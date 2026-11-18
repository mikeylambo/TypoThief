import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SAVE_SCHEMA,
  defaultSave,
  parseSaveWithRecovery,
  recordLevelClear,
  recordDailyClear,
  isDailyUnlocked,
  computeTotalScore,
  getResumeLevelId,
  type SaveData,
} from "../src/meta/save.ts";

describe("versioned save store and progression", () => {
  it("keeps Daily Heist locked until level 6 is cleared, then unlocks it", () => {
    let save = defaultSave();
    assert.equal(save.schemaVersion, SAVE_SCHEMA);
    assert.equal(SAVE_SCHEMA, 1);
    assert.equal(isDailyUnlocked(save), false);

    for (let id = 1; id <= 5; id++) {
      save = recordLevelClear(save, id, 2, 5);
      assert.equal(isDailyUnlocked(save), false);
    }

    save = recordLevelClear(save, 6, 3, 6);
    assert.equal(save.highestUnlocked, 7);
    assert.equal(isDailyUnlocked(save), true);
  });

  it("advances highestUnlocked sequentially up to 18, sets ftueCompleted on level 1, and never downgrades stars or bestMoves", () => {
    const initial = defaultSave();
    assert.equal(initial.highestUnlocked, 1);
    assert.equal(initial.ftueCompleted, false);

    const afterL1 = recordLevelClear(initial, 1, 2, 6);
    // Input save was not mutated
    assert.equal(initial.highestUnlocked, 1);
    assert.equal(initial.ftueCompleted, false);
    assert.deepEqual(initial.levels, {});

    assert.equal(afterL1.highestUnlocked, 2);
    assert.equal(afterL1.ftueCompleted, true);
    assert.deepEqual(afterL1.levels[1], { stars: 2, bestMoves: 6 });

    const afterL2 = recordLevelClear(afterL1, 2, 3, 5);
    assert.equal(afterL2.highestUnlocked, 3);

    // Replay level 1 with worse stars (1) and worse moves (9): keep 2 stars, 6 moves, highestUnlocked = 3
    const replayWorse = recordLevelClear(afterL2, 1, 1, 9);
    assert.deepEqual(replayWorse.levels[1], { stars: 2, bestMoves: 6 });
    assert.equal(replayWorse.highestUnlocked, 3);

    // Replay level 1 with better stars (3) and fewer moves (4): upgrade stars & bestMoves
    const replayBetter = recordLevelClear(replayWorse, 1, 3, 4);
    assert.deepEqual(replayBetter.levels[1], { stars: 3, bestMoves: 4 });
    assert.equal(replayBetter.highestUnlocked, 3);

    // Clearing level 18 caps highestUnlocked at 18
    let full = replayBetter;
    for (let id = 2; id <= 18; id++) {
      full = recordLevelClear(full, id, 3, 4);
    }
    assert.equal(full.highestUnlocked, 18);
  });

  it("computes total score as (totalStars * 100) + (dailyClears * 150)", () => {
    let save = defaultSave();
    assert.equal(computeTotalScore(save), 0);

    save = recordLevelClear(save, 1, 3, 4); // +300
    save = recordLevelClear(save, 2, 2, 6); // +200
    save = recordDailyClear(save, "2026-11-16", 2); // +150
    save = recordDailyClear(save, "2026-11-17", 3); // +150
    // Replaying same daily with fewer stars keeps best stars and does not double-count dailyClears
    save = recordDailyClear(save, "2026-11-17", 1);

    assert.equal(computeTotalScore(save), (3 + 2) * 100 + 2 * 150);
    assert.equal(computeTotalScore(save), 800);
  });

  it("tracks dailyStreak across consecutive UTC days, resets on gaps, and preserves streak on same-day replay", () => {
    let save = defaultSave();

    // First daily clear -> streak 1
    save = recordDailyClear(save, "2026-01-31", 2);
    assert.equal(save.dailyStreak, 1);
    assert.equal(save.lastDailyDate, "2026-01-31");
    assert.equal(save.dailyCleared["2026-01-31"], 2);

    // Consecutive UTC day across month boundary -> streak 2
    save = recordDailyClear(save, "2026-02-01", 3);
    assert.equal(save.dailyStreak, 2);
    assert.equal(save.lastDailyDate, "2026-02-01");

    // Replay same UTC date with lower stars -> streak stays 2, stars stay 3
    save = recordDailyClear(save, "2026-02-01", 1);
    assert.equal(save.dailyStreak, 2);
    assert.equal(save.lastDailyDate, "2026-02-01");
    assert.equal(save.dailyCleared["2026-02-01"], 3);

    // Gap (skipped Feb 2) -> streak resets to 1
    save = recordDailyClear(save, "2026-02-03", 2);
    assert.equal(save.dailyStreak, 1);
    assert.equal(save.lastDailyDate, "2026-02-03");

    // Same-day replay when recovered dailyStreak is 0 floors dailyStreak at 1
    const zeroStreakSameDay: SaveData = {
      ...save,
      dailyStreak: 0,
      lastDailyDate: "2026-02-03",
    };
    const replayed = recordDailyClear(zeroStreakSameDay, "2026-02-03", 3);
    assert.equal(replayed.dailyStreak, 1);
    assert.equal(replayed.dailyCleared["2026-02-03"], 3);
  });

  it("recovers cleanly from null, undefined, malformed JSON, wrong schemaVersion, and corrupted fields", () => {
    const fresh = defaultSave();

    assert.deepEqual(parseSaveWithRecovery(null), fresh);
    assert.deepEqual(parseSaveWithRecovery(undefined), fresh);
    assert.deepEqual(parseSaveWithRecovery("{bad json"), fresh);
    assert.deepEqual(parseSaveWithRecovery("42"), fresh);
    assert.deepEqual(parseSaveWithRecovery("[]"), fresh);
    assert.deepEqual(parseSaveWithRecovery(123), fresh);
    assert.deepEqual(parseSaveWithRecovery(["not", "an", "object"]), fresh);
    assert.deepEqual(
      parseSaveWithRecovery({ ...fresh, schemaVersion: 99 }),
      fresh,
    );
    assert.deepEqual(
      parseSaveWithRecovery({ ...fresh, schemaVersion: "1" }),
      fresh,
    );

    // Negative / NaN / out-of-range fields with valid schemaVersion reset cleanly
    const corruptedFields: Record<string, unknown> = {
      schemaVersion: 1,
      highestUnlocked: -5,
      levels: {
        "0": { stars: 3, bestMoves: 4 },
        "19": { stars: 3, bestMoves: 4 },
        "1": { stars: 4, bestMoves: 4 },
        "2": { stars: 2, bestMoves: -3 },
        "3": { stars: Number.NaN, bestMoves: Number.NaN },
      },
      dailyCleared: {
        "not-a-date": 3,
        "2026-02-30": 2,
        "2026-11-17": 5,
      },
      dailyStreak: Number.NaN,
      lastDailyDate: "bad-date",
      muted: "yes",
      reducedMotion: 1,
      ftueCompleted: null,
      seenDailyTwists: { rivets: "nope", twoSlot: 123 },
    };
    assert.deepEqual(parseSaveWithRecovery(corruptedFields), fresh);

    // Preserves valid entries alongside corrupted ones when schemaVersion === 1
    const partialPayload = JSON.stringify({
      schemaVersion: 1,
      highestUnlocked: 4,
      levels: {
        "1": { stars: 3, bestMoves: 4 },
        "2": { stars: 99, bestMoves: 5 }, // corrupted stars
        "3": { stars: 2, bestMoves: -1 }, // corrupted moves
      },
      dailyCleared: {
        "2026-11-17": 2,
        "bad-key": 3,
      },
      dailyStreak: 5,
      lastDailyDate: "2026-11-17",
      muted: true,
      reducedMotion: false,
      ftueCompleted: true,
      seenDailyTwists: { rivets: true, twoSlot: "invalid" },
    });

    const recovered: SaveData = parseSaveWithRecovery(partialPayload);
    assert.equal(recovered.schemaVersion, 1);
    assert.equal(recovered.highestUnlocked, 4);
    assert.deepEqual(recovered.levels, { "1": { stars: 3, bestMoves: 4 } });
    assert.deepEqual(recovered.dailyCleared, { "2026-11-17": 2 });
    assert.equal(recovered.dailyStreak, 5);
    assert.equal(recovered.lastDailyDate, "2026-11-17");
    assert.equal(recovered.muted, true);
    assert.equal(recovered.reducedMotion, false);
    assert.equal(recovered.ftueCompleted, true);
    assert.deepEqual(recovered.seenDailyTwists, {
      rivets: true,
      twoSlot: false,
    });

    // Reconciles highestUnlocked from recovered levels when highestUnlocked is corrupted or lower
    const reconciled = parseSaveWithRecovery({
      schemaVersion: 1,
      highestUnlocked: -1,
      levels: {
        "6": { stars: 3, bestMoves: 8 },
      },
    });
    assert.equal(reconciled.highestUnlocked, 7);

    const reconciledCap = parseSaveWithRecovery({
      schemaVersion: 1,
      highestUnlocked: 5,
      levels: {
        "18": { stars: 2, bestMoves: 9 },
      },
    });
    assert.equal(reconciledCap.highestUnlocked, 18);
  });

  it("returns 1 on fresh save, lowest uncompleted unlocked level on return, and 0 after level 18 is cleared", () => {
    let save = defaultSave();
    assert.equal(getResumeLevelId(save), 1);

    save = recordLevelClear(save, 1, 3, 4);
    assert.equal(getResumeLevelId(save), 2);

    save = recordLevelClear(save, 2, 2, 6);
    assert.equal(getResumeLevelId(save), 3);

    // If highestUnlocked is 5 but level 3 is uncompleted, returns lowest uncompleted unlocked (3)
    const gapped: SaveData = {
      ...save,
      highestUnlocked: 5,
      levels: {
        ...save.levels,
        4: { stars: 3, bestMoves: 5 },
      },
    };
    assert.equal(getResumeLevelId(gapped), 3);

    // Clearing all up to 18 returns 0 (Chapter Select)
    for (let id = 3; id <= 17; id++) {
      save = recordLevelClear(save, id, 2, 6);
    }
    assert.equal(getResumeLevelId(save), 18);

    save = recordLevelClear(save, 18, 3, 7);
    assert.equal(getResumeLevelId(save), 0);
  });
});
