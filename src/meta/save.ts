export const SAVE_SCHEMA = 1;

const MAX_CAMPAIGN_LEVEL = 18;
const DAILY_UNLOCK_LEVEL = 6;
const MS_PER_UTC_DAY = 86_400_000;
const UTC_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface LevelProgress {
  stars: 1 | 2 | 3;
  bestMoves: number;
}

export interface SeenDailyTwists {
  rivets: boolean;
  twoSlot: boolean;
}

export interface SaveData {
  schemaVersion: number;
  highestUnlocked: number;
  levels: Record<number, LevelProgress>;
  dailyCleared: Record<string, 1 | 2 | 3>;
  dailyStreak: number;
  lastDailyDate: string | null;
  muted: boolean;
  reducedMotion: boolean;
  ftueCompleted: boolean;
  seenDailyTwists: SeenDailyTwists;
}

/**
 * Create a fresh default save payload at the current schema version.
 */
export function defaultSave(): SaveData {
  return {
    schemaVersion: SAVE_SCHEMA,
    highestUnlocked: 1,
    levels: {},
    dailyCleared: {},
    dailyStreak: 0,
    lastDailyDate: null,
    muted: false,
    reducedMotion: false,
    ftueCompleted: false,
    seenDailyTwists: {
      rivets: false,
      twoSlot: false,
    },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStarRating(value: unknown): value is 1 | 2 | 3 {
  return value === 1 || value === 2 || value === 3;
}

function parseUtcDateMs(value: unknown): number | null {
  if (typeof value !== "string" || !UTC_DATE_PATTERN.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  const ms = parsed.getTime();
  if (Number.isNaN(ms) || parsed.toISOString().slice(0, 10) !== value) {
    return null;
  }
  return ms;
}

function isValidUtcDate(value: unknown): value is string {
  return parseUtcDateMs(value) !== null;
}

function isConsecutiveUtcDay(prevDate: string | null, nextDate: string): boolean {
  if (prevDate === null) {
    return false;
  }
  const prevMs = parseUtcDateMs(prevDate);
  const nextMs = parseUtcDateMs(nextDate);
  return prevMs !== null && nextMs !== null && nextMs - prevMs === MS_PER_UTC_DAY;
}

function cloneLevels(
  levels: Record<number, LevelProgress>,
): Record<number, LevelProgress> {
  const copy: Record<number, LevelProgress> = {};
  for (const [key, entry] of Object.entries(levels)) {
    copy[Number(key)] = { stars: entry.stars, bestMoves: entry.bestMoves };
  }
  return copy;
}

function recoverLevels(rawLevels: unknown): Record<number, LevelProgress> {
  const levels: Record<number, LevelProgress> = {};
  if (!isPlainObject(rawLevels)) {
    return levels;
  }
  for (const [key, entry] of Object.entries(rawLevels)) {
    const levelId = Number(key);
    if (
      !Number.isInteger(levelId) ||
      String(levelId) !== key ||
      levelId < 1 ||
      levelId > MAX_CAMPAIGN_LEVEL ||
      !isPlainObject(entry)
    ) {
      continue;
    }
    if (
      isStarRating(entry.stars) &&
      typeof entry.bestMoves === "number" &&
      Number.isInteger(entry.bestMoves) &&
      entry.bestMoves >= 0
    ) {
      levels[levelId] = {
        stars: entry.stars,
        bestMoves: entry.bestMoves,
      };
    }
  }
  return levels;
}

function recoverDailyCleared(rawDaily: unknown): Record<string, 1 | 2 | 3> {
  const dailyCleared: Record<string, 1 | 2 | 3> = {};
  if (!isPlainObject(rawDaily)) {
    return dailyCleared;
  }
  for (const [dateKey, stars] of Object.entries(rawDaily)) {
    if (isValidUtcDate(dateKey) && isStarRating(stars)) {
      dailyCleared[dateKey] = stars;
    }
  }
  return dailyCleared;
}

function recoverSeenDailyTwists(rawSeen: unknown): SeenDailyTwists {
  if (!isPlainObject(rawSeen)) {
    return { rivets: false, twoSlot: false };
  }
  return {
    rivets: typeof rawSeen.rivets === "boolean" ? rawSeen.rivets : false,
    twoSlot: typeof rawSeen.twoSlot === "boolean" ? rawSeen.twoSlot : false,
  };
}

/**
 * Parse and validate an untrusted save payload, recovering cleanly to defaults on any corruption.
 */
export function parseSaveWithRecovery(raw: unknown): SaveData {
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return defaultSave();
    }
  }

  if (!isPlainObject(parsed) || parsed.schemaVersion !== SAVE_SCHEMA) {
    return defaultSave();
  }

  const base = defaultSave();

  const highestUnlocked =
    typeof parsed.highestUnlocked === "number" &&
    Number.isInteger(parsed.highestUnlocked) &&
    parsed.highestUnlocked >= 1 &&
    parsed.highestUnlocked <= MAX_CAMPAIGN_LEVEL
      ? parsed.highestUnlocked
      : base.highestUnlocked;

  const dailyStreak =
    typeof parsed.dailyStreak === "number" &&
    Number.isInteger(parsed.dailyStreak) &&
    parsed.dailyStreak >= 0
      ? parsed.dailyStreak
      : base.dailyStreak;

  const lastDailyDate = isValidUtcDate(parsed.lastDailyDate)
    ? parsed.lastDailyDate
    : base.lastDailyDate;

  return {
    schemaVersion: SAVE_SCHEMA,
    highestUnlocked,
    levels: recoverLevels(parsed.levels),
    dailyCleared: recoverDailyCleared(parsed.dailyCleared),
    dailyStreak,
    lastDailyDate,
    muted: typeof parsed.muted === "boolean" ? parsed.muted : base.muted,
    reducedMotion:
      typeof parsed.reducedMotion === "boolean"
        ? parsed.reducedMotion
        : base.reducedMotion,
    ftueCompleted:
      typeof parsed.ftueCompleted === "boolean"
        ? parsed.ftueCompleted
        : base.ftueCompleted,
    seenDailyTwists: recoverSeenDailyTwists(parsed.seenDailyTwists),
  };
}

/**
 * Record a campaign level completion immutably, preserving best stars and lowest moves.
 */
export function recordLevelClear(
  save: SaveData,
  levelId: number,
  stars: 1 | 2 | 3,
  moves: number,
): SaveData {
  if (
    !Number.isInteger(levelId) ||
    levelId < 1 ||
    levelId > MAX_CAMPAIGN_LEVEL ||
    !isStarRating(stars) ||
    !Number.isInteger(moves) ||
    moves < 0
  ) {
    return save;
  }

  const nextLevels = cloneLevels(save.levels);
  const prev = nextLevels[levelId];
  nextLevels[levelId] = {
    stars: prev ? (Math.max(prev.stars, stars) as 1 | 2 | 3) : stars,
    bestMoves: prev ? Math.min(prev.bestMoves, moves) : moves,
  };

  return {
    ...save,
    highestUnlocked: Math.max(
      save.highestUnlocked,
      Math.min(MAX_CAMPAIGN_LEVEL, levelId + 1),
    ),
    levels: nextLevels,
    dailyCleared: { ...save.dailyCleared },
    ftueCompleted: save.ftueCompleted || levelId === 1,
    seenDailyTwists: { ...save.seenDailyTwists },
  };
}

/**
 * Record a Daily Heist completion for a UTC `YYYY-MM-DD` date immutably.
 */
export function recordDailyClear(
  save: SaveData,
  utcDate: string,
  stars: 1 | 2 | 3,
): SaveData {
  if (!isValidUtcDate(utcDate)) {
    throw new Error(`Invalid UTC date string "${utcDate}": expected YYYY-MM-DD`);
  }
  if (!isStarRating(stars)) {
    return save;
  }

  const nextDailyCleared: Record<string, 1 | 2 | 3> = { ...save.dailyCleared };
  const prevStars = nextDailyCleared[utcDate];
  nextDailyCleared[utcDate] = prevStars
    ? (Math.max(prevStars, stars) as 1 | 2 | 3)
    : stars;

  let nextStreak: number;
  let nextLastDate: string;
  if (save.lastDailyDate === utcDate) {
    nextStreak = save.dailyStreak;
    nextLastDate = save.lastDailyDate;
  } else if (isConsecutiveUtcDay(save.lastDailyDate, utcDate)) {
    nextStreak = save.dailyStreak + 1;
    nextLastDate = utcDate;
  } else {
    nextStreak = 1;
    nextLastDate = utcDate;
  }

  return {
    ...save,
    levels: cloneLevels(save.levels),
    dailyCleared: nextDailyCleared,
    dailyStreak: nextStreak,
    lastDailyDate: nextLastDate,
    seenDailyTwists: { ...save.seenDailyTwists },
  };
}

/**
 * Return whether Daily Heist is unlocked (requires clearing level 6).
 */
export function isDailyUnlocked(save: SaveData): boolean {
  return Boolean(save.levels[DAILY_UNLOCK_LEVEL]) || save.highestUnlocked >= DAILY_UNLOCK_LEVEL + 1;
}

/**
 * Compute aggregate player score across campaign stars and daily clears.
 */
export function computeTotalScore(save: SaveData): number {
  let totalStars = 0;
  for (const entry of Object.values(save.levels)) {
    totalStars += entry.stars;
  }
  const dailyClears = Object.keys(save.dailyCleared).length;
  return totalStars * 100 + dailyClears * 150;
}

/**
 * Determine which level the main Play CTA should resume, or `0` for Chapter Select once level 18 is cleared.
 */
export function getResumeLevelId(save: SaveData): number {
  if (save.levels[MAX_CAMPAIGN_LEVEL]) {
    return 0;
  }
  const maxUnlocked = Math.max(1, Math.min(MAX_CAMPAIGN_LEVEL, save.highestUnlocked));
  for (let id = 1; id <= maxUnlocked; id++) {
    if (!save.levels[id]) {
      return id;
    }
  }
  return maxUnlocked;
}
