import { renderPropSvg } from "../content/propsSvg.ts";
import type { SaveData } from "../meta/save.ts";
import { canSteal, isSolved, isStuck } from "../sim/rules.ts";
import type { GameState, LevelDef, Move } from "../sim/types.ts";
import type { PlayMode } from "./Hud.ts";

export interface BoardHandlers {
  onSteal: (propIdx: number, charIdx: number) => void;
  onDrop: (propIdx: number, pos: number, slotIdx: number) => void;
  onToggleDropSlot: (slotIdx: number) => void;
  onNextLevel: () => void;
  onRetry: () => void;
  onOpenChapters: () => void;
  onDismissTwist: () => void;
}

export interface BoardRenderContext {
  mode: PlayMode;
  level: LevelDef;
  state: GameState;
  save: SaveData;
  dict: Set<string>;
  hintMove: Move | null;
  twistCallout: { rivets: boolean; twoSlot: boolean };
  winStars: 1 | 2 | 3 | null;
}

export interface FtueTarget {
  propIdx: number;
  charIdx: number;
  side: "center" | "left";
}

export interface TileRectLike {
  left: number;
  width: number;
}

/**
 * Resolve insertion index `pos` when tapping the left (`tileIdx`) or right (`tileIdx + 1`) half of a tile.
 */
export function resolveHalfTileDropPos(
  tileIdx: number,
  clientX: number,
  rectLeft: number,
  rectWidth: number,
  isKeyboard = false,
): number {
  if (isKeyboard || rectWidth <= 0) {
    return tileIdx;
  }
  const midX = rectLeft + rectWidth / 2;
  return clientX < midX ? tileIdx : tileIdx + 1;
}

/**
 * Resolve insertion gap `0..wordLength` for a pointer X coordinate across a row of tile bounding rects.
 */
export function resolveDragGapPos(
  wordLength: number,
  clientX: number,
  tileRects: readonly TileRectLike[],
): number {
  const count = Math.min(wordLength, tileRects.length);
  for (let i = 0; i < count; i++) {
    const rect = tileRects[i];
    const midX = rect.left + rect.width / 2;
    if (clientX < midX) {
      return i;
    }
  }
  return count;
}

/**
 * Produce the neutral string preview when hovering `letter` at gap `pos` in `word` (no dictionary spoilers).
 */
export function computeNeutralPreviewWord(
  word: string,
  letter: string,
  pos: number,
): string {
  const clamped = Math.max(0, Math.min(pos, word.length));
  return word.slice(0, clamped) + letter + word.slice(clamped);
}

/**
 * Gentle cream-gold stealable tint is shown ONLY on Campaign Levels 1-2.
 */
export function shouldHighlightStealable(mode: PlayMode, levelId: number): boolean {
  return mode === "campaign" && (levelId === 1 || levelId === 2);
}

/**
 * Determine whether a Daily Heist introduces Rivets or the 2-Slot Bag before campaign unlock.
 */
export function getDailyTwistCallout(
  level: LevelDef,
  save: SaveData,
): { rivets: boolean; twoSlot: boolean } {
  const hasRivets = level.props.some((p) => (p.rivets?.length ?? 0) > 0);
  return {
    rivets:
      hasRivets &&
      !save.seenDailyTwists.rivets &&
      !save.levels[7] &&
      save.highestUnlocked <= 7,
    twoSlot:
      level.pocketCap === 2 &&
      !save.seenDailyTwists.twoSlot &&
      !save.levels[13] &&
      save.highestUnlocked <= 13,
  };
}

/**
 * Coordinates drag-release click suppression so dragging out of a Thief Bag slot
 * never leaves future slot taps swallowed when no DOM click fires on release.
 */
export class DragClickGuard {
  suppressed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  markDragging(): void {
    this.cancelTimer();
    this.suppressed = true;
  }

  releaseAfterDrag(): void {
    if (!this.suppressed) return;
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.suppressed = false;
      this.timer = null;
    }, 0);
  }

  consumeClick(): boolean {
    if (!this.suppressed) return false;
    this.reset();
    return true;
  }

  reset(): void {
    this.cancelTimer();
    this.suppressed = false;
  }

  private cancelTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

