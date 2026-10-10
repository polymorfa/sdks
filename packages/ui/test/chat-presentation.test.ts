import { describe, expect, it } from "vitest";
import {
  attachmentPresentation,
  fileExtension,
  filterInboxRows,
  formatDuration,
  inboxDraft,
  waveformBars,
} from "../src/index.js";

describe("chat attachment presentation", () => {
  it("separates voice notes from audio files only when the source says so", () => {
    expect(attachmentPresentation({ contentType: "audio/ogg" })).toBe("audio");
    expect(
      attachmentPresentation({ contentType: "audio/ogg", voice: true }),
    ).toBe("voice");
    expect(attachmentPresentation({ contentType: "IMAGE/PNG" })).toBe("image");
    expect(attachmentPresentation({ contentType: "video/mp4" })).toBe("video");
    expect(attachmentPresentation({ contentType: "application/pdf" })).toBe(
      "document",
    );
  });

  it("formats lengths and rejects missing or invalid ones", () => {
    expect(formatDuration(18)).toBe("0:18");
    expect(formatDuration(245.4)).toBe("4:05");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(undefined)).toBeUndefined();
    expect(formatDuration(Number.NaN)).toBeUndefined();
    expect(formatDuration(-1)).toBeUndefined();
  });

  it("reads short extensions only", () => {
    expect(fileExtension("Oak collection · October.pdf")).toBe("PDF");
    expect(fileExtension("notes.docx")).toBe("DOCX");
    expect(fileExtension("archive.tar.gz")).toBe("GZ");
    expect(fileExtension("README")).toBeUndefined();
    expect(fileExtension("data.verylongext")).toBeUndefined();
  });

  it("never invents a waveform and normalizes observed levels", () => {
    expect(waveformBars(undefined)).toEqual([]);
    expect(waveformBars([])).toEqual([]);
    expect(waveformBars([Number.NaN])).toEqual([]);
    const bars = waveformBars([0, 0.25, 0.5, 1], 4);
    expect(bars).toEqual([0.1, 0.25, 0.5, 1]);
    expect(waveformBars([0, 0], 3)).toEqual([0.1, 0.1, 0.1]);
    const many = waveformBars(
      Array.from({ length: 100 }, (_, i) => i / 99),
      10,
    );
    expect(many).toHaveLength(10);
    expect(many.at(-1)).toBe(1);
    expect(many.every((level) => level >= 0.1 && level <= 1)).toBe(true);
  });

  it("handles waveforms longer than the argument limit", () => {
    const levels = Array.from({ length: 500_000 }, (_, i) => (i % 100) / 100);
    levels[250_000] = -2;
    const bars = waveformBars(levels, 4);
    expect(bars).toHaveLength(4);
    expect(bars[2]).toBe(1);
  });
});

describe("inbox drafts", () => {
  const row = (id: string) => ({
    id,
    name: id,
    unreadCount: 0,
    lastActivity: 1,
  });

  it("reads only own draft entries", () => {
    expect(inboxDraft({ a: "hi" }, "a")).toBe("hi");
    expect(inboxDraft({}, "constructor")).toBeUndefined();
    expect(inboxDraft({}, "toString")).toBeUndefined();
    expect(inboxDraft(undefined, "a")).toBeUndefined();
  });

  it("searches and filters rows whose IDs name inherited properties", () => {
    const rows = [row("constructor"), row("__proto__"), row("plain")];
    expect(filterInboxRows(rows, "all", "zzz").map(({ id }) => id)).toEqual([]);
    expect(filterInboxRows(rows, "drafts", "")).toEqual([]);
    expect(
      filterInboxRows(rows, "drafts", "", { plain: "later" }).map(
        ({ id }) => id,
      ),
    ).toEqual(["plain"]);
  });
});
