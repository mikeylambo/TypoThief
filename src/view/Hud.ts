import type { SaveData } from "../meta/save.ts";
import { isDailyUnlocked } from "../meta/save.ts";
import type { GameState, LevelDef } from "../sim/types.ts";

export type PlayMode = "campaign" | "daily";

export interface HudHandlers {
  onUndo: () => void;
  onReset: () => void;
  onHint: () => void;
  onToggleAudio: () => void;
  onOpenChapters: () => void;
  onOpenDaily: () => void;
}

export interface HudRenderContext {
  mode: PlayMode;
  level: LevelDef;
  dailyDate: string;
  state: GameState;
  save: SaveData;
  muted: boolean;
  inChapterSelect: boolean;
}

function speakerSvg(muted: boolean): string {
  if (muted) {
    return (
      `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
      `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>` +
      `<line x1="22" y1="9" x2="16" y2="15"/>` +
      `<line x1="16" y1="9" x2="22" y2="15"/>` +
      `</svg>`
    );
  }
  return (
    `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
    `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>` +
    `<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>` +
    `<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>` +
    `</svg>`
  );
}

/**
 * Top Sunday-comic HUD bar: level/daily title, Moves/Par, Undo/Reset/Hint, audio, Chapters, and Daily Heist.
 */
export class Hud {
  readonly element: HTMLElement;
  private readonly handlers: HudHandlers;

  private readonly levelTagEl: HTMLElement;
  private readonly titleTextEl: HTMLElement;
  private readonly movesEl: HTMLElement;
  private readonly hintCapBadgeEl: HTMLElement;
  private readonly undoBtn: HTMLButtonElement;
  private readonly resetBtn: HTMLButtonElement;
  private readonly hintBtn: HTMLButtonElement;
  private readonly audioBtn: HTMLButtonElement;
  private readonly chaptersBtn: HTMLButtonElement;
  private readonly dailyBtn: HTMLButtonElement;

  constructor(handlers: HudHandlers) {
    this.handlers = handlers;

    this.element = document.createElement("header");
    this.element.className = "hud comic-panel";

    // Row 1: Title & mode navigation
    const topRow = document.createElement("div");
    topRow.className = "hud-row hud-row--top";

    const titleGroup = document.createElement("div");
    titleGroup.className = "hud-title-group";

    this.levelTagEl = document.createElement("span");
    this.levelTagEl.className = "hud-level-tag";

    this.titleTextEl = document.createElement("span");
    this.titleTextEl.className = "hud-level-name";

    titleGroup.append(this.levelTagEl, this.titleTextEl);

    const navGroup = document.createElement("div");
    navGroup.className = "hud-nav-group";

    this.chaptersBtn = document.createElement("button");
    this.chaptersBtn.type = "button";
    this.chaptersBtn.className = "comic-btn comic-btn--sm";
    this.chaptersBtn.textContent = "Chapters";
    this.chaptersBtn.addEventListener("click", () => this.handlers.onOpenChapters());

    this.dailyBtn = document.createElement("button");
    this.dailyBtn.type = "button";
    this.dailyBtn.className = "comic-btn comic-btn--sm comic-btn--daily";
    this.dailyBtn.addEventListener("click", () => this.handlers.onOpenDaily());

    navGroup.append(this.chaptersBtn, this.dailyBtn);
    topRow.append(titleGroup, navGroup);

    // Row 2: Moves/Par & game controls
    const bottomRow = document.createElement("div");
    bottomRow.className = "hud-row hud-row--bottom";

    const statsGroup = document.createElement("div");
    statsGroup.className = "hud-stats";

    this.movesEl = document.createElement("span");
    this.movesEl.className = "hud-moves";

    this.hintCapBadgeEl = document.createElement("span");
    this.hintCapBadgeEl.className = "hud-hint-cap";
    this.hintCapBadgeEl.textContent = "2★ max";
    this.hintCapBadgeEl.hidden = true;

    statsGroup.append(this.movesEl, this.hintCapBadgeEl);

    const actionsGroup = document.createElement("div");
    actionsGroup.className = "hud-actions";

    this.undoBtn = this.makeActionBtn("Undo", "Z", "Undo last move (Z)", () =>
      this.handlers.onUndo(),
    );
    this.resetBtn = this.makeActionBtn("Reset", "R", "Reset board (R)", () =>
      this.handlers.onReset(),
    );
    this.hintBtn = this.makeActionBtn("Hint", "H", "Show next optimal move (H)", () =>
      this.handlers.onHint(),
    );
    this.hintBtn.classList.add("comic-btn--gold");

    this.audioBtn = document.createElement("button");
    this.audioBtn.type = "button";
    this.audioBtn.className = "comic-btn comic-btn--sm comic-btn--icon";
    this.audioBtn.addEventListener("click", () => this.handlers.onToggleAudio());

    actionsGroup.append(this.undoBtn, this.resetBtn, this.hintBtn, this.audioBtn);
    bottomRow.append(statsGroup, actionsGroup);

    this.element.append(topRow, bottomRow);
  }

  private makeActionBtn(
    label: string,
    shortcut: string,
    ariaLabel: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "comic-btn comic-btn--sm";
    btn.setAttribute("aria-label", ariaLabel);
    btn.title = ariaLabel;

    const textSpan = document.createElement("span");
    textSpan.textContent = label;
    const keySpan = document.createElement("kbd");
    keySpan.className = "btn-kbd";
    keySpan.textContent = shortcut;

    btn.append(textSpan, keySpan);
    btn.addEventListener("click", onClick);
    return btn;
  }

  render(ctx: HudRenderContext): void {
    const { mode, level, dailyDate, state, save, muted, inChapterSelect } = ctx;

    if (mode === "daily") {
      this.levelTagEl.textContent = "Daily";
      this.levelTagEl.classList.add("hud-level-tag--daily");
      this.titleTextEl.textContent = `${level.title}`;
      this.titleTextEl.title = `Daily Heist (${dailyDate})`;
    } else {
      this.levelTagEl.textContent = `Ch.${level.chapter} · L${level.id}`;
      this.levelTagEl.classList.remove("hud-level-tag--daily");
      this.titleTextEl.textContent = level.title;
      this.titleTextEl.title = `Chapter ${level.chapter} · Level ${level.id}: ${level.title}`;
    }

    this.movesEl.textContent = `Moves ${state.moves} / ${level.par}`;
    this.movesEl.classList.toggle("hud-moves--over", state.moves > level.par);

    this.hintCapBadgeEl.hidden = !state.usedHint;

    this.undoBtn.disabled = inChapterSelect || state.history.length === 0;
    this.resetBtn.disabled =
      inChapterSelect || (state.moves === 0 && !state.usedHint);
    this.hintBtn.disabled = inChapterSelect;

    this.audioBtn.innerHTML = speakerSvg(muted);
    this.audioBtn.setAttribute("aria-label", muted ? "Unmute sound (M)" : "Mute sound (M)");
    this.audioBtn.setAttribute("aria-pressed", String(!muted));
    this.audioBtn.title = muted ? "Sound Muted (M)" : "Sound On (M)";
    this.audioBtn.classList.toggle("comic-btn--muted", muted);

    this.chaptersBtn.classList.toggle("is-active", inChapterSelect);
    this.chaptersBtn.textContent = inChapterSelect ? "Back" : "Chapters";

    const dailyUnlocked = isDailyUnlocked(save);
    if (!dailyUnlocked) {
      this.dailyBtn.disabled = true;
      this.dailyBtn.textContent = "Daily · Clear Ch.1";
      this.dailyBtn.title = "Clear Chapter 1 (Level 6) to unlock Daily Heist";
      this.dailyBtn.classList.add("is-locked");
      this.dailyBtn.classList.remove("is-active");
    } else {
      this.dailyBtn.disabled = false;
      this.dailyBtn.classList.remove("is-locked");
      this.dailyBtn.classList.toggle("is-active", !inChapterSelect && mode === "daily");
      const todayStars = save.dailyCleared[dailyDate];
      this.dailyBtn.textContent = todayStars ? `Daily ★` : "Daily";
      this.dailyBtn.title = `Daily Heist (${dailyDate})`;
    }
  }
}
