import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadDict } from "../src/sim/dict.ts";
import type { LevelDef } from "../src/sim/types.ts";
import {
  createGameState,
  canSteal,
  stealLetter,
  canDrop,
  dropLetter,
  toggleDropMode,
  undoMove,
  resetGame,
  hasAnyValidDrop,
  isStuck,
  isSolved,
  computeStars,
} from "../src/sim/rules.ts";

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

describe("pure game rules engine", () => {
  it("executes valid steal & drop sequence, increments moves, and solves only with empty bag", () => {
    const dict = loadDict();
    let state = createGameState(LEVEL_1);

    assert.equal(state.moves, 0);
    assert.deepEqual(state.pocket, []);
    assert.equal(state.dropMode, false);
    assert.equal(state.activeSlot, 0);
    assert.equal(state.usedHint, false);
    assert.equal(isSolved(state), false);

    // Invalid steal: stealing 'L' from CLAMP -> CAMP (valid), wait: stealing 'A' -> CLMP (invalid)
    const badSteal = canSteal(state, 0, 2, dict);
    assert.equal(badSteal.ok, false);
    assert.equal(stealLetter(state, 0, 2, dict), state);

    // 1. Steal 'C' from CLAMP -> LAMP
    const s1 = canSteal(state, 0, 0, dict);
    assert.equal(s1.ok, true);
    assert.equal(s1.nextWord, "LAMP");
    state = stealLetter(state, 0, 0, dict);
    assert.equal(state.props[0].word, "LAMP");
    assert.deepEqual(state.pocket, ["C"]);
    assert.equal(state.dropMode, true);
    assert.equal(state.activeSlot, 0);
    assert.equal(state.moves, 1);

    // Cannot steal when bag is full (1/1)
    assert.equal(canSteal(state, 2, 0, dict).ok, false);

    // 2. Drop 'C' before ART -> CART
    const d1 = canDrop(state, 1, 0, 0, dict);
    assert.equal(d1.ok, true);
    assert.equal(d1.nextWord, "CART");
    state = dropLetter(state, 1, 0, 0, dict);
    assert.equal(state.props[1].word, "CART");
    assert.deepEqual(state.pocket, []);
    assert.equal(state.dropMode, false);
    assert.equal(state.moves, 2);

    // 3. Steal 'T' from CART -> CAR
    state = stealLetter(state, 1, 3, dict);
    assert.equal(state.props[1].word, "CAR");
    assert.deepEqual(state.pocket, ["T"]);
    assert.equal(state.moves, 3);
    assert.equal(isSolved(state), false);

    // 4. Drop 'T' before RIP -> TRIP
    state = dropLetter(state, 2, 0, 0, dict);
    assert.equal(state.props[2].word, "TRIP");
    assert.deepEqual(state.pocket, []);
    assert.equal(state.dropMode, false);
    assert.equal(state.moves, 4);
    assert.equal(isSolved(state), true);
  });

  it("requires an empty pocket for isSolved even if all props already match goals", () => {
    const dict = loadDict(["cart", "car", "lamp", "trip"]);
    const level: LevelDef = {
      id: 99,
      chapter: 1,
      title: "Bag Check",
      par: 1,
      pocketCap: 1,
      props: [
        { id: "p1", label: "Cart", frame: "cart", start: "cart", goal: "car" },
        { id: "p2", label: "Lamp", frame: "lamp", start: "lamp", goal: "lamp" },
      ],
    };
    let state = createGameState(level);
    state = stealLetter(state, 0, 3, dict); // cart -> car, pocket = ['t']
    assert.equal(state.props[0].word, "car");
    assert.equal(state.props[1].word, "lamp");
    assert.deepEqual(state.pocket, ["t"]);
    assert.equal(isSolved(state), false);
  });

  it("enforces 3-6 letter bounds on steal and drop even with custom dicts", () => {
    const customDict = loadDict(["at", "art", "planet", "planets"]);
    const level: LevelDef = {
      id: 2,
      chapter: 1,
      title: "Bounds",
      par: 2,
      pocketCap: 1,
      props: [
        { id: "p1", label: "Art", frame: "pedestal", start: "art", goal: "art" },
        { id: "p2", label: "Planet", frame: "crate", start: "planet", goal: "planet" },
        { id: "p3", label: "Star", frame: "safe", start: "star", goal: "star" },
      ],
    };
    let state = createGameState(level);
    // Cannot steal from 3-letter word to form 2-letter word ("at")
    assert.equal(canSteal(state, 0, 1, customDict).ok, false);

    // Put 's' in pocket by using custom dict with "star" -> "tar"
    const customDict2 = loadDict(["tar", "star", "planet", "planets"]);
    state = stealLetter(state, 2, 0, customDict2);
    assert.deepEqual(state.pocket, ["s"]);
    // Cannot drop into 6-letter word "planet" to form 7-letter "planets"
    assert.equal(canDrop(state, 1, 6, 0, customDict2).ok, false);
  });

  it("tracks rivets index shifting across steals and drops and blocks stealing riveted tiles", () => {
    const dict = loadDict(["scare", "care", "scar", "cxare", "caxre"]);
    const level: LevelDef = {
      id: 7,
      chapter: 2,
      title: "Riveted Vault",
      par: 2,
      pocketCap: 1,
      props: [
        {
          id: "p1",
          label: "Vault",
          frame: "safe",
          start: "scare",
          goal: "scare",
          rivets: [2], // 'a' in "scare"
        },
      ],
    };

    let state = createGameState(level);
    assert.deepEqual(state.props[0].rivets, [false, false, true, false, false]);

    // Attempting to steal riveted 'a' (idx 2) is rejected
    const rivetedAttempt = canSteal(state, 0, 2, dict);
    assert.equal(rivetedAttempt.ok, false);
    assert.equal(stealLetter(state, 0, 2, dict), state);

    // Steal index 0 ('s') from "scare" -> "care"; rivet on 'a' shifts from idx 2 to idx 1
    state = stealLetter(state, 0, 0, dict);
    assert.equal(state.props[0].word, "care");
    assert.deepEqual(state.props[0].rivets, [false, true, false, false]);

    // Drop 's' at pos 0 (pos <= r) -> "scare"; rivet shifts right to idx 2
    const droppedAt0 = dropLetter(state, 0, 0, 0, dict);
    assert.equal(droppedAt0.props[0].word, "scare");
    assert.deepEqual(droppedAt0.props[0].rivets, [false, false, true, false, false]);

    // Drop at pos === r (pos 1 <= 1) also shifts rivet right (r + 1 = 2)
    const custom = loadDict(["care", "cxare", "caxre"]);
    const stateWithX = {
      ...state,
      pocket: ["x"],
    };
    const droppedAtR = dropLetter(stateWithX, 0, 1, 0, custom);
    assert.equal(droppedAtR.props[0].word, "cxare");
    assert.deepEqual(droppedAtR.props[0].rivets, [false, false, true, false, false]);

    // Drop at pos > r (pos 2 > 1) keeps rivet at r = 1
    const droppedAfterR = dropLetter(stateWithX, 0, 2, 0, custom);
    assert.equal(droppedAfterR.props[0].word, "caxre");
    assert.deepEqual(droppedAfterR.props[0].rivets, [false, true, false, false, false]);
  });

  it("handles Chapter 3 2-slot bag mode switching, slot selection, and dropping slot 0", () => {
    const dict = loadDict();
    const level: LevelDef = {
      id: 13,
      chapter: 3,
      title: "Double Take",
      par: 4,
      pocketCap: 2,
      props: [
        { id: "p1", label: "Clamp", frame: "lamp", start: "clamp", goal: "lamp" },
        { id: "p2", label: "Cart", frame: "cart", start: "cart", goal: "car" },
        { id: "p3", label: "Rip", frame: "crate", start: "rip", goal: "rip" },
        { id: "p4", label: "Ear", frame: "clock", start: "ear", goal: "tear" },
      ],
    };

    // 0/2 starts in Steal Mode; toggleDropMode on empty bag is a no-op
    let state = createGameState(level);
    assert.equal(state.dropMode, false);
    assert.equal(state.activeSlot, 0);
    assert.equal(toggleDropMode(state, 0), state);

    // Steal 1st letter ('c' from clamp -> lamp): stays in Steal Mode (1/2)
    state = stealLetter(state, 0, 0, dict);
    assert.deepEqual(state.pocket, ["c"]);
    assert.equal(state.dropMode, false);
    assert.equal(state.activeSlot, 0);

    // toggleDropMode(state, 0) enters dropMode: true
    state = toggleDropMode(state, 0);
    assert.equal(state.dropMode, true);
    assert.equal(state.activeSlot, 0);

    // Toggling again cancels cleanly back to dropMode: false without losing the letter
    state = toggleDropMode(state, 0);
    assert.equal(state.dropMode, false);
    assert.equal(state.activeSlot, 0);
    assert.deepEqual(state.pocket, ["c"]);

    // Steal 2nd letter ('t' from cart -> car): bag is 2/2 -> auto-sets dropMode: true, activeSlot: 0
    state = stealLetter(state, 1, 3, dict);
    assert.deepEqual(state.pocket, ["c", "t"]);
    assert.equal(state.dropMode, true);
    assert.equal(state.activeSlot, 0);

    // Switch to slot 1
    state = toggleDropMode(state, 1);
    assert.equal(state.dropMode, true);
    assert.equal(state.activeSlot, 1);

    // Clicking active slot when bag is full (2/2) stays in dropMode: true (cannot steal when full)
    state = toggleDropMode(state, 1);
    assert.equal(state.dropMode, true);
    assert.equal(state.activeSlot, 1);

    // Dropping from slot 0 ('c') leaves slot 1 ('t') intact in pocket[0], and exits dropMode
    state = dropLetter(state, 0, 0, 0, dict); // lamp -> clamp
    assert.equal(state.props[0].word, "clamp");
    assert.deepEqual(state.pocket, ["t"]);
    assert.equal(state.dropMode, false);
    assert.equal(state.activeSlot, 0);
  });

  it("supports free Undo rewinding moves, Reset clearing usedHint, and star thresholds", () => {
    const dict = loadDict();
    let state = createGameState(LEVEL_1);
    assert.equal(undoMove(state), state);

    // Perform steal with rivet in custom level to confirm undo restores rivets too
    const rivetLevel: LevelDef = {
      id: 8,
      chapter: 2,
      title: "Undo Rivets",
      par: 4,
      pocketCap: 1,
      props: [
        { id: "p1", label: "Scare", frame: "safe", start: "scare", goal: "care", rivets: [2] },
        { id: "p2", label: "Art", frame: "pedestal", start: "art", goal: "cart" },
      ],
    };
    const customDict = loadDict(["scare", "care", "art", "cart", "sart"]);
    let rState = createGameState(rivetLevel);
    rState = { ...rState, usedHint: true };

    rState = stealLetter(rState, 0, 0, customDict); // scare -> care, pocket ['s'], moves 1
    assert.equal(rState.moves, 1);
    assert.equal(rState.dropMode, true);
    assert.deepEqual(rState.props[0].rivets, [false, true, false, false]);

    // Undo restores props, pocket, rivets, dropMode, moves, and preserves usedHint
    rState = undoMove(rState);
    assert.equal(rState.moves, 0);
    assert.equal(rState.dropMode, false);
    assert.deepEqual(rState.pocket, []);
    assert.equal(rState.props[0].word, "scare");
    assert.deepEqual(rState.props[0].rivets, [false, false, true, false, false]);
    assert.equal(rState.usedHint, true);

    // Reset ALWAYS clears moves = 0 and usedHint = false
    const reset = resetGame(rivetLevel);
    assert.equal(reset.moves, 0);
    assert.equal(reset.usedHint, false);
    assert.deepEqual(reset.pocket, []);
    assert.deepEqual(reset.history, []);

    // Also test multi-step undo on LEVEL_1
    state = stealLetter(state, 0, 0, dict);
    state = dropLetter(state, 1, 0, 0, dict);
    assert.equal(state.moves, 2);
    state = undoMove(state);
    assert.equal(state.moves, 1);
    assert.equal(state.props[1].word, "ART");
    assert.deepEqual(state.pocket, ["C"]);
    assert.equal(state.dropMode, true);

    // Stars
    assert.equal(computeStars(4, 4, false), 3);
    assert.equal(computeStars(3, 4, false), 3);
    assert.equal(computeStars(4, 4, true), 2);
    assert.equal(computeStars(5, 4, false), 2);
    assert.equal(computeStars(6, 4, false), 2);
    assert.equal(computeStars(6, 4, true), 2);
    assert.equal(computeStars(7, 4, false), 1);
    assert.equal(computeStars(7, 4, true), 1);
  });

  it("detects stuck states only when bag is full and no valid drop exists", () => {
    const dict = loadDict(["clamp", "lamp", "art"]);
    const level: LevelDef = {
      id: 10,
      chapter: 1,
      title: "Stuck Check",
      par: 2,
      pocketCap: 1,
      props: [
        { id: "p1", label: "Lamp", frame: "lamp", start: "clamp", goal: "lamp" },
        { id: "p2", label: "Art", frame: "pedestal", start: "art", goal: "art" },
      ],
    };

    let state = createGameState(level);
    assert.equal(hasAnyValidDrop(state, dict), false);
    assert.equal(isStuck(state, dict), false); // pocket not full

    // Steal 'c' -> pocket = ['c']; 'clamp' is valid in dict so drop exists
    state = stealLetter(state, 0, 0, dict);
    assert.equal(hasAnyValidDrop(state, dict), true);
    assert.equal(isStuck(state, dict), false);

    // With a dictionary that does not accept 'clamp' or any insertion of 'c' into 'lamp'/'art'
    const deadDict = loadDict(["lamp", "art"]);
    assert.equal(hasAnyValidDrop(state, deadDict), false);
    assert.equal(isStuck(state, deadDict), true);
  });
});
