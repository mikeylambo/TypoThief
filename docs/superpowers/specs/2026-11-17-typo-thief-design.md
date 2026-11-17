# TYPO THIEF â€” Game Design & Architecture Spec

**Date:** 2026-11-17  
**Target Formats:** YouTube Playables (`PLATFORM=youtube`) & Portfolio Web (`PLATFORM=web`)  
**Target Repo Path [My Call]:** `C:\Users\Richard\.gemini\antigravity\scratch\TypoThief`  
**Stack:** Vite + TypeScript (strict), DOM/SVG UI, Pure `src/sim/` engine, Procedural WebAudio, Node test runner

---

## 1. Intent & Why
**TYPO THIEF** is a portfolio game-design showcase built to prove rapid AI-assisted execution and range across genres and visual styles. While the existing portfolio projects (*SIGNAL*, *Chroma Lines*, *REFLECT / DODGE*, *Junkshot*) lean toward sleek dark-tech aesthetics, *TYPO THIEF* delivers a **bright, goofy Sunday-comic word-routing puzzle** where players feel genuinely smarter after every level.

It is designed from day one for YouTube Playables constraints: tiny bundle size, sub-second load, zero-text onboarding, mobile-portrait + desktop responsiveness, and full playability with sound muted.

---

## 2. Goals, Non-Goals, and Anti-Goals

### Goals
- **2-second board readability:** Players grasp the rule on Level 1 without reading a tutorial modal.
- **"Aha!" routing depth:** Explicit target words turn letter-stealing into multi-step smuggling chains (e.g., turning `ART` into `CART` just to extract `T` and leave `CAR`), using a clean base-word dictionary derived from `Make a Word`.
- **Longevity without screen clutter:** 3 chapters (18 solver-verified levels on compact 3â€“4 prop boards) plus an unlockable **365+ puzzle Daily Heist** bank tiered by weekday.
- **Playables-ready engineering:** Pure deterministic `src/sim/` decoupled from DOM/SVG presentation and wired to a `PlatformAdapter` supporting both plain web and YouTube's `ytgame` SDK.

### Non-Goals
- Online multiplayer rooms, user accounts, or external backend servers.
- Open-ended sandbox word-guessing without target constraints.
- Audio MP3/OGG asset pipelines or heavy canvas engines (Phaser/Three.js).

### Anti-Goals
- **Aimless sandbox tinkering (rejected Model B):** Players should never feel stuck guessing which pun the designer had in mind.
- **Self-playing UI spoilers:** Valid `+` insertion gaps or valid/invalid drag-over color coding must NOT pre-highlight answers; players deduce where a letter fits.
- **Loose inflection sinks & obscure shortcuts:** No regular plurals/inflections (`-s/-es/-ies/-ed/-ing/-er/-est`) and no 2-letter Scrabble words that turn props into trivial letter dumps.
- **Undersized mobile targets:** No words over 6 letters and no cramped 15-target gap rows; every primary touch target stays accessible inside a 350px mobile board.

---

## 3. Constraints & Reference Artifacts
- **Reference Source Locations:**
  - `Make a Word` dictionary archives: `C:\Users\Richard\.gemini\antigravity\brain\fe7d30de-e5b3-4b93-9dc0-f20aa1bf8f91\scratch\drive_repos\make-a-word-main.zip` (`content/server-dictionary.json` + `content/word-ranks.json`).
  - `Chroma Lines` YouTube adapter reference: `C:\Users\Richard\.gemini\antigravity\brain\fe7d30de-e5b3-4b93-9dc0-f20aa1bf8f91\scratch\drive_repos\Chroma-Lines.zip` (`src/platform/`).
- **YouTube Playables SDK (`https://www.youtube.com/game_api/v1`):**
  - Only injected in `PLATFORM=youtube` builds; falls back cleanly to `WebAdapter` on web/itch.io.
  - `PlatformAdapter` contract (aligned with `Chroma Lines`):
    ```ts
    export interface PlatformAdapter {
      readonly id: "web" | "youtube";
      init(): Promise<void>;
      firstFrame(): void;
      gameReady(): void;
      language(): string;
      onPause(cb: () => void): void;
      onResume(cb: () => void): void;
      onAudioToggle(cb: (enabled: boolean) => void): void;
      save(data: unknown): Promise<void>;
      load<T>(): Promise<T | null>;
      submitScore(score: number): void;
      rewarded(slot: string): Promise<boolean>;
    }
    ```
  - **YouTube Score Metric [My Call]:** `ytgame.engagement.sendScore({ value })` submits cumulative integer `totalScore = (totalStars * 100) + (dailyClears * 150)` whenever a player improves their stars on any level or clears a Daily Heist.
