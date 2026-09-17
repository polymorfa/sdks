import type {
  ComposerAttachment,
  ConversationController,
  ConversationMessage,
  ConversationSnapshot,
  LocalAttachment,
  MessageAttachment,
  MessageComposerController,
  MessageComposerSnapshot,
} from "@polymorfa/browser";
import {
  CHAT_ICONS,
  formatDayLabel,
  formatFileSize,
  formatMessageTime,
  isImageAttachment,
  layoutMessages,
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
    const source = attachment.previewUrl ?? attachment.url;
    if (isImageAttachment(attachment) && source !== undefined) {
      const link = document.createElement("a");
      link.className = "pmfa-att pmfa-att-media";
      link.href = attachment.url ?? source;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      const image = document.createElement("img");
      image.src = source;
      image.alt = attachment.name;
      image.loading = "lazy";
      image.decoding = "async";
      link.append(image);
      return host.decorate(link, "attachment");
    }
    const node =
      attachment.url === undefined
        ? document.createElement("div")
        : document.createElement("a");
    node.className = "pmfa-att pmfa-att-file";
    if (node instanceof HTMLAnchorElement && attachment.url !== undefined) {
      node.href = attachment.url;
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

interface ComposerOptions {
  readonly controller: () => MessageComposerController | undefined;
  readonly accept: () => string | undefined;
  readonly multiple: () => boolean;
  readonly messages: () => readonly ConversationMessage[] | undefined;
}

interface Chip {
  readonly node: HTMLLIElement;
  readonly body: HTMLSpanElement;
  readonly progress: HTMLSpanElement;
  readonly fill: HTMLSpanElement;
  readonly status: HTMLSpanElement;
  readonly glyph: { current: SVGSVGElement; name: ChatIconName };
}

/** A composer whose textarea and buttons persist across renders. */
class ComposerView {
  readonly form: HTMLFormElement;
  readonly input: HTMLTextAreaElement;
  readonly #send: HTMLButtonElement;
  readonly #file: HTMLInputElement;
  readonly #chips: HTMLUListElement;
  readonly #banner: HTMLDivElement;
  readonly #bannerName: HTMLSpanElement;
  readonly #bannerText: HTMLSpanElement;
  readonly #error: HTMLParagraphElement;
  readonly #chipNodes = new Map<string, Chip>();
  #snapshot: MessageComposerSnapshot | undefined;
  #rejection: string | undefined;

  constructor(
    private readonly host: ViewHost,
    private readonly options: ComposerOptions,
  ) {
    const form = element("form", "composer") as HTMLFormElement;
    form.className = host.rootClass("pmfa-composer");
    this.form = host.decorate(form, "composer");
    const hint = span("pmfa-drop-hint", host.text("composer.dropHint"));
    hint.setAttribute("aria-hidden", "true");

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

    const row = element("div");
    row.className = "pmfa-composer-row";
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
    this.input.placeholder = host.text("composer.placeholder");
    this.input.setAttribute("aria-label", host.text("composer.label"));
    this.input.addEventListener("input", () => {
      this.options.controller()?.setText(this.input.value);
      this.#sync();
      this.#grow();
    });
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        this.#submit();
      }
    });
    this.input.addEventListener("paste", (event) => {
      const files = event.clipboardData?.files;
      if (files === undefined || files.length === 0) return;
      event.preventDefault();
      this.#addFiles(files);
    });

    this.#send = host.decorate(
      iconButton(
        host.text("composer.send"),
        "send",
        "primary send",
        () => undefined,
        "pmfa-btn pmfa-btn-primary pmfa-btn-icon pmfa-send",
      ),
      "composerSend",
    );
    this.#send.type = "submit";
    row.append(attach, this.#file, this.input, this.#send);

    const error = element("p", "error") as HTMLParagraphElement;
    error.className = "pmfa-error";
    this.#error = host.decorate(error, "error");
    this.#error.setAttribute("role", "alert");

    this.form.append(hint, row);
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
    this.#snapshot = snapshot;
    const { host } = this;
    const accept = this.options.accept();
    if (accept === undefined) this.#file.removeAttribute("accept");
    else if (this.#file.accept !== accept) this.#file.accept = accept;
    this.#file.multiple = this.options.multiple();

    const text = snapshot?.text ?? "";
    if (this.input.value !== text) {
      this.input.value = text;
      this.#grow();
    }

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
        this.form.insertBefore(this.#banner, this.form.children[1] ?? null);
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
        this.form.querySelector(".pmfa-composer-row"),
      );

    // Error
    const error = snapshot?.error ?? this.#rejection;
    if (error === undefined) this.#error.remove();
    else {
      setText(this.#error, error);
      if (!this.#error.isConnected) this.form.append(this.#error);
    }
    this.#sync();
  }

  focus(): void {
    this.input.focus({ preventScroll: true });
  }

  #canSend(): boolean {
    const snapshot = this.#snapshot;
    return (
      snapshot?.sending !== true &&
      (this.input.value.trim() !== "" ||
        (snapshot?.attachments ?? []).some(({ status }) => status === "ready"))
    );
  }

  #sync(): void {
    const sending = this.#snapshot?.sending === true;
    this.#send.disabled = !this.#canSend();
    const label = this.host.text(
      sending ? "composer.sending" : "composer.send",
    );
    if (this.#send.getAttribute("aria-label") !== label)
      this.#send.setAttribute("aria-label", label);
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
  static readonly observedAttributes = ["accept", "multiple"];
  #view: ComposerView | undefined;
  #viewGeneration: number | undefined;
  #conversation: ConversationController | undefined;
  #messages: readonly ConversationMessage[] | undefined;

  /** Resolves the reply banner's quoted message. */
  get conversation(): ConversationController | undefined {
    return this.#conversation;
  }
  set conversation(value: ConversationController | undefined) {
    this.#conversation = value;
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
      this.#view = new ComposerView(this.exposeHost(), {
        controller: () =>
          this.configuredController<MessageComposerController>(),
        accept: () => this.getAttribute("accept") ?? undefined,
        multiple: () => multipleAttribute(this),
        messages: () =>
          this.#messages ?? this.#conversation?.getSnapshot().messages,
      });
    }
    this.#view.update(snapshot);
    return [this.#view.form];
  }
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
    "accept",
    "multiple",
    "replyable",
  ];
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
    if (this.#open && event.key === "Escape" && !event.defaultPrevented)
      this.#close();
  };

  set open(value: boolean) {
    const opening = value && !this.#open;
    this.#open = value;
    if (opening) this.#previous = document.activeElement;
    this.render();
    if (opening) this.#focusFirst();
    if (!value) this.#restoreFocus();
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
    document.addEventListener("keydown", this.#onKey);
    if (this.#open) {
      this.#previous = document.activeElement;
      this.#focusFirst();
    }
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#composerUnsubscribe?.();
    this.#composerUnsubscribe = undefined;
    document.removeEventListener("keydown", this.#onKey);
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
      this.#composerView = undefined;
    } else {
      if (
        this.#composerView === undefined ||
        this.stale(this.#composerGeneration)
      ) {
        this.#composerView?.form.remove();
        this.#composerGeneration = this.generation;
        this.#composerView = new ComposerView(this.exposeHost(), {
          controller: () => this.#composer,
          accept: () => this.getAttribute("accept") ?? undefined,
          multiple: () => multipleAttribute(this),
          messages: () =>
            this.configuredController<ConversationController>()?.getSnapshot()
              .messages,
        });
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
