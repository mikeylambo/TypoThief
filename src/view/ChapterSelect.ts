import type { SaveData } from "../meta/save.ts";
import { computeTotalScore, isDailyUnlocked } from "../meta/save.ts";
import { weekdayTier } from "../sim/daily.ts";
import type { DailyTier, LevelDef } from "../sim/types.ts";

export interface ChapterSelectHandlers {
  onSelectLevel: (levelId: number) => void;
  onSelectDaily: () => void;
  onClose: () => void;
}

export interface ChapterSelectRenderContext {
  levels: readonly LevelDef[];
  save: SaveData;
  dailyDate: string;
  dailyLevel: LevelDef;
  activeMode: "campaign" | "daily";
  activeLevelId: number;
  canClose: boolean;
}

const CHAPTER_META: ReadonlyArray<{ chapter: 1 | 2 | 3; name: string; subtitle: string }> = [
  { chapter: 1, name: "Chapter 1 · Rookie Caper", subtitle: "1-Slot Bag · Smuggle & Bridge" },
  { chapter: 2, name: "Chapter 2 · Riveted Vaults", subtitle: "Brass Rivets · Drop Around Locks" },
  { chapter: 3, name: "Chapter 3 · Double-Take Heists", subtitle: "2-Slot Bag · Twin Swaps" },
];

function tierLabel(tier: DailyTier): string {
  switch (tier) {
    case "mon-tue":
      return "Mon–Tue · Classic";
    case "wed-thu":
      return "Wed–Thu · Rivets";
    case "fri-sat":
      return "Fri–Sat · 2-Slot Bag";
    case "sun":
      return "Sunday · 4-Prop Caper";
  }
}

function renderStarsText(stars: number): string {
  return "★".repeat(stars) + "☆".repeat(Math.max(0, 3 - stars));
}

/**
 * Chapter & Level selector drawer plus Daily Heist launcher.
 */
export class ChapterSelect {
  readonly element: HTMLElement;
  private readonly handlers: ChapterSelectHandlers;

  constructor(handlers: ChapterSelectHandlers) {
    this.handlers = handlers;
    this.element = document.createElement("section");
    this.element.className = "chapter-select comic-panel";
    this.element.setAttribute("aria-label", "Chapter and Level Select");
  }

