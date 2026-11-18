import { defineConfig, type Plugin } from "vite";
import { injectYouTubeSdk, resolveBuildPlatform, type BuildPlatform } from "./scripts/youtube-html.ts";

const platform: BuildPlatform = resolveBuildPlatform(process.env.PLATFORM);

function youtubeSdkPlugin(targetPlatform: BuildPlatform): Plugin {
  return {
    name: "typo-thief-youtube-sdk",
    transformIndexHtml: {
      order: "post",
      handler(html) {
        return injectYouTubeSdk(html, targetPlatform);
      },
    },
  };
}

export default defineConfig({
  base: "./",
  define: {
    __PLATFORM__: JSON.stringify(platform),
  },
  plugins: [youtubeSdkPlugin(platform)],
  build: {
    outDir: platform === "youtube" ? "dist-yt" : "dist-web",
    emptyOutDir: true,
  },
});
