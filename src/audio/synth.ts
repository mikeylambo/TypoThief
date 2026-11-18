type OscWave = "sine" | "square" | "sawtooth" | "triangle";

interface AudioParamLike {
  value: number;
  setValueAtTime?(value: number, startTime: number): unknown;
  linearRampToValueAtTime?(value: number, endTime: number): unknown;
  exponentialRampToValueAtTime?(value: number, endTime: number): unknown;
  cancelScheduledValues?(cancelTime: number): unknown;
}

interface GainNodeLike {
  gain: AudioParamLike;
  connect(destination: unknown): unknown;
  disconnect?(): void;
}

interface OscillatorNodeLike {
  type: OscWave;
  frequency: AudioParamLike;
  onended: (() => void) | null;
  connect(destination: unknown): unknown;
  disconnect?(): void;
  start(when?: number): void;
  stop(when?: number): void;
}

interface AudioContextLike {
  currentTime: number;
  state: string;
  destination: unknown;
  createGain(): GainNodeLike;
  createOscillator(): OscillatorNodeLike;
  suspend?(): Promise<void> | void;
  resume?(): Promise<void> | void;
}

interface ToneSpec {
  type: OscWave;
  startFreq: number;
  freqSteps?: Array<[number, number]>;
  endFreq?: number;
  delay?: number;
  duration: number;
  peakGain: number;
}

const DEFAULT_MASTER_GAIN = 0.28;

/**
 * Procedural WebAudio SFX synthesizer for Typo Thief.
 * Lazily initializes AudioContext on user interaction and degrades cleanly in headless environments.
 */
export class SoundEngine {
  private ctx: AudioContextLike | null = null;
  private masterGain: GainNodeLike | null = null;
  private activeOscs: Set<OscillatorNodeLike> = new Set();
  private muted = false;
  private paused = false;

  unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    if (!this.paused && ctx.state === "suspended" && typeof ctx.resume === "function") {
      try {
        Promise.resolve(ctx.resume()).catch(() => {});
      } catch {
        // Ignore resume errors in restricted contexts
      }
    }
    this.syncMasterGain();
  }

  setMuted(muted: boolean): void {
    this.muted = Boolean(muted);
    if (this.muted) {
      this.setMasterGainValue(0);
      this.stopActiveOscs();
    } else if (!this.paused) {
      this.setMasterGainValue(DEFAULT_MASTER_GAIN);
    }
  }

  setPaused(paused: boolean): void {
    this.paused = Boolean(paused);
    if (this.paused) {
      this.setMasterGainValue(0);
      this.stopActiveOscs();
      if (this.ctx && typeof this.ctx.suspend === "function") {
        try {
          Promise.resolve(this.ctx.suspend()).catch(() => {});
        } catch {
          // Ignore suspend errors
        }
      }
    } else {
      if (this.ctx && typeof this.ctx.resume === "function") {
        try {
          Promise.resolve(this.ctx.resume()).catch(() => {});
        } catch {
          // Ignore resume errors
        }
      }
      this.syncMasterGain();
    }
  }

  isMuted(): boolean {
    return this.muted;
  }

  playSteal(): void {
    // Rising comic "yoink" pop
    this.scheduleTone({
      type: "sine",
      startFreq: 320,
      endFreq: 780,
      duration: 0.095,
      peakGain: 0.55,
    });
    this.scheduleTone({
      type: "triangle",
      startFreq: 620,
      endFreq: 1120,
      delay: 0.015,
      duration: 0.075,
      peakGain: 0.22,
    });
  }

  playDrop(): void {
    // Tactile two-tone "ka-chunk" snap
    this.scheduleTone({
      type: "triangle",
      startFreq: 260,
      endFreq: 150,
      duration: 0.048,
      peakGain: 0.45,
    });
    this.scheduleTone({
      type: "triangle",
      startFreq: 440,
      endFreq: 240,
      delay: 0.045,
      duration: 0.08,
      peakGain: 0.55,
    });
  }

  playInvalid(): void {
    // Soft cartoon "boing" wobble
    this.scheduleTone({
      type: "triangle",
      startFreq: 240,
      freqSteps: [
        [145, 0.05],
        [215, 0.1],
        [130, 0.17],
      ],
      duration: 0.18,
      peakGain: 0.42,
    });
  }

  playWin(): void {
    // Rising celebratory C-major triad fanfare
    const notes: Array<{ freq: number; delay: number; duration: number; gain: number }> = [
      { freq: 523.25, delay: 0.0, duration: 0.14, gain: 0.42 },
      { freq: 659.25, delay: 0.08, duration: 0.14, gain: 0.44 },
      { freq: 783.99, delay: 0.16, duration: 0.16, gain: 0.46 },
      { freq: 1046.5, delay: 0.24, duration: 0.34, gain: 0.52 },
    ];
    for (const note of notes) {
      this.scheduleTone({
        type: "triangle",
        startFreq: note.freq,
        delay: note.delay,
        duration: note.duration,
        peakGain: note.gain,
      });
    }
    this.scheduleTone({
      type: "sine",
      startFreq: 523.25,
      delay: 0.24,
      duration: 0.34,
      peakGain: 0.25,
    });
  }

  private ensureContext(): AudioContextLike | null {
    if (this.ctx) return this.ctx;
    try {
      const g = globalThis as Record<string, unknown>;
      const Ctor = g.AudioContext ?? g.webkitAudioContext;
      if (typeof Ctor !== "function") return null;

      const ctx = new (Ctor as new () => AudioContextLike)();
      const gain = ctx.createGain();
      const initialGain = this.muted || this.paused ? 0 : DEFAULT_MASTER_GAIN;
      gain.gain.value = initialGain;
      gain.gain.setValueAtTime?.(initialGain, ctx.currentTime ?? 0);
      gain.connect(ctx.destination);

      this.ctx = ctx;
      this.masterGain = gain;
      return ctx;
    } catch {
      this.ctx = null;
      this.masterGain = null;
      return null;
    }
  }

  private syncMasterGain(): void {
    this.setMasterGainValue(this.muted || this.paused ? 0 : DEFAULT_MASTER_GAIN);
  }

  private setMasterGainValue(value: number): void {
    if (!this.ctx || !this.masterGain) return;
    try {
      const now = this.ctx.currentTime ?? 0;
      this.masterGain.gain.cancelScheduledValues?.(now);
      this.masterGain.gain.setValueAtTime?.(value, now);
      this.masterGain.gain.value = value;
    } catch {
      // Ignore gain update errors on restricted/mocked contexts
    }
  }

  private stopActiveOscs(): void {
    for (const osc of this.activeOscs) {
      try {
        osc.stop(0);
      } catch {
        // Ignore already-stopped oscillators
      }
      try {
        osc.disconnect?.();
      } catch {
        // Ignore disconnect failures
      }
    }
    this.activeOscs.clear();
  }

  private scheduleTone(spec: ToneSpec): void {
    if (this.muted || this.paused) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      try {
        Promise.resolve(ctx.resume()).catch(() => {});
      } catch {
        // Ignore resume errors
      }
    }

    try {
      const now = ctx.currentTime ?? 0;
      const startAt = now + (spec.delay ?? 0);
      const endAt = startAt + spec.duration;
      const attackAt = startAt + Math.min(0.01, spec.duration * 0.25);

      const osc = ctx.createOscillator();
      const env = ctx.createGain();

      osc.type = spec.type;
      osc.frequency.setValueAtTime?.(spec.startFreq, startAt);
      osc.frequency.value = spec.startFreq;

      if (spec.freqSteps) {
        for (const [freq, offset] of spec.freqSteps) {
          osc.frequency.linearRampToValueAtTime?.(freq, startAt + offset);
        }
      } else if (spec.endFreq !== undefined) {
        osc.frequency.exponentialRampToValueAtTime?.(Math.max(20, spec.endFreq), endAt);
      }

      env.gain.setValueAtTime?.(0.0001, startAt);
      env.gain.linearRampToValueAtTime?.(spec.peakGain, attackAt);
      env.gain.exponentialRampToValueAtTime?.(0.0001, endAt);

      osc.connect(env);
      env.connect(this.masterGain);

      this.activeOscs.add(osc);
      osc.onended = () => {
        this.activeOscs.delete(osc);
        try {
          osc.disconnect?.();
          env.disconnect?.();
        } catch {
          // Ignore cleanup errors
        }
      };

      osc.start(startAt);
      osc.stop(endAt + 0.01);
    } catch {
      // Never throw on headless or broken WebAudio implementations
    }
  }
}
