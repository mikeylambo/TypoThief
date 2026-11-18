import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadDict } from "../src/sim/dict.ts";
import { createGameState, dropLetter, stealLetter } from "../src/sim/rules.ts";
import { solveBoard } from "../src/sim/solver.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const DICT_PATH = path.join(REPO_ROOT, "src", "content", "dict.json");
const LEVELS_OUT = path.join(REPO_ROOT, "src", "content", "levels.ts");
const DAILY_OUT = path.join(REPO_ROOT, "src", "content", "dailyBank.ts");

const SOLVER_FAST_NODES = 2500;
const SOLVER_MAX_NODES = 6000;
const TARGET_PER_TIER = 92;

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

const FRAME_LABELS = [
  "Safe",
  "Watchdog",
  "Laser",
  "Lamp",
  "Crate",
  "Canvas",
  "Cart",
  "Clock",
  "Locker",
  "Trophy",
];

const DAILY_TITLES = [
  "Vault Whisper",
  "Laser Waltz",
  "Midnight Swap",
  "Velvet Caper",
  "Alley Switch",
  "Clockwork Lift",
  "Gallery Dash",
  "Locker Shuffle",
  "Trophy Snatch",
  "Guardhouse Slip",
  "Shadow Relay",
  "Brass Plunder",
  "Silent Cart",
  "Crate Escape",
  "Spotlight Dodge",
  "Double Bluff",
  "Rivet Bypass",
  "Corner Pocket",
  "Cipher Haul",
  "Rooftop Drop",
  "Blueprint Bait",
  "Museum Drift",
  "Siren Tease",
  "Phantom Key",
];

