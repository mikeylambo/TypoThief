import { SoundEngine } from "../audio/synth.ts";
import { DAILY_BANK } from "../content/dailyBank.ts";
import { CAMPAIGN_LEVELS } from "../content/levels.ts";
import type { SaveData } from "../meta/save.ts";
import {
  computeTotalScore,
  getResumeLevelId,
  isDailyUnlocked,
  parseSaveWithRecovery,
  recordDailyClear,
  recordLevelClear,
} from "../meta/save.ts";
import type { PlatformAdapter } from "../platform/index.ts";
import { pickDailyPuzzle } from "../sim/daily.ts";
import { loadDict } from "../sim/dict.ts";
import {
  applyHintSelection,
  canDrop,
  canSteal,
  computeStars,
  createGameState,
  dropLetter,
  isSolved,
  resetGame,
  stealLetter,
  toggleDropMode,
  undoMove,
} from "../sim/rules.ts";
import { getHintMove } from "../sim/solver.ts";
import type { GameState, LevelDef, Move } from "../sim/types.ts";
import { BoardView, getDailyTwistCallout } from "./BoardView.ts";
import { ChapterSelect } from "./ChapterSelect.ts";
import type { PlayMode } from "./Hud.ts";
import { Hud } from "./Hud.ts";

function getUtcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Top-level Typo Thief application controller coordinating simulation, DOM views, audio, and platform lifecycle.
 */
export class App {
  private readonly root: HTMLElement;
  private readonly platform: PlatformAdapter;
  private readonly sound: SoundEngine;
  private readonly dict: Set<string>;

  private readonly shellEl: HTMLElement;
  private readonly hud: Hud;
  private readonly boardView: BoardView;
  private readonly chapterSelect: ChapterSelect;

  private save: SaveData;
  private platformAudioEnabled = true;
  private mode: PlayMode = "campaign";
  private dailyDate: string = getUtcDateString();
  private activeLevel: LevelDef = CAMPAIGN_LEVELS[0];
  private state: GameState = createGameState(CAMPAIGN_LEVELS[0]);
  private hintMove: Move | null = null;
  private winStars: 1 | 2 | 3 | null = null;
  private inChapterSelect = false;
  private activeTwistCallout = { rivets: false, twoSlot: false };
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
  private unlockHandler: (() => void) | null = null;

  constructor(root: HTMLElement, platform: PlatformAdapter) {
    this.root = root;
    this.platform = platform;
    this.sound = new SoundEngine();
    this.dict = loadDict();
    this.save = parseSaveWithRecovery(null);

    this.shellEl = document.createElement("div");
    this.shellEl.className = "app-shell";

    this.hud = new Hud({
      onUndo: () => this.handleUndo(),
      onReset: () => this.handleReset(),
      onHint: () => this.handleHint(),
      onToggleAudio: () => this.handleToggleAudio(),
      onOpenChapters: () => this.handleToggleChapters(),
      onOpenDaily: () => this.handleOpenDaily(),
    });

    this.boardView = new BoardView({
      onSteal: (propIdx, charIdx) => this.handleSteal(propIdx, charIdx),
      onDrop: (propIdx, pos, slotIdx) => this.handleDrop(propIdx, pos, slotIdx),
      onToggleDropSlot: (slotIdx) => this.handleToggleDropSlot(slotIdx),
      onNextLevel: () => this.handleNextLevel(),
      onRetry: () => this.handleReset(),
      onOpenChapters: () => {
        this.inChapterSelect = true;
        this.render();
      },
      onDismissTwist: () => {
        this.activeTwistCallout = { rivets: false, twoSlot: false };
        this.render();
      },
    });

    this.chapterSelect = new ChapterSelect({
      onSelectLevel: (levelId) => this.startCampaignLevel(levelId),
      onSelectDaily: () => this.handleOpenDaily(),
      onClose: () => {
        this.inChapterSelect = false;
        this.render();
      },
    });

    this.shellEl.append(
      this.hud.element,
      this.boardView.element,
      this.chapterSelect.element,
    );
  }

