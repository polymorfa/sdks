import type {
  ConversationController,
  ConversationMessage,
  ConversationSnapshot,
  MessageComposerController,
  MessageComposerSnapshot,
} from "@polymorfa/browser";
import { PolymorfaElement, button, element, textElement } from "./base.js";

const CLOSE_ICON =
  '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>';

function renderMessages(
  snapshot: ConversationSnapshot | undefined,
  text: (
    key: "chat.loadMore" | "chat.empty" | "chat.failed" | "chat.sending",
  ) => string,
  localeCode: string,
  loadMore: () => void,
): HTMLElement {
  const list = element("ol", "message-list");
  list.className = "pmfa-list";
  list.setAttribute("aria-live", "polite");
  if (snapshot?.hasMore) {
    const item = element("li");
    item.className = "pmfa-loadmore";
    item.append(button(text("chat.loadMore"), "load-more", loadMore));
    list.append(item);
  }
  const messages = [...(snapshot?.messages ?? [])].sort(byCreatedAt);
  for (const message of messages)
    list.append(renderMessage(message, text, localeCode));
  if (messages.length === 0) {
    const empty = textElement("li", text("chat.empty"), "empty muted");
    empty.className = "pmfa-empty";
    list.append(empty);
  }
  return list;
}

function renderMessage(
  message: ConversationMessage,
  text: (key: "chat.failed" | "chat.sending") => string,
  localeCode: string,
): HTMLElement {
  const item = element("li", `message ${message.direction}`);
  item.className = `pmfa-msg pmfa-msg-${message.direction === "outbound" ? "out" : "in"} pmfa-msg-${message.status}`;
  item.dataset.messageId = message.id;
  const bubble = textElement("div", message.text, "bubble");
  bubble.className = "pmfa-bubble";
  const meta = element("span", "meta");
  meta.className = "pmfa-meta";
  const date = new Date(message.createdAt);
  if (!Number.isNaN(date.getTime())) {
    const time = document.createElement("time");
    time.dateTime = date.toISOString();
    time.textContent = date.toLocaleTimeString(localeCode, {
      hour: "numeric",
      minute: "2-digit",
    });
    meta.append(time);
  }
  if (message.status === "failed")
    meta.append(separator(meta) + text("chat.failed"));
  else if (message.status === "pending")
    meta.append(separator(meta) + text("chat.sending"));
  item.append(bubble, meta);
  if (message.error !== undefined) {
    const error = textElement("span", message.error);
    error.className = "pmfa-meta";
    error.setAttribute("role", "alert");
    item.append(error);
  }
  return item;
}

function separator(meta: HTMLElement): string {
  return meta.childNodes.length > 0 ? " · " : "";
}

/** Keep the newest message in view while the reader is at the end. */
function stickToBottom(list: HTMLElement, previous: HTMLElement | undefined) {
  const pinned =
    previous === undefined ||
    previous.scrollHeight - previous.scrollTop - previous.clientHeight < 32;
  const offset = previous?.scrollTop ?? 0;
  queueMicrotask(() => {
    list.scrollTop = pinned ? list.scrollHeight : offset;
  });
}

export class PolymorfaMessageListElement extends PolymorfaElement<ConversationSnapshot> {
  protected renderContent(
    snapshot: ConversationSnapshot | undefined,
  ): readonly Node[] {
    const previous =
      this.root.querySelector<HTMLElement>(".pmfa-list") ?? undefined;
    const list = renderMessages(
      snapshot,
      (key) => this.text(key),
      this.locale().code,
      () =>
        void this.configuredController<ConversationController>()?.loadMore(),
    );
    list.className = this.rootClass("pmfa-list");
    list.style.height = "100%";
    stickToBottom(list, previous);
    return [list];
  }
}