- **Bundle & Load Budget:** Total production `dist/` ZIP under **300 KB** (zero external fonts, zero bitmap sprite sheets; system rounded/comic font stack + modular inline SVG + ~35 KB base dictionary).
- **Input & Accessibility:** Full parity across touch tap, mouse click, drag-and-drop, and optional keyboard navigation; `prefers-reduced-motion` toggle/respect; muted-safe visual feedback for every valid/invalid action.

---

## 4. Approaches Considered
1. **Vite + TypeScript DOM/SVG + Pure `sim/` (Chosen):** Combines `Make a Word`'s crisp DOM-native layout with `Chroma Lines`'s separated `src/sim/` and `src/platform/` layers. Delivers <300 KB bundles, sharp typography at every DPI, easy automated BFS puzzle verification in Node, and fast AI iteration on modular SVG comic visuals.
2. **Phaser 3 on the `Chroma Lines` SLU Shell (Rejected):** Pre-wires shell utilities, but adds >1 MB bundle weight and canvas text-scaling friction for a tile-and-word puzzle.
3. **Single-File Zero-Build HTML (`Junkshot` Style) (Rejected):** Minimal tooling, but lacks clean TypeScript module boundaries and automated build-time solver verification across 18 levels + 365+ Daily Heists.

---

## 5. Core Gameplay & Mechanics

### 5.1 Core Rule (User-Validated Model A)
- Each heist presents **3â€“4 Props**, each showing a modular comic SVG prop frame, short prop label, clickable current word tiles (**3â€“6 letters**), and explicit **Goal** word (`Goal: LAMP`).
- **Steal & Drop (Order-Preserving):**
  - **Steal:** Removes an un-riveted letter tile into the Thief Bagâ€”**only allowed** if the remaining letters form a valid word in `DICT` (note: 3-letter words naturally freeze against stealing because no 2-letter words exist in `DICT`).
  - **Drop:** Inserts the active held letter at gap index `0..word.length`â€”**only allowed** if the resulting word is in `DICT`.
  - **Temporarily breaking solved props:** A prop already matching its Goal can still be used as a temporary smuggling bridge; the level clears only when **every prop matches its Goal AND the Thief Bag is empty**.
- **Explicit Input Mode State Machine (Solves Ch3 Ambiguity & Mobile Tap Targets):**
  - Words are capped at **6 letters** so every tile stays `48px+` wide inside a 350px mobile board, with **no** separate `+` gap buttons squeezing the row.
  - **Ch1â€“Ch2 (`pocketCap = 1`):** Bag `0/1` = **Steal Mode** (full-tile taps steal). Bag `1/1` = **Drop Mode** automatically.
  - **Ch3 (`pocketCap = 2`):** Bag `0/2` = **Steal Mode**. Bag `1/2` = **Steal Mode by default** (tapping a board tile steals a 2nd letter); **tapping the held tile in the Bag enters Drop Mode** for that letter (tapping it again cancels back to Steal Mode). Bag `2/2` = **Drop Mode** automatically (slot 0 active by default; tap slot 1 to switch).
  - **Drop Mode Target & Neutral Preview:** In Drop Mode, tapping the **left half or right half** of any tile inserts before or after that tile (`26pxâ€“40px` half-tile hit zones over `48px+` tiles). Optional drag-and-drop shows **only the neutral resulting string** (e.g., `CART` in neutral inkâ€”zero valid/invalid color spoilers!) and validates against `DICT` only on commit.

### 5.2 Free Undo, Hint Penalty, Stuck Detector & Stars
- **Free Multi-Level Undo:** Full history stack that **rewinds `moves`** cleanly (no `usedUndo` penalty, no `Clean Run` pill). Players can freely test dead-end branches and backtrack without forced Resets.
- **Reset & Hint:**
  - **Reset** restores the initial board, clears `moves = 0`, and clears `usedHint = false`.
  - **Hint** runs live `src/sim/solver.ts` BFS from the current board state to highlight one optimal next move, setting `usedHint = true` for that attempt.
