import type { PlatformAdapter } from "./PlatformAdapter.ts";
import { WebAdapter } from "./WebAdapter.ts";
import { YouTubeAdapter } from "./YouTubeAdapter.ts";

declare const __PLATFORM__: string | undefined;

export type { PlatformAdapter } from "./PlatformAdapter.ts";
export { WebAdapter } from "./WebAdapter.ts";
export { YouTubeAdapter, type YtGame } from "./YouTubeAdapter.ts";

/**
 * Instantiate the platform adapter for the active build target (`"web"` or `"youtube"`).
 */
export function createPlatform(envPlatform?: string): PlatformAdapter {
  const target =
    envPlatform ??
    (typeof __PLATFORM__ !== "undefined" ? __PLATFORM__ : "web");
  return target === "youtube" ? new YouTubeAdapter() : new WebAdapter();
}
