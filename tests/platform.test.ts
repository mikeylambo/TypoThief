import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { defaultSave, recordLevelClear, type SaveData } from "../src/meta/save.ts";
import {
  createPlatform,
  WebAdapter,
  YouTubeAdapter,
  type YtGame,
} from "../src/platform/index.ts";

interface MockGlobals {
  ytgame?: YtGame;
  window?: unknown;
  document?: unknown;
}

const g = globalThis as unknown as MockGlobals;
const originalYtGame = g.ytgame;
const originalWindow = g.window;
const originalDocument = g.document;

function restoreGlobals(): void {
  if (originalYtGame === undefined) {
    delete g.ytgame;
  } else {
    g.ytgame = originalYtGame;
  }
  if (originalWindow === undefined) {
    delete g.window;
  } else {
    g.window = originalWindow;
  }
  if (originalDocument === undefined) {
    delete g.document;
  } else {
    g.document = originalDocument;
  }
}

function createMockYtGame(overrides: Partial<{
  inEnv: boolean;
  audioEnabled: boolean;
  language: string;
  initialData: string;
}> = {}) {
  let firstFrameCalls = 0;
  let gameReadyCalls = 0;
  let storedData = overrides.initialData ?? "";
  let sentScores: Array<{ value: number }> = [];
  let pauseHandler: (() => void) | null = null;
  let resumeHandler: (() => void) | null = null;
  let audioHandler: ((enabled: boolean) => void) | null = null;
  let saveCalls = 0;
  let loadCalls = 0;

  const ytgame: YtGame = {
    IN_PLAYABLES_ENV: overrides.inEnv ?? true,
    SDK_VERSION: "1.0.0",
    game: {
      firstFrameReady() {
        firstFrameCalls += 1;
      },
      gameReady() {
        gameReadyCalls += 1;
      },
      async saveData(data: string) {
        saveCalls += 1;
        storedData = data;
      },
      async loadData() {
        loadCalls += 1;
        return storedData;
      },
    },
    engagement: {
      async sendScore(score: { value: number }) {
        sentScores.push(score);
      },
    },
    system: {
      isAudioEnabled() {
        return overrides.audioEnabled ?? true;
      },
      onAudioEnabledChange(cb: (enabled: boolean) => void) {
        audioHandler = cb;
        return () => {
          audioHandler = null;
        };
      },
      onPause(cb: () => void) {
        pauseHandler = cb;
        return () => {
          pauseHandler = null;
        };
      },
      onResume(cb: () => void) {
        resumeHandler = cb;
        return () => {
          resumeHandler = null;
        };
      },
      async getLanguage() {
        return overrides.language ?? "en-US";
      },
    },
  };

  return {
    ytgame,
    get firstFrameCalls() {
      return firstFrameCalls;
    },
    get gameReadyCalls() {
      return gameReadyCalls;
    },
    get saveCalls() {
      return saveCalls;
    },
    get loadCalls() {
      return loadCalls;
    },
    get storedData() {
      return storedData;
    },
    set storedData(val: string) {
      storedData = val;
    },
    get sentScores() {
      return sentScores;
    },
    triggerPause() {
      pauseHandler?.();
    },
    triggerResume() {
      resumeHandler?.();
    },
    triggerAudio(enabled: boolean) {
      audioHandler?.(enabled);
    },
  };
}

afterEach(() => {
  restoreGlobals();
});