- **Stuck-State Detector:** Whenever the Bag is full (`pocket.length === pocketCap`) and **zero** valid drop insertions exist anywhere on the board, show a gentle non-blocking pill nudging `"No valid drops left â€” Undo or Reset"`.
- **Star Thresholds:**
  - â˜…â˜…â˜…: `moves <= par && !usedHint`
  - â˜…â˜…â˜†: `moves <= par + 2`, or `moves <= par` with a Hint used
  - â˜…â˜†â˜†: anything else

### 5.3 Progression, Startup & Daily Heist Unlock
- **Sequential Campaign Unlock:** Levels 1â€“18 unlock sequentially (`1 â†’ 2 â†’ â€¦ â†’ 18`). Players can replay any unlocked level via the Chapter/Level drawer.
- **Zero-Menu Startup [My Call]:** First-time launch opens straight onto **Level 1** (2-second Playables rule). Returning players launch directly into their latest unlocked uncompleted level (or Chapter Select if all 18 are cleared).
- **Daily Heist (365+ Weekday-Tiered Bank):**
  - Locked behind **clearing Chapter 1 (Level 6)**, displayed as a visible milestone badge (`Daily Â· Clear Ch.1`) in the header.
  - Once unlocked, every player gets the same deterministic UTC date-seeded (`YYYY-MM-DD`) puzzle from a **365+ puzzle bank generated and solver-verified at build time**, tiered by weekday:
    - **Monâ€“Tue:** Chapter 1 ruleset (`par 4â€“6`)
    - **Wedâ€“Thu:** Chapter 2 Rivets (`par 4â€“6`)
    - **Friâ€“Sat:** Chapter 3 Two-Slot Bag (`par 6â€“8`)
    - **Sun:** Sunday Caper (4-prop multi-bridge puzzle, `par 6â€“8`)
  - **Required Early-Twist Tooltip:** Because unlocking Daily Heist on Wedâ€“Sun exposes players to Rivets or the 2-Slot Bag before they reach Chapters 2â€“3, a compact 1-line visual callout badge on the Daily board is **required** on first encounter with those mechanics.

### 5.4 Dictionary (`src/content/dict.json`) & Trap Verification
- **Empirical Verification:** Filtering `Make a Word`'s `server-dictionary.json` + `word-ranks.json` to **3â€“6 letters**, `rank <= 8000`, and stripping regular inflections (`-s`, `-es`, `-ies`, `-ed`, `-ing`, `-er`, `-est` against the full 62k stem set) yields **3,491 clean base words**, **1,449 directed steal/insert edges**, and **690 2-step bridge words** (`w0 + c_in â†’ w_mid - c_out â†’ w1`). Constructive chain sampling confirmed **4,939 unique `par = 6` 4-prop boards** (2,587 with â‰¥3 distinct valid first steals) in 5,000 samplesâ€”more than enough for 18 curated campaign levels and 365+ weekday-tiered Daily Heists.
- **No 2-letter words** are included unless explicitly whitelisted (default: none).
- **Global Dead-End Trap Requirement:** Since invalid taps are free and Undo is free, difficulty comes from global routing traps. Solver verification tests enforce that post-tutorial levels (L3â€“18 and Wedâ€“Sun Daily tiers) have multiple valid first steals where greedy moves dead-end or exceed `par`.

### 5.5 Three-Chapter Escalation (18 Levels)
- **Chapter 1 â€” Rookie Caper (Levels 1â€“6):** 1-slot pocket, 3â€“4 props. Teaches stealing/dropping (`L1â€“2`), smuggling through intermediate words (`L3â€“4`), and temporarily breaking a solved prop (`L5â€“6`).
- **Chapter 2 â€” Riveted Vaults (Levels 7â€“12):** Introduces **Riveted Tiles** (`rivets: boolean[]` tracked per tile). Riveted tiles wear a brass padlock/rivet badge and cannot be stolen, though letters can be dropped before/after them.
- **Chapter 3 â€” Double-Take Heists (Levels 13â€“18):** Unlocks the **2-Slot Thief Bag** (`pocketCap = 2`), enabling two-letter smuggling and cross-prop swaps on compact 3â€“4 prop boards.

