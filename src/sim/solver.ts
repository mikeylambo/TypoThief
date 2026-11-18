import {
  canDrop,
  canSteal,
  createGameState,
  dropLetter,
  isSolved,
  stealLetter,
} from "./rules.ts";
import type { GameState, LevelDef, Move } from "./types.ts";

export interface SolveResult {
  solvable: boolean;
  par: number;
  path: Move[];
  visited: number;
  validFirstSteals: number;
  deadEndFirstSteals: number;
}

interface BfsNode {
  state: GameState;
  depth: number;
  parentIdx: number;
  move: Move | null;
}

interface BfsOutcome {
  solvable: boolean;
  par: number;
  path: Move[];
  visited: number;
}

const DEFAULT_MAX_NODES = 50_000;

function isGameState(input: LevelDef | GameState): input is GameState {
  return "pocket" in input && "pocketCap" in input && !("title" in input);
}

function canonicalKey(state: GameState): string {
  const propsPart = state.props
    .map((prop) => {
      const mask = prop.rivets.map((r) => (r ? "1" : "0")).join("");
      return `${prop.word.toUpperCase()}:${mask}`;
    })
    .join("|");
  const pocketPart = state.pocket
    .map((ch) => ch.toUpperCase())
    .sort()
    .join("");
  return `${propsPart}#${pocketPart}`;
}

function reconstructPath(queue: readonly BfsNode[], lastIdx: number, finalMove: Move): Move[] {
  const path: Move[] = [finalMove];
  let idx = lastIdx;
  while (idx >= 0) {
    const node = queue[idx];
    if (node.move !== null) {
      path.push(node.move);
    }
    idx = node.parentIdx;
  }
  path.reverse();
  return path;
}

function runBfs(
  startState: GameState,
  dict: Set<string>,
  maxNodes: number,
  maxDepth?: number,
): BfsOutcome {
  if (maxNodes <= 0) {
    return { solvable: false, par: -1, path: [], visited: 0 };
  }

  const rootState: GameState = { ...startState, history: [] };
  if (isSolved(rootState)) {
    return { solvable: true, par: 0, path: [], visited: 1 };
  }
  if (maxDepth !== undefined && maxDepth <= 0) {
    return { solvable: false, par: -1, path: [], visited: 1 };
  }

  const visited = new Set<string>([canonicalKey(rootState)]);
  const queue: BfsNode[] = [
    { state: rootState, depth: 0, parentIdx: -1, move: null },
  ];

  let head = 0;
  while (head < queue.length) {
    const nodeIdx = head++;
    const node = queue[nodeIdx];
    const curr = node.state;

    if (maxDepth !== undefined && node.depth >= maxDepth) {
      continue;
    }

    if (curr.pocket.length < curr.pocketCap) {
      for (let propIdx = 0; propIdx < curr.props.length; propIdx++) {
        const wordLen = curr.props[propIdx].word.length;
        for (let charIdx = 0; charIdx < wordLen; charIdx++) {
          if (!canSteal(curr, propIdx, charIdx, dict).ok) {
            continue;
          }
          const nextState = stealLetter(curr, propIdx, charIdx, dict);
          const nextKey = canonicalKey(nextState);
          if (visited.has(nextKey)) {
            continue;
          }
          if (visited.size >= maxNodes) {
            return { solvable: false, par: -1, path: [], visited: visited.size };
          }
          visited.add(nextKey);
          queue.push({
            state: { ...nextState, history: [] },
            depth: node.depth + 1,
            parentIdx: nodeIdx,
            move: { kind: "steal", propIdx, charIdx },
          });
        }
      }
    }

    if (curr.pocket.length > 0) {
      for (let slotIdx = 0; slotIdx < curr.pocket.length; slotIdx++) {
        for (let propIdx = 0; propIdx < curr.props.length; propIdx++) {
          const wordLen = curr.props[propIdx].word.length;
          for (let pos = 0; pos <= wordLen; pos++) {
            if (!canDrop(curr, propIdx, pos, slotIdx, dict).ok) {
              continue;
            }
            const nextState = dropLetter(curr, propIdx, pos, slotIdx, dict);
            const move: Move = { kind: "drop", propIdx, pos, slotIdx };
            const nextKey = canonicalKey(nextState);
            if (isSolved(nextState)) {
              const totalVisited = visited.has(nextKey)
                ? visited.size
                : visited.size + 1;
              return {
                solvable: true,
                par: node.depth + 1,
                path: reconstructPath(queue, nodeIdx, move),
                visited: totalVisited,
              };
            }
            if (visited.has(nextKey)) {
              continue;
            }
            if (visited.size >= maxNodes) {
              return { solvable: false, par: -1, path: [], visited: visited.size };
            }
            visited.add(nextKey);
            queue.push({
              state: { ...nextState, history: [] },
              depth: node.depth + 1,
              parentIdx: nodeIdx,
              move,
            });
          }
        }
      }
    }
  }

  return { solvable: false, par: -1, path: [], visited: visited.size };
}

/**
 * Solve a board via breadth-first search and analyze initial steal traps.
 */
export function solveBoard(
  levelOrState: LevelDef | GameState,
  dict: Set<string>,
  maxNodes = DEFAULT_MAX_NODES,
): SolveResult {
  const startState = isGameState(levelOrState)
    ? levelOrState
    : createGameState(levelOrState);

  const main = runBfs(startState, dict, maxNodes);

  let validFirstSteals = 0;
  let deadEndFirstSteals = 0;

  if (startState.pocket.length < startState.pocketCap) {
    const subMaxDepth = main.solvable ? Math.max(0, main.par - 1) : undefined;
    const compactStart: GameState = { ...startState, history: [] };
    for (let propIdx = 0; propIdx < compactStart.props.length; propIdx++) {
      const wordLen = compactStart.props[propIdx].word.length;
      for (let charIdx = 0; charIdx < wordLen; charIdx++) {
        if (!canSteal(compactStart, propIdx, charIdx, dict).ok) {
          continue;
        }
        validFirstSteals++;
        if (main.solvable && main.par === 0) {
          deadEndFirstSteals++;
          continue;
        }
        const afterSteal = stealLetter(compactStart, propIdx, charIdx, dict);
        const sub = runBfs(afterSteal, dict, maxNodes, subMaxDepth);
        if (!sub.solvable || (main.solvable && 1 + sub.par > main.par)) {
          deadEndFirstSteals++;
        }
      }
    }
  }

  return {
    solvable: main.solvable,
    par: main.par,
    path: main.path,
    visited: main.visited,
    validFirstSteals,
    deadEndFirstSteals,
  };
}

/**
 * Return the next optimal move from `state`, or `null` if already solved or unsolvable.
 */
export function getHintMove(
  state: GameState,
  dict: Set<string>,
  maxNodes = DEFAULT_MAX_NODES,
): Move | null {
  if (isSolved(state)) {
    return null;
  }
  const res = runBfs(state, dict, maxNodes);
  if (!res.solvable || res.path.length === 0) {
    return null;
  }
  return res.path[0];
}