/**
 * Determine the Level 1 FTUE pointing-hand target, or null once completed / moved past step 1.
 */
export function getFtueTarget(
  mode: PlayMode,
  levelId: number,
  save: SaveData,
  state: GameState,
): FtueTarget | null {
  if (mode !== "campaign" || levelId !== 1 || save.ftueCompleted) {
    return null;
  }
  if (state.pocket.length === 0 && state.props[0]?.word === "CLAMP") {
    return { propIdx: 0, charIdx: 0, side: "center" };
  }
  if (
    state.pocket.length === 1 &&
    state.pocket[0] === "C" &&
    state.props[1]?.word === "ART"
  ) {
    return { propIdx: 1, charIdx: 0, side: "left" };
  }
  return null;
}

function rivetBadgeSvg(): string {
  return (
    `<svg class="tile-rivet-icon" width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">` +
    `<rect x="3" y="7" width="10" height="7" rx="2" fill="#FFD147" stroke="#1B1814" stroke-width="2"/>` +
    `<path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="#1B1814" stroke-width="2" stroke-linecap="round"/>` +
    `</svg>`
  );
}

function ftueHandSvg(): string {
  return (
    `<svg width="32" height="32" viewBox="0 0 36 36" fill="none" aria-hidden="true">` +
    `<path d="M16 4c1.8 0 3 1.3 3 3v8.5h1.5c1.5 0 2.5 1 2.5 2.4v.6h1.3c1.4 0 2.4 1 2.4 2.4v1h1c1.3 0 2.3 1 2.3 2.3v3.3c0 3.6-2.9 6.5-6.5 6.5h-5.8c-2.6 0-4.9-1.2-6.3-3.2L7 25.2c-.9-1.3-.6-3 .7-3.9 1.2-.8 2.8-.6 3.7.5l1.6 1.8V7c0-1.7 1.2-3 3-3z" fill="#FFFDF7" stroke="#1B1814" stroke-width="2.6" stroke-linejoin="round"/>` +
    `<path d="M16 1v2M10.5 3.5l1.5 1.5M21.5 3.5L20 5" stroke="#FF6B57" stroke-width="2.4" stroke-linecap="round"/>` +
    `</svg>`
  );
}

function bagIconSvg(): string {
  return (
    `<svg width="24" height="24" viewBox="0 0 28 28" fill="none" aria-hidden="true">` +
    `<path d="M9 9h10l3 13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L9 9z" fill="#FFFDF7" stroke="#1B1814" stroke-width="2.5" stroke-linejoin="round"/>` +
    `<path d="M10.5 9V7a3.5 3.5 0 0 1 7 0v2" stroke="#1B1814" stroke-width="2.5" stroke-linecap="round"/>` +
    `<circle cx="14" cy="16" r="2.2" fill="#FF6B57" stroke="#1B1814" stroke-width="1.8"/>` +
    `</svg>`
  );
}