function createRng(seedValue) {
  let seed = seedValue | 0;
  return function rand() {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildWordGraph(words, dict) {
  const stealMap = new Map();
  const dropMap = new Map();
  const stealsByCh = new Map();
  const dropsByCh = new Map();

  for (const w of words) {
    stealMap.set(w, []);
    dropMap.set(w, []);
  }

  for (const w of words) {
    if (w.length <= 3) continue;
    for (let i = 0; i < w.length; i++) {
      const nw = w.slice(0, i) + w.slice(i + 1);
      if (!dict.has(nw)) continue;
      const ch = w[i];
      stealMap.get(w).push({ charIdx: i, ch, nextWord: nw });
      dropMap.get(nw).push({ pos: i, ch, nextWord: w });
      if (!stealsByCh.has(ch)) stealsByCh.set(ch, []);
      stealsByCh.get(ch).push({ start: w, goal: nw, charIdx: i, ch });
      if (!dropsByCh.has(ch)) dropsByCh.set(ch, []);
      dropsByCh.get(ch).push({ start: nw, goal: w, pos: i, ch });
    }
  }

  const bridgesDS = [];
  const bridgesDSByIn = new Map();
  const bridgesSD = [];
  const bridgesSDByOut = new Map();

  for (const m of words) {
    for (const sIn of stealMap.get(m)) {
      for (const sOut of stealMap.get(m)) {
        if (sIn.nextWord === sOut.nextWord) continue;
        const b = {
          start: sIn.nextWord,
          mid: m,
          goal: sOut.nextWord,
          cIn: sIn.ch,
          cOut: sOut.ch,
        };
        bridgesDS.push(b);
        if (!bridgesDSByIn.has(b.cIn)) bridgesDSByIn.set(b.cIn, []);
        bridgesDSByIn.get(b.cIn).push(b);
      }
    }
    for (const dBack of dropMap.get(m)) {
      for (const dFwd of dropMap.get(m)) {
        if (dBack.nextWord === dFwd.nextWord) continue;
        const b = {
          start: dBack.nextWord,
          mid: m,
          goal: dFwd.nextWord,
          cOut: dBack.ch,
          cIn: dFwd.ch,
        };
        bridgesSD.push(b);
        if (!bridgesSDByOut.has(b.cOut)) bridgesSDByOut.set(b.cOut, []);
        bridgesSDByOut.get(b.cOut).push(b);
      }
    }
  }

  return {
    stealMap,
    dropMap,
    stealsByCh,
    dropsByCh,
    bridgesDS,
    bridgesDSByIn,
    bridgesSD,
    bridgesSDByOut,
  };
}

function boardSignature(pocketCap, props) {
  const sorted = props
    .map((p) => `${p.start.toUpperCase()}->${p.goal.toUpperCase()}@${(p.rivets ?? []).join(",")}`)
    .sort();
  return `${pocketCap}|${sorted.join(";")}`;
}

function pickDistinctFrameIndices(count, rand) {
  const pool = FRAMES.map((_, i) => i);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count);
}

function makeLevel(chapter, pocketCap, title, pairs, frameIndices, rivetsList = [], tier = undefined) {
  return {
    id: 0,
    chapter,
    title,
    par: 0,
    pocketCap,
    ...(tier ? { tier } : {}),
    props: pairs.map(([start, goal], idx) => {
      const fIdx = frameIndices[idx];
      const rivets = rivetsList[idx];
      return {
        id: `p${idx + 1}`,
        label: FRAME_LABELS[fIdx],
        frame: FRAMES[fIdx],
        start: start.toUpperCase(),
        goal: goal.toUpperCase(),
        ...(rivets && rivets.length > 0 ? { rivets } : {}),
      };
    }),
  };
}

function hasUniqueStartWords(pairs) {
  const seen = new Set();
  for (const [s] of pairs) {
    if (seen.has(s)) return false;
    seen.add(s);
  }
  return true;
}

function hasAllTransform(pairs) {
  return pairs.every(([s, g]) => s !== g);
}

const CAMPAIGN_WORD_AVOID = new Set([
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

function isCleanCampaignPairs(pairs) {
  return pairs.every(
    ([s, g]) => !CAMPAIGN_WORD_AVOID.has(s.toLowerCase()) && !CAMPAIGN_WORD_AVOID.has(g.toLowerCase()),
  );
}

function isCleanSolutionPath(lvl, solutionPath, dict) {
  let state = createGameState(lvl);
  for (const prop of state.props) {
    if (
      CAMPAIGN_WORD_AVOID.has(prop.word.toLowerCase()) ||
      CAMPAIGN_WORD_AVOID.has(prop.goal.toLowerCase())
    ) {
      return false;
    }
  }
  for (const move of solutionPath) {
    state =
      move.kind === "steal"
        ? stealLetter(state, move.propIdx, move.charIdx, dict)
        : dropLetter(state, move.propIdx, move.pos, move.slotIdx, dict);
    if (CAMPAIGN_WORD_AVOID.has(state.props[move.propIdx].word.toLowerCase())) {
      return false;
    }
  }
  return true;
}

// --- Sampling primitives ---

function samplePar4Cap1(graph, rand) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const b1 = pick(graph.bridgesDS);
  const sList = graph.stealsByCh.get(b1.cIn);
  const dList = graph.dropsByCh.get(b1.cOut);
  if (!sList?.length || !dList?.length) return null;
  const s0 = pick(sList);
  const d2 = pick(dList);
  return [
    [s0.start, s0.goal],
    [b1.start, b1.goal],
    [d2.start, d2.goal],
  ];
}

function samplePar4FourProps(graph, rand) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const b0 = pick(graph.bridgesSD);
  const dsList = (graph.bridgesDSByIn.get(b0.cOut) || []).filter((x) => x.cOut === b0.cIn);
  if (!dsList.length) return null;
  const ds = pick(dsList);
  const sList = Array.from(graph.stealsByCh.values()).flat();
  const s2 = pick(sList);
  const d3List = graph.dropsByCh.get(s2.ch);
  if (!d3List?.length) return null;
  const d3 = pick(d3List);
  return [
    [b0.start, b0.goal],
    [ds.start, ds.goal],
    [s2.start, s2.goal],
    [d3.start, d3.goal],
  ];
}

function samplePar6Cap1(graph, rand, numProps) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  if (numProps === 3) {
    const b0 = pick(graph.bridgesSD);
    const l1 = graph.bridgesDSByIn.get(b0.cOut);
    if (!l1?.length) return null;
    const b1 = pick(l1);
    const l2 = (graph.bridgesDSByIn.get(b1.cOut) || []).filter((x) => x.cOut === b0.cIn);
    if (!l2.length) return null;
    const b2 = pick(l2);
    return [
      [b0.start, b0.goal],
      [b1.start, b1.goal],
      [b2.start, b2.goal],
    ];
  }
  const b1 = pick(graph.bridgesDS);
  const s0List = graph.stealsByCh.get(b1.cIn);
  const b2List = graph.bridgesDSByIn.get(b1.cOut);
  if (!s0List?.length || !b2List?.length) return null;
  const b2 = pick(b2List);
  const d3List = graph.dropsByCh.get(b2.cOut);
  if (!d3List?.length) return null;
  const s0 = pick(s0List);
  const d3 = pick(d3List);
  return [
    [s0.start, s0.goal],
    [b1.start, b1.goal],
    [b2.start, b2.goal],
    [d3.start, d3.goal],
  ];
}

function samplePar8Cap1(graph, rand) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const b0 = pick(graph.bridgesSD);
  const l1 = graph.bridgesDSByIn.get(b0.cOut);
  if (!l1?.length) return null;
  const b1 = pick(l1);
  const l2 = graph.bridgesDSByIn.get(b1.cOut);
  if (!l2?.length) return null;
  const b2 = pick(l2);
  const l3 = (graph.bridgesDSByIn.get(b2.cOut) || []).filter((x) => x.cOut === b0.cIn);
  if (!l3.length) return null;
  const b3 = pick(l3);
  return [
    [b0.start, b0.goal],
    [b1.start, b1.goal],
    [b2.start, b2.goal],
    [b3.start, b3.goal],
  ];
}

