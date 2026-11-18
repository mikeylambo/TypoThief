import { isValidWord } from "./dict.ts";
import type { GameState, LevelDef, Move, MoveCheck, PropState, Snapshot } from "./types.ts";

const MIN_WORD_LEN = 3;
const MAX_WORD_LEN = 6;

function cloneProp(prop: PropState): PropState {
  return {
    ...prop,
    rivets: [...prop.rivets],
  };
}

function cloneProps(props: readonly PropState[]): PropState[] {
  return props.map(cloneProp);
}

function makeSnapshot(state: GameState): Snapshot {
  return {
    props: cloneProps(state.props),
    pocket: [...state.pocket],
    dropMode: state.dropMode,
    activeSlot: state.activeSlot,
    moves: state.moves,
  };
}

/**
 * Create the initial pure GameState for a level definition.
 */
export function createGameState(level: LevelDef): GameState {
  const props: PropState[] = level.props.map((def) => {
    const rivetSet = new Set(def.rivets ?? []);
    const rivets = Array.from({ length: def.start.length }, (_, idx) => rivetSet.has(idx));
    return {
      id: def.id,
      label: def.label,
      frame: def.frame,
      word: def.start,
      goal: def.goal,
      rivets,
    };
  });

  return {
    props,
    pocket: [],
    pocketCap: level.pocketCap,
    dropMode: false,
    activeSlot: 0,
    moves: 0,
    usedHint: false,
    history: [],
  };
}

/**
 * Check whether stealing the tile at `charIdx` from `props[propIdx]` is legal.
 */
export function canSteal(
  state: GameState,
  propIdx: number,
  charIdx: number,
  dict: Set<string>,
): MoveCheck {
  if (propIdx < 0 || propIdx >= state.props.length) {
    return { ok: false, reason: "Invalid prop", nextWord: "" };
  }
  const prop = state.props[propIdx];
  if (charIdx < 0 || charIdx >= prop.word.length) {
    return { ok: false, reason: "Invalid tile", nextWord: prop.word };
  }
  const nextWord = prop.word.slice(0, charIdx) + prop.word.slice(charIdx + 1);
  if (state.pocket.length >= state.pocketCap) {
    return { ok: false, reason: "Bag is full", nextWord };
  }
  if (prop.rivets[charIdx]) {
    return { ok: false, reason: "Tile is riveted", nextWord };
  }
  if (nextWord.length < MIN_WORD_LEN) {
    return { ok: false, reason: "Too short", nextWord };
  }
  if (!isValidWord(dict, nextWord)) {
    return { ok: false, reason: `${nextWord}? Not a word!`, nextWord };
  }
  return { ok: true, nextWord };
}

/**
 * Steal a tile into the Thief Bag, shifting rivets and auto-entering Drop Mode if full.
 */
export function stealLetter(
  state: GameState,
  propIdx: number,
  charIdx: number,
  dict: Set<string>,
): GameState {
  const check = canSteal(state, propIdx, charIdx, dict);
  if (!check.ok) {
    return state;
  }

  const target = state.props[propIdx];
  const stolenChar = target.word[charIdx];
  const nextPocket = [...state.pocket, stolenChar];
  const nextProps = state.props.map((prop, idx) => {
    if (idx !== propIdx) {
      return cloneProp(prop);
    }
    return {
      ...prop,
      word: check.nextWord,
      rivets: prop.rivets.filter((_, rIdx) => rIdx !== charIdx),
    };
  });

  const bagFull = nextPocket.length >= state.pocketCap;
  return {
    ...state,
    props: nextProps,
    pocket: nextPocket,
    dropMode: bagFull,
    activeSlot: 0,
    moves: state.moves + 1,
    history: [...state.history, makeSnapshot(state)],
  };
}

/**
 * Check whether inserting `pocket[slotIdx]` at `pos` into `props[propIdx]` is legal.
 */
export function canDrop(
  state: GameState,
  propIdx: number,
  pos: number,
  slotIdx: number,
  dict: Set<string>,
): MoveCheck {
  if (propIdx < 0 || propIdx >= state.props.length) {
    return { ok: false, reason: "Invalid prop", nextWord: "" };
  }
  const prop = state.props[propIdx];
  if (slotIdx < 0 || slotIdx >= state.pocket.length) {
    return { ok: false, reason: "No letter in bag slot", nextWord: prop.word };
  }
  if (pos < 0 || pos > prop.word.length) {
    return { ok: false, reason: "Invalid gap", nextWord: prop.word };
  }
  const letter = state.pocket[slotIdx];
  const nextWord = prop.word.slice(0, pos) + letter + prop.word.slice(pos);
  if (nextWord.length > MAX_WORD_LEN) {
    return { ok: false, reason: "Max 6 letters", nextWord };
  }
  if (!isValidWord(dict, nextWord)) {
    return { ok: false, reason: `${nextWord}? Not a word!`, nextWord };
  }
  return { ok: true, nextWord };
}

