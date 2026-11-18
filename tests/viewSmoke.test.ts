import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CAMPAIGN_LEVELS } from "../src/content/levels.ts";
import { defaultSave, isDailyUnlocked, recordLevelClear } from "../src/meta/save.ts";
import { loadDict } from "../src/sim/dict.ts";
import {
  applyHintSelection,
  createGameState,
  stealLetter,
  toggleDropMode,
} from "../src/sim/rules.ts";
import type { LevelDef } from "../src/sim/types.ts";
import {
  DragClickGuard,
  computeNeutralPreviewWord,
  getDailyTwistCallout,
  getFtueTarget,
  resolveDragGapPos,
  resolveHalfTileDropPos,
  shouldHighlightStealable,
} from "../src/view/BoardView.ts";

describe("BoardView pure UI helpers", () => {
  it("resolves left/right half-tile drop positions accurately", () => {
    // Tile 2 spans [100, 148), midpoint 124
    assert.equal(resolveHalfTileDropPos(2, 105, 100, 48), 2);
    assert.equal(resolveHalfTileDropPos(2, 123.9, 100, 48), 2);
    assert.equal(resolveHalfTileDropPos(2, 124, 100, 48), 3);
    assert.equal(resolveHalfTileDropPos(2, 147, 100, 48), 3);
    assert.equal(resolveHalfTileDropPos(2, 0, 0, 0, true), 2);
  });

  it("resolves drag gap index across tile bounding rects and builds neutral preview text", () => {
    const rects = [
      { left: 20, width: 48 }, // mid 44
      { left: 74, width: 48 }, // mid 98
      { left: 128, width: 48 }, // mid 152
    ];
    assert.equal(resolveDragGapPos(3, 30, rects), 0);
    assert.equal(resolveDragGapPos(3, 70, rects), 1);
    assert.equal(resolveDragGapPos(3, 130, rects), 2);
    assert.equal(resolveDragGapPos(3, 170, rects), 3);

    assert.equal(computeNeutralPreviewWord("ART", "C", 0), "CART");
    assert.equal(computeNeutralPreviewWord("ART", "C", 3), "ARTC");
  });

  it("highlights stealable tiles ONLY on Campaign Levels 1-2", () => {
    assert.equal(shouldHighlightStealable("campaign", 1), true);
    assert.equal(shouldHighlightStealable("campaign", 2), true);
    assert.equal(shouldHighlightStealable("campaign", 3), false);
    assert.equal(shouldHighlightStealable("campaign", 18), false);
    assert.equal(shouldHighlightStealable("daily", 1), false);
    assert.equal(shouldHighlightStealable("daily", 1001), false);
  });

  it("drives Level 1 FTUE pointing hand across steal and drop steps until cleared", () => {
    const dict = loadDict();
    const save = defaultSave();
    const lvl1 = CAMPAIGN_LEVELS[0];
    let state = createGameState(lvl1);

    assert.deepEqual(getFtueTarget("campaign", 1, save, state), {
      propIdx: 0,
      charIdx: 0,
      side: "center",
    });

    state = stealLetter(state, 0, 0, dict);
    assert.deepEqual(getFtueTarget("campaign", 1, save, state), {
      propIdx: 1,
      charIdx: 0,
      side: "left",
    });

    const clearedSave = { ...save, ftueCompleted: true };
    assert.equal(getFtueTarget("campaign", 1, clearedSave, state), null);
    assert.equal(getFtueTarget("campaign", 2, save, state), null);
    assert.equal(getFtueTarget("daily", 1, save, state), null);
  });

  it("triggers Daily Heist early-twist callouts after Level 6 unlocks Daily and hides after clearing Ch2/Ch3 or seeing once", () => {
    const rivetDaily: LevelDef = {
      id: 1093,
      chapter: 2,
      title: "Rivet Test",
      par: 4,
      pocketCap: 1,
      props: [{ id: "p1", label: "Safe", frame: "safe", start: "CAPE", goal: "CAP", rivets: [0] }],
    };
    const twoSlotDaily: LevelDef = {
      id: 1185,
      chapter: 3,
      title: "Twin Test",
      par: 6,
      pocketCap: 2,
      props: [{ id: "p1", label: "Lamp", frame: "lamp", start: "CHAR", goal: "CARD" }],
    };

    // Realistic progression: player clears Level 6 (unlocks Daily, highestUnlocked becomes 7, level 7 not cleared yet)
    const justUnlockedDaily = recordLevelClear(defaultSave(), 6, 3, 6);
    assert.equal(isDailyUnlocked(justUnlockedDaily), true);
    assert.equal(justUnlockedDaily.highestUnlocked, 7);
    assert.deepEqual(getDailyTwistCallout(rivetDaily, justUnlockedDaily), {
      rivets: true,
      twoSlot: false,
    });
    assert.deepEqual(getDailyTwistCallout(twoSlotDaily, justUnlockedDaily), {
      rivets: false,
      twoSlot: true,
    });

    const seenRivetSave = {
      ...justUnlockedDaily,
      seenDailyTwists: { rivets: true, twoSlot: false },
    };
    assert.deepEqual(getDailyTwistCallout(rivetDaily, seenRivetSave), {
      rivets: false,
      twoSlot: false,
    });

    // Once Level 7 (first Ch2 rivet level) is cleared, rivet callout no longer triggers
    const clearedL7Save = recordLevelClear(justUnlockedDaily, 7, 3, 4);
    assert.deepEqual(getDailyTwistCallout(rivetDaily, clearedL7Save), {
      rivets: false,
      twoSlot: false,
    });
    assert.deepEqual(getDailyTwistCallout(twoSlotDaily, clearedL7Save), {
      rivets: false,
      twoSlot: true,
    });

    // Clearing Level 12 unlocks Level 13 (twoSlot not yet cleared -> still triggers)
    const clearedL12Save = recordLevelClear(clearedL7Save, 12, 3, 8);
    assert.equal(clearedL12Save.highestUnlocked, 13);
    assert.deepEqual(getDailyTwistCallout(twoSlotDaily, clearedL12Save), {
      rivets: false,
      twoSlot: true,
    });

    // Once Level 13 (first Ch3 2-slot level) is cleared, twoSlot callout no longer triggers
    const clearedL13Save = recordLevelClear(clearedL12Save, 13, 3, 4);
    assert.deepEqual(getDailyTwistCallout(twoSlotDaily, clearedL13Save), {
      rivets: false,
      twoSlot: false,
    });
  });

  it("clears drag click suppression on render, click consumption, or after drag release outside slot", async () => {
    const guard = new DragClickGuard();

    // Short tap (never marked dragging) does not suppress click
    assert.equal(guard.consumeClick(), false);

    // Dragging then releasing over the same button suppresses the immediate click and clears
    guard.markDragging();
    guard.releaseAfterDrag();
    assert.equal(guard.consumeClick(), true);
    assert.equal(guard.consumeClick(), false);

    // Dragging then releasing outside the slot (no click event fires) auto-clears on next tick
    guard.markDragging();
    guard.releaseAfterDrag();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(guard.consumeClick(), false);

    // Explicit reset (called by BoardView.render) clears immediately
    guard.markDragging();
    guard.reset();
    assert.equal(guard.consumeClick(), false);
  });

  it("applyHintSelection flips Ch3 1/2 dropMode back to false on steal hint and preserves !usedHint when move is null", () => {
    const ch3Level: LevelDef = {
      id: 14,
      chapter: 3,
      title: "Twin Heist",
      par: 6,
      pocketCap: 2,
      props: [
        { id: "p1", label: "Lamp", frame: "lamp", start: "CLAP", goal: "FLAP" },
        { id: "p2", label: "Crate", frame: "crate", start: "FLOCK", goal: "CLOCK" },
      ],
    };
    const dict = loadDict(["CLAP", "LAP", "FLAP", "FLOCK", "LOCK", "CLOCK"]);
    let state = createGameState(ch3Level);
    state = stealLetter(state, 0, 0, dict); // pocket ["C"] (1/2)
    state = toggleDropMode(state, 0);
    assert.equal(state.dropMode, true);
    assert.equal(state.usedHint, false);

    // Hint returns a steal move -> exits dropMode, resets activeSlot, sets usedHint
    const afterStealHint = applyHintSelection(state, {
      kind: "steal",
      propIdx: 1,
      charIdx: 0,
    });
    assert.equal(afterStealHint.dropMode, false);
    assert.equal(afterStealHint.activeSlot, 0);
    assert.equal(afterStealHint.usedHint, true);

    // Hint returns a drop move -> enters dropMode on move.slotIdx and sets usedHint
    const afterDropHint = applyHintSelection(afterStealHint, {
      kind: "drop",
      propIdx: 0,
      pos: 0,
      slotIdx: 1,
    });
    assert.equal(afterDropHint.dropMode, true);
    assert.equal(afterDropHint.activeSlot, 1);
    assert.equal(afterDropHint.usedHint, true);

    // Hint returns null -> leaves usedHint false and state unchanged
    const afterNullHint = applyHintSelection(state, null);
    assert.equal(afterNullHint.usedHint, false);
    assert.equal(afterNullHint.dropMode, true);
    assert.equal(afterNullHint, state);
  });
});