function sampleSmugglePar6(graph, rand) {
  // P0: DS(+c1, -c2), P1: DS(+c2, -c1), P2: lender with c1 (start === goal!)
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const b0 = pick(graph.bridgesDS);
  const b1List = (graph.bridgesDSByIn.get(b0.cOut) || []).filter((x) => x.cOut === b0.cIn);
  if (!b1List.length) return null;
  const b1 = pick(b1List);
  const lenders = graph.stealsByCh.get(b0.cIn);
  if (!lenders?.length) return null;
  const l = pick(lenders);
  return [
    [b0.start, b0.goal],
    [l.start, l.start],
    [b1.start, b1.goal],
  ];
}

function sampleCap2Cycle(graph, rand, numProps) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  if (numProps === 3) {
    const b0 = pick(graph.bridgesSD);
    const l1 = graph.bridgesSDByOut.get(b0.cIn);
    if (!l1?.length) return null;
    const b1 = pick(l1);
    const l2 = (graph.bridgesSDByOut.get(b1.cIn) || []).filter((x) => x.cIn === b0.cOut);
    if (!l2.length) return null;
    const b2 = pick(l2);
    return [
      [b0.start, b0.goal],
      [b1.start, b1.goal],
      [b2.start, b2.goal],
    ];
  }
  const b0 = pick(graph.bridgesSD);
  const l1 = graph.bridgesSDByOut.get(b0.cIn);
  if (!l1?.length) return null;
  const b1 = pick(l1);
  const l2 = graph.bridgesSDByOut.get(b1.cIn);
  if (!l2?.length) return null;
  const b2 = pick(l2);
  const l3 = (graph.bridgesSDByOut.get(b2.cIn) || []).filter((x) => x.cIn === b0.cOut);
  if (!l3.length) return null;
  const b3 = pick(l3);
  return [
    [b0.start, b0.goal],
    [b1.start, b1.goal],
    [b2.start, b2.goal],
    [b3.start, b3.goal],
  ];
}

function sampleCap2Par4(graph, rand) {
  // 2 SD bridges forming a 2-slot swap + 1 safe/lender decoy prop (start === goal)
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const b0 = pick(graph.bridgesSD);
  const l1 = (graph.bridgesSDByOut.get(b0.cIn) || []).filter((x) => x.cIn === b0.cOut);
  if (!l1.length) return null;
  const b1 = pick(l1);
  const decoy = pick(graph.bridgesSD).start;
  return [
    [b0.start, b0.goal],
    [b1.start, b1.goal],
    [decoy, decoy],
  ];
}

function sampleCap2Par6FourProps(graph, rand) {
  // 2 SD bridges forming a 2-slot swap + 1 steal + 1 drop (4 props all transforming, par = 6)
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const b0 = pick(graph.bridgesSD);
  const l1 = (graph.bridgesSDByOut.get(b0.cIn) || []).filter((x) => x.cIn === b0.cOut);
  if (!l1.length) return null;
  const b1 = pick(l1);
  const chars = Array.from(graph.stealsByCh.keys());
  const ch = pick(chars);
  const sList = graph.stealsByCh.get(ch);
  const dList = graph.dropsByCh.get(ch);
  if (!sList?.length || !dList?.length) return null;
  const s2 = pick(sList);
  const d3 = pick(dList);
  return [
    [b0.start, b0.goal],
    [b1.start, b1.goal],
    [s2.start, s2.goal],
    [d3.start, d3.goal],
  ];
}

function tryAttachRivets(lvl, graph, dict, baseRes, allowSameGoalProp) {
  // Prefer riveting the tile stolen in baseRes.path[0] (forces routing around optimal move!),
  // then any tile in start that blocks a valid steal without breaking solvability.
  const candidates = [];
  if (baseRes.path[0]?.kind === "steal") {
    candidates.push({ p: baseRes.path[0].propIdx, idx: baseRes.path[0].charIdx, priority: 2 });
  }
  for (let p = 0; p < lvl.props.length; p++) {
    const sw = lvl.props[p].start.toLowerCase();
    for (const e of graph.stealMap.get(sw) ?? []) {
      if (baseRes.path[0]?.kind === "steal" && baseRes.path[0].propIdx === p && baseRes.path[0].charIdx === e.charIdx) {
        continue;
      }
      candidates.push({ p, idx: e.charIdx, priority: 1 });
    }
  }

  for (const cand of candidates) {
    const prop = lvl.props[cand.p];
    if (!allowSameGoalProp && prop.start === prop.goal) continue;
    const rLvl = {
      ...lvl,
      props: lvl.props.map((pr, idx) =>
        idx === cand.p ? { ...pr, rivets: [cand.idx] } : pr,
      ),
    };
    const rRes = solveBoard(rLvl, dict, SOLVER_MAX_NODES);
    if (!rRes.solvable) continue;
    if (rRes.validFirstSteals < 2) continue;
    if (rRes.deadEndFirstSteals < 1 && rRes.par < 6) continue;
    const breaksOptimal = cand.priority === 2;
    const blocksSteal = rRes.validFirstSteals < baseRes.validFirstSteals;
    const increasesPar = rRes.par > baseRes.par;
    if (increasesPar || breaksOptimal || blocksSteal) {
      return { level: rLvl, res: rRes, breaksOptimal, increasesPar };
    }
  }
  return null;
}

