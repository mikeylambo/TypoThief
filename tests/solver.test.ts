import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadDict } from "../src/sim/dict.ts";
import {
  createGameState,
  dropLetter,
  isSolved,
  stealLetter,
} from "../src/sim/rules.ts";
import type { GameState, LevelDef, Move } from "../src/sim/types.ts";
import { getHintMove, solveBoard } from "../src/sim/solver.ts";
import { pickDailyPuzzle, weekdayTier } from "../src/sim/daily.ts";

function applyMoves(
  initial: GameState,
  moves: readonly Move[],
  dict: Set<string>,
): GameState {
  let state = initial;
  for (const move of moves) {
    if (move.kind === "steal") {
      const next = stealLetter(state, move.propIdx, move.charIdx, dict);
      assert.notEqual(next, state, `Expected legal steal: ${JSON.stringify(move)}`);
      state = next;
    } else {
      const next = dropLetter(state, move.propIdx, move.pos, move.slotIdx, dict);
      assert.notEqual(next, state, `Expected legal drop: ${JSON.stringify(move)}`);
      state = next;
    }
  }
  return state;
}

const LEVEL_1: LevelDef = {
  id: 1,
  chapter: 1,
  title: "Rookie Caper",
  par: 4,
  pocketCap: 1,
  tier: "mon-tue",
  props: [
    { id: "p1", label: "Lamp", frame: "lamp", start: "CLAMP", goal: "LAMP" },
    { id: "p2", label: "Pedestal", frame: "pedestal", start: "ART", goal: "CAR" },
    { id: "p3", label: "Rope", frame: "crate", start: "RIP", goal: "TRIP" },
  ],
};

