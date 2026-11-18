import defaultWords from "../content/dict.json" with { type: "json" };

/**
 * Load the 3-6 letter base dictionary into a normalized lowercase Set.
 */
export function loadDict(words: readonly string[] = defaultWords): Set<string> {
  const dict = new Set<string>();
  for (const word of words) {
    const normalized = word.trim().toLowerCase();
    if (normalized.length > 0) {
      dict.add(normalized);
    }
  }
  return dict;
}

/**
 * Check whether `word` is present in `dict` (case-insensitive).
 */
export function isValidWord(dict: Set<string>, word: string): boolean {
  if (word.length === 0) {
    return false;
  }
  return dict.has(word.toLowerCase());
}
