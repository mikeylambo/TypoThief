# TYPO THIEF Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and package **TYPO THIEF**, a Sunday-comic word-routing puzzle game for YouTube Playables (`PLATFORM=youtube`) and portfolio web (`PLATFORM=web`), starting with a pure Node-verified simulation & puzzle-generation gate before any UI work.

**Architecture:** Pure deterministic TypeScript simulation (`src/sim/`) decoupled from a DOM/SVG UI (`src/view/`), procedural WebAudio (`src/audio/`), schema-versioned persistence (`src/meta/`), and dual `WebAdapter` / `YouTubeAdapter` platform wrappers (`src/platform/`). Milestone 1 builds and verifies the 3â€“6 letter cleaned dictionary, game rules, BFS solver, 18 campaign levels, and 365+ weekday-tiered Daily Heist bank in Node (`v24.15.0` native TS + `node --test`) as a strict gate prior to Milestone 2 UI work.

**Tech Stack:** TypeScript (strict), Vite, Node v24 (`node --test`), native DOM/SVG, Web Audio API, `ytgame` SDK v1.

**Spec:** [2026-11-17-typo-thief-design.md](file:///C:/Users/Richard/.gemini/antigravity/brain/fe7d30de-e5b3-4b93-9dc0-f20aa1bf8f91/2026-11-17-typo-thief-design.md)

**Target Repo Directory:** `C:\Users\Richard\.gemini\antigravity\scratch\TypoThief`

---

## Global Constraints
- Word lengths capped at **3â€“6 letters** (`3 <= word.length <= 6`); **no 2-letter words** and **no regular plurals/inflections** (`-s/-es/-ies/-ed/-ing/-er/-est`).
- Boards have **3â€“4 props** max so every tile stays **48px+ wide** inside a **350px** mobile playfield with no scrolling.
- Drop Mode uses left/right half-tile targets and **never** pre-highlights valid/invalid gaps or valid/invalid drag previews.
- **Free multi-level Undo** rewinds `moves`; **Reset** resets `moves = 0` and `usedHint = false`; **Hint** sets `usedHint = true` (caps clear at 2â˜…).
- Stars: `â˜…â˜…â˜…` = `moves <= par && !usedHint`; `â˜…â˜…â˜†` = `moves <= par + 2` or (`moves <= par && usedHint`); `â˜…â˜†â˜†` = all other clears.
- Sequential unlock (`1 â†’ 18`); first visit opens straight onto Level 1; Daily Heist unlocks after clearing **Level 6 (Chapter 1)** and serves a weekday-tiered UTC date-seeded puzzle from a **365+ puzzle bank**.
- Production `PLATFORM=youtube` ZIP bundle must stay **under 300 KB**, inject `<script src="https://www.youtube.com/game_api/v1"></script>` **only** for `youtube` builds, and ship zero external fonts or audio files.

## Review Focus
1. **Riveted tile index shifting:** Stealing or dropping a letter before a riveted tile shifts `rivets: boolean[]`; index tracking must keep each padlock glued to its exact original character across steals, drops, and Undos (pinned in Task 3).
2. **Inflection filter over-stripping true stems:** Base words ending in `-s`, `-ed`, `-ing`, or `-er` (`glass`, `bus`, `bed`, `red`, `ring`, `her`) must survive dictionary filtering (pinned in Task 2).
3. **Chapter 3 Drop-Mode ambiguity & cancellation:** With `pocketCap = 2` and `1` letter held, board tile taps must steal by default unless Drop Mode is explicitly toggled via the Bag; cancelling Drop Mode or switching slots must never drop or reorder held letters (pinned in Task 3 & Task 9).
4. **Corrupted or schema-mismatched save payloads:** Malformed JSON or missing fields from `localStorage` / `ytgame.game.loadData()` must recover safely to defaults without throwing (pinned in Task 6).
5. **YouTube Playables lifecycle & muted audio:** Multiple `firstFrame()` calls, mid-sound `onPause()` / `onAudioToggle(false)`, or missing `window.ytgame` must be idempotent and never throw (pinned in Task 7 & Task 8).

---

## Milestone 1 â€” Pure Sim, Dictionary, Solver & Content Gate (Node Only)

### Task 1: Project Scaffold & Native-TS Test Harness

**Files:**
- Create: `C:\Users\Richard\.gemini\antigravity\scratch\TypoThief\package.json`
- Create: `C:\Users\Richard\.gemini\antigravity\scratch\TypoThief\tsconfig.json`
- Create: `C:\Users\Richard\.gemini\antigravity\scratch\TypoThief\.gitignore`
- Copy spec & plan into: `docs/superpowers/specs/2026-11-17-typo-thief-design.md`, `docs/superpowers/plans/2026-11-17-typo-thief-plan.md`

**Interfaces:**
- Produces: npm scripts (`test`, `typecheck`, `build:dict`, `gen:content`, `dev`, `build`, `build:yt`) runnable via `npm.cmd`.

- [ ] **Step 1: Initialize `package.json`, `tsconfig.json`, and `.gitignore` in `C:\Users\Richard\.gemini\antigravity\scratch\TypoThief`**
  Configure TypeScript strict mode (`"noEmit": true`, `"moduleResolution": "bundler"`, `"allowImportingTsExtensions": true`, `"resolveJsonModule": true`), `vite` devDependency, and `"test": "node --test tests/*.test.ts"`.
- [ ] **Step 2: Install Vite + TypeScript and initialize git repo**
  Run: `npm.cmd install -D vite typescript` and `git init`.
  Expected: `node -v` (`v24.15.0+`), `npx.cmd tsc --noEmit` exits `0`.
- [ ] **Step 3: Copy spec and plan into `docs/superpowers/` and commit scaffold**
  Run: `git add package.json package-lock.json tsconfig.json .gitignore docs/ && git commit -m "chore: scaffold typo-thief TypeScript and Vite workspace"`

---

### Task 2: Cleaned 3â€“6 Letter Base Dictionary Builder

**Files:**
- Create: `scripts/build-dict.mjs`
- Create: `src/content/dict.json`
- Create: `src/sim/dict.ts`
- Test: `tests/dict.test.ts`

**Interfaces:**
- Consumes: `C:\Users\Richard\.gemini\antigravity\brain\fe7d30de-e5b3-4b93-9dc0-f20aa1bf8f91\scratch\drive_repos\make-a-word-main.zip` (`content/server-dictionary.json`, `content/word-ranks.json`).
- Produces: `loadDict(words?: string[]): Set<string>` and `isValidWord(dict: Set<string>, word: string): boolean` in `src/sim/dict.ts`, plus `src/content/dict.json`.

- [ ] **Step 1: Write the failing test in `tests/dict.test.ts`**
  Assert: every entry in `dict.json` is lowercase ASCII `a-z` of length `3..6`; no 2-letter words exist; regular inflections (`carts`, `lamps`, `played`, `playing`, `faster`) are excluded; true base stems (`glass`, `bus`, `bed`, `red`, `ring`, `her`, `clamp`, `art`, `cart`, `car`, `rip`, `trip`) are present; `isValidWord` is case-insensitive.
- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test tests/dict.test.ts`
  Expected: FAIL (`dict.json` / `dict.ts` not found).
- [ ] **Step 3: Implement `scripts/build-dict.mjs` and `src/sim/dict.ts`**
  Filter `server-dictionary.json` with `word-ranks.json <= 8000`, `3 <= len <= 6`, stripping regular `-s/-es/-ies/-ed/-ing/-er/-est` against the full 62k stem set while preserving true stems (`-ss`, `-us`, `-is`, short stems), plus explicit campaign whitelists if needed; emit sorted JSON array to `src/content/dict.json` and run `npm.cmd run build:dict`.
- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test tests/dict.test.ts`
  Expected: PASS (`~3,491` words verified).
- [ ] **Step 5: Commit**
  Run: `git add scripts/build-dict.mjs src/content/dict.json src/sim/dict.ts tests/dict.test.ts && git commit -m "feat: build cleaned 3-6 letter base dictionary"`

---

### Task 3: Pure Game Rules Engine (`rules.ts`)

**Files:**
- Create: `src/sim/types.ts`
- Create: `src/sim/rules.ts`
- Test: `tests/rules.test.ts`

**Interfaces:**
- Consumes: `isValidWord` from `src/sim/dict.ts`.
- Produces in `src/sim/types.ts`:
  - `PropDef`: `{ id: string; label: string; frame: string; start: string; goal: string; rivets?: number[] }`
  - `LevelDef`: `{ id: number; chapter: 1 | 2 | 3; title: string; par: number; pocketCap: 1 | 2; props: PropDef[] }`
  - `PropState`: `{ id: string; label: string; frame: string; word: string; goal: string; rivets: boolean[] }`
  - `Move`: `{ kind: "steal"; propIdx: number; charIdx: number } | { kind: "drop"; propIdx: number; pos: number; slotIdx: number }`
  - `GameState`: `{ props: PropState[]; pocket: string[]; pocketCap: 1 | 2; dropMode: boolean; activeSlot: number; moves: number; usedHint: boolean; history: Snapshot[] }`
- Produces in `src/sim/rules.ts`:
  - `createGameState(level: LevelDef): GameState`
  - `canSteal(state: GameState, propIdx: number, charIdx: number, dict: Set<string>): { ok: boolean; reason?: string; nextWord: string }`
  - `stealLetter(state: GameState, propIdx: number, charIdx: number, dict: Set<string>): GameState`
  - `canDrop(state: GameState, propIdx: number, pos: number, slotIdx: number, dict: Set<string>): { ok: boolean; reason?: string; nextWord: string }`
  - `dropLetter(state: GameState, propIdx: number, pos: number, slotIdx: number, dict: Set<string>): GameState`
  - `toggleDropMode(state: GameState, slotIdx?: number): GameState`
  - `undoMove(state: GameState): GameState`
  - `resetGame(level: LevelDef, prevUsedHint?: boolean): GameState`
  - `hasAnyValidDrop(state: GameState, dict: Set<string>): boolean`
  - `isStuck(state: GameState, dict: Set<string>): boolean`
  - `isSolved(state: GameState): boolean`
  - `computeStars(moves: number, par: number, usedHint: boolean): 1 | 2 | 3`

- [ ] **Step 1: Write failing unit tests in `tests/rules.test.ts`**
  Cover:
  1. Valid steal & drop sequence (`CLAMP -> LAMP`, `ART -> CART -> CAR`, `RIP -> TRIP`), confirming `moves` increments and `isSolved` triggers only when `pocket.length === 0`.
  2. **Rivets index shifting (Review Focus #1):** Stealing index `0` from `scare` with rivet on `a` (idx `2`) leaves `rivets` on `a` (new idx `1`); inserting at `pos <= r` shifts rivet right (`r + 1`); attempting to steal a riveted tile returns `ok: false`.
  3. **Chapter 3 2-slot bag mode switching (Review Focus #3):** `0/2` has `dropMode: false`; stealing 1st letter leaves `dropMode: false`; `toggleDropMode(state, 0)` enters `dropMode: true` and toggling again cancels cleanly without losing the letter; stealing 2nd letter auto-sets `dropMode: true` with `activeSlot: 0`; dropping from slot `0` leaves slot `1` intact.
  4. **Free Undo & Stars:** `undoMove` restores prior `props`, `pocket`, `rivets`, `dropMode`, and rewinds `moves`; `computeStars` returns `3` iff `moves <= par && !usedHint`, `2` for `moves <= par + 2` or `(moves <= par && usedHint)`, `1` otherwise.
  5. **Stuck detector:** `isStuck` returns `true` when `pocket.length === pocketCap` and `hasAnyValidDrop === false`.
- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test tests/rules.test.ts`
  Expected: FAIL (`types.ts` / `rules.ts` not found).
- [ ] **Step 3: Implement `src/sim/types.ts` and `src/sim/rules.ts`**
  Keep every transition pure/immutable so Undo snapshots and BFS cloning are trivial and bug-free.
- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test tests/rules.test.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  Run: `git add src/sim/types.ts src/sim/rules.ts tests/rules.test.ts && git commit -m "feat: implement pure game rules, rivets, 2-slot bag, and free undo"`

---

### Task 4: BFS Solver, Trap Analyzer & Daily Selector

**Files:**
- Create: `src/sim/solver.ts`
- Create: `src/sim/daily.ts`
- Test: `tests/solver.test.ts`

**Interfaces:**
- Consumes: `LevelDef`, `GameState`, `Move` from `src/sim/types.ts` and `canSteal`, `stealLetter`, `canDrop`, `dropLetter`, `isSolved`, `createGameState` from `src/sim/rules.ts`.
- Produces in `src/sim/solver.ts`:
  - `SolveResult`: `{ solvable: boolean; par: number; path: Move[]; visited: number; validFirstSteals: number; deadEndFirstSteals: number }`
  - `solveBoard(levelOrState: LevelDef | GameState, dict: Set<string>, maxNodes?: number): SolveResult`
  - `getHintMove(state: GameState, dict: Set<string>, maxNodes?: number): Move | null`
- Produces in `src/sim/daily.ts`:
  - `weekdayTier(utcDateStr: string): "mon-tue" | "wed-thu" | "fri-sat" | "sun"`
  - `pickDailyPuzzle(utcDateStr: string, bank: LevelDef[]): LevelDef`

- [ ] **Step 1: Write failing tests in `tests/solver.test.ts`**
  Cover:
  1. `solveBoard` finds exact `par = 4` for `['clamp','art','rip'] -> ['lamp','car','trip']`.
  2. `solveBoard` respects riveted tiles (rejects a puzzle whose only route requires stealing a riveted letter) and supports Ch3 `pocketCap = 2` boards.
  3. `deadEndFirstSteals` correctly counts valid initial steals from which no path reaches the goal (or optimal length exceeds `par`).
  4. `getHintMove` returns the exact next optimal `Move` from a mid-puzzle state.
  5. `pickDailyPuzzle` deterministically selects matching weekday tiers (`Monâ€“Tue` Ch1, `Wedâ€“Thu` Ch2, `Friâ€“Sat` Ch3, `Sun` 4-prop Sunday Caper) for a given `YYYY-MM-DD` across a mock bank.
- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test tests/solver.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Implement `src/sim/solver.ts` and `src/sim/daily.ts`**
  Canonicalize BFS state keys as `props.map(w + rivetMask).join('|') + '#' + [...pocket].sort().join('')` (or exact pocket tuple) so state spaces stay compact; evaluate each initial valid steal's sub-BFS reachability to compute `deadEndFirstSteals`.
- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test tests/solver.test.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  Run: `git add src/sim/solver.ts src/sim/daily.ts tests/solver.test.ts && git commit -m "feat: add BFS solver, trap analyzer, and weekday daily selector"`

---

### Task 5: Campaign 18-Level + 365+ Daily Bank Generator & Milestone 1 Gate Test

**Files:**
- Create: `scripts/generate-content.mjs`
- Create: `src/content/levels.ts`
- Create: `src/content/dailyBank.ts`
- Test: `tests/content.test.ts`

**Interfaces:**
- Consumes: `src/content/dict.json`, `solveBoard` from `src/sim/solver.ts`.
- Produces: `CAMPAIGN_LEVELS: LevelDef[]` (18 levels: 6 per chapter) in `src/content/levels.ts`; `DAILY_BANK: LevelDef[]` (`>= 365` puzzles covering all 4 weekday tiers) in `src/content/dailyBank.ts`.

- [ ] **Step 1: Write failing content-gate test in `tests/content.test.ts`**
  Assert:
  1. `CAMPAIGN_LEVELS.length === 18`, 6 per chapter (`1..3`), `pocketCap === 2` only in Chapter 3, `rivets` present in Chapter 2.
  2. Every campaign & daily word is length `3..6` and present in `dict.json`.
  3. Every campaign level and every puzzle in `DAILY_BANK` (`>= 365` entries, with `>= 92` per weekday tier) solves via `solveBoard`, matches its declared `par` (`4 <= par <= 8` past L2), and for `L3..18` and `Wedâ€“Sun` Dailies has `validFirstSteals >= 2` and (`deadEndFirstSteals >= 1` OR `par >= 6`).
- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test tests/content.test.ts`
  Expected: FAIL (`levels.ts` / `dailyBank.ts` not found).
- [ ] **Step 3: Implement `scripts/generate-content.mjs` and generate `src/content/levels.ts` + `src/content/dailyBank.ts`**
  Use constructive multi-bridge graph sampling + `solveBoard` filtering to curate 18 fun, distinct campaign levels (starting with L1 `CLAMP/ART/RIP`, L2 `CHAIR/ART/EAR/ICE`, scaling up cleanly through Rivets & 2-Slot Bag) and generate `>= 365` unique verified Daily Heist puzzles across all 4 weekday tiers. Run `npm.cmd run gen:content`.
- [ ] **Step 4: Run full Milestone 1 Node verification gate**
  Run: `node --test tests/*.test.ts && npx.cmd tsc --noEmit`
  Expected: ALL Milestone 1 tests PASS; `tsc --noEmit` exits `0`. **Gate met â€” ready for Milestone 2 UI work.**
- [ ] **Step 5: Commit**
  Run: `git add scripts/generate-content.mjs src/content/levels.ts src/content/dailyBank.ts tests/content.test.ts && git commit -m "feat: generate and verify 18 campaign levels and 365+ daily heists"`

---

## Milestone 2 â€” Platform, Persistence, Audio, Modular Comic UI & Packaging

### Task 6: Schema-Versioned Save & Progression Store (`save.ts`)

**Files:**
- Create: `src/meta/save.ts`
- Test: `tests/save.test.ts`

**Interfaces:**
- Consumes: `LevelDef` from `src/sim/types.ts`.
- Produces: `SaveData`, `SAVE_SCHEMA = 1`, `defaultSave()`, `parseSaveWithRecovery(raw: unknown): SaveData`, `recordLevelClear(save: SaveData, levelId: number, stars: 1 | 2 | 3, moves: number): SaveData`, `recordDailyClear(save: SaveData, utcDate: string, stars: 1 | 2 | 3): SaveData`, `isDailyUnlocked(save: SaveData): boolean`, `computeTotalScore(save: SaveData): number`, `getResumeLevelId(save: SaveData): number`.

- [ ] **Step 1: Write failing tests in `tests/save.test.ts`**
  Cover:
  1. `isDailyUnlocked` is `false` until level `6` is cleared, then `true`.
  2. Sequential unlock (`highestUnlocked` advances from `1` to `Math.min(18, cleared + 1)`); replaying an older level never downgrades best stars or `highestUnlocked`.
  3. `computeTotalScore` equals `(totalStars * 100) + (dailyClears * 150)`.
  4. **Corrupted payload recovery (Review Focus #4):** Passing `null`, `"{bad json"`, wrong `schemaVersion`, or negative/NaN fields to `parseSaveWithRecovery` returns valid `defaultSave()` without throwing.
  5. `getResumeLevelId` returns `1` on fresh save, latest uncompleted unlocked level on return, and `0` (Chapter Select) once level `18` is cleared.
- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test tests/save.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Implement `src/meta/save.ts`**
- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test tests/save.test.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  Run: `git add src/meta/save.ts tests/save.test.ts && git commit -m "feat: add versioned save state, progression unlocks, and corruption recovery"`

---

### Task 7: Dual Web & YouTube Platform Adapters

**Files:**
- Create: `src/platform/PlatformAdapter.ts`
- Create: `src/platform/WebAdapter.ts`
- Create: `src/platform/YouTubeAdapter.ts`
- Create: `src/platform/index.ts`
- Test: `tests/platform.test.ts`

**Interfaces:**
- Consumes: `SaveData` / `parseSaveWithRecovery` from `src/meta/save.ts`.
- Produces: `PlatformAdapter`, `WebAdapter`, `YouTubeAdapter`, `createPlatform(envPlatform?: string): PlatformAdapter`.

- [ ] **Step 1: Write failing tests in `tests/platform.test.ts`**
  Cover (Review Focus #5):
  1. `YouTubeAdapter` falls back cleanly to `WebAdapter` when `globalThis.ytgame` is missing or `IN_PLAYABLES_ENV` is false.
  2. With mocked `globalThis.ytgame`, `firstFrame()` invokes `ytgame.game.firstFrameReady()` only once even if called repeatedly.
  3. `save` / `load` round-trips JSON via `ytgame.game.saveData` / `loadData`; `submitScore` calls `ytgame.engagement.sendScore({ value })`.
- [ ] **Step 2: Run test to verify it fails**
  Run: `node --test tests/platform.test.ts`
  Expected: FAIL.
- [ ] **Step 3: Implement `src/platform/*.ts`** (aligned directly with `Chroma Lines`'s `PlatformAdapter` contract).
- [ ] **Step 4: Run test to verify it passes**
  Run: `node --test tests/platform.test.ts`
  Expected: PASS.
- [ ] **Step 5: Commit**
  Run: `git add src/platform/ tests/platform.test.ts && git commit -m "feat: add Web and YouTube Playables platform adapters"`

---

### Task 8: Procedural WebAudio Synth & Modular Comic SVG Prop Registry

**Files:**
- Create: `src/audio/synth.ts`
- Create: `src/content/propsSvg.ts`

**Interfaces:**
- Consumes: `PropState` from `src/sim/types.ts`.
- Produces: `SoundEngine` (`unlock()`, `setMuted(m)`, `setPaused(p)`, `playSteal()`, `playDrop()`, `playInvalid()`, `playWin()`) in `src/audio/synth.ts`; `renderPropSvg(frame: string, solved: boolean, levelId?: number, propId?: string): string` (8â€“10 modular state-reactive comic frames + L1/L6/L12/L18 hero gag overlays) in `src/content/propsSvg.ts`.

- [ ] **Step 1: Implement `src/audio/synth.ts`**
  Lazy `AudioContext` creation on first user gesture; `setMuted(true)` and `setPaused(true)` immediately silence/suspend without throwing in headless/SSR contexts.
- [ ] **Step 2: Implement `src/content/propsSvg.ts`**
  Create 8â€“10 crisp Sunday-comic inline SVG frames (`safe`, `dog`, `laser`, `lamp`, `crate`, `art`, `cart`, `clock`, `locker`, `trophy`) with bold `#1B1814` outlines and distinct unsolved vs. solved expressions/effects, plus bespoke hero overlays for Levels `1, 6, 12, 18`.
- [ ] **Step 3: Type-check**
  Run: `npx.cmd tsc --noEmit`
  Expected: exits `0`.
- [ ] **Step 4: Commit**
  Run: `git add src/audio/synth.ts src/content/propsSvg.ts && git commit -m "feat: add procedural WebAudio synth and modular Sunday-comic SVG frames"`

---

### Task 9: Interactive DOM/SVG UI (`view/`)

**Files:**
- Create: `src/view/styles.css`
- Create: `src/view/Hud.ts`
- Create: `src/view/BoardView.ts`
- Create: `src/view/ChapterSelect.ts`
- Create: `src/view/App.ts`
- Create: `src/main.ts`
- Create: `index.html`

**Interfaces:**
- Consumes: `src/sim/*`, `src/content/levels.ts`, `src/content/dailyBank.ts`, `src/content/propsSvg.ts`, `src/meta/save.ts`, `src/platform/index.ts`, `src/audio/synth.ts`.
- Produces: Complete playable app mounted into `#app` in `index.html`, firing `platform.firstFrame()` after first board render and `platform.gameReady()` once interactive.

- [ ] **Step 1: Build `src/view/styles.css` and `index.html`**
  Sunday-comic cream/ink styling (`#FFF9EC`, `#1B1814` 3px borders, hard shadows); responsive `max-width: 440px` mobile-first playfield ensuring `3â€“6` letter tiles stay `>= 48px` wide inside 350px; `@media (prefers-reduced-motion: reduce)` support.
- [ ] **Step 2: Implement `Hud.ts`, `BoardView.ts`, and `ChapterSelect.ts`**
  - `Hud.ts`: Chapter/Level label, `Moves / Par`, Undo (`Z`), Reset (`R`), Hint (`H`), Audio toggle, Chapters button, Daily Heist button (`Locked Â· Clear Ch.1` until L6 cleared).
  - `BoardView.ts`:
    - Explicit Steal/Drop mode state machine (tapping Bag slot toggles Drop Mode in Ch3; tapping left/right half of a tile drops before/after that tile; optional pointer drag shows **only** neutral resultant string with zero color spoilers).
    - Gentle cream-gold steal tint on **Levels 1â€“2 only**; neutral tiles from Level 3+ and Daily Heist.
    - Level 1 animated pointing-hand FTUE overlay until first clear.
    - Required 1-line visual callout tooltip when encountering Rivets or 2-Slot Bag on Wedâ€“Sun Daily Heist before reaching Ch2/Ch3.
    - Stuck-state non-blocking pill (`"No valid drops left â€” Undo or Reset"`).
    - Win modal displaying earned `1â€“3` stars, `moves` vs `par`, Next Level / Retry for â˜…â˜…â˜… buttons.
- [ ] **Step 3: Implement `App.ts` and `src/main.ts`**
  Wire `createPlatform()`, load save, route straight into Level 1 (or latest unlocked level), handle `onPause`/`onResume`/`onAudioToggle`, persist & call `platform.submitScore(computeTotalScore(save))` on clears.
- [ ] **Step 4: Verify TypeScript compilation and local dev launch**
  Run: `npx.cmd tsc --noEmit`
  Expected: exits `0`.
- [ ] **Step 5: Commit**
  Run: `git add index.html src/main.ts src/view/ && git commit -m "feat: implement Sunday-comic DOM/SVG UI, FTUE, and app controller"`

---

### Task 10: Dual Build, YouTube ZIP Packaging & Verification

**Files:**
- Create: `vite.config.ts`
- Create: `scripts/package-youtube.mjs`

**Interfaces:**
- Produces: `dist-web/` (`PLATFORM=web`) and `dist-yt/` + `typo-thief-youtube.zip` (`PLATFORM=youtube` with `<script src="https://www.youtube.com/game_api/v1"></script>` injected in `<head>`).

- [ ] **Step 1: Implement `vite.config.ts` and `scripts/package-youtube.mjs`**
  Define `__PLATFORM__` at build time; conditionally inject the YouTube SDK `<script>` tag **only** when `PLATFORM=youtube`; zip `dist-yt/` and assert archive size `< 300 * 1024` bytes.
- [ ] **Step 2: Run full verification suite & both production builds**
  Run:
  - `node --test tests/*.test.ts`
  - `npx.cmd tsc --noEmit`
  - `npm.cmd run build`
  - `npm.cmd run build:yt`
  Expected: all tests PASS, `tsc` exits `0`, Web build succeeds without `youtube.com/game_api/v1`, YouTube ZIP succeeds under `300 KB` with `game_api/v1` present before app bundle.
- [ ] **Step 3: Commit**
  Run: `git add vite.config.ts scripts/package-youtube.mjs package.json && git commit -m "chore: configure dual web and YouTube Playables <300KB builds"`