describe("BFS solver & trap analyzer", () => {
  it("finds exact par = 4 for ['clamp','art','rip'] -> ['lamp','car','trip'] and replays cleanly", () => {
    const dict = loadDict();
    const result = solveBoard(LEVEL_1, dict);

    assert.equal(result.solvable, true);
    assert.equal(result.par, 4);
    assert.equal(result.path.length, 4);
    assert.ok(result.visited >= 5);
    assert.ok(result.validFirstSteals >= 1);

    const endState = applyMoves(createGameState(LEVEL_1), result.path, dict);
    assert.equal(isSolved(endState), true);
    assert.equal(endState.moves, 4);
  });

  it("respects riveted tiles and supports Ch3 pocketCap = 2 boards", () => {
    const dict = loadDict();

    // Riveting 'C' (index 0) of CLAMP blocks the only path to LAMP
    const rivetedBlocked: LevelDef = {
      ...LEVEL_1,
      props: [
        {
          id: "p1",
          label: "Lamp",
          frame: "lamp",
          start: "CLAMP",
          goal: "LAMP",
          rivets: [0],
        },
        ...LEVEL_1.props.slice(1),
      ],
    };
    const blockedRes = solveBoard(rivetedBlocked, dict);
    assert.equal(blockedRes.solvable, false);
    assert.deepEqual(blockedRes.path, []);

    // Riveting 'L' (index 1) of CLAMP still permits stealing 'C' and solving in par 4
    const rivetedOk: LevelDef = {
      ...LEVEL_1,
      props: [
        {
          id: "p1",
          label: "Lamp",
          frame: "lamp",
          start: "CLAMP",
          goal: "LAMP",
          rivets: [1],
        },
        ...LEVEL_1.props.slice(1),
      ],
    };
    const okRes = solveBoard(rivetedOk, dict);
    assert.equal(okRes.solvable, true);
    assert.equal(okRes.par, 4);
    assert.equal(isSolved(applyMoves(createGameState(rivetedOk), okRes.path, dict)), true);

    // Ch3 2-slot bag swap that deadlocks under pocketCap = 1 but solves under pocketCap = 2
    const swapDict = loadDict(["CLAP", "LAP", "FLAP", "FART", "ART", "CART"]);
    const swapCap1: LevelDef = {
      id: 90,
      chapter: 3,
      title: "Cap 1 Deadlock",
      par: 4,
      pocketCap: 1,
      props: [
        { id: "p1", label: "A", frame: "lamp", start: "CLAP", goal: "FLAP" },
        { id: "p2", label: "B", frame: "crate", start: "FART", goal: "CART" },
      ],
    };
    assert.equal(solveBoard(swapCap1, swapDict).solvable, false);

    const swapCap2: LevelDef = { ...swapCap1, id: 91, pocketCap: 2 };
    const swapRes = solveBoard(swapCap2, swapDict);
    assert.equal(swapRes.solvable, true);
    assert.equal(swapRes.par, 4);
    assert.equal(swapRes.path.length, 4);
    assert.equal(isSolved(applyMoves(createGameState(swapCap2), swapRes.path, swapDict)), true);
  });

  it("counts deadEndFirstSteals for traps that unsolve or exceed par", () => {
    // Suboptimal trap: stealing 'L' from CLAM -> CAM forces bouncing back (exceeds par = 2)
    const trapDict = loadDict(["CLAM", "LAM", "CAM", "RAM", "CRAM", "CLAP", "LAP"]);
    const trapLevel: LevelDef = {
      id: 92,
      chapter: 2,
      title: "Trap Test",
      par: 2,
      pocketCap: 1,
      props: [
        { id: "p1", label: "A", frame: "lamp", start: "CLAM", goal: "LAM" },
        { id: "p2", label: "B", frame: "crate", start: "RAM", goal: "CRAM" },
      ],
    };
    const res = solveBoard(trapLevel, trapDict);
    assert.equal(res.solvable, true);
    assert.equal(res.par, 2);
    // Valid first steals from CLAM: 'C' -> LAM (optimal) and 'L' -> CAM (suboptimal trap)
    assert.equal(res.validFirstSteals, 2);
    assert.equal(res.deadEndFirstSteals, 1);

    // Unsolvable-first-steal trap: stealing 'B' -> RAMP leaves 'B' stranded with no drop back
    // if only 'BRAMP' is absent and 'RAMP' has no valid drops
    const oneWayDict = loadDict(["BRAMP", "RAMP", "CLAM", "LAM", "RAM", "CRAM"]);
    const oneWayLevel: LevelDef = {
      id: 93,
      chapter: 2,
      title: "One-Way Trap",
      par: 2,
      pocketCap: 1,
      props: [
        { id: "p1", label: "A", frame: "lamp", start: "CLAM", goal: "LAM" },
        { id: "p2", label: "B", frame: "crate", start: "RAM", goal: "CRAM" },
        { id: "p3", label: "C", frame: "crate", start: "BRAMP", goal: "BRAMP" },
      ],
    };
    // Note: in oneWayDict, BRAMP -> RAMP (drop B back? B+RAMP = BRAMP -> valid!)
    // To make a genuine one-way trap (no return): steal 'S' from STAR -> TAR where STAR isn't in dict? No, start isn't checked, drop checks dict!
    // Even simpler: in oneWayDict, leave "BRAMP" OUT of dict so dropping 'B' back onto RAMP is rejected!
    const trueOneWayDict = loadDict(["RAMP", "CLAM", "LAM", "RAM", "CRAM"]);
    const oneWayRes = solveBoard(oneWayLevel, trueOneWayDict);
    assert.equal(oneWayRes.solvable, true);
    assert.equal(oneWayRes.par, 2);
    assert.equal(oneWayRes.validFirstSteals, 2); // 'C' from CLAM, 'B' from BRAMP
    assert.equal(oneWayRes.deadEndFirstSteals, 1); // 'B' from BRAMP is unsolvable dead-end
  });

  it("getHintMove returns the exact next optimal Move from mid-puzzle and null at goal", () => {
    const dict = loadDict();
    let state = createGameState(LEVEL_1);

    // Step through the entire puzzle using getHintMove repeatedly
    const taken: Move[] = [];
    for (let i = 0; i < 4; i++) {
      const hint = getHintMove(state, dict);
      assert.ok(hint !== null, `Expected hint at step ${i}`);
      taken.push(hint);
      state = applyMoves(state, [hint], dict);
    }
    assert.equal(isSolved(state), true);
    assert.equal(taken.length, 4);

    // Mid-puzzle check after first optimal steal ('C' from CLAMP -> LAMP)
    const afterFirstSteal = stealLetter(createGameState(LEVEL_1), 0, 0, dict);
    const secondHint = getHintMove(afterFirstSteal, dict);
    assert.deepEqual(secondHint, { kind: "drop", propIdx: 1, pos: 0, slotIdx: 0 });

    // Ch3 2-slot bag mid-puzzle hint check with 2 letters held
    const swapDict = loadDict(["CLAP", "LAP", "FLAP", "FART", "ART", "CART"]);
    const swapLevel: LevelDef = {
      id: 94,
      chapter: 3,
      title: "Cap 2 Hint",
      par: 4,
      pocketCap: 2,
      props: [
        { id: "p1", label: "A", frame: "lamp", start: "CLAP", goal: "FLAP" },
        { id: "p2", label: "B", frame: "crate", start: "FART", goal: "CART" },
      ],
    };
    let sCap2 = createGameState(swapLevel);
    sCap2 = stealLetter(sCap2, 0, 0, swapDict); // pocket ["C"]
    sCap2 = stealLetter(sCap2, 1, 0, swapDict); // pocket ["C", "F"]
    const cap2Hint = getHintMove(sCap2, swapDict);
    assert.ok(cap2Hint !== null);
    assert.equal(cap2Hint.kind, "drop");

    // Solved and unsolvable states return null
    assert.equal(getHintMove(state, dict), null);
    const impossible: LevelDef = {
      ...LEVEL_1,
      props: [
        { ...LEVEL_1.props[0], rivets: [0] },
        ...LEVEL_1.props.slice(1),
      ],
    };
    assert.equal(getHintMove(createGameState(impossible), dict), null);
  });
});

