import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CAMPAIGN_LEVELS } from "../src/content/levels.ts";
import { DAILY_BANK } from "../src/content/dailyBank.ts";
import { isValidWord, loadDict } from "../src/sim/dict.ts";
import { createGameState, dropLetter, stealLetter } from "../src/sim/rules.ts";
import { solveBoard } from "../src/sim/solver.ts";
import type { DailyTier, LevelDef, Move } from "../src/sim/types.ts";

const AVOIDED_WORDS = new Set([
  "drug",
  "kill",
  "fart",
  "dead",
  "hell",
  "sin",
  "dam",
  "gay",
  "pee",
  "poop",
  "booty",
  "weed",
  "bra",
  "scum",
  "suck",
  "bomb",
  "shoot",
  "stab",
]);

function assertFamilyFriendlyLevel(
  level: LevelDef,
  solutionPath: readonly Move[],
  dict: Set<string>,
): void {
  for (const prop of level.props) {
    assert.equal(
      AVOIDED_WORDS.has(prop.start.toLowerCase()),
      false,
      `Level ${level.id} start '${prop.start}' is in avoided list`,
    );
    assert.equal(
      AVOIDED_WORDS.has(prop.goal.toLowerCase()),
      false,
      `Level ${level.id} goal '${prop.goal}' is in avoided list`,
    );
  }
  let state = createGameState(level);
  for (const move of solutionPath) {
    state =
      move.kind === "steal"
        ? stealLetter(state, move.propIdx, move.charIdx, dict)
        : dropLetter(state, move.propIdx, move.pos, move.slotIdx, dict);
    const word = state.props[move.propIdx].word.toLowerCase();
    assert.equal(
      AVOIDED_WORDS.has(word),
      false,
      `Level ${level.id} intermediate word '${word}' is in avoided list`,
    );
  }
}

const VALID_FRAMES = new Set([
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
]);

const SOLVER_MAX_NODES = 6000;

function assertValidWordsAndProps(level: LevelDef, dict: Set<string>): void {
  assert.ok(level.title.trim().length > 0, `Level ${level.id} missing title`);
  assert.ok(
    level.props.length >= 3 && level.props.length <= 4,
    `Level ${level.id} expected 3-4 props, got ${level.props.length}`,
  );
  for (const prop of level.props) {
    assert.ok(prop.id.trim().length > 0, `Level ${level.id} prop missing id`);
    assert.ok(prop.label.trim().length > 0, `Level ${level.id} prop missing label`);
    assert.ok(
      VALID_FRAMES.has(prop.frame),
      `Level ${level.id} invalid frame '${prop.frame}'`,
    );
    assert.ok(
      prop.start.length >= 3 && prop.start.length <= 6,
      `Level ${level.id} start '${prop.start}' length out of 3..6`,
    );
    assert.ok(
      prop.goal.length >= 3 && prop.goal.length <= 6,
      `Level ${level.id} goal '${prop.goal}' length out of 3..6`,
    );
    assert.equal(
      isValidWord(dict, prop.start),
      true,
      `Level ${level.id} start '${prop.start}' not in dict.json`,
    );
    assert.equal(
      isValidWord(dict, prop.goal),
      true,
      `Level ${level.id} goal '${prop.goal}' not in dict.json`,
    );
    if (prop.rivets) {
      for (const idx of prop.rivets) {
        assert.ok(
          Number.isInteger(idx) && idx >= 0 && idx < prop.start.length,
          `Level ${level.id} prop '${prop.id}' invalid rivet index ${idx}`,
        );
      }
    }
  }
}

