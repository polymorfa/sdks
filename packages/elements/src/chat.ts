import {
  VoiceNoteRecorder,
  localAttachmentFromFile,
  type ComposerAttachment,
  type ConversationController,
  type ConversationMessage,
  type ConversationSnapshot,
  type LocalAttachment,
  type MessageAttachment,
  type MessageComposerController,
  type MessageComposerSnapshot,
  type VoiceNoteError,
} from "@polymorfa/browser";
import {
  CHAT_ICONS,
  EMOJI_CATEGORY_ICONS,
  EMOJI_PICKER_CATEGORIES,
  applyQuickReply,
  emojiInCategory,
  filterQuickReplies,
  findQuickReplyQuery,
  formatElapsed,
  insertText,
  placePopover,
  quickReplyLabel,
  readRecentEmoji,
  recentEmojiEntries,
  recordRecentEmoji,
  searchEmoji,
  type EmojiPickerCategory,
  type QuickReplyOption,
  type TextEdit,
  formatDayLabel,
  formatFileSize,
  formatMessageTime,
  isImageAttachment,
  layoutMessages,
  safeAttachmentUrl,
  type ChatIconName,
  type ComponentSlot,
  type MessageKey,
} from "@polymorfa/ui";
import { PolymorfaElement, button, element, textElement } from "./base.js";

const SVG = "http://www.w3.org/2000/svg";

function icon(name: ChatIconName, className = "pmfa-icon"): SVGSVGElement {
  const svg = document.createElementNS(SVG, "svg");
  svg.setAttribute("class", className);
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(SVG, "path");
  path.setAttribute("d", CHAT_ICONS[name]);
  svg.append(path);
  return svg;
}

function iconButton(
  label: string,
  name: ChatIconName,
  part: string,
  action: () => void,
  className = "pmfa-btn pmfa-btn-ghost pmfa-btn-icon",
): HTMLButtonElement {
  const value = button("", part, action, className);
  value.setAttribute("aria-label", label);
  value.title = label;
  value.append(icon(name));
  return value;
}

function span(className: string, text?: string): HTMLSpanElement {
  const value = document.createElement("span");
  value.className = className;
  if (text !== undefined) value.textContent = text;
  return value;
}

