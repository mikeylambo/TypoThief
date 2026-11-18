export const YOUTUBE_SDK_URL = "https://www.youtube.com/game_api/v1";
export const YOUTUBE_SDK_SCRIPT = `<script src="${YOUTUBE_SDK_URL}"></script>`;

export type BuildPlatform = "web" | "youtube";

/**
 * Resolve the active build platform from `PLATFORM` env value, defaulting to `"web"`.
 */
export function resolveBuildPlatform(rawPlatform: string | undefined): BuildPlatform {
  return rawPlatform === "youtube" ? "youtube" : "web";
}

/**
 * Inject the YouTube Playables SDK `<script>` inside `<head>` before any
 * `<script type="module"` bundle when building for `"youtube"`.
 * Returns the HTML untouched when building for `"web"`.
 */
export function injectYouTubeSdk(html: string, platform: BuildPlatform): string {
  if (platform !== "youtube") {
    return html;
  }
  if (html.includes(YOUTUBE_SDK_URL)) {
    return html;
  }

  const headCloseMatch = /<\/head>/i.exec(html);
  if (!headCloseMatch || headCloseMatch.index === undefined) {
    throw new Error("Cannot inject YouTube Playables SDK: missing </head> tag.");
  }
  const headCloseIdx = headCloseMatch.index;

  const moduleScriptMatch = /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*>/i.exec(html);
  if (moduleScriptMatch && moduleScriptMatch.index !== undefined && moduleScriptMatch.index < headCloseIdx) {
    const insertIdx = moduleScriptMatch.index;
    return `${html.slice(0, insertIdx)}${YOUTUBE_SDK_SCRIPT}\n    ${html.slice(insertIdx)}`;
  }

  return `${html.slice(0, headCloseIdx)}    ${YOUTUBE_SDK_SCRIPT}\n  ${html.slice(headCloseIdx)}`;
}