function starSvg(filled: boolean): string {
  return (
    `<svg class="win-star ${filled ? "is-filled" : "is-empty"}" width="38" height="38" viewBox="0 0 36 36" fill="none" aria-hidden="true">` +
    `<path d="M18 3l4.6 9.3 10.2 1.5-7.4 7.2 1.7 10.2L18 26.4l-9.1 4.8 1.7-10.2-7.4-7.2 10.2-1.5z" fill="${filled ? "#FFD147" : "#E9EDF2"}" stroke="#1B1814" stroke-width="2.6" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

/**
 * Interactive Sunday-comic puzzle board, Thief Bag, FTUE hand, feedback pills, and Win modal.
 */
export class BoardView {
  readonly element: HTMLElement;
  private readonly handlers: BoardHandlers;

  private readonly calloutContainer: HTMLElement;
  private readonly propsListEl: HTMLElement;
  private readonly stuckPillEl: HTMLElement;
  private readonly bagEl: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly modalEl: HTMLElement;

  private lastCtx: BoardRenderContext | null = null;
  private propCardEls: HTMLElement[] = [];
  private tileElsByProp: HTMLButtonElement[][] = [];
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private shakeTimer: ReturnType<typeof setTimeout> | null = null;
  private dragCleanup: (() => void) | null = null;
  private readonly dragClickGuard = new DragClickGuard();

  constructor(handlers: BoardHandlers) {
    this.handlers = handlers;

    this.element = document.createElement("main");
    this.element.className = "board-view";

    this.calloutContainer = document.createElement("div");
    this.calloutContainer.className = "twist-callout-wrap";
    this.calloutContainer.hidden = true;

    this.propsListEl = document.createElement("div");
    this.propsListEl.className = "props-list";

    this.stuckPillEl = document.createElement("div");
    this.stuckPillEl.className = "stuck-pill";
    this.stuckPillEl.setAttribute("role", "status");
    this.stuckPillEl.textContent = "No valid drops left — Undo or Reset";
    this.stuckPillEl.hidden = true;

    this.bagEl = document.createElement("section");
    this.bagEl.className = "thief-bag comic-panel";
    this.bagEl.setAttribute("aria-label", "Thief Bag");

    this.toastEl = document.createElement("div");
    this.toastEl.className = "feedback-toast";
    this.toastEl.setAttribute("role", "status");
    this.toastEl.setAttribute("aria-live", "polite");
    this.toastEl.hidden = true;

    this.modalEl = document.createElement("div");
    this.modalEl.className = "modal-backdrop";
    this.modalEl.hidden = true;

    this.element.append(
      this.calloutContainer,
      this.propsListEl,
      this.stuckPillEl,
      this.bagEl,
      this.toastEl,
      this.modalEl,
    );
  }

  render(ctx: BoardRenderContext): void {
    this.cancelDrag();
    this.dragClickGuard.reset();
    this.lastCtx = ctx;

    const { mode, level, state, save, dict, hintMove, twistCallout, winStars } = ctx;

    this.element.classList.toggle("board--drop-mode", state.dropMode);
    this.element.classList.toggle("board--steal-mode", !state.dropMode);

    this.renderTwistCallout(twistCallout);
    this.renderProps(mode, level, state, save, dict, hintMove);
    this.stuckPillEl.hidden = !isStuck(state, dict);
    this.renderBag(state, hintMove);
    this.renderWinModal(mode, level, state, winStars);
  }

  showFeedback(message: string, propIdx?: number, charIdx?: number): void {
    this.clearDropSideMarkers();
    if (this.toastTimer !== null) {
      clearTimeout(this.toastTimer);
    }
    this.toastEl.textContent = message;
    this.toastEl.hidden = false;
    this.toastTimer = setTimeout(() => {
      this.toastEl.hidden = true;
      this.toastTimer = null;
    }, 1800);

    if (propIdx !== undefined) {
      const targetEl =
        charIdx !== undefined
          ? this.tileElsByProp[propIdx]?.[charIdx]
          : this.propCardEls[propIdx];
      if (targetEl) {
        if (this.shakeTimer !== null) {
          clearTimeout(this.shakeTimer);
        }
        targetEl.classList.remove("is-shaking");
        // Force reflow so rapid repeated invalid taps replay the shake
        void targetEl.offsetWidth;
        targetEl.classList.add("is-shaking");
        this.shakeTimer = setTimeout(() => {
          targetEl.classList.remove("is-shaking");
          this.shakeTimer = null;
        }, 320);
      }
    }
  }

  clearFeedback(): void {
    if (this.toastTimer !== null) {
      clearTimeout(this.toastTimer);
      this.toastTimer = null;
    }
    this.toastEl.hidden = true;
  }

  private clearDropSideMarkers(): void {
    for (const row of this.tileElsByProp) {
      for (const tile of row) {
        delete tile.dataset.dropSide;
      }
    }
  }

  private renderTwistCallout(twist: { rivets: boolean; twoSlot: boolean }): void {
    this.calloutContainer.innerHTML = "";
    if (!twist.rivets && !twist.twoSlot) {
      this.calloutContainer.hidden = true;
      return;
    }

    const badge = document.createElement("div");
    badge.className = "twist-callout";
    badge.setAttribute("role", "note");

    const text = document.createElement("span");
    text.className = "twist-callout-text";
    if (twist.rivets && twist.twoSlot) {
      text.textContent =
        "Daily Twist: Rivets stay locked & Bag holds 2 letters!";
    } else if (twist.rivets) {
      text.textContent =
        "🔒 Riveted tiles stay bolted — drop letters around them!";
    } else {
      text.textContent =
        "🎒 2-Slot Bag — hold 2 letters or tap bag to drop early!";
    }

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "twist-callout-close";
    closeBtn.setAttribute("aria-label", "Dismiss tip");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => this.handlers.onDismissTwist());

    badge.append(text, closeBtn);
    this.calloutContainer.appendChild(badge);
    this.calloutContainer.hidden = false;
  }

  private renderProps(
    mode: PlayMode,
    level: LevelDef,
    state: GameState,
    save: SaveData,
    dict: Set<string>,
    hintMove: Move | null,
  ): void {
    this.propsListEl.innerHTML = "";
    this.propsListEl.dataset.propCount = String(state.props.length);
    this.propCardEls = [];
    this.tileElsByProp = [];

    const highlightSteal = shouldHighlightStealable(mode, level.id);
    const ftue = getFtueTarget(mode, level.id, save, state);

    state.props.forEach((prop, propIdx) => {
      const propSolved = prop.word.toLowerCase() === prop.goal.toLowerCase();

      const card = document.createElement("section");
      card.className = `prop-card comic-panel${propSolved ? " is-solved" : ""}`;
      card.dataset.propIdx = String(propIdx);

      // Header: comic SVG prop + label + goal
      const head = document.createElement("div");
      head.className = "prop-head";

      const artWrap = document.createElement("div");
      artWrap.className = "prop-art";
      artWrap.innerHTML = renderPropSvg(
        prop.frame,
        propSolved,
        mode === "campaign" ? level.id : undefined,
        prop.id,
      );

      const labelEl = document.createElement("span");
      labelEl.className = "prop-label";
      labelEl.textContent = prop.label;

      const previewPill = document.createElement("span");
      previewPill.className = "drag-preview";
      previewPill.hidden = true;

      const goalEl = document.createElement("span");
      goalEl.className = `prop-goal${propSolved ? " is-solved" : ""}`;
      goalEl.textContent = propSolved ? `✓ ${prop.goal}` : `Goal: ${prop.goal}`;

      head.append(artWrap, labelEl, previewPill, goalEl);

      // Word tile row
      const row = document.createElement("div");
      row.className = `tile-row len-${prop.word.length}`;
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", `${prop.label}: ${prop.word}, goal ${prop.goal}`);

      const tileEls: HTMLButtonElement[] = [];

      for (let charIdx = 0; charIdx < prop.word.length; charIdx++) {
        const ch = prop.word[charIdx];
        const riveted = Boolean(prop.rivets[charIdx]);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tile";
        btn.dataset.propIdx = String(propIdx);
        btn.dataset.charIdx = String(charIdx);

        if (riveted) {
          btn.classList.add("tile--riveted");
        }
        if (
          highlightSteal &&
          !state.dropMode &&
          canSteal(state, propIdx, charIdx, dict).ok
        ) {
          btn.classList.add("tile--stealable");
        }

        if (hintMove) {
          if (
            hintMove.kind === "steal" &&
            hintMove.propIdx === propIdx &&
            hintMove.charIdx === charIdx
          ) {
            btn.classList.add("tile--hint");
          } else if (hintMove.kind === "drop" && hintMove.propIdx === propIdx) {
            if (hintMove.pos === charIdx) {
              btn.classList.add("tile--hint-left");
            } else if (
              hintMove.pos === prop.word.length &&
              charIdx === prop.word.length - 1
            ) {
              btn.classList.add("tile--hint-right");
            }
          }
        }

        const letterSpan = document.createElement("span");
        letterSpan.className = "tile-letter";
        letterSpan.textContent = ch;
        btn.appendChild(letterSpan);

        if (riveted) {
          const rivetWrap = document.createElement("span");
          rivetWrap.innerHTML = rivetBadgeSvg();
          if (rivetWrap.firstElementChild) {
            btn.appendChild(rivetWrap.firstElementChild);
          }
        }

        if (ftue && ftue.propIdx === propIdx && ftue.charIdx === charIdx) {
          const hand = document.createElement("span");
          hand.className = `ftue-hand ftue-hand--${ftue.side}`;
          hand.setAttribute("aria-hidden", "true");
          hand.innerHTML = ftueHandSvg();
          btn.appendChild(hand);
        }

        btn.setAttribute(
          "aria-label",
          state.dropMode
            ? `Letter ${ch} in ${prop.word}, tap left to insert before or right to insert after`
            : riveted
              ? `Riveted letter ${ch} in ${prop.word}`
              : `Steal letter ${ch} from ${prop.word}`,
        );

        btn.addEventListener("pointermove", (e) => {
          if (!this.lastCtx?.state.dropMode) {
            delete btn.dataset.dropSide;
            return;
          }
          const rect = btn.getBoundingClientRect();
          const side = e.clientX < rect.left + rect.width / 2 ? "left" : "right";
          btn.dataset.dropSide = side;
        });

        btn.addEventListener("pointerleave", () => {
          delete btn.dataset.dropSide;
        });

        btn.addEventListener("pointerup", () => {
          delete btn.dataset.dropSide;
        });

        btn.addEventListener("pointercancel", () => {
          delete btn.dataset.dropSide;
        });

        btn.addEventListener("blur", () => {
          delete btn.dataset.dropSide;
        });

        btn.addEventListener("keydown", (e) => {
          if (!this.lastCtx?.state.dropMode) return;
          if (e.key === "ArrowLeft") {
            btn.dataset.dropSide = "left";
          } else if (e.key === "ArrowRight") {
            btn.dataset.dropSide = "right";
          }
        });

        btn.addEventListener("click", (e) => {
          const current = this.lastCtx?.state;
          if (!current) return;
          if (!current.dropMode) {
            this.handlers.onSteal(propIdx, charIdx);
            return;
          }
          const rect = btn.getBoundingClientRect();
          const isKeyboard = e.detail === 0;
          const pos = isKeyboard
            ? btn.dataset.dropSide === "right"
              ? charIdx + 1
              : charIdx
            : resolveHalfTileDropPos(charIdx, e.clientX, rect.left, rect.width);
          delete btn.dataset.dropSide;
          this.handlers.onDrop(propIdx, pos, current.activeSlot);
        });

        tileEls.push(btn);
        row.appendChild(btn);
      }

      card.append(head, row);
      this.propCardEls.push(card);
      this.tileElsByProp.push(tileEls);
      this.propsListEl.appendChild(card);
    });
  }

  private renderBag(state: GameState, hintMove: Move | null): void {
    this.bagEl.innerHTML = "";

    const info = document.createElement("div");
    info.className = "bag-info";

    const titleRow = document.createElement("div");
    titleRow.className = "bag-title-row";

    const iconWrap = document.createElement("span");
    iconWrap.className = "bag-icon";
    iconWrap.innerHTML = bagIconSvg();

    const title = document.createElement("span");
    title.className = "bag-title";
    title.textContent = "Thief Bag";

    const modeBadge = document.createElement("span");
    modeBadge.className = `bag-mode-badge ${state.dropMode ? "is-drop" : "is-steal"}`;
    modeBadge.textContent = state.dropMode ? "DROP MODE" : "STEAL MODE";

    titleRow.append(iconWrap, title, modeBadge);

    const hintLine = document.createElement("div");
    hintLine.className = "bag-sub";
    if (state.dropMode) {
      hintLine.textContent =
        state.pocketCap === 2 && state.pocket.length === 1
          ? "Tap left/right of a tile, drag, or tap bag to cancel"
          : "Tap left/right half of a tile (or drag letter to word)";
    } else if (state.pocketCap === 2 && state.pocket.length === 1) {
      hintLine.textContent = "Tap a tile to steal a 2nd letter, or tap bag to drop";
    } else {
      hintLine.textContent = "Tap any un-riveted tile to steal a letter";
    }

    info.append(titleRow, hintLine);

    const slotsWrap = document.createElement("div");
    slotsWrap.className = "bag-slots";

    for (let slotIdx = 0; slotIdx < state.pocketCap; slotIdx++) {
      const heldChar = state.pocket[slotIdx];
      if (heldChar !== undefined) {
        const slotBtn = document.createElement("button");
        slotBtn.type = "button";
        const isActive = state.dropMode && state.activeSlot === slotIdx;
        const isHintSlot =
          hintMove?.kind === "drop" && hintMove.slotIdx === slotIdx && !isActive;

        slotBtn.className = "bag-slot is-filled";
        if (isActive) slotBtn.classList.add("is-active");
        if (isHintSlot) slotBtn.classList.add("is-hint");
        slotBtn.textContent = heldChar;
        slotBtn.setAttribute("aria-pressed", String(isActive));
        slotBtn.setAttribute(
          "aria-label",
          isActive
            ? `Held letter ${heldChar} (active for drop)`
            : `Held letter ${heldChar}, activate drop mode`,
        );

        slotBtn.addEventListener("click", () => {
          if (this.dragClickGuard.consumeClick()) {
            return;
          }
          this.handlers.onToggleDropSlot(slotIdx);
        });

        slotBtn.addEventListener("pointerdown", (e) => {
          if (e.button !== 0 && e.pointerType === "mouse") return;
          this.beginSlotDrag(e, slotIdx, heldChar);
        });

        slotsWrap.appendChild(slotBtn);
      } else {
        const emptySlot = document.createElement("div");
        emptySlot.className = "bag-slot is-empty";
        emptySlot.setAttribute("aria-hidden", "true");
        slotsWrap.appendChild(emptySlot);
      }
    }

    this.bagEl.append(info, slotsWrap);
  }

  private beginSlotDrag(
    downEvent: PointerEvent,
    slotIdx: number,
    letter: string,
  ): void {
    this.cancelDrag();

    const startX = downEvent.clientX;
    const startY = downEvent.clientY;
    const pointerId = downEvent.pointerId;
    let dragging = false;
    let ghostEl: HTMLElement | null = null;
    let activeTarget: { propIdx: number; pos: number } | null = null;

    const clearPreviews = () => {
      for (const card of this.propCardEls) {
        card.classList.remove("is-drag-target");
        const pill = card.querySelector<HTMLElement>(".drag-preview");
        if (pill) {
          pill.hidden = true;
          pill.textContent = "";
        }
      }
    };

    const updateHover = (clientX: number, clientY: number) => {
      if (ghostEl) {
        ghostEl.style.left = `${clientX}px`;
        ghostEl.style.top = `${clientY}px`;
      }
      clearPreviews();
      activeTarget = null;

      const currentState = this.lastCtx?.state;
      if (!currentState) return;

      for (let propIdx = 0; propIdx < this.propCardEls.length; propIdx++) {
        const card = this.propCardEls[propIdx];
        const cardRect = card.getBoundingClientRect();
        if (
          clientX >= cardRect.left &&
          clientX <= cardRect.right &&
          clientY >= cardRect.top &&
          clientY <= cardRect.bottom
        ) {
          const tileRects = (this.tileElsByProp[propIdx] ?? []).map((t) => {
            const r = t.getBoundingClientRect();
            return { left: r.left, width: r.width };
          });
          const word = currentState.props[propIdx].word;
          const pos = resolveDragGapPos(word.length, clientX, tileRects);
          const previewWord = computeNeutralPreviewWord(word, letter, pos);

          card.classList.add("is-drag-target");
          const pill = card.querySelector<HTMLElement>(".drag-preview");
          if (pill) {
            pill.textContent = `→ ${previewWord}`;
            pill.hidden = false;
          }
          activeTarget = { propIdx, pos };
          break;
        }
      }
    };

    const onMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dx, dy) < 8) return;
        dragging = true;
        this.dragClickGuard.markDragging();
        ghostEl = document.createElement("div");
        ghostEl.className = "drag-ghost";
        ghostEl.textContent = letter;
        document.body.appendChild(ghostEl);
      }
      updateHover(moveEvent.clientX, moveEvent.clientY);
    };

    const cleanup = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      if (ghostEl && ghostEl.parentNode) {
        ghostEl.parentNode.removeChild(ghostEl);
      }
      ghostEl = null;
      clearPreviews();
      this.dragCleanup = null;
    };

    const onUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      const wasDragging = dragging;
      const dropTarget = activeTarget;
      cleanup();
      if (wasDragging) {
        this.dragClickGuard.releaseAfterDrag();
      }
      if (wasDragging && dropTarget) {
        this.handlers.onDrop(dropTarget.propIdx, dropTarget.pos, slotIdx);
      }
    };

    const onCancel = (cancelEvent: PointerEvent) => {
      if (cancelEvent.pointerId !== pointerId) return;
      const wasDragging = dragging;
      cleanup();
      if (wasDragging) {
        this.dragClickGuard.releaseAfterDrag();
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    this.dragCleanup = cleanup;
  }

  private cancelDrag(): void {
    if (this.dragCleanup) {
      this.dragCleanup();
      this.dragCleanup = null;
    }
  }

  private renderWinModal(
    mode: PlayMode,
    level: LevelDef,
    state: GameState,
    winStars: 1 | 2 | 3 | null,
  ): void {
    this.modalEl.innerHTML = "";
    if (winStars === null || !isSolved(state)) {
      this.modalEl.hidden = true;
      return;
    }

    const card = document.createElement("div");
    card.className = "win-modal comic-panel";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", "Level Complete");

    const badge = document.createElement("div");
    badge.className = "win-badge";
    badge.textContent = mode === "daily" ? "DAILY HEIST CLEARED!" : "HEIST COMPLETE!";

    const starsRow = document.createElement("div");
    starsRow.className = "win-stars";
    starsRow.setAttribute("aria-label", `${winStars} out of 3 stars`);
    starsRow.innerHTML =
      starSvg(winStars >= 1) + starSvg(winStars >= 2) + starSvg(winStars >= 3);

    const scoreLine = document.createElement("div");
    scoreLine.className = "win-stats";
    scoreLine.textContent = `Moves: ${state.moves}  ·  Par: ${level.par}`;

    card.append(badge, starsRow, scoreLine);

    if (state.usedHint) {
      const hintNote = document.createElement("div");
      hintNote.className = "win-hint-note";
      hintNote.textContent = "Hint used (capped at 2★)";
      card.appendChild(hintNote);
    }

    const btnRow = document.createElement("div");
    btnRow.className = "win-actions";

    if (mode === "campaign" && level.id < 18) {
      const nextBtn = document.createElement("button");
      nextBtn.type = "button";
      nextBtn.className = "comic-btn comic-btn--mint";
      nextBtn.textContent = "Next Level";
      nextBtn.addEventListener("click", () => this.handlers.onNextLevel());
      btnRow.appendChild(nextBtn);
    }

    if (winStars < 3) {
      const retryBtn = document.createElement("button");
      retryBtn.type = "button";
      retryBtn.className = "comic-btn comic-btn--gold";
      retryBtn.textContent = "Retry for ★★★";
      retryBtn.addEventListener("click", () => this.handlers.onRetry());
      btnRow.appendChild(retryBtn);
    }

    const chaptersBtn = document.createElement("button");
    chaptersBtn.type = "button";
    chaptersBtn.className = "comic-btn";
    chaptersBtn.textContent = "Chapters";
    chaptersBtn.addEventListener("click", () => this.handlers.onOpenChapters());
    btnRow.appendChild(chaptersBtn);

    card.appendChild(btnRow);
    this.modalEl.appendChild(card);
    this.modalEl.hidden = false;
  }
}