function sampleRivetedDeadlock(graph, rand, numProps) {
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const b0 = pick(graph.bridgesDS);
  const b1List = (graph.bridgesDSByIn.get(b0.cOut) || []).filter((x) => x.cOut === b0.cIn);
  if (!b1List.length) return null;
  const b1 = pick(b1List);
  const lenders = graph.stealsByCh.get(b0.cIn);
  if (!lenders || lenders.length < 2) return null;
  const l1 = pick(lenders);
  const l2 = pick(lenders);
  if (l1.start === l2.start) return null;

  const pairs =
    numProps === 3
      ? [
          [b0.start, b0.goal],
          [b1.start, b1.goal],
          [l1.start, l1.start],
        ]
      : [
          [b0.start, b0.goal],
          [b1.start, b1.goal],
          [l1.start, l1.start],
          [l2.start, l2.start],
        ];
  if (!hasUniqueStartWords(pairs)) return null;
  return pairs;
}

function generateCampaignLevels(graph, dict, usedSignatures) {
  const rand = createRng(0x43414d50); // "CAMP"
  const levels = [];

  // L1: Fixed canonical opener
  const l1 = {
    id: 1,
    chapter: 1,
    title: "Rookie Caper",
    par: 4,
    pocketCap: 1,
    props: [
      { id: "p1", label: "Desk Lamp", frame: "lamp", start: "CLAMP", goal: "LAMP" },
      { id: "p2", label: "Gallery Art", frame: "art", start: "ART", goal: "CAR" },
      { id: "p3", label: "Velvet Crate", frame: "crate", start: "RIP", goal: "TRIP" },
    ],
  };
  usedSignatures.add(boardSignature(1, l1.props));
  levels.push(l1);

  // L2: Fixed canonical 4-prop escalator
  const l2 = {
    id: 2,
    chapter: 1,
    title: "Museum Shuffle",
    par: 6,
    pocketCap: 1,
    props: [
      { id: "p1", label: "Marble Bust", frame: "art", start: "CHAIR", goal: "HAIR" },
      { id: "p2", label: "Curator Cart", frame: "cart", start: "ART", goal: "CAR" },
      { id: "p3", label: "Tea Timer", frame: "clock", start: "EAR", goal: "TEA" },
      { id: "p4", label: "Chilled Safe", frame: "safe", start: "ICE", goal: "RICE" },
    ],
  };
  usedSignatures.add(boardSignature(1, l2.props));
  levels.push(l2);

  function curateCampaignLevel(spec) {
    for (let attempt = 0; attempt < 4000; attempt++) {
      const candidate = spec.sample(attempt);
      if (!candidate) continue;
      const pairs = candidate.pairs ?? candidate;
      if (!hasUniqueStartWords(pairs) || !isCleanCampaignPairs(pairs)) continue;
      const frames = pickDistinctFrameIndices(pairs.length, rand);
      const lvl = makeLevel(
        spec.chapter,
        spec.pocketCap,
        spec.title,
        pairs,
        frames,
        candidate.rivets ?? [],
      );
      const sig = boardSignature(lvl.pocketCap, lvl.props);
      if (usedSignatures.has(sig)) continue;

      const base = solveBoard(lvl, dict, SOLVER_MAX_NODES);
      if (!base.solvable) continue;

      if (spec.chapter === 2) {
        // Attach rivets
        let finalLvl = lvl;
        let finalRes = base;
        if (candidate.rivets) {
          if (
            base.par !== spec.targetPar ||
            base.validFirstSteals < 2 ||
            (base.deadEndFirstSteals < 1 && base.par < 6)
          ) {
            continue;
          }
        } else {
          const attached = tryAttachRivets(lvl, graph, dict, base, true);
          if (!attached) continue;
          if (attached.res.par !== spec.targetPar) continue;
          if (spec.requireBreaksOptimal && !attached.breaksOptimal && !attached.increasesPar) continue;
          finalLvl = attached.level;
          finalRes = attached.res;
        }
        const finalSig = boardSignature(finalLvl.pocketCap, finalLvl.props);
        if (usedSignatures.has(finalSig)) continue;
        if (!isCleanSolutionPath(finalLvl, finalRes.path, dict)) continue;
        usedSignatures.add(finalSig);
        return { ...finalLvl, id: spec.id, par: finalRes.par };
      }

      if (base.par !== spec.targetPar) continue;
      if (base.validFirstSteals < 2) continue;
      if (base.deadEndFirstSteals < 1 && base.par < 6) continue;

      if (spec.checkExtra && !spec.checkExtra(lvl, base)) continue;

      if (spec.chapter === 3) {
        const cap1 = solveBoard({ ...lvl, pocketCap: 1 }, dict, SOLVER_MAX_NODES);
        if (cap1.solvable && cap1.par <= base.par) continue;
        if (spec.addRivet) {
          const attached = tryAttachRivets(lvl, graph, dict, base, false);
          if (!attached || attached.res.par !== spec.targetPar) continue;
          const cap1R = solveBoard({ ...attached.level, pocketCap: 1 }, dict, SOLVER_MAX_NODES);
          if (cap1R.solvable && cap1R.par <= attached.res.par) continue;
          const finalSig = boardSignature(attached.level.pocketCap, attached.level.props);
          if (usedSignatures.has(finalSig)) continue;
          if (!isCleanSolutionPath(attached.level, attached.res.path, dict)) continue;
          usedSignatures.add(finalSig);
          return { ...attached.level, id: spec.id, par: attached.res.par };
        }
      }

      if (!isCleanSolutionPath(lvl, base.path, dict)) continue;
      usedSignatures.add(sig);
      return { ...lvl, id: spec.id, par: base.par };
    }
    throw new Error(`Failed to curate campaign level ${spec.id} (${spec.title})`);
  }

  // L3..L6 (Chapter 1)
  levels.push(
    curateCampaignLevel({
      id: 3,
      chapter: 1,
      pocketCap: 1,
      targetPar: 4,
      title: "Bridge Job",
      sample: () => {
        const p = samplePar4Cap1(graph, rand);
        return p && hasAllTransform(p) ? p : null;
      },
    }),
  );

  levels.push(
    curateCampaignLevel({
      id: 4,
      chapter: 1,
      pocketCap: 1,
      targetPar: 6,
      title: "Inside Smuggle",
      sample: () => sampleSmugglePar6(graph, rand),
      checkExtra: (lvl) => {
        // Ensure the already-solved smuggling prop (index 1) is truly needed!
        const withoutSmuggler = {
          ...lvl,
          props: [lvl.props[0], lvl.props[2]],
        };
        const res = solveBoard(withoutSmuggler, dict, SOLVER_MAX_NODES);
        return !res.solvable || res.par > 6;
      },
    }),
  );

  levels.push(
    curateCampaignLevel({
      id: 5,
      chapter: 1,
      pocketCap: 1,
      targetPar: 6,
      title: "Four-Way Switch",
      sample: () => {
        const p = samplePar6Cap1(graph, rand, 4);
        return p && hasAllTransform(p) ? p : null;
      },
    }),
  );

  levels.push(
    curateCampaignLevel({
      id: 6,
      chapter: 1,
      pocketCap: 1,
      targetPar: 8,
      title: "Midnight Relay",
      sample: () => {
        const p = samplePar8Cap1(graph, rand);
        return p && hasAllTransform(p) ? p : null;
      },
    }),
  );

  // L7..L12 (Chapter 2: Rivets)
  levels.push(
    curateCampaignLevel({
      id: 7,
      chapter: 2,
      pocketCap: 1,
      targetPar: 4,
      title: "Bolted Frame",
      sample: () => {
        const p = samplePar4Cap1(graph, rand);
        return p && hasAllTransform(p) ? p : null;
      },
    }),
  );

  levels.push(
    curateCampaignLevel({
      id: 8,
      chapter: 2,
      pocketCap: 1,
      targetPar: 6,
      title: "Rivet Bypass",
      requireBreaksOptimal: true,
      sample: () => sampleRivetedDeadlock(graph, rand, 4),
    }),
  );

  levels.push(
    curateCampaignLevel({
      id: 9,
      chapter: 2,
      pocketCap: 1,
      targetPar: 6,
      title: "Locked Vault",
      sample: () => {
        const p = samplePar6Cap1(graph, rand, 3);
        return p && hasAllTransform(p) ? p : null;
      },
    }),
  );

  levels.push(
    curateCampaignLevel({
      id: 10,
      chapter: 2,
      pocketCap: 1,
      targetPar: 6,
      title: "Iron Gallery",
      requireBreaksOptimal: true,
      sample: () => sampleRivetedDeadlock(graph, rand, 4),
    }),
  );

  levels.push(
    curateCampaignLevel({
      id: 11,
      chapter: 2,
      pocketCap: 1,
      targetPar: 8,
      title: "Steel Maze",
      sample: () => {
        const p = samplePar8Cap1(graph, rand);
        return p && hasAllTransform(p) ? p : null;
      },
    }),
  );

  levels.push(
    curateCampaignLevel({
      id: 12,
      chapter: 2,
      pocketCap: 1,
      targetPar: 8,
      title: "Warden's Safe",
      sample: () => {
        const p = samplePar8Cap1(graph, rand);
        return p && hasAllTransform(p) ? p : null;
      },
    }),
  );

  // L13..L18 (Chapter 3: 2-Slot Thief Bag)
  levels.push(
    curateCampaignLevel({
      id: 13,
      chapter: 3,
      pocketCap: 2,
      targetPar: 4,
      title: "Double Pocket",
      sample: () => sampleCap2Par4(graph, rand),
    }),
  );

  levels.push(
    curateCampaignLevel({
      id: 14,
      chapter: 3,
      pocketCap: 2,
      targetPar: 6,
      title: "Twin Heist",
      sample: () => {
        const p = sampleCap2Cycle(graph, rand, 3);
        return p && hasAllTransform(p) ? p : null;
      },
    }),
  );

  levels.push(
    curateCampaignLevel({
      id: 15,
      chapter: 3,
      pocketCap: 2,
      targetPar: 6,
      title: "Two-Handed Grab",
      sample: () => {
        const p = sampleCap2Par6FourProps(graph, rand);
        return p && hasAllTransform(p) ? p : null;
      },
    }),
  );

  levels.push(
    curateCampaignLevel({
      id: 16,
      chapter: 3,
      pocketCap: 2,
      targetPar: 8,
      title: "Crossfire Hold",
      addRivet: true,
      sample: () => {
        const p = sampleCap2Cycle(graph, rand, 4);
        return p && hasAllTransform(p) ? p : null;
      },
    }),
  );

  levels.push(
    curateCampaignLevel({
      id: 17,
      chapter: 3,
      pocketCap: 2,
      targetPar: 8,
      title: "Grand Carousel",
      sample: () => {
        const p = sampleCap2Cycle(graph, rand, 4);
        return p && hasAllTransform(p) ? p : null;
      },
    }),
  );

  levels.push(
    curateCampaignLevel({
      id: 18,
      chapter: 3,
      pocketCap: 2,
      targetPar: 8,
      title: "Master Thief",
      addRivet: true,
      sample: () => {
        const p = sampleCap2Cycle(graph, rand, 4);
        return p && hasAllTransform(p) ? p : null;
      },
    }),
  );

  return levels;
}