/**
 * Insert the held letter at `slotIdx` into `props[propIdx]` at `pos`, shifting rivets right.
 */
export function dropLetter(
  state: GameState,
  propIdx: number,
  pos: number,
  slotIdx: number,
  dict: Set<string>,
): GameState {
  const check = canDrop(state, propIdx, pos, slotIdx, dict);
  if (!check.ok) {
    return state;
  }

  const nextPocket = state.pocket.filter((_, idx) => idx !== slotIdx);
  const nextProps = state.props.map((prop, idx) => {
    if (idx !== propIdx) {
      return cloneProp(prop);
    }
    return {
      ...prop,
      word: check.nextWord,
      rivets: [...prop.rivets.slice(0, pos), false, ...prop.rivets.slice(pos)],
    };
  });

  // Always return to Steal Mode by default after a drop (even with 1/2 remaining in Ch3)
  return {
    ...state,
    props: nextProps,
    pocket: nextPocket,
    dropMode: false,
    activeSlot: 0,
    moves: state.moves + 1,
    history: [...state.history, makeSnapshot(state)],
  };
}

/**
 * Toggle Drop Mode or switch active bag slot without mutating or reordering held letters.
 */
export function toggleDropMode(state: GameState, slotIdx?: number): GameState {
  if (state.pocket.length === 0) {
    return state;
  }

  const hasValidSlot =
    slotIdx !== undefined && slotIdx >= 0 && slotIdx < state.pocket.length;

  if (!state.dropMode) {
    const clampedSlot = Math.max(0, Math.min(slotIdx ?? 0, state.pocket.length - 1));
    return {
      ...state,
      dropMode: true,
      activeSlot: clampedSlot,
    };
  }

  if (hasValidSlot && slotIdx !== state.activeSlot) {
    return {
      ...state,
      activeSlot: slotIdx,
    };
  }

  // Cannot cancel back to Steal Mode when the bag is already full
  if (state.pocket.length >= state.pocketCap) {
    return state;
  }

  return {
    ...state,
    dropMode: false,
    activeSlot: 0,
  };
}

/**
 * Free multi-level Undo: restores the prior snapshot and rewinds `moves`, keeping `usedHint`.
 */
export function undoMove(state: GameState): GameState {
  if (state.history.length === 0) {
    return state;
  }
  const prev = state.history[state.history.length - 1];
  return {
    ...state,
    props: cloneProps(prev.props),
    pocket: [...prev.pocket],
    dropMode: prev.dropMode,
    activeSlot: prev.activeSlot,
    moves: prev.moves,
    history: state.history.slice(0, -1),
  };
}

/**
 * Reset the level to its initial state with `moves = 0` and `usedHint = false`.
 */
export function resetGame(level: LevelDef): GameState {
  return createGameState(level);
}

/**
 * Return true if at least one held letter can be legally dropped anywhere on the board.
 */
export function hasAnyValidDrop(state: GameState, dict: Set<string>): boolean {
  for (let slotIdx = 0; slotIdx < state.pocket.length; slotIdx++) {
    for (let propIdx = 0; propIdx < state.props.length; propIdx++) {
      const len = state.props[propIdx].word.length;
      for (let pos = 0; pos <= len; pos++) {
        if (canDrop(state, propIdx, pos, slotIdx, dict).ok) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Stuck-state detector: true only when the bag is full and no valid drop exists.
 */
export function isStuck(state: GameState, dict: Set<string>): boolean {
  return state.pocket.length >= state.pocketCap && !hasAnyValidDrop(state, dict);
}

/**
 * Level is solved only when every prop matches its goal and the Thief Bag is empty.
 */
export function isSolved(state: GameState): boolean {
  if (state.pocket.length !== 0) {
    return false;
  }
  return state.props.every(
    (prop) => prop.word.toLowerCase() === prop.goal.toLowerCase(),
  );
}

/**
 * Apply hint selection mode and hint-usage flag without mutating board tiles.
 */
export function applyHintSelection(state: GameState, move: Move | null): GameState {
  if (!move) {
    return state;
  }
  if (move.kind === "drop") {
    return {
      ...state,
      usedHint: true,
      dropMode: true,
      activeSlot: move.slotIdx,
    };
  }
  return {
    ...state,
    usedHint: true,
    dropMode: false,
    activeSlot: 0,
  };
}

/**
 * Compute star rating (1-3): Hint caps clear at 2 stars; within par+2 is 2 stars.
 */
export function computeStars(moves: number, par: number, usedHint: boolean): 1 | 2 | 3 {
  if (moves <= par && !usedHint) {
    return 3;
  }
  if (moves <= par + 2) {
    return 2;
  }
  return 1;
}
