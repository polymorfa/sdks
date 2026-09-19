/**
 * Framework-neutral composer helpers shared by the React and Web Component
 * composers: caret-aware insertion, "/" quick replies, popover placement,
 * and the recording timer.
 */

export interface QuickReplyOption {
  readonly id: string;
  /** Typed after "/", such as `thanks`. A leading "/" is ignored. */
  readonly shortcut: string;
  /** Text that replaces the "/shortcut" word. */
  readonly text: string;
  readonly description?: string;
}

export interface TextEdit {
  readonly text: string;
  /** Caret position after the edit. */
  readonly caret: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Replace `text[start, end)` with `insert` and put the caret after it. */
export function insertText(
  text: string,
  insert: string,
  start: number = text.length,
  end: number = start,
): TextEdit {
  const from = clamp(Math.min(start, end), 0, text.length);
  const to = clamp(Math.max(start, end), from, text.length);
  return {
    text: text.slice(0, from) + insert + text.slice(to),
    caret: from + insert.length,
  };
}

export interface QuickReplyQuery {
  /** Index of the "/" that starts the word. */
  readonly start: number;
  /** End of the word (the caret, or the end of the word it sits in). */
  readonly end: number;
  /** Text after "/", without it. */
  readonly query: string;
}

/**
 * The "/word" the caret is in, when that word starts at the beginning of the
 * text or after whitespace. `undefined` otherwise.
 */
export function findQuickReplyQuery(
  text: string,
  caret: number = text.length,
): QuickReplyQuery | undefined {
  const position = clamp(caret, 0, text.length);
  let start = position;
  while (start > 0 && !/\s/.test(text.charAt(start - 1))) start -= 1;
  if (text.charAt(start) !== "/") return undefined;
  let end = position;
  while (end < text.length && !/\s/.test(text.charAt(end))) end += 1;
  return { start, end, query: text.slice(start + 1, position) };
}

function normalizedShortcut(shortcut: string): string {
  return shortcut.replace(/^\//, "").toLowerCase();
}

/**
 * Options matching `query` by shortcut or text, case-insensitively.
 * Shortcut prefix matches come first, then other shortcut matches, then
 * text matches; ties keep their original order.
 */
export function filterQuickReplies(
  options: readonly QuickReplyOption[],
  query: string,
): readonly QuickReplyOption[] {
  const needle = query.toLowerCase().trim();
  const ranked: { option: QuickReplyOption; rank: number; index: number }[] =
    [];
  options.forEach((option, index) => {
    const shortcut = normalizedShortcut(option.shortcut);
    const rank =
      needle === "" || shortcut.startsWith(needle)
        ? 0
        : shortcut.includes(needle)
          ? 1
          : option.text.toLowerCase().includes(needle) ||
              (option.description?.toLowerCase().includes(needle) ?? false)
            ? 2
            : -1;
    if (rank >= 0) ranked.push({ option, rank, index });
  });
  return ranked
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ option }) => option);
}

/** Replace the "/word" with the option's text. */
export function applyQuickReply(
  text: string,
  query: QuickReplyQuery,
  option: QuickReplyOption,
): TextEdit {
  return insertText(text, option.text, query.start, query.end);
}

/** `/shortcut`, with exactly one leading slash. */
export function quickReplyLabel(option: QuickReplyOption): string {
  return `/${option.shortcut.replace(/^\//, "")}`;
}

export interface PopoverRect {
  readonly top: number;
  readonly left: number;
  readonly bottom: number;
  readonly right: number;
}

export interface PopoverPlacement {
  readonly top: number;
  readonly left: number;
  readonly placement: "top" | "bottom";
  /** Height available on the chosen side, for `max-height`. */
  readonly maxHeight: number;
}

/**
 * Where to put a fixed popover of `size` next to `anchor` so it stays in the
 * viewport: above the anchor when there is room (as WhatsApp does for the
 * composer), otherwise on the side with more space.
 */
export function placePopover(
  anchor: PopoverRect,
  size: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
  options: {
    readonly gap?: number;
    readonly margin?: number;
    readonly align?: "start" | "end";
    readonly direction?: "ltr" | "rtl";
  } = {},
): PopoverPlacement {
  const gap = options.gap ?? 8;
  const margin = options.margin ?? 8;
  const above = anchor.top - gap - margin;
  const below = viewport.height - anchor.bottom - gap - margin;
  const placement: "top" | "bottom" =
    size.height <= above || above >= below ? "top" : "bottom";
  const maxHeight = Math.max(0, placement === "top" ? above : below);
  const height = Math.min(size.height, maxHeight);
  const top =
    placement === "top" ? anchor.top - gap - height : anchor.bottom + gap;
  const alignEnd =
    ((options.align ?? "start") === "end") !== (options.direction === "rtl");
  const preferred = alignEnd ? anchor.right - size.width : anchor.left;
  const left = clamp(
    preferred,
    margin,
    Math.max(margin, viewport.width - size.width - margin),
  );
  return { top: Math.max(margin, top), left, placement, maxHeight };
}

/** `mm:ss` for a recording, or `h:mm:ss` past an hour. */
export function formatElapsed(milliseconds: number): string {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${String(minutes).padStart(2, "0")}:${seconds}`;
}
