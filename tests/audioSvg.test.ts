import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SoundEngine } from "../src/audio/synth.ts";
import { renderPropSvg } from "../src/content/propsSvg.ts";
import { CAMPAIGN_LEVELS } from "../src/content/levels.ts";

interface MockGainParam {
  value: number;
  setValueAtTimeCalls: Array<[number, number]>;
  linearRampCalls: Array<[number, number]>;
  exponentialRampCalls: Array<[number, number]>;
  cancelCalls: number[];
  setValueAtTime(val: number, time: number): void;
  linearRampToValueAtTime(val: number, time: number): void;
  exponentialRampToValueAtTime(val: number, time: number): void;
  cancelScheduledValues(time: number): void;
}

interface MockOscillator {
  type: string;
  frequency: MockGainParam;
  started: number[];
  stopped: number[];
  disconnected: boolean;
  onended: (() => void) | null;
  connect(): void;
  disconnect(): void;
  start(when?: number): void;
  stop(when?: number): void;
}

function createParam(initial = 1): MockGainParam {
  const param: MockGainParam = {
    value: initial,
    setValueAtTimeCalls: [],
    linearRampCalls: [],
    exponentialRampCalls: [],
    cancelCalls: [],
    setValueAtTime(val: number, time: number) {
      param.value = val;
      param.setValueAtTimeCalls.push([val, time]);
    },
    linearRampToValueAtTime(val: number, time: number) {
      param.value = val;
      param.linearRampCalls.push([val, time]);
    },
    exponentialRampToValueAtTime(val: number, time: number) {
      param.value = val;
      param.exponentialRampCalls.push([val, time]);
    },
    cancelScheduledValues(time: number) {
      param.cancelCalls.push(time);
    },
  };
  return param;
}

describe("SoundEngine", () => {
  it("never throws when AudioContext is missing in Node/headless", () => {
    const prevAudio = (globalThis as Record<string, unknown>).AudioContext;
    const prevWebkit = (globalThis as Record<string, unknown>).webkitAudioContext;
    delete (globalThis as Record<string, unknown>).AudioContext;
    delete (globalThis as Record<string, unknown>).webkitAudioContext;

    try {
      const sfx = new SoundEngine();
      assert.equal(sfx.isMuted(), false);
      assert.doesNotThrow(() => {
        sfx.unlock();
        sfx.playSteal();
        sfx.playDrop();
        sfx.playInvalid();
        sfx.playWin();
        sfx.setMuted(true);
        assert.equal(sfx.isMuted(), true);
        sfx.playWin();
        sfx.setPaused(true);
        sfx.playSteal();
        sfx.setPaused(false);
        sfx.setMuted(false);
        assert.equal(sfx.isMuted(), false);
      });
    } finally {
      if (prevAudio !== undefined) {
        (globalThis as Record<string, unknown>).AudioContext = prevAudio;
      }
      if (prevWebkit !== undefined) {
        (globalThis as Record<string, unknown>).webkitAudioContext = prevWebkit;
      }
    }
  });

  it("lazily creates AudioContext and immediately silences/suspends mid-fanfare on mute or pause", () => {
    const prevAudio = (globalThis as Record<string, unknown>).AudioContext;
    let ctorCalls = 0;
    const gains: Array<{ gain: MockGainParam }> = [];
    const oscillators: MockOscillator[] = [];
    let suspendCalls = 0;
    let resumeCalls = 0;
    let rejectPromises = false;

    class MockAudioContext {
      currentTime = 1.5;
      state: "suspended" | "running" = "suspended";
      destination = {};

      constructor() {
        ctorCalls += 1;
      }

      createGain() {
        const node = {
          gain: createParam(1),
          connect() {},
          disconnect() {},
        };
        gains.push(node);
        return node;
      }

      createOscillator(): MockOscillator {
        const osc: MockOscillator = {
          type: "sine",
          frequency: createParam(440),
          started: [],
          stopped: [],
          disconnected: false,
          onended: null,
          connect() {},
          disconnect() {
            osc.disconnected = true;
          },
          start(when = 0) {
            osc.started.push(when);
          },
          stop(when = 0) {
            osc.stopped.push(when);
          },
        };
        oscillators.push(osc);
        return osc;
      }

      suspend() {
        suspendCalls += 1;
        this.state = "suspended";
        return rejectPromises ? Promise.reject(new Error("suspend fail")) : Promise.resolve();
      }

      resume() {
        resumeCalls += 1;
        this.state = "running";
        return rejectPromises ? Promise.reject(new Error("resume fail")) : Promise.resolve();
      }
    }

    (globalThis as Record<string, unknown>).AudioContext = MockAudioContext;

    try {
      const sfx = new SoundEngine();
      assert.equal(ctorCalls, 0, "AudioContext should be created lazily on gesture");

      sfx.unlock();
      assert.equal(ctorCalls, 1);
      assert.equal(resumeCalls, 1);
      assert.ok(gains.length >= 1, "master gain node should be created");
      const masterGain = gains[0];

      sfx.playSteal();
      sfx.playDrop();
      sfx.playInvalid();
      const countBeforeWin = oscillators.length;
      assert.ok(countBeforeWin >= 3);

      // Start fanfare then mute mid-fanfare
      sfx.playWin();
      const countDuringWin = oscillators.length;
      assert.ok(countDuringWin > countBeforeWin, "playWin should schedule fanfare oscillators");

      sfx.setMuted(true);
      assert.equal(sfx.isMuted(), true);
      assert.equal(masterGain.gain.value, 0, "setMuted(true) must zero master gain immediately");
      assert.ok(
        oscillators[countBeforeWin].stopped.includes(0) &&
          oscillators[countBeforeWin].disconnected,
        "mid-fanfare oscillators should be stopped and disconnected on mute",
      );

      // Further plays while muted should not schedule oscillators
      sfx.playSteal();
      assert.equal(oscillators.length, countDuringWin);

      sfx.setMuted(false);
      assert.equal(sfx.isMuted(), false);
      assert.ok(masterGain.gain.value > 0, "unmuting should restore master gain");

      // Pause mid-fanfare should silence master gain and suspend context
      sfx.playWin();
      const countBeforePause = oscillators.length;
      rejectPromises = true;
      assert.doesNotThrow(() => sfx.setPaused(true));
      assert.equal(suspendCalls, 1);
      assert.equal(masterGain.gain.value, 0, "setPaused(true) must immediately silence master gain");
      assert.ok(
        oscillators[countBeforePause - 1].stopped.includes(0),
        "mid-fanfare oscillators should be stopped on pause",
      );

      // Unmuting while paused must keep master gain silent until resumed
      sfx.setMuted(true);
      sfx.setMuted(false);
      assert.equal(masterGain.gain.value, 0);

      sfx.playDrop();
      assert.equal(oscillators.length, countBeforePause, "paused engine should not schedule sounds");

      assert.doesNotThrow(() => sfx.setPaused(false));
      assert.equal(resumeCalls, 2);
      assert.ok(masterGain.gain.value > 0);
    } finally {
      if (prevAudio === undefined) {
        delete (globalThis as Record<string, unknown>).AudioContext;
      } else {
        (globalThis as Record<string, unknown>).AudioContext = prevAudio;
      }
    }
  });
});

