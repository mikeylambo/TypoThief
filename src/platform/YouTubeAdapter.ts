import { parseSaveWithRecovery } from "../meta/save.ts";
import type { PlatformAdapter } from "./PlatformAdapter.ts";
import { WebAdapter } from "./WebAdapter.ts";

/**
 * Subset of the YouTube Playables SDK (`window.ytgame`) consumed by Typo Thief.
 */
export interface YtGame {
  IN_PLAYABLES_ENV?: boolean;
  SDK_VERSION?: string;
  game: {
    firstFrameReady(): void;
    gameReady(): void;
    saveData(data: string): Promise<void>;
    loadData(): Promise<string>;
  };
  engagement: {
    sendScore(score: { value: number }): Promise<void>;
  };
  system: {
    isAudioEnabled(): boolean;
    onAudioEnabledChange(cb: (isAudioEnabled: boolean) => void): () => void;
    onPause(cb: () => void): () => void;
    onResume(cb: () => void): () => void;
    getLanguage(): Promise<string>;
  };
}

function yt(): YtGame | null {
  const g = (globalThis as { ytgame?: YtGame }).ytgame;
  return g && g.IN_PLAYABLES_ENV === true ? g : null;
}

/**
 * YouTube Playables platform adapter with graceful fallback to WebAdapter
 * whenever `globalThis.ytgame` is unavailable or `IN_PLAYABLES_ENV` is false.
 */
export class YouTubeAdapter implements PlatformAdapter {
  readonly id = "youtube" as const;

  private readonly fallback = new WebAdapter();
  private initialized = false;
  private firstFrameSent = false;
  private gameReadySent = false;
  private cachedLang: string | null = null;
  private readonly pauseCallbacks: Array<() => void> = [];
  private readonly resumeCallbacks: Array<() => void> = [];
  private readonly audioCallbacks: Array<(enabled: boolean) => void> = [];

  async init(): Promise<void> {
    const g = yt();
    if (!g) {
      await this.fallback.init();
      return;
    }
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    g.system?.onPause?.(() => {
      for (const cb of this.pauseCallbacks) {
        cb();
      }
    });
    g.system?.onResume?.(() => {
      for (const cb of this.resumeCallbacks) {
        cb();
      }
    });
    g.system?.onAudioEnabledChange?.((enabled: boolean) => {
      for (const cb of this.audioCallbacks) {
        cb(enabled);
      }
    });

    if (
      typeof window !== "undefined" &&
      typeof window.addEventListener === "function"
    ) {
      window.addEventListener("error", () => {});
      window.addEventListener("unhandledrejection", () => {});
    }

    try {
      const lang = await g.system?.getLanguage?.();
      if (typeof lang === "string" && lang.length > 0) {
        this.cachedLang = lang;
      }
    } catch {
      // Keep fallback language if getLanguage fails.
    }
  }

  firstFrame(): void {
    if (this.firstFrameSent) {
      return;
    }
    const g = yt();
    if (!g) {
      this.fallback.firstFrame();
      return;
    }
    this.firstFrameSent = true;
    g.game.firstFrameReady();
  }

  gameReady(): void {
    if (this.gameReadySent) {
      return;
    }
    const g = yt();
    if (!g) {
      this.fallback.gameReady();
      return;
    }
    this.gameReadySent = true;
    g.game.gameReady();
  }

  language(): string {
    return this.cachedLang ?? this.fallback.language();
  }

  onPause(cb: () => void): void {
    this.pauseCallbacks.push(cb);
    if (!yt()) {
      this.fallback.onPause(cb);
    }
  }

  onResume(cb: () => void): void {
    this.resumeCallbacks.push(cb);
    if (!yt()) {
      this.fallback.onResume(cb);
    }
  }

  onAudioToggle(cb: (enabled: boolean) => void): void {
    this.audioCallbacks.push(cb);
    if (!yt()) {
      this.fallback.onAudioToggle(cb);
    }
  }

  isAudioEnabled(): boolean {
    const g = yt();
    if (!g) {
      return this.fallback.isAudioEnabled();
    }
    return g.system?.isAudioEnabled?.() ?? true;
  }

  async save(data: unknown): Promise<void> {
    const g = yt();
    if (!g) {
      await this.fallback.save(data);
      return;
    }
    try {
      await g.game.saveData(JSON.stringify(data));
    } catch {
      // Ignore save failures in restricted environments.
    }
  }

  async load<T>(): Promise<T | null> {
    const g = yt();
    if (!g) {
      return this.fallback.load<T>();
    }
    try {
      const raw = await g.game.loadData();
      if (!raw) {
        return null;
      }
      return parseSaveWithRecovery(raw) as T;
    } catch {
      return null;
    }
  }

  submitScore(score: number): void {
    const g = yt();
    if (!g) {
      this.fallback.submitScore(score);
      return;
    }
    const value = Number.isFinite(score) ? Math.max(0, Math.floor(score)) : 0;
    g.engagement?.sendScore({ value })?.catch(() => {});
  }

  async rewarded(slot: string): Promise<boolean> {
    const g = yt();
    if (!g) {
      return this.fallback.rewarded(slot);
    }
    return false;
  }
}