### 5.6 Onboarding, Modular Art & Audio
- **FTUE (Zero-Text):** Level 1 opens directly onto the board with an animated comic hand cursor nudging the first steal and first drop, disappearing permanently once Level 1 is cleared.
- **Steal Affordance [My Call]:** On Levels 1â€“2 only, stealable letters show a gentle cream-gold tint. From Level 3 onward and in Daily Heist, tiles stay neutral; invalid steals/drops shake and pop a brief `"CLMP? Not a word!"` pill.
- **Modular Sunday-Comic SVG Strategy:**
  - Ship **8â€“10 modular state-reactive comic SVG prop frames** (Vault Safe, Watchdog, Laser Gadget, Desk Lamp, Crate, Art Pedestal, Cart, Alarm Clock, Locker, Trophy Case) across **all** 18 campaign levels and 365+ Daily Heists, driven by state transitions (hostile/locked/dark â†’ calm/open/lit + comic *CLICK! / POOF!* bursts).
  - Reserve **4 bespoke hero transformation gags** as a final polish pass on **L1, L6, L12, and L18** after the vertical slice is verified.
- **Procedural WebAudio (`src/audio/synth.ts`):** Pure Web Audio API SFX (*yoink*, *ka-chunk*, *boing*, heist-clear fanfare) synced with `PlatformAdapter` audio state and `reduced-motion`.

---

## 6. Architecture, Module Layout & Milestone 1 Gate
- `src/sim/` (100% pure, DOM-free, testable in Node):
  - `types.ts` â€” `PropState`, `LevelDef`, `GameState`, `Move`
  - `dict.ts` â€” dictionary lookup `Set<string>`
  - `rules.ts` â€” `canSteal`, `stealLetter`, `canDrop`, `dropLetter`, `isSolved`, `hasAnyValidDrop` (including `rivets` index shifting & 2-slot bag mode)
  - `solver.ts` â€” BFS solver returning optimal `par`, next hint move, and dead-end/distractor trap metrics
  - `daily.ts` â€” UTC date-seeded Daily Heist selector over the 365+ weekday-tiered bank
- `src/content/`:
  - `dict.json` â€” cleaned 3â€“6 letter base-word list (~3,491 words)
  - `levels.ts` â€” 18 solver-verified campaign levels across Chapters 1â€“3
  - `dailyBank.ts` â€” 365+ build-time generated & solver-verified Daily Heist puzzles
  - `propsSvg.ts` â€” 8â€“10 modular state-reactive comic frames + L1/L6/L12/L18 hero gag overlays
- `src/platform/`:
  - `PlatformAdapter.ts`, `WebAdapter.ts`, `YouTubeAdapter.ts`, `index.ts`
- `src/audio/`:
  - `synth.ts` â€” procedural WebAudio SFX
- `src/meta/`:
  - `save.ts` â€” schema-versioned progress (highest unlocked level, best stars/moves per level, Daily Heist streak/cleared dates, `totalScore`, audio/motion prefs) with corrupted-JSON recovery
- `src/view/`:
  - `App.ts`, `BoardView.ts`, `ChapterSelect.ts`, `Hud.ts`, `styles.css`
- `tests/`:
  - Unit tests for `rules.ts` (`rivets` shifting, 2-slot bag, free Undo rewind, Hint cap, stuck detection), `save.ts`, `daily.ts`, and **content verification tests** asserting all 18 campaign levels + all 365+ Daily Bank puzzles are solvable, match their declared `par`, respect the 6-letter cap, and pass dead-end trap thresholds.

### Milestone 1 Gate (Before UI Work)
Milestone 1 builds and verifies `src/sim/`, the cleaned 3â€“6 letter dictionary builder, the BFS solver + trap analyzer, the 18 candidate campaign levels + 365+ weekday-tiered Daily Heist generator, and the full Node test suite **before any DOM/SVG UI work begins**.

---

## 7. Left to the Builder
- Exact CSS animations, confetti/particle timing, and modular SVG artwork details for the 8â€“10 comic frames (plus the L1, L6, L12, L18 hero polish gags).
- Exact selection of the 18 campaign word-chain boards from solver-generated candidates.
- Vite config (`PLATFORM=web` vs `PLATFORM=youtube` conditional `<script src="https://www.youtube.com/game_api/v1"></script>` injection) and YouTube `.zip` packaging script.

