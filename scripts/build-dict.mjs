import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateRawSync } from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");

const DEFAULT_ZIP_PATH =
  "C:\\Users\\Richard\\.gemini\\antigravity\\brain\\fe7d30de-e5b3-4b93-9dc0-f20aa1bf8f91\\scratch\\drive_repos\\make-a-word-main.zip";

const MAX_RANK = 8000;
const MIN_LEN = 3;
const MAX_LEN = 6;

// Everyday base stems used by campaign levels/props whose Make-a-Word rank sits above 8000.
const CAMPAIGN_WHITELIST = new Set(["clamp", "crate"]);

// Common 2-letter verbs whose 5-letter -ing forms (being, doing, going) are regular inflections.
const TWO_LETTER_ING_STEMS = new Set(["be", "do", "go"]);

// Base stems missing from Make-a-Word's dictionary whose inflections (pends, pended) would otherwise leak.
const EXTRA_INFLECTION_STEMS = new Set(["pend"]);

// Comparative -er forms with doubled consonants not covered by general -er (to avoid stripping dinner/hammer/summer).
const EXTRA_EXCLUDED_INFLECTIONS = new Set(["bigger", "hotter"]);

// Strict family-friendly slur & profanity filter for YouTube Playables beyond Make-a-Word's blocklists.
const EXTRA_PROFANITY_AND_SLURS = new Set([
  "anus",
  "ass",
  "boner",
  "boob",
  "boobs",
  "bugger",
  "chink",
  "coon",
  "dildo",
  "dyke",
  "erotic",
  "fag",
  "faggot",
  "fetish",
  "gook",
  "hooker",
  "horny",
  "kike",
  "kkk",
  "lesbo",
  "nazi",
  "nazis",
  "nigga",
  "nigger",
  "paki",
  "pimp",
  "prick",
  "pube",
  "pubes",
  "pubic",
  "queer",
  "rectum",
  "retard",
  "schlong",
  "scrotum",
  "semen",
  "skank",
  "smut",
  "sperm",
  "spic",
  "spick",
  "tranny",
  "turd",
  "twat",
  "vulva",
  "wank",
  "wanker",
  "wetback",
  "yid",
]);

/**
 * Extract named entries from a ZIP buffer using its Central Directory.
 * Supports compression methods 0 (STORE) and 8 (DEFLATE).
 */
function readZipEntries(zipBuffer, wantedNames) {
  const wanted = new Set(wantedNames);
  const results = new Map();

  // Locate End of Central Directory signature (0x06054b50) scanning backwards.
  const minOffset = Math.max(0, zipBuffer.length - 65557);
  let eocdOffset = -1;
  for (let i = zipBuffer.length - 22; i >= minOffset; i--) {
    if (zipBuffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) {
    throw new Error("Invalid ZIP archive: End of Central Directory not found");
  }

  const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10);
  const cdOffset = zipBuffer.readUInt32LE(eocdOffset + 16);

  let cursor = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    if (zipBuffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new Error(`Invalid Central Directory header at offset ${cursor}`);
    }
    const method = zipBuffer.readUInt16LE(cursor + 10);
    const compressedSize = zipBuffer.readUInt32LE(cursor + 20);
    const fileNameLen = zipBuffer.readUInt16LE(cursor + 28);
    const extraLen = zipBuffer.readUInt16LE(cursor + 30);
    const commentLen = zipBuffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(cursor + 42);

    const fileName = zipBuffer.toString("utf8", cursor + 46, cursor + 46 + fileNameLen);
    cursor += 46 + fileNameLen + extraLen + commentLen;

    if (!wanted.has(fileName)) {
      continue;
    }

    if (zipBuffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error(`Invalid Local File Header for ${fileName}`);
    }
    const localNameLen = zipBuffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const rawSlice = zipBuffer.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) {
      results.set(fileName, rawSlice);
    } else if (method === 8) {
      results.set(fileName, inflateRawSync(rawSlice));
    } else {
      throw new Error(`Unsupported ZIP compression method ${method} for ${fileName}`);
    }
  }

  for (const name of wantedNames) {
    if (!results.has(name)) {
      throw new Error(`Missing required ZIP entry: ${name}`);
    }
  }
  return results;
}

/**
 * Returns true if `word` is a regular inflection (-s/-es/-ies/-ed/-ied/-ing/-er/-ier/-est)
 * of a known stem in `stemSet`, while preserving true base stems (-ss, -us, -is, short stems).
 */