describe("WebAdapter", () => {
  it("falls back to in-memory storage when window/document are absent in Node", async () => {
    delete g.window;
    delete g.document;

    const adapter = new WebAdapter();
    assert.equal(adapter.id, "web");
    assert.equal(adapter.isAudioEnabled(), true);
    assert.equal(typeof adapter.language(), "string");

    await adapter.init();
    adapter.firstFrame();
    adapter.gameReady();
    adapter.submitScore(100);
    assert.equal(await adapter.rewarded("hint"), false);

    assert.equal(await adapter.load<SaveData>(), null);

    const progress = recordLevelClear(defaultSave(), 1, 3, 4);
    await adapter.save(progress);

    const loaded = await adapter.load<SaveData>();
    assert.deepEqual(loaded, progress);
  });

  it("uses localStorage under typo-thief:save:v1 and recovers corrupted saves", async () => {
    const store = new Map<string, string>();
    g.window = {
      localStorage: {
        getItem(key: string) {
          return store.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          store.set(key, value);
        },
      },
    };

    const adapter = new WebAdapter();
    const save = recordLevelClear(defaultSave(), 2, 2, 7);
    await adapter.save(save);
    assert.equal(store.has("typo-thief:save:v1"), true);

    const loaded = await adapter.load<SaveData>();
    assert.deepEqual(loaded, save);

    // Corrupted JSON recovers cleanly to defaultSave()
    store.set("typo-thief:save:v1", "{corrupt-json");
    const recovered = await adapter.load<SaveData>();
    assert.deepEqual(recovered, defaultSave());
  });

  it("falls back to memory if localStorage throws", async () => {
    g.window = {
      localStorage: {
        getItem() {
          throw new Error("SecurityError");
        },
        setItem() {
          throw new Error("QuotaExceededError");
        },
      },
    };

    const adapter = new WebAdapter();
    const save = recordLevelClear(defaultSave(), 1, 2, 5);
    await adapter.save(save);
    const loaded = await adapter.load<SaveData>();
    assert.deepEqual(loaded, save);
  });

  it("wires document visibilitychange to onPause and onResume when document exists", async () => {
    const listeners = new Map<string, Array<() => void>>();
    const mockDoc = {
      hidden: false,
      addEventListener(event: string, cb: () => void) {
        const list = listeners.get(event) ?? [];
        list.push(cb);
        listeners.set(event, list);
      },
    };
    g.document = mockDoc;

    const adapter = new WebAdapter();
    let paused = 0;
    let resumed = 0;
    adapter.onPause(() => {
      paused += 1;
    });
    adapter.onResume(() => {
      resumed += 1;
    });

    await adapter.init();
    const handlers = listeners.get("visibilitychange") ?? [];
    assert.equal(handlers.length, 1);

    mockDoc.hidden = true;
    handlers[0]();
    assert.equal(paused, 1);
    assert.equal(resumed, 0);

    mockDoc.hidden = false;
    handlers[0]();
    assert.equal(paused, 1);
    assert.equal(resumed, 1);
  });
});

