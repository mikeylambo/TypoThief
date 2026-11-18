/**
 * Platform abstraction for web and YouTube Playables runtimes.
 */
export interface PlatformAdapter {
  readonly id: "web" | "youtube";
  init(): Promise<void>;
  firstFrame(): void;
  gameReady(): void;
  language(): string;
  onPause(cb: () => void): void;
  onResume(cb: () => void): void;
  onAudioToggle(cb: (enabled: boolean) => void): void;
  isAudioEnabled(): boolean;
  save(data: unknown): Promise<void>;
  load<T>(): Promise<T | null>;
  submitScore(score: number): void;
  rewarded(slot: string): Promise<boolean>;
}