describe("renderPropSvg", () => {
  const FRAMES = [
    "safe",
    "dog",
    "laser",
    "lamp",
    "crate",
    "art",
    "cart",
    "clock",
    "locker",
    "trophy",
  ];

  it("renders crisp Sunday-comic SVGs for all 10 frames and unknown fallback in both states", () => {
    for (const frame of [...FRAMES, "unknown-prop"]) {
      const unsolved = renderPropSvg(frame, false);
      const solved = renderPropSvg(frame, true);

      for (const svg of [unsolved, solved]) {
        assert.ok(svg.includes("<svg"), `${frame} should contain <svg`);
        assert.ok(svg.includes("</svg>"), `${frame} should close </svg>`);
        assert.ok(svg.includes('viewBox="0 0 80 80"'), `${frame} should use 80x80 viewBox`);
        assert.ok(svg.includes("#1B1814"), `${frame} should use Sunday-comic #1B1814 ink`);
      }

      assert.notEqual(unsolved, solved, `${frame} unsolved and solved SVGs must differ`);
    }
  });

  it("applies bespoke hero gag overlays for campaign levels 1, 6, 12, and 18", () => {
    const heroTargets: Array<{ levelId: number; propId: string }> = [
      { levelId: 1, propId: "p1" },
      { levelId: 6, propId: "p4" },
      { levelId: 12, propId: "p2" },
      { levelId: 18, propId: "p3" },
    ];

    for (const { levelId, propId } of heroTargets) {
      const level = CAMPAIGN_LEVELS.find((l) => l.id === levelId);
      assert.ok(level, `Level ${levelId} must exist`);
      const prop = level.props.find((p) => p.id === propId);
      assert.ok(prop, `Level ${levelId} prop ${propId} must exist`);

      const genericUnsolved = renderPropSvg(prop.frame, false);
      const genericSolved = renderPropSvg(prop.frame, true);
      const heroUnsolved = renderPropSvg(prop.frame, false, levelId, propId);
      const heroSolved = renderPropSvg(prop.frame, true, levelId, propId);

      assert.notEqual(
        heroUnsolved,
        genericUnsolved,
        `L${levelId} ${propId} unsolved should have bespoke hero overlay`,
      );
      assert.notEqual(
        heroSolved,
        genericSolved,
        `L${levelId} ${propId} solved should have bespoke hero overlay`,
      );
      assert.notEqual(
        heroUnsolved,
        heroSolved,
        `L${levelId} ${propId} hero unsolved and solved must differ`,
      );
    }
  });
});