describe("Campaign 18 levels & 365+ Daily Heist bank", () => {
  const dict = loadDict();

  it("has 18 campaign levels (6 per chapter) with valid words, frames, rivets, and pocketCap progression", () => {
    assert.equal(CAMPAIGN_LEVELS.length, 18);

    const chapterCounts = new Map<number, number>([
      [1, 0],
      [2, 0],
      [3, 0],
    ]);

    for (let i = 0; i < CAMPAIGN_LEVELS.length; i++) {
      const level = CAMPAIGN_LEVELS[i];
      assert.equal(level.id, i + 1, `Expected sequential campaign id ${i + 1}`);
      chapterCounts.set(level.chapter, (chapterCounts.get(level.chapter) ?? 0) + 1);

      if (level.chapter === 1) {
        assert.equal(level.pocketCap, 1, `Ch1 level ${level.id} must have pocketCap=1`);
        const hasRivets = level.props.some((p) => (p.rivets?.length ?? 0) > 0);
        assert.equal(hasRivets, false, `Ch1 level ${level.id} must not have rivets`);
      } else if (level.chapter === 2) {
        assert.equal(level.pocketCap, 1, `Ch2 level ${level.id} must have pocketCap=1`);
        const hasRivets = level.props.some((p) => (p.rivets?.length ?? 0) > 0);
        assert.equal(hasRivets, true, `Ch2 level ${level.id} must have at least one rivet`);
      } else {
        assert.equal(level.chapter, 3);
        assert.equal(level.pocketCap, 2, `Ch3 level ${level.id} must have pocketCap=2`);
      }

      assertValidWordsAndProps(level, dict);
    }

    assert.equal(chapterCounts.get(1), 6);
    assert.equal(chapterCounts.get(2), 6);
    assert.equal(chapterCounts.get(3), 6);

    assert.deepEqual(
      CAMPAIGN_LEVELS[0].props.map((p) => `${p.start}->${p.goal}`),
      ["CLAMP->LAMP", "ART->CAR", "RIP->TRIP"],
    );
    assert.equal(CAMPAIGN_LEVELS[0].par, 4);

    assert.deepEqual(
      CAMPAIGN_LEVELS[1].props.map((p) => `${p.start}->${p.goal}`),
      ["CHAIR->HAIR", "ART->CAR", "EAR->TEA", "ICE->RICE"],
    );
    assert.equal(CAMPAIGN_LEVELS[1].par, 6);
  });

  it("solves every campaign level at exact par and meets L3..18 trap/depth thresholds", () => {
    for (const level of CAMPAIGN_LEVELS) {
      const result = solveBoard(level, dict, SOLVER_MAX_NODES);
      assert.equal(result.solvable, true, `Campaign level ${level.id} not solvable`);
      assert.equal(
        result.par,
        level.par,
        `Campaign level ${level.id} par mismatch: declared ${level.par}, solved ${result.par}`,
      );
      assertFamilyFriendlyLevel(level, result.path, dict);

      if (level.id >= 3) {
        assert.ok(
          level.par >= 4 && level.par <= 8,
          `Campaign level ${level.id} par ${level.par} outside 4..8`,
        );
        assert.ok(
          result.validFirstSteals >= 2,
          `Campaign level ${level.id} validFirstSteals=${result.validFirstSteals} < 2`,
        );
        assert.ok(
          result.deadEndFirstSteals >= 1 || level.par >= 6,
          `Campaign level ${level.id} lacks trap/depth (deadEnd=${result.deadEndFirstSteals}, par=${level.par})`,
        );
      }
    }
  });

  it("has >= 365 unique daily puzzles with >= 92 per weekday tier, valid words, and exact solver verification", () => {
    assert.ok(
      DAILY_BANK.length >= 365,
      `Expected DAILY_BANK.length >= 365, got ${DAILY_BANK.length}`,
    );

    const tierCounts = new Map<DailyTier, number>([
      ["mon-tue", 0],
      ["wed-thu", 0],
      ["fri-sat", 0],
      ["sun", 0],
    ]);

    const seenIds = new Set<number>();
    const seenBoards = new Set<string>();

    for (const level of DAILY_BANK) {
      assert.ok(level.tier, `Daily level ${level.id} missing tier`);
      assert.equal(seenIds.has(level.id), false, `Duplicate daily id ${level.id}`);
      seenIds.add(level.id);

      tierCounts.set(level.tier, (tierCounts.get(level.tier) ?? 0) + 1);
      assertValidWordsAndProps(level, dict);

      const boardKey = `${level.pocketCap}|${level.props
        .map((p) => `${p.start}->${p.goal}@${(p.rivets ?? []).join(",")}`)
        .join(";")}`;
      assert.equal(seenBoards.has(boardKey), false, `Duplicate daily board ${boardKey}`);
      seenBoards.add(boardKey);

      if (level.tier === "mon-tue") {
        assert.equal(level.chapter, 1);
        assert.equal(level.pocketCap, 1);
        assert.ok(level.par >= 4 && level.par <= 6, `mon-tue par=${level.par} out of 4..6`);
      } else if (level.tier === "wed-thu") {
        assert.equal(level.chapter, 2);
        assert.equal(level.pocketCap, 1);
        assert.ok(
          level.props.some((p) => (p.rivets?.length ?? 0) > 0),
          `wed-thu daily ${level.id} missing rivets`,
        );
        assert.ok(level.par >= 4 && level.par <= 6, `wed-thu par=${level.par} out of 4..6`);
      } else if (level.tier === "fri-sat") {
        assert.equal(level.chapter, 3);
        assert.equal(level.pocketCap, 2);
        assert.ok(level.par >= 6 && level.par <= 8, `fri-sat par=${level.par} out of 6..8`);
      } else {
        assert.equal(level.tier, "sun");
        assert.ok(level.chapter === 2 || level.chapter === 3);
        assert.equal(level.props.length, 4, `sun daily ${level.id} must have 4 props`);
        assert.equal(level.pocketCap, level.chapter === 3 ? 2 : 1);
        if (level.chapter === 2) {
          assert.ok(
            level.props.some((p) => (p.rivets?.length ?? 0) > 0),
            `sun Ch2 daily ${level.id} missing rivets`,
          );
        }
        assert.ok(level.par >= 6 && level.par <= 8, `sun par=${level.par} out of 6..8`);
      }

      const result = solveBoard(level, dict, SOLVER_MAX_NODES);
      assert.equal(result.solvable, true, `Daily level ${level.id} (${level.tier}) not solvable`);
      assert.equal(
        result.par,
        level.par,
        `Daily level ${level.id} (${level.tier}) par mismatch: declared ${level.par}, solved ${result.par}`,
      );
      assertFamilyFriendlyLevel(level, result.path, dict);

      if (level.tier !== "mon-tue") {
        assert.ok(
          result.validFirstSteals >= 2,
          `Daily level ${level.id} (${level.tier}) validFirstSteals=${result.validFirstSteals} < 2`,
        );
        assert.ok(
          result.deadEndFirstSteals >= 1 || level.par >= 6,
          `Daily level ${level.id} (${level.tier}) lacks trap/depth`,
        );
      }
    }

    for (const [tier, count] of tierCounts) {
      assert.ok(count >= 92, `Tier ${tier} has ${count} puzzles, expected >= 92`);
    }
  });
});