function generateDailyBank(graph, dict, usedSignatures) {
  const rand = createRng(0x4441494c); // "DAIL"
  const dailyTuples = [];
  let nextId = 1001;

  function fillTier(tier, count, generatorFn) {
    let produced = 0;
    let attempts = 0;
    while (produced < count && attempts < count * 80) {
      attempts++;
      const entry = generatorFn(produced, attempts);
      if (!entry) continue;
      const sig = boardSignature(entry.pocketCap, entry.props);
      if (usedSignatures.has(sig)) continue;
      usedSignatures.add(sig);

      const titleIdx = Math.floor(rand() * DAILY_TITLES.length);
      const tierIdx = ["mon-tue", "wed-thu", "fri-sat", "sun"].indexOf(tier);
      const propTuples = entry.props.map((p, idx) => {
        const fIdx = entry.frameIndices[idx];
        return p.rivets && p.rivets.length > 0
          ? [p.start, p.goal, fIdx, p.rivets]
          : [p.start, p.goal, fIdx];
      });
      dailyTuples.push([nextId++, tierIdx, entry.chapter, entry.par, titleIdx, propTuples]);
      produced++;
    }
    if (produced < count) {
      throw new Error(`Tier ${tier} only produced ${produced}/${count} after ${attempts} attempts`);
    }
  }

  // 1. mon-tue: chapter 1, pocketCap 1, 3-4 props, par 4..6
  fillTier("mon-tue", TARGET_PER_TIER, (idx) => {
    const wantPar = idx % 2 === 0 ? 4 : 6;
    const numProps = wantPar === 4 ? (idx % 4 === 0 ? 3 : 4) : idx % 3 === 0 ? 3 : 4;
    const pairs =
      wantPar === 4
        ? numProps === 3
          ? samplePar4Cap1(graph, rand)
          : samplePar4FourProps(graph, rand)
        : samplePar6Cap1(graph, rand, numProps);
    if (!pairs || !hasUniqueStartWords(pairs) || !hasAllTransform(pairs) || !isCleanCampaignPairs(pairs)) {
      return null;
    }
    const frameIndices = pickDistinctFrameIndices(pairs.length, rand);
    const lvl = makeLevel(1, 1, "Daily", pairs, frameIndices, [], "mon-tue");
    const res = solveBoard(lvl, dict, SOLVER_MAX_NODES);
    if (!res.solvable || res.par < 4 || res.par > 6 || !isCleanSolutionPath(lvl, res.path, dict)) {
      return null;
    }
    return { chapter: 1, pocketCap: 1, par: res.par, props: lvl.props, frameIndices };
  });

  // 2. wed-thu: chapter 2, pocketCap 1, 3-4 props with rivets, par 4..6, validFirstSteals>=2 && (deadEnd>=1 || par>=6)
  fillTier("wed-thu", TARGET_PER_TIER, (idx) => {
    const wantPar = idx % 2 === 0 ? 4 : 6;
    const useDeadlock = wantPar === 6 && idx % 4 === 1;
    let pairs;
    if (useDeadlock) {
      pairs = sampleRivetedDeadlock(graph, rand, 4);
      if (!pairs) return null;
    } else {
      const numProps = wantPar === 4 ? 3 : idx % 3 === 0 ? 3 : 4;
      pairs =
        wantPar === 4
          ? samplePar4Cap1(graph, rand)
          : samplePar6Cap1(graph, rand, numProps);
      if (!pairs || !hasAllTransform(pairs)) return null;
    }
    if (!hasUniqueStartWords(pairs) || !isCleanCampaignPairs(pairs)) return null;
    const frameIndices = pickDistinctFrameIndices(pairs.length, rand);
    const lvl = makeLevel(2, 1, "Daily", pairs, frameIndices, [], "wed-thu");
    const base = solveBoard(lvl, dict, SOLVER_MAX_NODES);
    if (!base.solvable) return null;
    const attached = tryAttachRivets(lvl, graph, dict, base, useDeadlock);
    if (!attached) return null;
    if (attached.res.par < 4 || attached.res.par > 6) return null;
    if (useDeadlock && !attached.breaksOptimal && !attached.increasesPar) return null;
    if (!isCleanSolutionPath(attached.level, attached.res.path, dict)) return null;
    return {
      chapter: 2,
      pocketCap: 1,
      par: attached.res.par,
      props: attached.level.props,
      frameIndices,
    };
  });

  // 3. fri-sat: chapter 3, pocketCap 2, 3-4 props, par 6..8, validFirstSteals>=2 && (deadEnd>=1 || par>=6)
  fillTier("fri-sat", TARGET_PER_TIER, (idx) => {
    const numProps = idx % 2 === 0 ? 3 : 4;
    const pairs =
      numProps === 4 && idx % 4 === 1
        ? sampleCap2Par6FourProps(graph, rand)
        : sampleCap2Cycle(graph, rand, numProps);
    if (!pairs || !hasUniqueStartWords(pairs) || !hasAllTransform(pairs) || !isCleanCampaignPairs(pairs)) {
      return null;
    }
    const frameIndices = pickDistinctFrameIndices(pairs.length, rand);
    const lvl = makeLevel(3, 2, "Daily", pairs, frameIndices, [], "fri-sat");
    const res2 = solveBoard(lvl, dict, SOLVER_FAST_NODES);
    if (!res2.solvable || res2.par < 6 || res2.par > 8) return null;
    if (res2.validFirstSteals < 2 || (res2.deadEndFirstSteals < 1 && res2.par < 6)) return null;
    const res1 = solveBoard({ ...lvl, pocketCap: 1 }, dict, SOLVER_FAST_NODES);
    if (res1.solvable && res1.par <= res2.par) return null;
    const exact = solveBoard(lvl, dict, SOLVER_MAX_NODES);
    if (!exact.solvable || exact.par !== res2.par || !isCleanSolutionPath(lvl, exact.path, dict)) {
      return null;
    }
    return { chapter: 3, pocketCap: 2, par: exact.par, props: lvl.props, frameIndices };
  });

  // 4. sun: chapter 2 or 3, 4 props, par 6..8, validFirstSteals>=2 && (deadEnd>=1 || par>=6)
  fillTier("sun", TARGET_PER_TIER, (idx) => {
    const isCh3 = idx % 2 === 1;
    if (isCh3) {
      const pairs =
        idx % 4 === 1
          ? sampleCap2Par6FourProps(graph, rand)
          : sampleCap2Cycle(graph, rand, 4);
      if (!pairs || !hasUniqueStartWords(pairs) || !hasAllTransform(pairs) || !isCleanCampaignPairs(pairs)) {
        return null;
      }
      const frameIndices = pickDistinctFrameIndices(4, rand);
      const lvl = makeLevel(3, 2, "Daily", pairs, frameIndices, [], "sun");
      const res2 = solveBoard(lvl, dict, SOLVER_FAST_NODES);
      if (!res2.solvable || res2.par < 6 || res2.par > 8) return null;
      if (res2.validFirstSteals < 2 || (res2.deadEndFirstSteals < 1 && res2.par < 6)) return null;
      const res1 = solveBoard({ ...lvl, pocketCap: 1 }, dict, SOLVER_FAST_NODES);
      if (res1.solvable && res1.par <= res2.par) return null;
      const exact = solveBoard(lvl, dict, SOLVER_MAX_NODES);
      if (!exact.solvable || exact.par !== res2.par || !isCleanSolutionPath(lvl, exact.path, dict)) {
        return null;
      }
      return { chapter: 3, pocketCap: 2, par: exact.par, props: lvl.props, frameIndices };
    }
    const useDeadlock = idx % 4 === 0;
    let pairs;
    if (useDeadlock) {
      pairs = sampleRivetedDeadlock(graph, rand, 4);
      if (!pairs) return null;
    } else {
      pairs = idx % 4 === 2 ? samplePar8Cap1(graph, rand) : samplePar6Cap1(graph, rand, 4);
      if (!pairs || !hasAllTransform(pairs)) return null;
    }
    if (!hasUniqueStartWords(pairs) || !isCleanCampaignPairs(pairs)) return null;
    const frameIndices = pickDistinctFrameIndices(4, rand);
    const lvl = makeLevel(2, 1, "Daily", pairs, frameIndices, [], "sun");
    const base = solveBoard(lvl, dict, SOLVER_MAX_NODES);
    if (!base.solvable) return null;
    const attached = tryAttachRivets(lvl, graph, dict, base, useDeadlock);
    if (!attached) return null;
    if (attached.res.par < 6 || attached.res.par > 8) return null;
    if (useDeadlock && !attached.breaksOptimal && !attached.increasesPar) return null;
    if (!isCleanSolutionPath(attached.level, attached.res.path, dict)) return null;
    return {
      chapter: 2,
      pocketCap: 1,
      par: attached.res.par,
      props: attached.level.props,
      frameIndices,
    };
  });

  return dailyTuples;
}

