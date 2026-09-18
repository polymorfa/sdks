import { describe, expect, it } from "vitest";
import {
  applyQuickReply,
  emojiList,
  filterQuickReplies,
  findQuickReplyQuery,
  formatElapsed,
  insertText,
  placePopover,
  readRecentEmoji,
  recordRecentEmoji,
  searchEmoji,
} from "../src/index.js";

const options = [
  { id: "1", shortcut: "thanks", text: "Thank you for reaching out!" },
  {
    id: "2",
    shortcut: "/hours",
    text: "We are open 9–5.",
    description: "Opening hours",
  },
  { id: "3", shortcut: "ship", text: "Your order ships today." },
];

describe("composer helpers", () => {
  it("inserts at the caret or over a selection", () => {
    expect(insertText("Hello world", "🙂", 5)).toEqual({
      text: "Hello🙂 world",
      caret: 7,
    });
    expect(insertText("Hello world", "there", 6, 11)).toEqual({
      text: "Hello there",
      caret: 11,
    });
  });

  it("finds the slash word at the caret", () => {
    expect(findQuickReplyQuery("/tha")).toEqual({
      start: 0,
      end: 4,
      query: "tha",
    });
    expect(findQuickReplyQuery("hi /sh there", 6)).toEqual({
      start: 3,
      end: 6,
      query: "sh",
    });
    expect(findQuickReplyQuery("a/b")).toBeUndefined();
    expect(findQuickReplyQuery("hello")).toBeUndefined();
  });

  it("filters by shortcut first, then text", () => {
    expect(filterQuickReplies(options, "").map(({ id }) => id)).toEqual([
      "1",
      "2",
      "3",
    ]);
    expect(filterQuickReplies(options, "HO").map(({ id }) => id)).toEqual([
      "2",
    ]);
    expect(filterQuickReplies(options, "order").map(({ id }) => id)).toEqual([
      "3",
    ]);
    expect(filterQuickReplies(options, "zzz")).toEqual([]);
    const query = findQuickReplyQuery("Hi /th", 6)!;
    expect(applyQuickReply("Hi /th", query, options[0]!)).toEqual({
      text: "Hi Thank you for reaching out!",
      caret: 30,
    });
  });

  it("keeps popovers inside the viewport", () => {
    const viewport = { width: 400, height: 800 };
    const size = { width: 360, height: 400 };
    const low = placePopover(
      { top: 700, bottom: 740, left: 300, right: 340 },
      size,
      viewport,
    );
    expect(low.placement).toBe("top");
    expect(low.top).toBe(292);
    expect(low.left).toBe(32);
    const high = placePopover(
      { top: 20, bottom: 60, left: 10, right: 50 },
      size,
      viewport,
    );
    expect(high.placement).toBe("bottom");
    expect(high.top).toBe(68);
  });

  it("formats elapsed time as mm:ss", () => {
    expect(formatElapsed(0)).toBe("00:00");
    expect(formatElapsed(65_400)).toBe("01:05");
    expect(formatElapsed(3_723_000)).toBe("1:02:03");
  });
});

describe("emoji data", () => {
  it("ships a compact searchable set", () => {
    const list = emojiList();
    expect(list.length).toBeGreaterThanOrEqual(300);
    expect(list.length).toBeLessThanOrEqual(500);
    expect(new Set(list.map(({ emoji }) => emoji)).size).toBe(list.length);
    expect(searchEmoji("thumbs")[0]?.emoji).toBe("👍");
    expect(searchEmoji("heart red")[0]?.emoji).toBe("❤️");
    expect(searchEmoji("")).toEqual([]);
  });

  it("remembers recent emoji and survives broken storage", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    };
    recordRecentEmoji("🙂", storage);
    recordRecentEmoji("🎉", storage);
    expect(recordRecentEmoji("🙂", storage)).toEqual(["🙂", "🎉"]);
    expect(readRecentEmoji(storage)).toEqual(["🙂", "🎉"]);
    const broken = {
      getItem: () => "{nope",
      setItem: () => {
        throw new Error("quota");
      },
    };
    expect(readRecentEmoji(broken)).toEqual([]);
    expect(recordRecentEmoji("🙂", broken)).toEqual(["🙂"]);
  });
});