export class PolymorfaComposeBoxElement extends PolymorfaElement<MessageComposerSnapshot> {
  protected renderContent(
    snapshot: MessageComposerSnapshot | undefined,
  ): readonly Node[] {
    const focused = this.root.activeElement?.localName === "textarea";
    const form = element("form", "composer") as HTMLFormElement;
    form.className = this.rootClass("pmfa-composer");
    const input = document.createElement("textarea");
    input.part.add("input");
    input.className = "pmfa-input";
    input.rows = 1;
    input.placeholder = this.text("composer.placeholder");
    input.value = snapshot?.text ?? "";
    input.setAttribute("aria-label", "Message");
    const empty = () => input.value.trim() === "";
    const submit = () => {
      if (snapshot?.sending || empty()) return;
      void this.configuredController<MessageComposerController>()?.submit();
    };
    const send = button(
      snapshot?.sending
        ? this.text("composer.sending")
        : this.text("composer.send"),
      "primary send",
      submit,
      "pmfa-btn pmfa-btn-primary",
    );
    send.disabled = snapshot?.sending === true || empty();
    input.addEventListener("input", () => {
      send.disabled = snapshot?.sending === true || empty();
      this.configuredController<MessageComposerController>()?.setText(
        input.value,
      );
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        submit();
      }
    });
    form.append(input, send);
    if (snapshot?.error !== undefined) {
      const error = textElement("p", snapshot.error, "error");
      error.className = "pmfa-error";
      error.setAttribute("role", "alert");
      form.append(error);
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      submit();
    });
    if (focused)
      queueMicrotask(() => {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      });
    return [form];
  }
}

export class PolymorfaChatDrawerElement extends PolymorfaElement<ConversationSnapshot> {
  #open = true;
  #opener: HTMLElement | undefined;
  #onKey = (event: KeyboardEvent) => {
    if (this.#open && event.key === "Escape") this.#close();
  };
  set open(value: boolean) {
    this.#open = value;
    this.render();
    if (!value) this.#opener?.focus();
  }
  get open(): boolean {
    return this.#open;
  }
  set opener(value: HTMLElement | undefined) {
    this.#opener = value;
  }
  override connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("keydown", this.#onKey);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("keydown", this.#onKey);
  }
  #close(): void {
    this.open = false;
    this.dispatchEvent(
      new CustomEvent("pmfa-close", { bubbles: true, composed: true }),
    );
  }
  protected renderContent(
    snapshot: ConversationSnapshot | undefined,
  ): readonly Node[] {
    if (!this.#open) return [];
    const previous =
      this.root.querySelector<HTMLElement>(".pmfa-list") ?? undefined;
    const title = this.getAttribute("heading") ?? this.text("chat.title");
    const panel = element("aside", "panel drawer");
    panel.className = this.rootClass("pmfa-drawer");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", title);
    const header = element("header", "header");
    header.className = "pmfa-drawer-header";
    const heading = textElement("h2", title, "title");
    heading.className = "pmfa-drawer-title";
    const close = button(
      "",
      "close",
      () => this.#close(),
      "pmfa-btn pmfa-btn-ghost pmfa-btn-icon",
    );
    close.setAttribute("aria-label", this.text("common.close"));
    close.innerHTML = CLOSE_ICON;
    header.append(heading, close);
    const list = renderMessages(
      snapshot,
      (key) => this.text(key),
      this.locale().code,
      () =>
        void this.configuredController<ConversationController>()?.loadMore(),
    );
    stickToBottom(list, previous);
    const footer = element("div", "footer");
    footer.className = "pmfa-drawer-footer";
    footer.append(document.createElement("slot"));
    panel.append(header, list);
    if (snapshot?.status === "error") {
      const error = textElement(
        "p",
        snapshot.error ?? this.text("chat.loadError"),
        "error",
      );
      error.className = "pmfa-error";
      error.setAttribute("role", "alert");
      panel.append(error);
    }
    panel.append(footer);
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

/** Oldest first; messages without a valid time sort as the newest. */
function byCreatedAt(
  left: { readonly createdAt: number },
  right: { readonly createdAt: number },
): number {
  const a = Number.isFinite(left.createdAt) ? left.createdAt : Infinity;
  const b = Number.isFinite(right.createdAt) ? right.createdAt : Infinity;
  return a === b ? 0 : a < b ? -1 : 1;
}
