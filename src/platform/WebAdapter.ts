import { parseSaveWithRecovery } from "../meta/save.ts";
import type { PlatformAdapter } from "./PlatformAdapter.ts";

const STORAGE_KEY = "typo-thief:save:v1";

/**
 * Default browser platform adapter using localStorage (with in-memory fallback)
 * and document visibility events.
 */
export class WebAdapter implements PlatformAdapter {
  readonly id = "web" as const;

  private initialized = false;
  private memorySave: string | null = null;
  private readonly pauseCallbacks: Array<() => void> = [];
  private readonly resumeCallbacks: Array<() => void> = [];
  private readonly audioCallbacks: Array<(enabled: boolean) => void> = [];

  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }
    this.initialized = true;

    if (
      typeof document !== "undefined" &&
      typeof document.addEventListener === "function"
    ) {
      document.addEventListener("visibilitychange", () => {
        const list = document.hidden
          ? this.pauseCallbacks
          : this.resumeCallbacks;
        for (const cb of list) {
          cb();
        }
      });
    }
  }

  firstFrame(): void {}

  gameReady(): void {}

  language(): string {
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.language === "string" &&
      navigator.language.length > 0
    ) {
      return navigator.language;
    }
    return "en";
  }

  onPause(cb: () => void): void {
    this.pauseCallbacks.push(cb);
  }

  onResume(cb: () => void): void {
    this.resumeCallbacks.push(cb);
  }

  onAudioToggle(cb: (enabled: boolean) => void): void {
    this.audioCallbacks.push(cb);
  }

  isAudioEnabled(): boolean {
    return true;
  }

  async save(data: unknown): Promise<void> {
    const json = JSON.stringify(data);
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, json);
        this.memorySave = null;
        return;
      }
    } catch {
      // Fall back to in-memory storage when localStorage is unavailable or throws.
    }
    this.memorySave = json;
  }

  async load<T>(): Promise<T | null> {
    let raw: string | null = this.memorySave;
    if (raw === null) {
      try {
        if (typeof window !== "undefined" && window.localStorage) {
          raw = window.localStorage.getItem(STORAGE_KEY);
        }
      } catch {
        raw = this.memorySave;
      }
    }

    if (raw === null) {
      return null;
    }
    return parseSaveWithRecovery(raw) as T;
  }

  submitScore(_score: number): void {}

  async rewarded(_slot: string): Promise<boolean> {
    return false;
  }
}