  async start(): Promise<void> {
    await this.platform.init();
    this.platformAudioEnabled = this.platform.isAudioEnabled();

    const loaded = await this.platform.load<SaveData>();
    this.save = parseSaveWithRecovery(loaded);

    this.syncSoundMute();

    this.platform.onAudioToggle((enabled) => {
      this.platformAudioEnabled = enabled;
      this.syncSoundMute();
      this.render();
    });
    this.platform.onPause(() => {
      this.sound.setPaused(true);
    });
    this.platform.onResume(() => {
      this.sound.setPaused(false);
    });

    this.root.innerHTML = "";
    this.root.appendChild(this.shellEl);

    const resumeId = getResumeLevelId(this.save);
    if (resumeId === 0) {
      this.loadCampaignLevelState(CAMPAIGN_LEVELS[CAMPAIGN_LEVELS.length - 1].id);
      this.inChapterSelect = true;
    } else {
      this.loadCampaignLevelState(resumeId);
      this.inChapterSelect = false;
    }

    this.bindGlobalEvents();
    this.render();

    const finishLifecycle = () => {
      this.platform.firstFrame();
      this.platform.gameReady();
    };
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => finishLifecycle());
    } else {
      finishLifecycle();
    }
  }

  destroy(): void {
    if (this.keydownHandler && typeof window !== "undefined") {
      window.removeEventListener("keydown", this.keydownHandler);
      this.keydownHandler = null;
    }
    if (this.unlockHandler && typeof window !== "undefined") {
      window.removeEventListener("pointerdown", this.unlockHandler);
      window.removeEventListener("keydown", this.unlockHandler);
      this.unlockHandler = null;
    }
  }

  private bindGlobalEvents(): void {
    if (typeof window === "undefined") return;

    this.unlockHandler = () => {
      this.sound.unlock();
    };
    window.addEventListener("pointerdown", this.unlockHandler, { passive: true });
    window.addEventListener("keydown", this.unlockHandler, { passive: true });

    this.keydownHandler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.altKey || e.metaKey) return;

      const key = e.key.toLowerCase();
      if (key === "escape" && this.inChapterSelect) {
        e.preventDefault();
        this.inChapterSelect = false;
        this.render();
        return;
      }

      if (key === "m" && !e.ctrlKey) {
        e.preventDefault();
        this.handleToggleAudio();
        return;
      }

      if (this.inChapterSelect) return;

      if (key === "z") {
        e.preventDefault();
        this.handleUndo();
      } else if (key === "r" && !e.ctrlKey) {
        e.preventDefault();
        this.handleReset();
      } else if (key === "h" && !e.ctrlKey) {
        e.preventDefault();
        this.handleHint();
      }
    };
    window.addEventListener("keydown", this.keydownHandler);
  }

  private isEffectivelyMuted(): boolean {
    return this.save.muted || !this.platformAudioEnabled;
  }

  private syncSoundMute(): void {
    this.sound.setMuted(this.isEffectivelyMuted());
  }

  private loadCampaignLevelState(levelId: number): void {
    const found =
      CAMPAIGN_LEVELS.find((lvl) => lvl.id === levelId) ?? CAMPAIGN_LEVELS[0];
    this.mode = "campaign";
    this.activeLevel = found;
    this.state = createGameState(found);
    this.hintMove = null;
    this.winStars = null;
    this.activeTwistCallout = { rivets: false, twoSlot: false };
    this.boardView.clearFeedback();
  }

  private startCampaignLevel(levelId: number): void {
    this.sound.unlock();
    this.loadCampaignLevelState(levelId);
    this.inChapterSelect = false;
    this.render();
  }

  private handleOpenDaily(): void {
    this.sound.unlock();
    if (!isDailyUnlocked(this.save)) {
      this.boardView.showFeedback("Clear Chapter 1 (Level 6) to unlock Daily Heist!");
      return;
    }

    this.dailyDate = getUtcDateString();
    const dailyLevel = pickDailyPuzzle(this.dailyDate, DAILY_BANK);
    const twist = getDailyTwistCallout(dailyLevel, this.save);

    this.mode = "daily";
    this.activeLevel = dailyLevel;
    this.state = createGameState(dailyLevel);
    this.hintMove = null;
    this.winStars = null;
    this.inChapterSelect = false;
    this.activeTwistCallout = twist;
    this.boardView.clearFeedback();

    if (twist.rivets || twist.twoSlot) {
      this.save = {
        ...this.save,
        seenDailyTwists: {
          rivets: this.save.seenDailyTwists.rivets || twist.rivets,
          twoSlot: this.save.seenDailyTwists.twoSlot || twist.twoSlot,
        },
      };
      void this.platform.save(this.save);
    }

    this.render();
  }

  private handleSteal(propIdx: number, charIdx: number): void {
    this.sound.unlock();
    if (this.winStars !== null) return;

    this.hintMove = null;
    const check = canSteal(this.state, propIdx, charIdx, this.dict);
    if (!check.ok) {
      this.sound.playInvalid();
      this.boardView.showFeedback(check.reason ?? "Cannot steal", propIdx, charIdx);
      return;
    }

    this.state = stealLetter(this.state, propIdx, charIdx, this.dict);
    this.sound.playSteal();
    this.boardView.clearFeedback();
    this.render();
  }

  private handleDrop(propIdx: number, pos: number, slotIdx: number): void {
    this.sound.unlock();
    if (this.winStars !== null) return;

    this.hintMove = null;
    const check = canDrop(this.state, propIdx, pos, slotIdx, this.dict);
    if (!check.ok) {
      this.sound.playInvalid();
      this.boardView.showFeedback(check.reason ?? "Cannot drop here", propIdx);
      return;
    }

    this.state = dropLetter(this.state, propIdx, pos, slotIdx, this.dict);
    this.boardView.clearFeedback();

    if (isSolved(this.state)) {
      const stars = computeStars(
        this.state.moves,
        this.activeLevel.par,
        this.state.usedHint,
      );
      this.winStars = stars;
      this.sound.playWin();

      if (this.mode === "campaign") {
        this.save = recordLevelClear(
          this.save,
          this.activeLevel.id,
          stars,
          this.state.moves,
        );
      } else {
        this.save = recordDailyClear(this.save, this.dailyDate, stars);
      }
      void this.platform.save(this.save);
      this.platform.submitScore(computeTotalScore(this.save));
    } else {
      this.sound.playDrop();
    }

    this.render();
  }

  private handleToggleDropSlot(slotIdx: number): void {
    this.sound.unlock();
    if (this.winStars !== null) return;
    this.hintMove = null;
    this.state = toggleDropMode(this.state, slotIdx);
    this.render();
  }

  private handleUndo(): void {
    this.sound.unlock();
    if (this.winStars !== null || this.state.history.length === 0) return;
    this.hintMove = null;
    this.state = undoMove(this.state);
    this.boardView.clearFeedback();
    this.render();
  }

  private handleReset(): void {
    this.sound.unlock();
    this.hintMove = null;
    this.winStars = null;
    this.state = resetGame(this.activeLevel);
    this.boardView.clearFeedback();
    this.render();
  }

  private handleHint(): void {
    this.sound.unlock();
    if (this.winStars !== null || isSolved(this.state)) return;

    const move = getHintMove(this.state, this.dict);
    this.state = applyHintSelection(this.state, move);
    this.hintMove = move;
    this.render();

    if (!move) {
      this.boardView.showFeedback("No hint available — try Undo or Reset");
    }
  }

  private handleToggleAudio(): void {
    this.sound.unlock();
    this.save = {
      ...this.save,
      muted: !this.save.muted,
    };
    this.syncSoundMute();
    void this.platform.save(this.save);
    this.render();
  }

  private handleToggleChapters(): void {
    this.sound.unlock();
    this.inChapterSelect = !this.inChapterSelect;
    this.render();
  }

  private handleNextLevel(): void {
    if (this.mode === "campaign" && this.activeLevel.id < 18) {
      this.startCampaignLevel(this.activeLevel.id + 1);
    } else {
      this.inChapterSelect = true;
      this.render();
    }
  }

  private render(): void {
    this.shellEl.classList.toggle("reduced-motion", this.save.reducedMotion);

    this.hud.render({
      mode: this.mode,
      level: this.activeLevel,
      dailyDate: this.dailyDate,
      state: this.state,
      save: this.save,
      muted: this.isEffectivelyMuted(),
      inChapterSelect: this.inChapterSelect,
    });

    this.boardView.element.hidden = this.inChapterSelect;
    this.chapterSelect.element.hidden = !this.inChapterSelect;

    if (this.inChapterSelect) {
      const dailyLevel = pickDailyPuzzle(this.dailyDate, DAILY_BANK);
      this.chapterSelect.render({
        levels: CAMPAIGN_LEVELS,
        save: this.save,
        dailyDate: this.dailyDate,
        dailyLevel,
        activeMode: this.mode,
        activeLevelId: this.activeLevel.id,
        canClose: true,
      });
    } else {
      this.boardView.render({
        mode: this.mode,
        level: this.activeLevel,
        state: this.state,
        save: this.save,
        dict: this.dict,
        hintMove: this.hintMove,
        twistCallout: this.activeTwistCallout,
        winStars: this.winStars,
      });
    }
  }
}
