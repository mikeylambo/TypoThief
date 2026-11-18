import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";
import { build } from "vite";
import { YOUTUBE_SDK_SCRIPT } from "./youtube-html.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DIST_YT_DIR = path.join(REPO_ROOT, "dist-yt");
const ZIP_PATH = path.join(REPO_ROOT, "typo-thief-youtube.zip");
const MAX_ZIP_BYTES = 300 * 1024;

/**
 * Recursively collect all files inside `rootDir` with POSIX paths relative to `rootDir`.
 */
function collectFiles(rootDir, currentDir = rootDir) {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectFiles(rootDir, fullPath));
    } else if (entry.isFile()) {
      const relPath = path.relative(rootDir, fullPath).split(path.sep).join("/");
      files.push({ fullPath, relPath });
    }
  }
  files.sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));
  return files;
}

/**
 * Convert a JS Date into MS-DOS time/date fields used by PKZIP headers.
 */
function toDosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { dosTime, dosDate };
}

/**
 * Build a standard PKZIP archive buffer from `{ relPath, data, mtime }` entries.
 */
function createZipBuffer(fileRecords) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const record of fileRecords) {
    const nameBuf = Buffer.from(record.relPath, "utf8");
    const rawData = record.data;
    const deflated = deflateRawSync(rawData, { level: 9 });
    const useDeflate = deflated.length < rawData.length;
    const method = useDeflate ? 8 : 0;
    const payload = useDeflate ? deflated : rawData;
    const checksum = crc32(rawData) >>> 0;
    const { dosTime, dosDate } = toDosDateTime(record.mtime);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(dosTime, 10);
    localHeader.writeUInt16LE(dosDate, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(rawData.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    localParts.push(localHeader, nameBuf, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(dosTime, 12);
    centralHeader.writeUInt16LE(dosDate, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(rawData.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    centralParts.push(centralHeader, nameBuf);
    offset += localHeader.length + nameBuf.length + payload.length;
  }

  const centralDirBuffer = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(fileRecords.length, 8);
  eocd.writeUInt16LE(fileRecords.length, 10);
  eocd.writeUInt32LE(centralDirBuffer.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirBuffer, eocd]);
}

function verifyBuiltHtml(htmlPath) {
  if (!fs.existsSync(htmlPath)) {
    throw new Error(`Missing YouTube build output: ${htmlPath}`);
  }
  const html = fs.readFileSync(htmlPath, "utf8");
  const headOpenIdx = html.search(/<head\b[^>]*>/i);
  const headCloseIdx = html.search(/<\/head>/i);
  const sdkIdx = html.indexOf(YOUTUBE_SDK_SCRIPT);
  const moduleIdx = html.search(/<script\b[^>]*\btype\s*=\s*["']module["']/i);

  if (sdkIdx === -1) {
    throw new Error(`YouTube Playables SDK script tag missing in ${htmlPath}`);
  }
  if (headOpenIdx === -1 || headCloseIdx === -1 || sdkIdx < headOpenIdx || sdkIdx > headCloseIdx) {
    throw new Error(`YouTube Playables SDK script tag must appear inside <head> in ${htmlPath}`);
  }
  if (moduleIdx === -1 || sdkIdx > moduleIdx) {
    throw new Error(
      `YouTube Playables SDK script tag must appear before <script type="module" in ${htmlPath}`,
    );
  }
}

async function main() {
  process.env.PLATFORM = "youtube";

  await build({
    root: REPO_ROOT,
    configFile: path.join(REPO_ROOT, "vite.config.ts"),
  });

  verifyBuiltHtml(path.join(DIST_YT_DIR, "index.html"));

  const files = collectFiles(DIST_YT_DIR);
  if (files.length === 0 || !files.some((f) => f.relPath === "index.html")) {
    throw new Error(`dist-yt/ is missing index.html at archive root.`);
  }

  const fileRecords = files.map((file) => {
    const stat = fs.statSync(file.fullPath);
    const data = fs.readFileSync(file.fullPath);
    return {
      relPath: file.relPath,
      data,
      mtime: stat.mtime,
    };
  });

  const zipBuffer = createZipBuffer(fileRecords);
  fs.writeFileSync(ZIP_PATH, zipBuffer);

  const zipStats = fs.statSync(ZIP_PATH);
  let totalRawBytes = 0;
  console.log("dist-yt files:");
  for (const record of fileRecords) {
    totalRawBytes += record.data.length;
    console.log(`  ${record.relPath}: ${record.data.length} bytes`);
  }
  console.log(`Total dist-yt uncompressed: ${totalRawBytes} bytes`);
  console.log(
    `ZIP archive: ${path.basename(ZIP_PATH)} = ${zipStats.size} bytes (limit: ${MAX_ZIP_BYTES} bytes)`,
  );

  if (zipStats.size >= MAX_ZIP_BYTES) {
    throw new Error(
      `YouTube Playables ZIP exceeds 300 KB limit: ${zipStats.size} >= ${MAX_ZIP_BYTES} bytes`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