describe("weekdayTier & pickDailyPuzzle", () => {
  const makeMockLevel = (
    id: number,
    chapter: 1 | 2 | 3,
    propCount: number,
    tier?: "mon-tue" | "wed-thu" | "fri-sat" | "sun",
  ): LevelDef => ({
    id,
    chapter,
    title: `Mock ${id}`,
    par: 4,
    pocketCap: chapter === 3 ? 2 : 1,
    tier,
    props: Array.from({ length: propCount }, (_, idx) => ({
      id: `p${idx + 1}`,
      label: `Prop ${idx + 1}`,
      frame: "crate",
      start: "CLAP",
      goal: "CLAP",
    })),
  });

  it("maps UTC YYYY-MM-DD dates to weekday tiers and rejects invalid dates", () => {
    assert.equal(weekdayTier("2026-11-16"), "mon-tue"); // Monday
    assert.equal(weekdayTier("2026-11-17"), "mon-tue"); // Tuesday
    assert.equal(weekdayTier("2026-11-18"), "wed-thu"); // Wednesday
    assert.equal(weekdayTier("2026-11-19"), "wed-thu"); // Thursday
    assert.equal(weekdayTier("2026-11-20"), "fri-sat"); // Friday
    assert.equal(weekdayTier("2026-11-21"), "fri-sat"); // Saturday
    assert.equal(weekdayTier("2026-11-22"), "sun"); // Sunday

    assert.throws(() => weekdayTier("2026-11-31"));
    assert.throws(() => weekdayTier("2026-2-3"));
    assert.throws(() => weekdayTier("not-a-date"));
  });

  it("deterministically picks matching tier puzzles across tagged and untagged mock banks", () => {
    const taggedBank: LevelDef[] = [
      makeMockLevel(101, 1, 3, "mon-tue"),
      makeMockLevel(102, 1, 3, "mon-tue"),
      makeMockLevel(201, 2, 3, "wed-thu"),
      makeMockLevel(202, 2, 3, "wed-thu"),
      makeMockLevel(301, 3, 3, "fri-sat"),
      makeMockLevel(302, 3, 3, "fri-sat"),
      makeMockLevel(401, 3, 4, "sun"),
      makeMockLevel(402, 3, 4, "sun"),
    ];

    const mon = pickDailyPuzzle("2026-11-16", taggedBank);
    const wed = pickDailyPuzzle("2026-11-18", taggedBank);
    const fri = pickDailyPuzzle("2026-11-20", taggedBank);
    const sun = pickDailyPuzzle("2026-11-22", taggedBank);

    assert.equal(mon.tier, "mon-tue");
    assert.equal(mon.chapter, 1);
    assert.equal(wed.tier, "wed-thu");
    assert.equal(wed.chapter, 2);
    assert.equal(fri.tier, "fri-sat");
    assert.equal(fri.chapter, 3);
    assert.equal(sun.tier, "sun");
    assert.equal(sun.props.length, 4);

    // Deterministic across repeated calls
    assert.deepEqual(pickDailyPuzzle("2026-11-16", taggedBank), mon);
    assert.deepEqual(pickDailyPuzzle("2026-11-22", taggedBank), sun);

    // Fallback when tier is omitted on mock entries
    const untaggedBank: LevelDef[] = [
      makeMockLevel(1, 1, 3),
      makeMockLevel(2, 2, 3),
      makeMockLevel(3, 3, 3),
      makeMockLevel(4, 3, 4),
    ];
    assert.equal(pickDailyPuzzle("2026-11-17", untaggedBank).id, 1);
    assert.equal(pickDailyPuzzle("2026-11-19", untaggedBank).id, 2);
    assert.equal(pickDailyPuzzle("2026-11-21", untaggedBank).id, 3);
    assert.equal(pickDailyPuzzle("2026-11-22", untaggedBank).id, 4);
  });
});
