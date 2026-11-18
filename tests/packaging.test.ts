import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  YOUTUBE_SDK_SCRIPT,
  YOUTUBE_SDK_URL,
  injectYouTubeSdk,
  resolveBuildPlatform,
} from "../scripts/youtube-html.ts";

describe("YouTube Playables HTML injection & platform resolution", () => {
  it("defaults platform to web unless explicitly youtube", () => {
    assert.equal(resolveBuildPlatform(undefined), "web");
    assert.equal(resolveBuildPlatform(""), "web");
    assert.equal(resolveBuildPlatform("web"), "web");
    assert.equal(resolveBuildPlatform("youtube"), "youtube");
  });

  it("leaves HTML untouched on web builds", () => {
    const html = `<!doctype html><html><head><title>Typo Thief</title><script type="module" src="./assets/index.js"></script></head><body></body></html>`;
    const result = injectYouTubeSdk(html, "web");
    assert.equal(result, html);
    assert.equal(result.includes(YOUTUBE_SDK_URL), false);
  });

  it("injects YouTube SDK inside <head> before <script type=\"module\" on youtube builds", () => {
    const builtHtml = [
      "<!doctype html>",
      '<html lang="en">',
      "  <head>",
      '    <meta charset="UTF-8" />',
      "    <title>Typo Thief</title>",
      '    <script type="module" crossorigin src="./assets/index-123.js"></script>',
      '    <link rel="stylesheet" crossorigin href="./assets/index-123.css">',
      "  </head>",
      "  <body>",
      '    <div id="app"></div>',
      "  </body>",
      "</html>",
    ].join("\n");

    const result = injectYouTubeSdk(builtHtml, "youtube");
    const sdkIdx = result.indexOf(YOUTUBE_SDK_SCRIPT);
    const headOpenIdx = result.indexOf("<head>");
    const headCloseIdx = result.indexOf("</head>");
    const moduleIdx = result.indexOf('<script type="module"');

    assert.ok(sdkIdx > headOpenIdx && sdkIdx < headCloseIdx, "SDK must be inside <head>");
    assert.ok(sdkIdx < moduleIdx, "SDK must appear before module bundle");
    assert.equal(injectYouTubeSdk(result, "youtube"), result, "injection must be idempotent");
  });

  it("injects YouTube SDK before </head> when module script is in <body>", () => {
    const devHtml = `<!doctype html><html><head><title>Typo Thief</title></head><body><script type="module" src="/src/main.ts"></script></body></html>`;
    const result = injectYouTubeSdk(devHtml, "youtube");
    const sdkIdx = result.indexOf(YOUTUBE_SDK_SCRIPT);
    const headCloseIdx = result.indexOf("</head>");
    const moduleIdx = result.indexOf('<script type="module"');

    assert.ok(sdkIdx !== -1 && sdkIdx < headCloseIdx);
    assert.ok(sdkIdx < moduleIdx);
  });
});
