import {
  EMOJI_CATEGORIES,
  EMOJI_SOURCE,
  type EmojiCategory,
} from "./emoji-data.js";

export { EMOJI_CATEGORIES, type EmojiCategory } from "./emoji-data.js";

export interface EmojiEntry {
  readonly emoji: string;
  /** English CLDR-style name, such as `thumbs up`. */
  readonly name: string;
  readonly keywords: readonly string[];
  readonly category: EmojiCategory;
}

/** Picker tabs: recently used first, then the built-in categories. */
export type EmojiPickerCategory = "recent" | EmojiCategory;

export const EMOJI_PICKER_CATEGORIES: readonly EmojiPickerCategory[] = [
  "recent",
  ...EMOJI_CATEGORIES,
];

/** A representative emoji for each picker tab. */
export const EMOJI_CATEGORY_ICONS: Readonly<
  Record<EmojiPickerCategory, string>
> = {
  recent: "🕘",
  smileys: "😀",
  people: "👋",
  nature: "🌿",
  food: "🍔",
  activities: "⚽",
  travel: "✈️",
  objects: "💡",
  symbols: "❤️",
  flags: "🏳️",
};

let parsed: readonly EmojiEntry[] | undefined;

/** Every built-in emoji, grouped by category in picker order. */
export function emojiList(): readonly EmojiEntry[] {
  if (parsed !== undefined) return parsed;
  const entries: EmojiEntry[] = [];
  for (const category of EMOJI_CATEGORIES)
    for (const line of EMOJI_SOURCE[category].split("\n")) {
      const space = line.indexOf(" ");
      const colon = line.indexOf(":", space);
      if (space <= 0 || colon < 0) continue;
      entries.push(
        Object.freeze({
          emoji: line.slice(0, space),
          name: line.slice(space + 1, colon).trim(),
          keywords: Object.freeze(
            line
              .slice(colon + 1)
              .trim()
              .split(/\s+/)
              .filter(Boolean),
          ),
          category,
        }),
      );
    }
  parsed = Object.freeze(entries);
  return parsed;
}

/** Built-in emoji of one category. */
export function emojiInCategory(
  category: EmojiCategory,
): readonly EmojiEntry[] {
  return emojiList().filter((entry) => entry.category === category);
}

/**
 * Emoji whose name or keywords match every word of `query`, best matches
 * first: a name or keyword that starts with the word ranks above one that
 * only contains it.
 */
export function searchEmoji(query: string, limit = 120): readonly EmojiEntry[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const scored: { entry: EmojiEntry; score: number; index: number }[] = [];
  emojiList().forEach((entry, index) => {
    const terms = [...entry.name.split(/[\s-]+/), ...entry.keywords];
    let score = 0;
    for (const word of words) {
      if (terms.some((term) => term === word)) score += 3;
      else if (terms.some((term) => term.startsWith(word))) score += 2;
      else if (entry.name.includes(word)) score += 1;
      else return;
    }
    scored.push({ entry, score, index });
  });
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map(({ entry }) => entry);
}

/** The built-in entry for an emoji, if it is in the set. */
export function findEmoji(emoji: string): EmojiEntry | undefined {
  return emojiList().find((entry) => entry.emoji === emoji);
}

const RECENT_KEY = "polymorfa:recent-emoji";
const MAX_RECENT = 32;

function defaultStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * Recently picked emoji, newest first. Returns an empty list when storage is
 * unavailable, blocked, or holds something unexpected.
 */
export function readRecentEmoji(
  storage: Pick<Storage, "getItem"> | undefined = defaultStorage(),
): readonly string[] {
  try {
    const value: unknown = JSON.parse(storage?.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(value)
      ? value
          .filter(
            (item): item is string =>
              typeof item === "string" && item.length <= 32,
          )
          .slice(0, MAX_RECENT)
      : [];
  } catch {
    return [];
  }
}

/** Move `emoji` to the front of the recent list. Storage errors are ignored. */
export function recordRecentEmoji(
  emoji: string,
  storage: Pick<Storage, "getItem" | "setItem"> | undefined = defaultStorage(),
): readonly string[] {
  const next = [
    emoji,
    ...readRecentEmoji(storage).filter((item) => item !== emoji),
  ].slice(0, MAX_RECENT);
  try {
    storage?.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full quota: keep the list for this session only.
  }
  return next;
}

/** Entries for the recent tab; emoji outside the built-in set still show. */
export function recentEmojiEntries(
  recent: readonly string[],
): readonly EmojiEntry[] {
  return recent.map(
    (emoji) =>
      findEmoji(emoji) ?? {
        emoji,
        name: emoji,
        keywords: [],
        category: "symbols",
      },
  );
}