describe("YouTubeAdapter", () => {
  it("falls back cleanly to WebAdapter when globalThis.ytgame is missing", async () => {
    delete g.ytgame;
    delete g.window;
    delete g.document;

    const adapter = new YouTubeAdapter();
    assert.equal(adapter.id, "youtube");
    assert.equal(adapter.isAudioEnabled(), true);

    await adapter.init();
    adapter.firstFrame();
    adapter.gameReady();
    adapter.submitScore(500);
    assert.equal(await adapter.rewarded("hint"), false);

    assert.equal(await adapter.load<SaveData>(), null);
    const save = recordLevelClear(defaultSave(), 1, 3, 3);
    await adapter.save(save);
    assert.deepEqual(await adapter.load<SaveData>(), save);
  });

  it("falls back to WebAdapter when IN_PLAYABLES_ENV is false", async () => {
    const mock = createMockYtGame({ inEnv: false, audioEnabled: false });
    g.ytgame = mock.ytgame;

    const adapter = new YouTubeAdapter();
    await adapter.init();
    adapter.firstFrame();
    adapter.gameReady();
    adapter.submitScore(300);

    assert.equal(mock.firstFrameCalls, 0);
    assert.equal(mock.gameReadyCalls, 0);
    assert.equal(mock.sentScores.length, 0);
    assert.equal(adapter.isAudioEnabled(), true);

    const save = recordLevelClear(defaultSave(), 1, 2, 6);
    await adapter.save(save);
    assert.equal(mock.saveCalls, 0);
    assert.deepEqual(await adapter.load<SaveData>(), save);
    assert.equal(mock.loadCalls, 0);
  });

  it("invokes firstFrameReady() and gameReady() only once even when called repeatedly", async () => {
    const mock = createMockYtGame({ inEnv: true });
    g.ytgame = mock.ytgame;

    const adapter = new YouTubeAdapter();
    adapter.firstFrame();
    adapter.firstFrame();
    adapter.firstFrame();
    assert.equal(mock.firstFrameCalls, 1);

    adapter.gameReady();
    adapter.gameReady();
    adapter.gameReady();
    assert.equal(mock.gameReadyCalls, 1);
  });

  it("round-trips save/load via ytgame.game, handles empty/corrupt data, and sends clamped floored score", async () => {
    const mock = createMockYtGame({ inEnv: true });
    g.ytgame = mock.ytgame;

    const adapter = new YouTubeAdapter();
    await adapter.init();

    // Empty loadData() ("") returns null
    assert.equal(await adapter.load<SaveData>(), null);

    // Save + load round-trip
    const save = recordLevelClear(defaultSave(), 3, 3, 5);
    await adapter.save(save);
    assert.equal(mock.saveCalls, 1);
    assert.deepEqual(await adapter.load<SaveData>(), save);

    // Corrupt JSON recovers cleanly via parseSaveWithRecovery
    mock.storedData = "{invalid";
    assert.deepEqual(await adapter.load<SaveData>(), defaultSave());

    // Score submission clamps >= 0 and floors
    adapter.submitScore(450.8);
    adapter.submitScore(-20);
    assert.deepEqual(mock.sentScores, [{ value: 450 }, { value: 0 }]);
  });

  it("wires onPause, onResume, onAudioToggle, isAudioEnabled, language, and window error handlers safely", async () => {
    const mock = createMockYtGame({
      inEnv: true,
      audioEnabled: false,
      language: "ja",
    });
    g.ytgame = mock.ytgame;

    const windowEvents = new Set<string>();
    g.window = {
      addEventListener(event: string) {
        windowEvents.add(event);
      },
    };

    const adapter = new YouTubeAdapter();
    let paused = 0;
    let resumed = 0;
    const audioStates: boolean[] = [];

    // Register before init()
    adapter.onPause(() => {
      paused += 1;
    });
    adapter.onAudioToggle((enabled) => {
      audioStates.push(enabled);
    });

    await adapter.init();

    // Register after init()
    adapter.onResume(() => {
      resumed += 1;
    });

    assert.equal(adapter.isAudioEnabled(), false);
    assert.equal(adapter.language(), "ja");
    assert.equal(windowEvents.has("error"), true);
    assert.equal(windowEvents.has("unhandledrejection"), true);

    mock.triggerPause();
    mock.triggerResume();
    mock.triggerAudio(true);
    mock.triggerAudio(false);

    assert.equal(paused, 1);
    assert.equal(resumed, 1);
    assert.deepEqual(audioStates, [true, false]);
  });

  it("initializes cleanly in Node when window is absent", async () => {
    delete g.window;
    const mock = createMockYtGame({ inEnv: true });
    g.ytgame = mock.ytgame;

    const adapter = new YouTubeAdapter();
    await adapter.init();
    assert.equal(adapter.language(), "en-US");
  });
});

describe("createPlatform", () => {
  it("selects WebAdapter or YouTubeAdapter based on envPlatform and defaults to web", () => {
    const def = createPlatform();
    assert.equal(def.id, "web");
    assert.ok(def instanceof WebAdapter);

    const web = createPlatform("web");
    assert.equal(web.id, "web");
    assert.ok(web instanceof WebAdapter);

    const yt = createPlatform("youtube");
    assert.equal(yt.id, "youtube");
    assert.ok(yt instanceof YouTubeAdapter);
  });
});
