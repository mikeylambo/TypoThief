import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CAMPAIGN_LEVELS } from "../src/content/levels.ts";
import { defaultSave } from "../src/meta/save.ts";
import { loadDict } from "../src/sim/dict.ts";
import { createGameState, stealLetter } from "../src/sim/rules.ts";
import type { LevelDef } from "../src/sim/types.ts";
import {
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

  it("triggers Daily Heist early-twist callouts only before campaign unlock and once per twist", () => {
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

    const ch1ClearSave = { ...defaultSave(), highestUnlocked: 6 };
    assert.deepEqual(getDailyTwistCallout(rivetDaily, ch1ClearSave), {
      rivets: true,
      twoSlot: false,
    });
    assert.deepEqual(getDailyTwistCallout(twoSlotDaily, ch1ClearSave), {
      rivets: false,
      twoSlot: true,
    });

    const seenRivetSave = {
      ...ch1ClearSave,
      seenDailyTwists: { rivets: true, twoSlot: false },
    };
    assert.deepEqual(getDailyTwistCallout(rivetDaily, seenRivetSave), {
      rivets: false,
      twoSlot: false,
    });

    const ch2Save = { ...defaultSave(), highestUnlocked: 7 };
    assert.deepEqual(getDailyTwistCallout(rivetDaily, ch2Save), {
      rivets: false,
      twoSlot: false,
    });

    const ch3Save = { ...defaultSave(), highestUnlocked: 13 };
    assert.deepEqual(getDailyTwistCallout(twoSlotDaily, ch3Save), {
      rivets: false,
      twoSlot: false,
    });
  });
});