function emitLevelsTs(levels) {
  return `import type { LevelDef } from "../sim/types.ts";

// Generated by scripts/generate-content.mjs — do not edit by hand.
export const CAMPAIGN_LEVELS: LevelDef[] = ${JSON.stringify(levels, null, 2)};
`;
}

function emitDailyBankTs(dailyTuples) {
  return `import type { DailyTier, LevelDef, PropDef } from "../sim/types.ts";

// Generated by scripts/generate-content.mjs — compact tuple bank expanded at module load.
const FRAMES = ${JSON.stringify(FRAMES)} as const;
const LABELS = ${JSON.stringify(FRAME_LABELS)} as const;
const TIERS: readonly DailyTier[] = ["mon-tue", "wed-thu", "fri-sat", "sun"];
const TITLES = ${JSON.stringify(DAILY_TITLES)} as const;

type PropTuple = readonly [start: string, goal: string, frameIdx: number, rivets?: readonly number[]];
type DailyTuple = readonly [
  id: number,
  tierIdx: number,
  chapter: 1 | 2 | 3,
  par: number,
  titleIdx: number,
  props: readonly PropTuple[],
];

const RAW_DAILY: readonly DailyTuple[] = ${JSON.stringify(dailyTuples)};

export const DAILY_BANK: LevelDef[] = RAW_DAILY.map(
  ([id, tierIdx, chapter, par, titleIdx, propTuples]): LevelDef => ({
    id,
    chapter,
    title: TITLES[titleIdx],
    par,
    pocketCap: chapter === 3 ? 2 : 1,
    tier: TIERS[tierIdx],
    props: propTuples.map(([start, goal, frameIdx, rivets], idx): PropDef => ({
      id: \`p\${idx + 1}\`,
      label: LABELS[frameIdx],
      frame: FRAMES[frameIdx],
      start,
      goal,
      ...(rivets ? { rivets: [...rivets] } : {}),
    })),
  }),
);
`;
}

function main() {
  const t0 = Date.now();
  const words = JSON.parse(fs.readFileSync(DICT_PATH, "utf8"));
  const dict = loadDict(words);
  const graph = buildWordGraph(words, dict);
  const usedSignatures = new Set();

  const campaign = generateCampaignLevels(graph, dict, usedSignatures);
  const dailyTuples = generateDailyBank(graph, dict, usedSignatures);

  fs.writeFileSync(LEVELS_OUT, emitLevelsTs(campaign), "utf8");
  fs.writeFileSync(DAILY_OUT, emitDailyBankTs(dailyTuples), "utf8");

  const elapsed = Date.now() - t0;
  console.log(
    `Generated ${campaign.length} campaign levels and ${dailyTuples.length} daily puzzles in ${elapsed}ms`,
  );
}

main();
