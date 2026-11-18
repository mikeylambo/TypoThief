import type { DailyTier, LevelDef } from "./types.ts";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Map a UTC `YYYY-MM-DD` date string to its Daily Heist difficulty tier.
 */
export function weekdayTier(utcDateStr: string): DailyTier {
  if (!DATE_PATTERN.test(utcDateStr)) {
    throw new Error(`Invalid UTC date string "${utcDateStr}": expected YYYY-MM-DD`);
  }

  const parsed = new Date(`${utcDateStr}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== utcDateStr) {
    throw new Error(`Invalid calendar date "${utcDateStr}"`);
  }

  switch (parsed.getUTCDay()) {
    case 1:
    case 2:
      return "mon-tue";
    case 3:
    case 4:
      return "wed-thu";
    case 5:
    case 6:
      return "fri-sat";
    default:
      return "sun";
  }
}

function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function filterByTierFallback(bank: readonly LevelDef[], tier: DailyTier): LevelDef[] {
  const untagged = bank.filter((level) => level.tier === undefined);
  if (tier === "sun") {
    return untagged.filter((level) => level.props.length >= 4);
  }
  const targetChapter = tier === "mon-tue" ? 1 : tier === "wed-thu" ? 2 : 3;
  const strict = untagged.filter(
    (level) => level.chapter === targetChapter && level.props.length < 4,
  );
  if (strict.length > 0) {
    return strict;
  }
  return untagged.filter((level) => level.chapter === targetChapter);
}

/**
 * Deterministically select a Daily Heist puzzle matching `utcDateStr`'s weekday tier.
 */
export function pickDailyPuzzle(utcDateStr: string, bank: LevelDef[]): LevelDef {
  if (bank.length === 0) {
    throw new Error("Daily puzzle bank is empty");
  }

  const tier = weekdayTier(utcDateStr);
  const taggedMatches = bank.filter((level) => level.tier === tier);
  const fallbackMatches =
    taggedMatches.length > 0 ? taggedMatches : filterByTierFallback(bank, tier);
  const pool = fallbackMatches.length > 0 ? fallbackMatches : bank;

  const index = fnv1a32(utcDateStr) % pool.length;
  return pool[index];
}