function setText(node: Node, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

/** Put `nodes` into `parent` in order, moving only what is out of place. */
function reconcile(parent: Element, nodes: readonly Node[]): void {
  nodes.forEach((node, index) => {
    const current = parent.childNodes[index];
    if (current !== node) parent.insertBefore(node, current ?? null);
  });
  while (parent.childNodes.length > nodes.length) parent.lastChild?.remove();
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** What the views need from their element. */
interface ViewHost {
  text(key: MessageKey, values?: Readonly<Record<string, string>>): string;
  localeCode(): string;
  rootClass(names: string): string;
  decorate<N extends Element>(node: N, slot: ComponentSlot): N;
}

function authorName(host: ViewHost, message?: ConversationMessage): string {
  return host.text(
    message?.direction === "outbound" ? "chat.you" : "chat.contact",
  );
}

function snippet(host: ViewHost, message: ConversationMessage): string {
  return message.text.trim() !== ""
    ? message.text
    : (message.attachments?.[0]?.name ?? host.text("chat.attachment"));
}

// ── Message list ──────────────────────────────────────────────────────

interface ListActions {
  loadMore(): void;
  retry?: ((clientId: string) => Promise<void>) | undefined;
  /** Present when messages offer a Reply action. */
  reply?: ((message: ConversationMessage) => void) | undefined;
}

interface CachedMessage {
  readonly message: ConversationMessage;
  readonly quoted: ConversationMessage | undefined;
  readonly replyable: boolean;
  readonly retryable: boolean;
  readonly node: HTMLLIElement;
}

/**
 * One persistent log with message nodes keyed by id. A message whose object
 * is unchanged keeps its node, so focus, the live region, and scroll position
 * survive unrelated updates.
 */
class MessageListView {
  readonly scroller: HTMLDivElement;
  readonly list: HTMLOListElement;
  #cache = new Map<string, CachedMessage>();
  #dates = new Map<string, HTMLLIElement>();
  #loadMore: HTMLLIElement | undefined;
  #empty: HTMLLIElement | undefined;
  #pinned = true;

  constructor(
    private readonly host: ViewHost,
    private readonly actions: () => ListActions,
    scrollerClass: string,
  ) {
    const scroller = element("div", "message-list") as HTMLDivElement;
    scroller.className = scrollerClass;
    this.scroller = host.decorate(scroller, "messageList");
    this.scroller.setAttribute("role", "log");
    this.scroller.setAttribute("aria-live", "polite");
    this.scroller.setAttribute("aria-label", host.text("chat.title"));
    this.scroller.addEventListener("scroll", () => {
      const node = this.scroller;
      this.#pinned =
        node.scrollHeight - node.scrollTop - node.clientHeight < 32;
    });
    this.list = document.createElement("ol");
    this.list.className = "pmfa-items";
    this.scroller.append(this.list);
  }

  update(snapshot: ConversationSnapshot | undefined): void {
    const actions = this.actions();
    const messages = snapshot?.messages ?? [];
    const byId = new Map(messages.map((message) => [message.id, message]));
    const entries = layoutMessages(messages);
    const nodes: Node[] = [];
    if (snapshot?.hasMore) nodes.push(this.#loadMoreNode());
    const seen = new Set<string>();
    const seenDates = new Set<string>();
    const now = Date.now();
    const labels = {
      today: this.host.text("chat.today"),
      yesterday: this.host.text("chat.yesterday"),
    };
    for (const entry of entries) {
      if (entry.kind === "date") {
        seenDates.add(entry.key);
        let node = this.#dates.get(entry.key);
        if (node === undefined) {
          node = document.createElement("li");
          node.className = "pmfa-date";
          this.host.decorate(node, "dateSeparator");
          this.#dates.set(entry.key, node);
        }
        setText(
          node,
          formatDayLabel(entry.time, this.host.localeCode(), labels, now),
        );
        nodes.push(node);
        continue;
      }
      const { message } = entry;
      seen.add(message.id);
      const quoted =
        message.replyTo === undefined ? undefined : byId.get(message.replyTo);
      const replyable = actions.reply !== undefined;
      const retryable = actions.retry !== undefined;
      let cached = this.#cache.get(message.id);
      if (
        cached === undefined ||
        cached.message !== message ||
        cached.quoted !== quoted ||
        cached.replyable !== replyable ||
        cached.retryable !== retryable
      ) {
        cached = {
          message,
          quoted,
          replyable,
          retryable,
          node: this.#messageNode(message, quoted, replyable, retryable),
        };
        this.#cache.set(message.id, cached);
      }
      cached.node.classList.toggle("pmfa-msg-start", entry.groupStart);
      cached.node.classList.toggle("pmfa-msg-end", entry.groupEnd);
      nodes.push(cached.node);
    }
    for (const id of this.#cache.keys())
      if (!seen.has(id)) this.#cache.delete(id);
    for (const key of this.#dates.keys())
      if (!seenDates.has(key)) this.#dates.delete(key);
    if (entries.length === 0) nodes.push(this.#emptyNode());
    const pinned = this.#pinned || !this.scroller.isConnected;
    const offset = this.scroller.scrollTop;
    reconcile(this.list, nodes);
    queueMicrotask(() => {
      this.scroller.scrollTop = pinned ? this.scroller.scrollHeight : offset;
    });
  }

  jump(id: string): void {
    const target = this.#cache.get(id)?.node;
    if (target === undefined) return;
    target.scrollIntoView?.({
      block: "center",
      behavior: prefersReducedMotion() ? "auto" : "smooth",
    });
    target.focus({ preventScroll: true });
    target.classList.remove("pmfa-msg-flash");
    target.classList.add("pmfa-msg-flash");
    setTimeout(() => target.classList.remove("pmfa-msg-flash"), 1200);
  }

  #loadMoreNode(): HTMLLIElement {
    if (this.#loadMore === undefined) {
      const item = document.createElement("li");
      item.className = "pmfa-loadmore";
      item.append(
        this.host.decorate(
          button(this.host.text("chat.loadMore"), "load-more", () =>
            this.actions().loadMore(),
          ),
          "loadMore",
        ),
      );
      this.#loadMore = item;
    }
    return this.#loadMore;
  }

  #emptyNode(): HTMLLIElement {
    if (this.#empty === undefined) {
      const empty = textElement(
        "li",
        this.host.text("chat.empty"),
        "empty muted",
      ) as HTMLLIElement;
      empty.className = "pmfa-empty";
      this.#empty = this.host.decorate(empty, "empty");
    }
    return this.#empty;
  }

  #messageNode(
    message: ConversationMessage,
    quoted: ConversationMessage | undefined,
    replyable: boolean,
    retryable: boolean,
  ): HTMLLIElement {
    const { host } = this;
    const outbound = message.direction === "outbound";
    const item = host.decorate(
      element("li", `message ${message.direction}`) as HTMLLIElement,
      "message",
    );
    item.classList.add(
      "pmfa-msg",
      `pmfa-msg-${outbound ? "out" : "in"}`,
      `pmfa-msg-${message.status}`,
    );
    item.dataset.messageId = message.id;
    item.tabIndex = -1;
    if (quoted !== undefined) {
      const quote = host.decorate(
        button("", "quote", () => this.jump(quoted.id), "pmfa-quote"),
        "replyQuote",
      );
      quote.append(
        span("pmfa-sr", host.text("chat.jumpToReply")),
        span("pmfa-quote-name", authorName(host, quoted)),
        span("pmfa-quote-text", snippet(host, quoted)),
      );
      item.append(quote);
    }
    const row = element("div");
    row.className = "pmfa-row";
    const bubble = host.decorate(element("div", "bubble"), "bubble");
    bubble.classList.add("pmfa-bubble");
    if ((message.attachments?.length ?? 0) > 0) {
      const attachments = element("div");
      attachments.className = "pmfa-atts";
      for (const attachment of message.attachments ?? [])
        attachments.append(this.#attachmentNode(attachment));
      bubble.append(attachments);
    }
    if (message.text !== "") bubble.append(span("pmfa-text", message.text));
    row.append(bubble);
    const retry =
      retryable &&
      outbound &&
      message.status === "failed" &&
      message.clientId !== undefined;
    if (replyable || retry) {
      const actions = host.decorate(element("div"), "messageActions");
      actions.classList.add("pmfa-actions-msg");
      actions.setAttribute("role", "group");
      actions.setAttribute("aria-label", host.text("chat.messageActions"));
      if (retry)
        actions.append(
          host.decorate(
            iconButton(
              host.text("chat.retry"),
              "retry",
              "retry",
              () => {
                const clientId = message.clientId;
                const run = this.actions().retry;
                if (clientId !== undefined && run !== undefined)
                  void run(clientId).catch(() => undefined);
              },
              "pmfa-btn pmfa-btn-ghost pmfa-btn-icon pmfa-action-retry",
            ),
            "retryButton",
          ),
        );
      if (replyable)
        actions.append(
          host.decorate(
            iconButton(host.text("chat.reply"), "reply", "reply", () =>
              this.actions().reply?.(message),
            ),
            "replyButton",
          ),
        );
      row.append(actions);
    }
    const meta = host.decorate(element("span", "meta"), "messageMeta");
    meta.classList.add("pmfa-meta");
    const time = formatMessageTime(message.createdAt, host.localeCode());
    if (time !== undefined) {
      const node = document.createElement("time");
      node.dateTime = new Date(message.createdAt).toISOString();
      node.textContent = time;
      meta.append(node);
    }
    if (outbound) meta.append(icon(message.status, "pmfa-icon pmfa-status"));
    const status =
      message.status === "failed"
        ? host.text("chat.failed")
        : message.status === "pending"
          ? host.text("chat.sending")
          : outbound
            ? host.text("chat.sent")
            : undefined;
    if (status !== undefined)
      meta.append(
        message.status === "failed"
          ? span("", status)
          : span("pmfa-sr", status),
      );
    item.append(row, meta);
    if (message.error !== undefined) {
      const error = span("pmfa-msg-error", message.error);
      error.setAttribute("role", "alert");
      item.append(error);
    }
    return item;
  }

  #attachmentNode(attachment: MessageAttachment): HTMLElement {
    const { host } = this;
    // Unsafe schemes such as `javascript:` never reach `href` or `src`.
    const url = safeAttachmentUrl(attachment.url);
    const source = safeAttachmentUrl(attachment.previewUrl) ?? url;
    if (isImageAttachment(attachment) && source !== undefined) {
      const image = document.createElement("img");
      image.src = source;
      image.alt = attachment.name;
      image.loading = "lazy";
      image.decoding = "async";
      if (url === undefined) {
        const frame = document.createElement("div");
        frame.className = "pmfa-att pmfa-att-media";
        frame.append(image);
        return host.decorate(frame, "attachment");
      }
      const link = document.createElement("a");
      link.className = "pmfa-att pmfa-att-media";
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.append(image);
      return host.decorate(link, "attachment");
    }
    const node =
      url === undefined
        ? document.createElement("div")
        : document.createElement("a");
    node.className = "pmfa-att pmfa-att-file";
    if (node instanceof HTMLAnchorElement && url !== undefined) {
      node.href = url;
      node.target = "_blank";
      node.rel = "noopener noreferrer";
      node.title = host.text("chat.openAttachment", { name: attachment.name });
    }
    const badge = span("pmfa-att-icon");
    badge.append(icon("file"));
    const body = span("pmfa-att-body");
    body.append(
      span("pmfa-att-name", attachment.name),
      span("pmfa-att-size", formatFileSize(attachment.size, host.localeCode())),
    );
    node.append(badge, body);
    return host.decorate(node, "attachment");
  }
}

// ── Composer ──────────────────────────────────────────────────────────

/**
 * Whether a composer change retires a rejected-file message: the text was
 * edited, a send succeeded, or the composer was reset.
 */
function rejectionCleared(
  previous: MessageComposerSnapshot | undefined,
  next: MessageComposerSnapshot | undefined,
): boolean {
  if (previous === undefined || next === undefined || previous === next)
    return false;
  if (previous.text !== next.text) return true;
  if (previous.sending && !next.sending && next.error === undefined)
    return true;
  return (
    next.status === "ready" &&
    !next.sending &&
    next.error === undefined &&
    next.text === "" &&
    next.attachments.length === 0 &&
    next.replyTo === undefined
  );
}

const supportsFieldSizing = () =>
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("field-sizing", "content");

let attachmentCounter = 0;
function attachmentFromFile(file: File): LocalAttachment {
  attachmentCounter += 1;
  return {
    id:
      globalThis.crypto?.randomUUID?.() ??
      `local-${Date.now()}-${attachmentCounter}`,
    name: file.name,
    size: file.size,
    contentType: file.type === "" ? "application/octet-stream" : file.type,
    file,
  };
}

// ── Emoji picker ──────────────────────────────────────────────────────

const EMOJI_GRID_COLUMNS = 8;

/** The emoji popover; built when opened and dropped when closed. */
class EmojiPickerView {
  readonly node: HTMLDivElement;
  readonly #search: HTMLInputElement;
  readonly #tabs: HTMLDivElement;
  readonly #body: HTMLDivElement;
  readonly #heading: HTMLParagraphElement;
  readonly #panelId = `pmfa-emoji-${Math.random().toString(36).slice(2)}`;
  #recent: readonly string[] = readRecentEmoji();
  #category: EmojiPickerCategory;
  #active = 0;
  #cleanup: (() => void)[] = [];

  constructor(
    private readonly host: ViewHost,
    private readonly anchor: HTMLElement,
    private readonly onPick: (emoji: string) => void,
    private readonly onClose: (restoreFocus: boolean) => void,
  ) {
    this.#category = this.#recent.length > 0 ? "recent" : "smileys";
    const node = document.createElement("div");
    node.className = "pmfa-popover pmfa-emoji";
    node.setAttribute("part", "emoji-picker");
    this.node = host.decorate(node, "emojiPicker");
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-label", host.text("composer.emojiPicker"));
    node.tabIndex = -1;
    node.toggleAttribute("data-measuring", true);
    node.addEventListener("keydown", (event) => {
      if (event.key !== "Escape" || event.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      this.onClose(true);
    });

    const searchBox = document.createElement("div");
    searchBox.className = "pmfa-emoji-search";
    this.#search = document.createElement("input");
    this.#search.type = "search";
    this.#search.className = "pmfa-input";
    this.#search.placeholder = host.text("composer.emojiSearch");
    this.#search.setAttribute("aria-label", host.text("composer.emojiSearch"));
    this.#search.setAttribute("aria-controls", this.#panelId);
    this.#search.addEventListener("input", () => {
      this.#active = 0;
      this.#render();
    });
    this.#search.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.#focusCell(0);
      } else if (event.key === "Enter") {
        const first = this.#entries()[0];
        if (first === undefined) return;
        event.preventDefault();
        this.#pick(first.emoji);
      }
    });
    searchBox.append(icon("search"), this.#search);

    this.#tabs = document.createElement("div");
    this.#tabs.className = "pmfa-emoji-tabs";
    this.#tabs.setAttribute("role", "tablist");
    this.#tabs.setAttribute(
      "aria-label",
      host.text("composer.emojiCategories"),
    );
    for (const name of EMOJI_PICKER_CATEGORIES) {
      const label = host.text(`composer.emojiCategory.${name}`);
      const tab = document.createElement("button");
      tab.type = "button";
      tab.className = "pmfa-emoji-tab";
      tab.dataset.category = name;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-label", label);
      tab.setAttribute("aria-controls", this.#panelId);
      tab.title = label;
      const glyph = document.createElement("span");
      glyph.textContent = EMOJI_CATEGORY_ICONS[name];
      glyph.setAttribute("aria-hidden", "true");
      tab.append(glyph);
      tab.addEventListener("click", () => this.#selectTab(name));
      this.#tabs.append(tab);
    }
    this.#tabs.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const rtl = getComputedStyle(this.#tabs).direction === "rtl";
      const step = (event.key === "ArrowRight") !== rtl ? 1 : -1;
      const count = EMOJI_PICKER_CATEGORIES.length;
      const index = EMOJI_PICKER_CATEGORIES.indexOf(this.#category);
      const next =
        EMOJI_PICKER_CATEGORIES[(index + step + count) % count] ?? "smileys";
      this.#selectTab(next);
      this.#tabs
        .querySelector<HTMLElement>(`[data-category="${next}"]`)
        ?.focus();
    });

    this.#body = document.createElement("div");
    this.#body.className = "pmfa-emoji-body";
    this.#body.id = this.#panelId;
    this.#body.setAttribute("role", "tabpanel");
    this.#heading = document.createElement("p");
    this.#heading.className = "pmfa-emoji-heading";
    this.#heading.setAttribute("aria-hidden", "true");
    node.append(searchBox, this.#tabs, this.#body);
    this.#render();
  }

  /** Call once the node is in the document. */
  attach(): void {
    const place = () => this.#place();
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const onPointer = (event: PointerEvent) => {
      const path = event.composedPath();
      if (path.includes(this.node) || path.includes(this.anchor)) return;
      this.onClose(false);
    };
    document.addEventListener("pointerdown", onPointer, true);
    this.#cleanup.push(
      () => window.removeEventListener("resize", place),
      () => window.removeEventListener("scroll", place, true),
      () => document.removeEventListener("pointerdown", onPointer, true),
    );
    const narrow =
      typeof matchMedia === "function" &&
      matchMedia("(max-width: 600px)").matches;
    if (narrow) this.node.focus({ preventScroll: true });
    else this.#search.focus({ preventScroll: true });
  }

  dispose(): void {
    for (const cleanup of this.#cleanup) cleanup();
    this.#cleanup = [];
    this.node.remove();
  }

  #place(): void {
    const rect = this.anchor.getBoundingClientRect();
    const spot = placePopover(
      rect,
      {
        width: this.node.offsetWidth || 360,
        height: this.node.offsetHeight || 400,
      },
      { width: window.innerWidth, height: window.innerHeight },
      {
        direction:
          getComputedStyle(this.anchor).direction === "rtl" ? "rtl" : "ltr",
      },
    );
    this.node.style.setProperty("--pmfa-pop-top", `${spot.top}px`);
    this.node.style.setProperty("--pmfa-pop-left", `${spot.left}px`);
    this.node.style.setProperty("--pmfa-pop-max", `${spot.maxHeight}px`);
    this.node.dataset.placement = spot.placement;
    this.node.removeAttribute("data-measuring");
  }

  #query(): string {
    return this.#search.value.trim();
  }

  #entries() {
    const query = this.#query();
    return query !== ""
      ? searchEmoji(query)
      : this.#category === "recent"
        ? recentEmojiEntries(this.#recent)
        : emojiInCategory(this.#category);
  }

  #selectTab(name: EmojiPickerCategory): void {
    this.#category = name;
    this.#search.value = "";
    this.#active = 0;
    this.#render();
    this.#body.scrollTop = 0;
  }

  #pick(emoji: string): void {
    this.#recent = recordRecentEmoji(emoji);
    this.onPick(emoji);
    if (this.#category === "recent" && this.#query() === "") {
      const focused = this.#cellIndex(
        this.node.getRootNode() instanceof ShadowRoot
          ? (this.node.getRootNode() as ShadowRoot).activeElement
          : document.activeElement,
      );
      this.#render();
      if (focused >= 0) this.#focusCell(focused);
    }
  }

  #cells(): HTMLElement[] {
    return [...this.#body.querySelectorAll<HTMLElement>(".pmfa-emoji-cell")];
  }

  #cellIndex(target: Element | null): number {
    return target === null ? -1 : this.#cells().indexOf(target as HTMLElement);
  }

  #focusCell(index: number): void {
    const cells = this.#cells();
    const next = Math.max(0, Math.min(index, cells.length - 1));
    cells.forEach((cell, position) => {
      cell.tabIndex = position === next ? 0 : -1;
    });
    this.#active = next;
    cells[next]?.focus();
    cells[next]?.scrollIntoView?.({ block: "nearest" });
  }

  #columns(cells: readonly HTMLElement[]): number {
    const first = cells[0];
    if (first === undefined) return EMOJI_GRID_COLUMNS;
    let columns = 0;
    for (const cell of cells) {
      if (cell.offsetTop !== first.offsetTop) break;
      columns += 1;
    }
    return columns > 0 && columns < cells.length ? columns : EMOJI_GRID_COLUMNS;
  }

  #render(): void {
    const { host } = this;
    const query = this.#query();
    for (const tab of this.#tabs.querySelectorAll<HTMLElement>(
      ".pmfa-emoji-tab",
    )) {
      const selected = query === "" && tab.dataset.category === this.#category;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex =
        tab.dataset.category === (query === "" ? this.#category : "recent")
          ? 0
          : -1;
    }
    const heading =
      query !== ""
        ? host.text("composer.emojiSearch")
        : host.text(`composer.emojiCategory.${this.#category}`);
    setText(this.#heading, heading);
    this.#body.setAttribute("aria-label", heading);
    const entries = this.#entries();
    const children: Node[] = [this.#heading];
    if (entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "pmfa-emoji-empty";
      empty.textContent = host.text(
        query === "" ? "composer.emojiNoRecent" : "composer.emojiNoResults",
      );
      children.push(empty);
    } else {
      const grid = document.createElement("div");
      grid.className = "pmfa-emoji-grid";
      grid.setAttribute("role", "group");
      grid.setAttribute("aria-label", heading);
      const active = Math.min(this.#active, entries.length - 1);
      entries.forEach((entry, index) => {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "pmfa-emoji-cell";
        cell.textContent = entry.emoji;
        cell.title = entry.name;
        cell.setAttribute("aria-label", entry.name);
        cell.tabIndex = index === active ? 0 : -1;
        cell.addEventListener("focus", () => {
          this.#active = index;
        });
        cell.addEventListener("click", () => this.#pick(entry.emoji));
        grid.append(cell);
      });
      grid.addEventListener("keydown", (event) => {
        const cells = this.#cells();
        const index = cells.indexOf(event.target as HTMLElement);
        if (index < 0) return;
        const columns = this.#columns(cells);
        const rtl = getComputedStyle(grid).direction === "rtl";
        const moves: Record<string, number> = {
          ArrowRight: rtl ? -1 : 1,
          ArrowLeft: rtl ? 1 : -1,
          ArrowDown: columns,
          ArrowUp: -columns,
          Home: -index,
          End: cells.length - 1 - index,
        };
        const move = moves[event.key];
        if (move === undefined) return;
        event.preventDefault();
        if (event.key === "ArrowUp" && index < columns) {
          this.#search.focus();
          return;
        }
        this.#focusCell(index + move);
      });
      children.push(grid);
    }
    this.#body.replaceChildren(...children);
  }
}

const VOICE_ERROR_KEYS = {
  "permission-denied": "composer.microphoneDenied",
  unavailable: "composer.microphoneUnavailable",
  failed: "composer.recordingFailed",
} as const satisfies Record<VoiceNoteError, MessageKey>;

const LEVEL_BAR_COUNT = 28;

/** Whether a boolean attribute is on: present and not `"false"`, or `fallback` when absent. */
function flagAttribute(
  node: HTMLElement,
  name: string,
  fallback: boolean,
): boolean {
  const value = node.getAttribute(name);
  return value === null ? fallback : value !== "false";
}

interface ComposerOptions {
  readonly controller: () => MessageComposerController | undefined;
  readonly accept: () => string | undefined;
  readonly multiple: () => boolean;
  readonly messages: () => readonly ConversationMessage[] | undefined;
  readonly emoji: () => boolean;
  readonly voiceNotes: () => boolean;
  readonly voiceNoteAutoSend: () => boolean;
  readonly placeholder: () => string | undefined;
  readonly maxRows: () => number;
  readonly quickReplies: () => readonly QuickReplyOption[];
  readonly onQuickReply: (option: QuickReplyOption) => void;
}

interface Chip {
  readonly node: HTMLLIElement;
  readonly body: HTMLSpanElement;
  readonly progress: HTMLSpanElement;
  readonly fill: HTMLSpanElement;
  readonly status: HTMLSpanElement;
  readonly glyph: { current: SVGSVGElement; name: ChatIconName };
}

function actionSlot(name: string, extra: string): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = `pmfa-composer-actions ${extra}`;
  wrapper.hidden = true;
  const slot = document.createElement("slot");
  slot.name = name;
  slot.addEventListener("slotchange", () => {
    wrapper.hidden = slot.assignedNodes({ flatten: true }).length === 0;
  });
  wrapper.append(slot);
  return wrapper;
}

let menuCounter = 0;

/** A composer whose textarea and buttons persist across renders. */
class ComposerView {
  readonly form: HTMLFormElement;
  readonly input: HTMLTextAreaElement;
  readonly #row: HTMLDivElement;
  readonly #send: HTMLButtonElement;
  readonly #mic: HTMLButtonElement;
  readonly #emojiButton: HTMLButtonElement;
  readonly #file: HTMLInputElement;
  readonly #chips: HTMLUListElement;
  readonly #banner: HTMLDivElement;
  readonly #bannerName: HTMLSpanElement;
  readonly #bannerText: HTMLSpanElement;
  readonly #error: HTMLParagraphElement;
  readonly #live: HTMLSpanElement;
  readonly #menu: HTMLDivElement;
  readonly #menuList: HTMLUListElement;
  readonly #menuId = `pmfa-qr-${++menuCounter}`;
  readonly #recording: HTMLDivElement;
  readonly #recTime: HTMLSpanElement;
  readonly #recMeter: HTMLSpanElement;
  readonly #recBars: HTMLSpanElement[] = [];
  readonly #recStop: HTMLButtonElement;
  readonly #chipNodes = new Map<string, Chip>();
  #snapshot: MessageComposerSnapshot | undefined;
  #rejection: string | undefined;
  #picker: EmojiPickerView | undefined;
  #recorder: VoiceNoteRecorder | undefined;
  #recorderUnsubscribe: (() => void) | undefined;
  #levels: number[] = [];
  #caret = 0;
  #dismissedText: string | undefined;
  #menuQuery: string | undefined;
  #menuOptions: readonly QuickReplyOption[] = [];
  #activeOption = 0;
  #pendingCaret: number | undefined;

  constructor(
    private readonly host: ViewHost,
    private readonly options: ComposerOptions,
  ) {
    const form = element("form", "composer") as HTMLFormElement;
    form.className = host.rootClass("pmfa-composer");
    this.form = host.decorate(form, "composer");
    const hint = span("pmfa-drop-hint", host.text("composer.dropHint"));
    hint.setAttribute("aria-hidden", "true");
    this.#live = span("pmfa-sr");
    this.#live.setAttribute("aria-live", "polite");

    const banner = document.createElement("div");
    banner.className = "pmfa-reply-banner";
    this.#banner = host.decorate(banner, "replyBanner");
    const bannerBody = span("pmfa-reply-body");
    this.#bannerName = span("pmfa-reply-name");
    this.#bannerText = span("pmfa-reply-text");
    bannerBody.append(this.#bannerName, this.#bannerText);
    this.#banner.append(
      bannerBody,
      iconButton(
        host.text("composer.cancelReply"),
        "close",
        "cancel-reply",
        () => {
          this.options.controller()?.setReplyTo();
          this.input.focus();
        },
      ),
    );

    this.#chips = document.createElement("ul");
    this.#chips.className = "pmfa-chips";
    this.#chips.setAttribute("aria-label", host.text("composer.attachments"));

    // Quick reply menu
    const menu = document.createElement("div");
    menu.className = "pmfa-qr";
    this.#menu = host.decorate(menu, "quickReplyMenu");
    const menuTitle = span("pmfa-qr-title", host.text("composer.quickReplies"));
    menuTitle.setAttribute("aria-hidden", "true");
    menuTitle.style.display = "block";
    this.#menuList = document.createElement("ul");
    this.#menuList.id = this.#menuId;
    this.#menuList.setAttribute("role", "listbox");
    this.#menuList.setAttribute(
      "aria-label",
      host.text("composer.quickReplies"),
    );
    this.#menu.append(menuTitle, this.#menuList);

    // Toolbar
    const row = element("div") as HTMLDivElement;
    row.className = "pmfa-composer-row";
    this.#row = host.decorate(row, "composerToolbar");
    this.#emojiButton = host.decorate(
      iconButton(host.text("composer.emoji"), "smiley", "emoji", () =>
        this.#toggleEmoji(),
      ),
      "emojiButton",
    );
    this.#emojiButton.classList.add("pmfa-emoji-button");
    this.#emojiButton.setAttribute("aria-haspopup", "dialog");
    this.#emojiButton.setAttribute("aria-expanded", "false");
    const attach = host.decorate(
      iconButton(host.text("composer.attach"), "attach", "attach", () =>
        this.#file.click(),
      ),
      "composerAttach",
    );
    this.#file = document.createElement("input");
    this.#file.type = "file";
    this.#file.className = "pmfa-sr";
    this.#file.tabIndex = -1;
    this.#file.setAttribute("aria-hidden", "true");
    this.#file.addEventListener("change", () => {
      this.#addFiles(this.#file.files);
      this.#file.value = "";
    });

    const input = document.createElement("textarea");
    input.className = "pmfa-input";
    input.setAttribute("part", "input");
    this.input = host.decorate(input, "composerInput");
    this.input.rows = 1;
    this.input.setAttribute("aria-label", host.text("composer.label"));
    const trackCaret = () => {
      if (this.#caret === this.input.selectionStart) return;
      this.#caret = this.input.selectionStart;
      this.#syncMenu();
    };
    this.input.addEventListener("input", () => {
      this.#rejection = undefined;
      this.#caret = this.input.selectionStart;
      this.options.controller()?.setText(this.input.value);
      this.#sync();
      this.#syncMenu();
      this.#grow();
    });
    this.input.addEventListener("select", trackCaret);
    this.input.addEventListener("keyup", trackCaret);
    this.input.addEventListener("click", trackCaret);
    this.input.addEventListener("keydown", (event) => this.#onKey(event));
    this.input.addEventListener("paste", (event) => {
      const files = event.clipboardData?.files;
      if (files === undefined || files.length === 0) return;
      event.preventDefault();
      this.#addFiles(files);
    });

    this.#send = host.decorate(
      iconButton(
        host.text("composer.send"),
        "sendArrow",
        "primary send",
        () => undefined,
        "pmfa-btn pmfa-btn-primary pmfa-btn-icon pmfa-send",
      ),
      "composerSend",
    );
    this.#send.type = "submit";
    this.#mic = host.decorate(
      iconButton(
        host.text("composer.voiceNote"),
        "mic",
        "voice",
        () => this.#startRecording(),
        "pmfa-btn pmfa-btn-ghost pmfa-btn-icon pmfa-voice",
      ),
      "voiceButton",
    );
    this.#row.append(
      actionSlot("start-actions", "pmfa-composer-start"),
      this.#emojiButton,
      attach,
      this.#file,
      this.input,
      actionSlot("end-actions", "pmfa-composer-end"),
      this.#send,
    );

    // Recording bar
    const recording = document.createElement("div");
    recording.className = "pmfa-recording";
    this.#recording = host.decorate(recording, "recordingBar");
    this.#recording.setAttribute("role", "group");
    this.#recording.setAttribute("aria-label", host.text("composer.recording"));
    const cancel = iconButton(
      host.text("composer.cancelRecording"),
      "trash",
      "cancel-recording",
      () => this.#cancelRecording(),
      "pmfa-btn pmfa-btn-ghost pmfa-btn-icon pmfa-rec-cancel",
    );
    const status = span("pmfa-recording-status");
    const dot = span("pmfa-rec-dot");
    dot.setAttribute("aria-hidden", "true");
    this.#recTime = span("pmfa-rec-time", "00:00");
    this.#recTime.setAttribute("role", "timer");
    this.#recMeter = span("pmfa-rec-level");
    this.#recMeter.setAttribute("role", "meter");
    this.#recMeter.setAttribute(
      "aria-label",
      host.text("composer.recordingLevel"),
    );
    this.#recMeter.setAttribute("aria-valuemin", "0");
    this.#recMeter.setAttribute("aria-valuemax", "100");
    for (let index = 0; index < LEVEL_BAR_COUNT; index += 1) {
      const bar = document.createElement("span");
      this.#recBars.push(bar);
      this.#recMeter.append(bar);
    }
    status.append(dot, this.#recTime, this.#recMeter);
    this.#recStop = iconButton(
      host.text("composer.sendVoiceNote"),
      "sendArrow",
      "stop-recording",
      () => this.#stopRecording(),
      "pmfa-btn pmfa-btn-primary pmfa-btn-icon pmfa-send",
    );
    this.#recording.append(cancel, status, this.#recStop);

    const error = element("p", "error") as HTMLParagraphElement;
    error.className = "pmfa-error";
    this.#error = host.decorate(error, "error");
    this.#error.setAttribute("role", "alert");

    this.form.append(hint, this.#live, this.#row);
    this.form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.#submit();
    });
    const hasFiles = (event: DragEvent) =>
      [...(event.dataTransfer?.types ?? [])].includes("Files");
    this.form.addEventListener("dragenter", (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      this.form.toggleAttribute("data-dragging", true);
    });
    this.form.addEventListener("dragover", (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    });
    this.form.addEventListener("dragleave", (event) => {
      if (!this.form.contains(event.relatedTarget as Node | null))
        this.form.toggleAttribute("data-dragging", false);
    });
    this.form.addEventListener("drop", (event) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      this.form.toggleAttribute("data-dragging", false);
      this.#addFiles(event.dataTransfer?.files);
    });
  }

  update(snapshot: MessageComposerSnapshot | undefined): void {
    if (rejectionCleared(this.#snapshot, snapshot)) this.#rejection = undefined;
    this.#snapshot = snapshot;
    const { host } = this;
    const accept = this.options.accept();
    if (accept === undefined) this.#file.removeAttribute("accept");
    else if (this.#file.accept !== accept) this.#file.accept = accept;
    this.#file.multiple = this.options.multiple();
    const placeholder =
      this.options.placeholder() ?? host.text("composer.placeholder");
    if (this.input.placeholder !== placeholder)
      this.input.placeholder = placeholder;
    const maxRows = String(Math.max(1, this.options.maxRows()));
    if (
      this.input.style.getPropertyValue("--pmfa-composer-max-rows") !== maxRows
    )
      this.input.style.setProperty("--pmfa-composer-max-rows", maxRows);
    this.#emojiButton.hidden = !this.options.emoji();
    if (this.#emojiButton.hidden) this.#closeEmoji(false);

    const text = snapshot?.text ?? "";
    if (this.input.value !== text) {
      this.input.value = text;
      if (this.#pendingCaret !== undefined) {
        this.input.setSelectionRange(this.#pendingCaret, this.#pendingCaret);
        this.#caret = this.#pendingCaret;
      } else this.#caret = Math.min(this.#caret, text.length);
      this.#grow();
    }
    this.#pendingCaret = undefined;

    // Reply banner
    const replyTo = snapshot?.replyTo;
    if (replyTo === undefined) this.#banner.remove();
    else {
      const replied = this.options.messages()?.find(({ id }) => id === replyTo);
      setText(
        this.#bannerName,
        host.text("composer.replyingTo", { name: authorName(host, replied) }),
      );
      setText(
        this.#bannerText,
        replied === undefined ? "" : snippet(host, replied),
      );
      this.#bannerText.hidden = replied === undefined;
      if (!this.#banner.isConnected)
        this.form.insertBefore(
          this.#banner,
          this.#chips.isConnected ? this.#chips : this.#row,
        );
    }

    // Attachment chips, keyed by id
    const attachments = snapshot?.attachments ?? [];
    const chips = attachments.map((attachment) => this.#chip(attachment));
    for (const id of this.#chipNodes.keys())
      if (!attachments.some((attachment) => attachment.id === id))
        this.#chipNodes.delete(id);
    reconcile(this.#chips, chips);
    if (attachments.length === 0) this.#chips.remove();
    else if (!this.#chips.isConnected)
      this.form.insertBefore(
        this.#chips,
        this.#recording.isConnected ? this.#recording : this.#row,
      );

    this.#renderError();
    this.#sync();
    this.#syncMenu();
  }

  focus(): void {
    this.input.focus({ preventScroll: true });
  }

  /** Stop recording, close popovers, and release the microphone. */
  dispose(): void {
    this.#closeEmoji(false);
    this.#recorderUnsubscribe?.();
    this.#recorderUnsubscribe = undefined;
    this.#recorder?.dispose();
    this.#recorder = undefined;
    this.#syncRecording();
  }

  #renderError(): void {
    const recorder = this.#recorder?.getSnapshot();
    const voiceError =
      recorder?.status === "error" && recorder.error !== undefined
        ? this.host.text(VOICE_ERROR_KEYS[recorder.error])
        : undefined;
    const error = this.#snapshot?.error ?? this.#rejection ?? voiceError;
    if (error === undefined) this.#error.remove();
    else {
      setText(this.#error, error);
      if (!this.#error.isConnected) this.form.append(this.#error);
    }
  }

  #canSend(): boolean {
    const snapshot = this.#snapshot;
    return (
      snapshot?.sending !== true &&
      (this.input.value.trim() !== "" ||
        (snapshot?.attachments ?? []).some(({ status }) => status === "ready"))
    );
  }

  #voiceEnabled(): boolean {
    return this.options.voiceNotes() && VoiceNoteRecorder.isSupported();
  }

  #sync(): void {
    const snapshot = this.#snapshot;
    const sending = snapshot?.sending === true;
    this.#send.disabled = !this.#canSend();
    const label = this.host.text(
      sending ? "composer.sending" : "composer.send",
    );
    if (this.#send.getAttribute("aria-label") !== label)
      this.#send.setAttribute("aria-label", label);
    const showMic =
      this.#voiceEnabled() &&
      !sending &&
      this.input.value.trim() === "" &&
      !(snapshot?.attachments ?? []).some(({ status }) => status === "ready");
    const [shown, hidden] = showMic
      ? [this.#mic, this.#send]
      : [this.#send, this.#mic];
    if (!shown.isConnected) {
      const refocus = hidden.matches(":focus");
      hidden.replaceWith(shown);
      if (refocus) shown.focus();
    }
  }

  #grow(): void {
    if (supportsFieldSizing()) return;
    this.input.style.height = "auto";
    this.input.style.height = `${this.input.scrollHeight + 2}px`;
  }

  #submit(): void {
    if (!this.#canSend()) return;
    void this.options
      .controller()
      ?.submit()
      .catch(() => undefined);
  }

  #addFiles(files: FileList | null | undefined): void {
    const controller = this.options.controller();
    if (files === null || files === undefined || controller === undefined)
      return;
    this.#setRejection(undefined);
    for (const file of [...files])
      controller
        .addAttachment(attachmentFromFile(file))
        .catch((cause: unknown) =>
          this.#setRejection(
            cause instanceof Error ? cause.message : String(cause),
          ),
        );
  }

  #setRejection(message: string | undefined): void {
    if (this.#rejection === message) return;
    this.#rejection = message;
    this.update(this.#snapshot);
  }

  #replaceText(edit: TextEdit): void {
    const controller = this.options.controller();
    if (controller === undefined) return;
    this.#rejection = undefined;
    this.#pendingCaret = edit.caret;
    controller.setText(edit.text);
    // A controller that did not publish leaves the field as it was.
    if (this.#pendingCaret !== undefined) {
      this.#pendingCaret = undefined;
      this.input.value = edit.text;
      this.input.setSelectionRange(edit.caret, edit.caret);
      this.#caret = edit.caret;
      this.#sync();
      this.#syncMenu();
    }
  }

  // Emoji

  #toggleEmoji(): void {
    if (this.#picker !== undefined) this.#closeEmoji(true);
    else this.#openEmoji();
  }

  #openEmoji(): void {
    if (this.#picker !== undefined || !this.options.emoji()) return;
    const picker = new EmojiPickerView(
      this.host,
      this.#emojiButton,
      (emoji) => {
        const value = this.input.value;
        const start = this.input.selectionStart ?? value.length;
        const end = this.input.selectionEnd ?? start;
        this.#replaceText(insertText(value, emoji, start, end));
      },
      (restoreFocus) => this.#closeEmoji(restoreFocus),
    );
    this.#picker = picker;
    this.#emojiButton.setAttribute("aria-expanded", "true");
    this.form.insertBefore(
      picker.node,
      this.#error.isConnected ? this.#error : null,
    );
    picker.attach();
  }

  #closeEmoji(restoreFocus: boolean): void {
    const picker = this.#picker;
    if (picker === undefined) return;
    this.#picker = undefined;
    picker.dispose();
    this.#emojiButton.setAttribute("aria-expanded", "false");
    if (restoreFocus) this.#emojiButton.focus();
  }

  // Quick replies

  #syncMenu(): void {
    const options = this.options.quickReplies();
    const enabled = options.length > 0;
    const text = this.input.value;
    const match =
      enabled && !this.#isRecording()
        ? findQuickReplyQuery(text, Math.min(this.#caret, text.length))
        : undefined;
    const filtered =
      match === undefined ? [] : filterQuickReplies(options, match.query);
    const open = filtered.length > 0 && this.#dismissedText !== text;
    if (match?.query !== this.#menuQuery) {
      this.#menuQuery = match?.query;
      this.#activeOption = 0;
    }
    this.#activeOption = Math.min(
      this.#activeOption,
      Math.max(0, filtered.length - 1),
    );
    if (enabled) {
      this.input.setAttribute("role", "combobox");
      this.input.setAttribute("aria-autocomplete", "list");
      this.input.setAttribute("aria-controls", this.#menuId);
      this.input.setAttribute("aria-expanded", String(open));
    } else
      for (const name of [
        "role",
        "aria-autocomplete",
        "aria-controls",
        "aria-expanded",
      ])
        this.input.removeAttribute(name);
    if (!open) {
      this.#menuOptions = [];
      this.input.removeAttribute("aria-activedescendant");
      this.#menu.remove();
      return;
    }
    if (
      filtered.length !== this.#menuOptions.length ||
      filtered.some((option, index) => option !== this.#menuOptions[index])
    ) {
      this.#menuOptions = filtered;
      this.#menuList.replaceChildren(
        ...filtered.map((option, index) => {
          const item = document.createElement("li");
          item.id = `${this.#menuId}-${index}`;
          item.className = "pmfa-qr-option";
          item.setAttribute("role", "option");
          const head = span("pmfa-qr-head");
          head.append(span("pmfa-qr-shortcut", quickReplyLabel(option)));
          if (option.description !== undefined)
            head.append(span("pmfa-qr-description", option.description));
          item.append(head, span("pmfa-qr-text", option.text));
          item.addEventListener("mousedown", (event) => event.preventDefault());
          item.addEventListener("mousemove", () => {
            if (this.#activeOption === index) return;
            this.#activeOption = index;
            this.#syncMenu();
          });
          item.addEventListener("click", () => this.#choose(option));
          return item;
        }),
      );
    }
    [...this.#menuList.children].forEach((item, index) =>
      item.setAttribute("aria-selected", String(index === this.#activeOption)),
    );
    this.input.setAttribute(
      "aria-activedescendant",
      `${this.#menuId}-${this.#activeOption}`,
    );
    if (!this.#menu.isConnected)
      this.form.insertBefore(this.#menu, this.form.children[2] ?? null);
  }

  #choose(option: QuickReplyOption): void {
    const text = this.input.value;
    const match = findQuickReplyQuery(text, Math.min(this.#caret, text.length));
    if (match === undefined) return;
    this.#replaceText(applyQuickReply(text, match, option));
    this.options.onQuickReply(option);
    this.input.focus();
  }

  #onKey(event: KeyboardEvent): void {
    if (event.isComposing) return;
    const options = this.#menuOptions;
    if (options.length > 0 && this.#menu.isConnected) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        this.#activeOption =
          (this.#activeOption + step + options.length) % options.length;
        this.#syncMenu();
        return;
      }
      if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
        const option = options[this.#activeOption];
        if (option === undefined) return;
        event.preventDefault();
        this.#choose(option);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.#dismissedText = this.input.value;
        this.#syncMenu();
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      this.#submit();
    }
  }

  // Voice notes

  #isRecording(): boolean {
    const status = this.#recorder?.getSnapshot().status;
    return status === "recording" || status === "stopping";
  }

  #announce(message: string): void {
    this.#live.textContent = message;
  }

  #startRecording(): void {
    let recorder = this.#recorder;
    if (recorder === undefined) {
      recorder = new VoiceNoteRecorder();
      this.#recorder = recorder;
      this.#recorderUnsubscribe = recorder.subscribe(() =>
        this.#syncRecording(),
      );
    }
    this.#closeEmoji(false);
    const current = recorder;
    void current.start().then(() => {
      if (current.getSnapshot().status === "recording")
        this.#announce(this.host.text("composer.recording"));
    });
  }

  #cancelRecording(): void {
    this.#recorder?.cancel();
    this.#announce(this.host.text("composer.recordingCancelled"));
    this.#mic.focus();
  }

  #stopRecording(): void {
    const recorder = this.#recorder;
    if (recorder === undefined) return;
    void recorder.stop().then(async (file) => {
      this.#announce(this.host.text("composer.recordingStopped"));
      this.input.focus({ preventScroll: true });
      const controller = this.options.controller();
      if (file === undefined || controller === undefined) return;
      const attachment = localAttachmentFromFile(file);
      try {
        await controller.addAttachment(attachment);
      } catch (cause) {
        this.#setRejection(
          cause instanceof Error ? cause.message : String(cause),
        );
        return;
      }
      if (!this.options.voiceNoteAutoSend()) return;
      const after = controller.getSnapshot();
      if (
        after.sending ||
        !after.attachments.some(({ id }) => id === attachment.id) ||
        after.attachments.some(({ status }) => status !== "ready")
      )
        return;
      await controller.submit().catch(() => undefined);
    });
  }

  #syncRecording(): void {
    const snapshot = this.#recorder?.getSnapshot();
    const active =
      snapshot?.status === "recording" || snapshot?.status === "stopping";
    this.#mic.disabled = snapshot?.status === "requesting";
    this.#mic.toggleAttribute("aria-busy", snapshot?.status === "requesting");
    this.form.toggleAttribute("data-recording", active);
    if (!active || snapshot === undefined) {
      this.#levels = [];
      if (this.#recording.isConnected) {
        this.#recording.remove();
        this.#row.hidden = false;
      }
      this.#renderError();
      return;
    }
    const autoSend = this.options.voiceNoteAutoSend();
    const stopLabel = this.host.text(
      autoSend ? "composer.sendVoiceNote" : "composer.stopRecording",
    );
    if (this.#recStop.getAttribute("aria-label") !== stopLabel) {
      this.#recStop.setAttribute("aria-label", stopLabel);
      this.#recStop.title = stopLabel;
      this.#recStop.replaceChildren(icon(autoSend ? "sendArrow" : "sent"));
    }
    this.#recStop.disabled = snapshot.status !== "recording";
    setText(this.#recTime, formatElapsed(snapshot.elapsed));
    this.#recMeter.setAttribute(
      "aria-valuenow",
      String(Math.round(snapshot.level * 100)),
    );
    this.#levels = [...this.#levels, snapshot.level].slice(-LEVEL_BAR_COUNT);
    const offset = LEVEL_BAR_COUNT - this.#levels.length;
    this.#recBars.forEach((bar, index) => {
      const level = index < offset ? 0 : (this.#levels[index - offset] ?? 0);
      bar.style.setProperty("--pmfa-level", String(Math.max(0.12, level)));
    });
    if (!this.#recording.isConnected) {
      const hadFocus = this.#row.contains(
        (this.form.getRootNode() as Document | ShadowRoot).activeElement,
      );
      this.#closeEmoji(false);
      this.form.insertBefore(this.#recording, this.#row);
      this.#row.hidden = true;
      this.#menu.remove();
      if (hadFocus) this.#recStop.focus();
    }
    this.#renderError();
  }

  #chip(attachment: ComposerAttachment): HTMLLIElement {
    const { host } = this;
    let chip = this.#chipNodes.get(attachment.id);
    if (chip === undefined) {
      const node = host.decorate(
        document.createElement("li"),
        "attachmentChip",
      );
      node.dataset.attachmentId = attachment.id;
      const body = span("pmfa-chip-body");
      const progress = span("pmfa-progress");
      progress.setAttribute("role", "progressbar");
      progress.setAttribute("aria-valuemin", "0");
      progress.setAttribute("aria-valuemax", "100");
      progress.setAttribute(
        "aria-label",
        host.text("composer.uploading", { name: attachment.name }),
      );
      const fill = document.createElement("span");
      progress.append(fill);
      const status = span("pmfa-chip-status");
      status.setAttribute("aria-live", "polite");
      body.append(span("pmfa-chip-name", attachment.name), progress, status);
      const glyph = { current: icon("file"), name: "file" as ChatIconName };
      node.append(
        glyph.current,
        body,
        iconButton(
          host.text("composer.removeNamedAttachment", {
            name: attachment.name,
          }),
          "close",
          "remove",
          () => this.options.controller()?.cancelAttachment(attachment.id),
        ),
      );
      chip = { node, body, progress, fill, status, glyph };
      this.#chipNodes.set(attachment.id, chip);
    }
    chip.node.classList.remove(
      "pmfa-chip-uploading",
      "pmfa-chip-ready",
      "pmfa-chip-failed",
    );
    chip.node.classList.add("pmfa-chip", `pmfa-chip-${attachment.status}`);
    const glyphName: ChatIconName =
      attachment.status === "failed" ? "failed" : "file";
    if (chip.glyph.name !== glyphName) {
      const next = icon(glyphName);
      chip.glyph.current.replaceWith(next);
      chip.glyph.current = next;
      chip.glyph.name = glyphName;
    }
    const percent = String(Math.round(attachment.progress * 100));
    if (attachment.status === "uploading") {
      chip.progress.setAttribute("aria-valuenow", percent);
      chip.fill.style.width = `${percent}%`;
      if (!chip.progress.isConnected)
        chip.body.insertBefore(chip.progress, chip.status);
    } else chip.progress.remove();
    if (attachment.status === "failed") {
      chip.status.className = "pmfa-chip-status";
      setText(
        chip.status,
        attachment.error ?? host.text("composer.uploadFailed"),
      );
    } else if (attachment.status === "uploading") {
      chip.status.className = "pmfa-chip-status pmfa-sr";
      setText(
        chip.status,
        host.text("composer.uploading", { name: attachment.name }),
      );
    } else {
      chip.status.className = "pmfa-chip-status";
      setText(chip.status, formatFileSize(attachment.size, host.localeCode()));
    }
    return chip.node;
  }
}

/** Attributes both composing elements read. */
const COMPOSER_ATTRIBUTES = [
  "accept",
  "multiple",
  "emoji",
  "voice-notes",
  "voice-note-auto-send",
  "placeholder",
  "max-rows",
] as const;

// ── Elements ──────────────────────────────────────────────────────────

/** Shared plumbing that hands the protected helpers to the views. */
abstract class ChatElement<T extends object> extends PolymorfaElement<T> {
  #host: ViewHost | undefined;
  #hostGeneration = -1;
  /** @internal Hands the protected helpers to the shared views. */
  exposeHost(): ViewHost {
    if (this.#host === undefined || this.#hostGeneration !== this.generation) {
      this.#hostGeneration = this.generation;
      this.#host = {
        text: (key, values) => this.text(key, values),
        localeCode: () => this.locale().code,
        rootClass: (names) => this.rootClass(names),
        decorate: (node, slot) => this.decorate(node, slot),
      };
    }
    return this.#host;
  }
  /** Whether a view built for an earlier configuration must be rebuilt. */
  protected stale(generation: number | undefined): boolean {
    return generation !== this.generation;
  }
}

/** Handler a host can set to receive Reply clicks; also enables the action. */
export type ReplyHandler = (message: ConversationMessage) => void;

export class PolymorfaMessageListElement extends ChatElement<ConversationSnapshot> {
  static readonly observedAttributes = ["replyable"];
  #view: MessageListView | undefined;
  #viewGeneration: number | undefined;
  #onReply: ReplyHandler | undefined;

  /** Called for each Reply click, next to the `pmfa-reply` event. */
  get onReply(): ReplyHandler | undefined {
    return this.#onReply;
  }
  set onReply(handler: ReplyHandler | undefined) {
    this.#onReply = handler;
    this.render();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.render();
  }

  protected renderContent(
    snapshot: ConversationSnapshot | undefined,
  ): readonly Node[] {
    if (this.#view === undefined || this.stale(this.#viewGeneration)) {
      this.#viewGeneration = this.generation;
      this.#view = new MessageListView(
        this.exposeHost(),
        () => {
          const controller =
            this.configuredController<ConversationController>();
          return {
            loadMore: () => void controller?.loadMore(),
            retry:
              typeof controller?.retry === "function"
                ? (clientId) => controller.retry(clientId)
                : undefined,
            reply:
              this.#onReply !== undefined || this.hasAttribute("replyable")
                ? (message) => {
                    this.#onReply?.(message);
                    this.dispatchEvent(
                      new CustomEvent("pmfa-reply", {
                        detail: message,
                        bubbles: true,
                        composed: true,
                      }),
                    );
                  }
                : undefined,
          };
        },
        this.rootClass("pmfa-list"),
      );
      this.#view.scroller.style.height = "100%";
    }
    this.#view.update(snapshot);
    return [this.#view.scroller];
  }
}

export class PolymorfaComposeBoxElement extends ChatElement<MessageComposerSnapshot> {
  static readonly observedAttributes = [...COMPOSER_ATTRIBUTES];
  #view: ComposerView | undefined;
  #quickReplies: readonly QuickReplyOption[] = [];
  #viewGeneration: number | undefined;
  #conversation: ConversationController | undefined;
  #conversationUnsubscribe: (() => void) | undefined;
  #messages: readonly ConversationMessage[] | undefined;

  /** Resolves the reply banner's quoted message, and follows its updates. */
  get conversation(): ConversationController | undefined {
    return this.#conversation;
  }
  set conversation(value: ConversationController | undefined) {
    if (value === this.#conversation) return;
    this.#unbindConversation();
    this.#conversation = value;
    if (this.isConnected) this.#bindConversation();
    this.render();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#bindConversation();
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#unbindConversation();
    this.#view?.dispose();
  }

  #bindConversation(): void {
    const conversation = this.#conversation;
    if (conversation === undefined || this.#conversationUnsubscribe) return;
    try {
      this.#conversationUnsubscribe = conversation.subscribe(() =>
        this.render(),
      );
    } catch {
      // A disposed conversation has nothing further to publish.
    }
  }

  #unbindConversation(): void {
    this.#conversationUnsubscribe?.();
    this.#conversationUnsubscribe = undefined;
  }
  /**
   * Options for the "/" quick reply menu. Choosing one dispatches a
   * composed `pmfa-quick-reply` event whose `detail` is the option.
   */
  get quickReplies(): readonly QuickReplyOption[] {
    return this.#quickReplies;
  }
  set quickReplies(value: readonly QuickReplyOption[] | undefined) {
    this.#quickReplies = value ?? [];
    this.render();
  }
  /** Resolves the reply banner's quoted message without a controller. */
  get messages(): readonly ConversationMessage[] | undefined {
    return this.#messages;
  }
  set messages(value: readonly ConversationMessage[] | undefined) {
    this.#messages = value;
    this.render();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.render();
  }

  override focus(options?: FocusOptions): void {
    if (this.#view === undefined) super.focus(options);
    else this.#view.input.focus(options);
  }

  protected renderContent(
    snapshot: MessageComposerSnapshot | undefined,
  ): readonly Node[] {
    if (this.#view === undefined || this.stale(this.#viewGeneration)) {
      this.#viewGeneration = this.generation;
      this.#view?.dispose();
      this.#view = new ComposerView(
        this.exposeHost(),
        composerOptions(
          this,
          {
            controller: () =>
              this.configuredController<MessageComposerController>(),
            messages: () =>
              this.#messages ?? this.#conversation?.getSnapshot().messages,
          },
          () => this.#quickReplies,
        ),
      );
    }
    this.#view.update(snapshot);
    return [this.#view.form];
  }
}

function composerOptions(
  node: HTMLElement,
  base: Pick<ComposerOptions, "controller" | "messages">,
  quickReplies: () => readonly QuickReplyOption[],
): ComposerOptions {
  return {
    ...base,
    accept: () => node.getAttribute("accept") ?? undefined,
    multiple: () => multipleAttribute(node),
    emoji: () => flagAttribute(node, "emoji", true),
    voiceNotes: () => flagAttribute(node, "voice-notes", true),
    voiceNoteAutoSend: () => flagAttribute(node, "voice-note-auto-send", true),
    placeholder: () => node.getAttribute("placeholder") ?? undefined,
    maxRows: () => {
      const value = Number.parseInt(node.getAttribute("max-rows") ?? "", 10);
      return Number.isFinite(value) && value > 0 ? value : 8;
    },
    quickReplies,
    onQuickReply: (option) =>
      node.dispatchEvent(
        new CustomEvent<QuickReplyOption>("pmfa-quick-reply", {
          detail: option,
          bubbles: true,
          composed: true,
        }),
      ),
  };
}

function multipleAttribute(node: HTMLElement): boolean {
  const value = node.getAttribute("multiple");
  return value === null || value !== "false";
}

interface DrawerParts {
  readonly generation: number;
  readonly panel: HTMLElement;
  readonly heading: HTMLElement;
  readonly close: HTMLButtonElement;
  readonly list: MessageListView;
  readonly error: HTMLElement;
  readonly footer: HTMLElement;
  readonly slot: HTMLSlotElement;
}

export class PolymorfaChatDrawerElement extends ChatElement<ConversationSnapshot> {
  static readonly observedAttributes = [
    "heading",
    ...COMPOSER_ATTRIBUTES,
    "replyable",
    "autofocus",
  ];
  #quickReplies: readonly QuickReplyOption[] = [];

  /** Quick replies for the built-in composer. */
  get quickReplies(): readonly QuickReplyOption[] {
    return this.#quickReplies;
  }
  set quickReplies(value: readonly QuickReplyOption[] | undefined) {
    this.#quickReplies = value ?? [];
    this.render();
  }
  #open = true;
  #opener: HTMLElement | undefined;
  #previous: Element | null = null;
  #parts: DrawerParts | undefined;
  #composer: MessageComposerController | undefined;
  #composerView: ComposerView | undefined;
  #composerGeneration: number | undefined;
  #composerUnsubscribe: (() => void) | undefined;
  #onReply: ReplyHandler | undefined;
  #titleId = `pmfa-drawer-title-${Math.random().toString(36).slice(2)}`;
  #onKey = (event: KeyboardEvent) => {
    if (
      !this.#open ||
      event.key !== "Escape" ||
      event.defaultPrevented ||
      event.isComposing
    )
      return;
    event.preventDefault();
    this.#close();
  };

  set open(value: boolean) {
    const wasOpen = this.#open;
    // Focus moves only when a mounted drawer opens.
    const opening = value && !wasOpen && this.isConnected;
    this.#open = value;
    if (opening) this.#previous = document.activeElement;
    this.render();
    if (opening) this.#focusFirst();
    if (!value && wasOpen) this.#restoreFocus();
  }
  get open(): boolean {
    return this.#open;
  }
  set opener(value: HTMLElement | undefined) {
    this.#opener = value;
  }

  /** Renders a built-in composer and wires message Reply to it. */
  get composerController(): MessageComposerController | undefined {
    return this.#composer;
  }
  set composerController(value: MessageComposerController | undefined) {
    if (value === this.#composer) return;
    this.#composerUnsubscribe?.();
    this.#composerUnsubscribe = undefined;
    this.#composer = value;
    if (this.isConnected) this.#bindComposer();
    this.render();
  }

  /** Called for each Reply click, next to the `pmfa-reply` event. */
  get onReply(): ReplyHandler | undefined {
    return this.#onReply;
  }
  set onReply(handler: ReplyHandler | undefined) {
    this.#onReply = handler;
    this.render();
  }

  attributeChangedCallback(): void {
    if (this.isConnected) this.render();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#bindComposer();
    // Listening on the host only sees Escape pressed inside this drawer.
    this.addEventListener("keydown", this.#onKey);
    // Opening by default must not pull focus away from the page; opt in with
    // the `autofocus` attribute.
    if (this.#open && this.hasAttribute("autofocus")) {
      this.#previous = document.activeElement;
      this.#focusFirst();
    }
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#composerUnsubscribe?.();
    this.#composerUnsubscribe = undefined;
    this.removeEventListener("keydown", this.#onKey);
    this.#composerView?.dispose();
  }

  #bindComposer(): void {
    if (this.#composer === undefined || this.#composerUnsubscribe !== undefined)
      return;
    const composer = this.#composer;
    this.#composerUnsubscribe = composer.subscribe(() =>
      this.#composerView?.update(composer.getSnapshot()),
    );
  }

  #close(): void {
    this.open = false;
    this.dispatchEvent(
      new CustomEvent("pmfa-close", { bubbles: true, composed: true }),
    );
  }

  #focusFirst(): void {
    queueMicrotask(() => {
      if (!this.#open || !this.isConnected) return;
      const target =
        this.#composerView?.input ??
        (this.#parts?.close.isConnected ? this.#parts.close : undefined) ??
        this.#parts?.panel;
      target?.focus({ preventScroll: true });
    });
  }

  #restoreFocus(): void {
    const target = this.#opener ?? this.#previous;
    this.#previous = null;
    if (target instanceof HTMLElement && target.isConnected)
      target.focus({ preventScroll: true });
  }

  #partsFor(): DrawerParts {
    if (this.#parts !== undefined && !this.stale(this.#parts.generation))
      return this.#parts;
    const host = this.exposeHost();
    const panel = this.decorate(element("aside", "panel drawer"), "drawer");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "false");
    panel.setAttribute("aria-labelledby", this.#titleId);
    panel.tabIndex = -1;
    const header = this.decorate(element("header", "header"), "drawerHeader");
    header.classList.add("pmfa-drawer-header");
    const heading = this.decorate(element("h2", "title"), "drawerTitle");
    heading.classList.add("pmfa-drawer-title");
    heading.id = this.#titleId;
    const close = this.decorate(
      iconButton(this.text("common.close"), "close", "close", () =>
        this.#close(),
      ),
      "drawerClose",
    );
    close.removeAttribute("title");
    header.append(heading, close);
    const list = new MessageListView(
      host,
      () => {
        const controller = this.configuredController<ConversationController>();
        const composer = this.#composer;
        const replyable =
          composer !== undefined ||
          this.#onReply !== undefined ||
          this.hasAttribute("replyable");
        return {
          loadMore: () => void controller?.loadMore(),
          retry:
            typeof controller?.retry === "function"
              ? (clientId) => controller.retry(clientId)
              : undefined,
          reply: replyable
            ? (message) => {
                this.#onReply?.(message);
                this.dispatchEvent(
                  new CustomEvent("pmfa-reply", {
                    detail: message,
                    bubbles: true,
                    composed: true,
                  }),
                );
                if (composer !== undefined) {
                  composer.setReplyTo(message.id);
                  this.#composerView?.focus();
                }
              }
            : undefined,
        };
      },
      "pmfa-list",
    );
    const error = element("p", "error");
    error.className = "pmfa-error";
    this.decorate(error, "error");
    error.setAttribute("role", "alert");
    const footer = element("div", "footer");
    footer.className = "pmfa-drawer-footer";
    const slot = document.createElement("slot");
    footer.append(slot);
    panel.append(header, list.scroller, footer);
    this.#parts = {
      generation: this.generation,
      panel,
      heading,
      close,
      list,
      error,
      footer,
      slot,
    };
    return this.#parts;
  }

  protected renderContent(
    snapshot: ConversationSnapshot | undefined,
  ): readonly Node[] {
    if (!this.#open) return [];
    const parts = this.#partsFor();
    const { panel } = parts;
    const className = this.rootClass("pmfa-drawer");
    const extra = this.appearance().elements.drawer?.className;
    const full = extra === undefined ? className : `${className} ${extra}`;
    if (panel.className !== full) panel.className = full;
    setText(
      parts.heading,
      this.getAttribute("heading") ?? this.text("chat.title"),
    );
    parts.list.update(snapshot);

    if (snapshot?.status === "error") {
      setText(parts.error, snapshot.error ?? this.text("chat.loadError"));
      if (!parts.error.isConnected)
        panel.insertBefore(parts.error, parts.footer);
    } else parts.error.remove();

    const composer = this.#composer;
    if (composer === undefined) {
      this.#composerView?.form.remove();
      this.#composerView?.dispose();
      this.#composerView = undefined;
    } else {
      if (
        this.#composerView === undefined ||
        this.stale(this.#composerGeneration)
      ) {
        this.#composerView?.form.remove();
        this.#composerView?.dispose();
        this.#composerGeneration = this.generation;
        this.#composerView = new ComposerView(
          this.exposeHost(),
          composerOptions(
            this,
            {
              controller: () => this.#composer,
              messages: () =>
                this.configuredController<ConversationController>()?.getSnapshot()
                  .messages,
            },
            () => this.#quickReplies,
          ),
        );
        // The internal composer carries the drawer's theme already.
        this.#composerView.form.classList.remove(
          "pmfa",
          "pmfa-dark",
          "pmfa-auto",
        );
      }
      this.#composerView.update(composer.getSnapshot());
      if (this.#composerView.form.parentNode !== parts.footer)
        parts.footer.insertBefore(this.#composerView.form, parts.slot);
    }
    return [panel];
  }
}

export function defineChatElements(
  registry: CustomElementRegistry = customElements,
): void {
  if (registry.get("pmfa-message-list") === undefined)
    registry.define("pmfa-message-list", PolymorfaMessageListElement);
  if (registry.get("pmfa-compose-box") === undefined)
    registry.define("pmfa-compose-box", PolymorfaComposeBoxElement);
  if (registry.get("pmfa-chat-drawer") === undefined)
    registry.define("pmfa-chat-drawer", PolymorfaChatDrawerElement);
}