  render(ctx: ChapterSelectRenderContext): void {
    const { levels, save, dailyDate, dailyLevel, activeMode, activeLevelId, canClose } = ctx;
    this.element.innerHTML = "";

    // Top summary bar
    const header = document.createElement("div");
    header.className = "cs-header";

    const summary = document.createElement("div");
    summary.className = "cs-summary";

    let totalStars = 0;
    for (const entry of Object.values(save.levels)) {
      totalStars += entry.stars;
    }

    const heading = document.createElement("h2");
    heading.className = "cs-title";
    heading.textContent = "Heist Blueprints";

    const stats = document.createElement("div");
    stats.className = "cs-stats";
    stats.textContent = `${totalStars}/54 ★ · Score ${computeTotalScore(save)}`;

    summary.append(heading, stats);
    header.appendChild(summary);

    if (canClose) {
      const closeBtn = document.createElement("button");
      closeBtn.type = "button";
      closeBtn.className = "comic-btn comic-btn--sm";
      closeBtn.textContent = "Resume";
      closeBtn.addEventListener("click", () => this.handlers.onClose());
      header.appendChild(closeBtn);
    }

    this.element.appendChild(header);

    // Daily Heist Banner
    const dailyCard = document.createElement("div");
    const unlocked = isDailyUnlocked(save);
    dailyCard.className = `cs-daily-card ${unlocked ? "is-unlocked" : "is-locked"}`;

    const dailyInfo = document.createElement("div");
    dailyInfo.className = "cs-daily-info";

    const dailyTitle = document.createElement("div");
    dailyTitle.className = "cs-daily-title";
    const tier = weekdayTier(dailyDate);
    dailyTitle.textContent = unlocked
      ? `Daily Heist · ${dailyLevel.title}`
      : "Daily Heist · Locked";

    const dailySub = document.createElement("div");
    dailySub.className = "cs-daily-sub";
    if (!unlocked) {
      dailySub.textContent = "Clear Chapter 1 (Level 6) to unlock daily puzzles";
    } else {
      const todayStars = save.dailyCleared[dailyDate];
      const streakText = save.dailyStreak > 0 ? ` · 🔥 ${save.dailyStreak}d streak` : "";
      const clearText = todayStars ? ` · Cleared ${renderStarsText(todayStars)}` : " · Unclaimed";
      dailySub.textContent = `${dailyDate} (${tierLabel(tier)})${clearText}${streakText}`;
    }

    dailyInfo.append(dailyTitle, dailySub);
    dailyCard.appendChild(dailyInfo);

    const dailyPlayBtn = document.createElement("button");
    dailyPlayBtn.type = "button";
    dailyPlayBtn.className = "comic-btn comic-btn--sm comic-btn--gold";
    dailyPlayBtn.disabled = !unlocked;
    dailyPlayBtn.textContent = unlocked ? "Play Daily" : "Clear Ch.1";
    if (unlocked) {
      dailyPlayBtn.addEventListener("click", () => this.handlers.onSelectDaily());
    }
    dailyCard.appendChild(dailyPlayBtn);

    this.element.appendChild(dailyCard);

    // Chapter lists
    const scrollBody = document.createElement("div");
    scrollBody.className = "cs-chapters";

    for (const meta of CHAPTER_META) {
      const section = document.createElement("div");
      section.className = "cs-chapter";

      const chHead = document.createElement("div");
      chHead.className = "cs-chapter-head";

      const chTitle = document.createElement("h3");
      chTitle.className = "cs-chapter-title";
      chTitle.textContent = meta.name;

      const chSub = document.createElement("span");
      chSub.className = "cs-chapter-sub";
      chSub.textContent = meta.subtitle;

      chHead.append(chTitle, chSub);
      section.appendChild(chHead);

      const grid = document.createElement("div");
      grid.className = "cs-level-grid";

      const chapterLevels = levels.filter((lvl) => lvl.chapter === meta.chapter);
      for (const lvl of chapterLevels) {
        const progress = save.levels[lvl.id];
        const isUnlocked = lvl.id <= save.highestUnlocked || Boolean(progress);
        const isCurrent = activeMode === "campaign" && activeLevelId === lvl.id;

        const card = document.createElement("button");
        card.type = "button";
        card.className = "cs-level-btn";
        if (!isUnlocked) card.classList.add("is-locked");
        if (progress) card.classList.add("is-cleared");
        if (isCurrent) card.classList.add("is-current");
        card.disabled = !isUnlocked;

        const numRow = document.createElement("div");
        numRow.className = "cs-level-top";

        const num = document.createElement("span");
        num.className = "cs-level-num";
        num.textContent = `L${lvl.id}`;

        const starsEl = document.createElement("span");
        starsEl.className = "cs-level-stars";
        starsEl.textContent = progress
          ? renderStarsText(progress.stars)
          : isUnlocked
            ? "☆☆☆"
            : "🔒";

        numRow.append(num, starsEl);

        const nameEl = document.createElement("div");
        nameEl.className = "cs-level-name";
        nameEl.textContent = lvl.title;

        const parEl = document.createElement("div");
        parEl.className = "cs-level-par";
        parEl.textContent = progress
          ? `Best ${progress.bestMoves} · Par ${lvl.par}`
          : `Par ${lvl.par}`;

        card.append(numRow, nameEl, parEl);
        if (isUnlocked) {
          card.addEventListener("click", () => this.handlers.onSelectLevel(lvl.id));
        }

        grid.appendChild(card);
      }

      section.appendChild(grid);
      scrollBody.appendChild(section);
    }

    this.element.appendChild(scrollBody);
  }
}