function isInflection(word, stemSet) {
  const len = word.length;

  if (EXTRA_EXCLUDED_INFLECTIONS.has(word)) {
    return true;
  }

  if (word.endsWith("ies") && len > 4 && stemSet.has(`${word.slice(0, -3)}y`)) {
    return true;
  }
  if (word.endsWith("es") && len > 3 && !/(ss|is)$/.test(word)) {
    const stem2 = word.slice(0, -2);
    const stem1 = word.slice(0, -1);
    if (stemSet.has(stem2) || (stem1.endsWith("e") && stemSet.has(stem1))) {
      return true;
    }
  }
  if (word.endsWith("s") && len > 3 && !/(ss|is)$/.test(word)) {
    if (stemSet.has(word.slice(0, -1))) {
      return true;
    }
  }

  if (word.endsWith("ied") && len > 4 && stemSet.has(`${word.slice(0, -3)}y`)) {
    return true;
  }
  if (word.endsWith("ed")) {
    if (len === 4 && !word.endsWith("eed") && word !== "shed" && stemSet.has(word.slice(0, -1))) {
      return true;
    }
    if (len > 4) {
      if (stemSet.has(word.slice(0, -2)) || stemSet.has(word.slice(0, -1))) {
        return true;
      }
      if (len > 5 && word[len - 3] === word[len - 4] && stemSet.has(word.slice(0, -3))) {
        return true;
      }
    }
  }

  if (word.endsWith("ing")) {
    const stem3 = word.slice(0, -3);
    if (len === 5) {
      if (TWO_LETTER_ING_STEMS.has(stem3)) {
        return true;
      }
      if (word.endsWith("ying") && stemSet.has(`${word.slice(0, -4)}ie`)) {
        return true;
      }
      if (word !== "thing" && stemSet.has(`${stem3}e`)) {
        return true;
      }
    }
    if (len > 5) {
      if (stemSet.has(stem3) || stemSet.has(`${stem3}e`)) {
        return true;
      }
      if (len > 6 && word[len - 4] === word[len - 5] && stemSet.has(word.slice(0, -4))) {
        return true;
      }
    }
  }

  if (word.endsWith("ier") && len > 4 && stemSet.has(`${word.slice(0, -3)}y`)) {
    return true;
  }
  if (word.endsWith("er") && len > 4) {
    if (stemSet.has(word.slice(0, -2)) || stemSet.has(word.slice(0, -1))) {
      return true;
    }
  }

  if (word.endsWith("est") && len > 5) {
    if (stemSet.has(word.slice(0, -3)) || stemSet.has(word.slice(0, -2))) {
      return true;
    }
  }

  return false;
}

function buildDictionary() {
  const zipPath = process.env.DICT_ZIP_PATH ?? DEFAULT_ZIP_PATH;
  const zipBuffer = fs.readFileSync(zipPath);

  const dictEntry = "make-a-word-main/content/server-dictionary.json";
  const ranksEntry = "make-a-word-main/content/word-ranks.json";
  const profanityEntry = "make-a-word-main/content/dictionary-profanity.json";
  const blocklistEntry = "make-a-word-main/content/dictionary-blocklist.json";

  const entries = readZipEntries(zipBuffer, [
    dictEntry,
    ranksEntry,
    profanityEntry,
    blocklistEntry,
  ]);

  const rawWords = JSON.parse(entries.get(dictEntry).toString("utf8"));
  const rawRanks = JSON.parse(entries.get(ranksEntry).toString("utf8"));
  const profanity = JSON.parse(entries.get(profanityEntry).toString("utf8"));
  const blocklist = JSON.parse(entries.get(blocklistEntry).toString("utf8"));

  if (!Array.isArray(rawWords) || !Array.isArray(rawRanks) || rawWords.length !== rawRanks.length) {
    throw new Error("server-dictionary.json and word-ranks.json must be parallel arrays of equal length");
  }

  const excludedStems = new Set([
    ...profanity.map((w) => String(w).toLowerCase()),
    ...blocklist.map((w) => String(w).toLowerCase()),
    ...EXTRA_PROFANITY_AND_SLURS,
  ]);

  const stemSet = new Set([...excludedStems, ...EXTRA_INFLECTION_STEMS]);
  for (const raw of rawWords) {
    stemSet.add(String(raw).toLowerCase());
  }

  const filtered = new Set();
  for (let i = 0; i < rawWords.length; i++) {
    const word = String(rawWords[i]).toLowerCase();
    const rank = Number(rawRanks[i]);

    if (word.length < MIN_LEN || word.length > MAX_LEN) {
      continue;
    }
    if (!/^[a-z]+$/.test(word)) {
      continue;
    }
    if (excludedStems.has(word)) {
      continue;
    }
    if (rank > MAX_RANK && !CAMPAIGN_WHITELIST.has(word)) {
      continue;
    }
    if (isInflection(word, stemSet)) {
      continue;
    }
    filtered.add(word);
  }

  for (const required of CAMPAIGN_WHITELIST) {
    filtered.add(required);
  }

  const sorted = Array.from(filtered).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  const outPath = path.join(REPO_ROOT, "src", "content", "dict.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(sorted, null, 2)}\n`, "utf8");

  console.log(`Built ${sorted.length} words -> ${outPath}`);
}

buildDictionary();
