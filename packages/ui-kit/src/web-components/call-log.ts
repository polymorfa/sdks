import {
  CallLogController,
  createApiCallLogSource,
  type CallLogEntry,
  type CallLogSnapshot,
  type CallLogSource,
  type InboxConversation,
} from "../browser/index.js";
import {
  formatDayLabel,
  formatMessageTime,
  type MessageKey,
} from "../appearance/index.js";
import { element, textElement } from "./base.js";
import { ClientElement, hue, icon, initials } from "./client.js";

function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes % 60).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}

/**
 * `<pmfa-call-log>`: the WhatsApp-style call log. Rows fire `pmfa-open` with
 * the call's conversation; call-back buttons fire `pmfa-call` with the
 * `CallLogEntry`, so your page places the call with its Calls client.
 *
 * Properties: `client`, `source` (defaults to the API,
 * `GET /messaging/{session}/calls` with `read_calls`), `controller`. Attribute
 * `no-call-back` hides call-back buttons. Put extra header content in
 * `slot="actions"`.
 */
export class PolymorfaCallLogElement extends ClientElement<CallLogSnapshot> {
  static get observedAttributes(): string[] {
    return ["no-call-back"];
  }
  #source: CallLogSource | undefined;
  #owned: CallLogController | undefined;

  get source(): CallLogSource | undefined {
    return this.#source;
  }
  set source(value: CallLogSource | undefined) {
    this.#source = value;
    this.#dispose();
    if (this.isConnected) this.#ensure();
  }

  attributeChangedCallback(): void {
    this.render();
  }
  override connectedCallback(): void {
    super.connectedCallback();
    this.#ensure();
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#dispose();
  }
  protected override onClientChange(): void {
    this.#ensure();
    this.render();
  }

  #ensure(): void {
    const external = this.configuredController<CallLogController>();
    if (external !== undefined && external !== this.#owned) {
      if (external.getSnapshot().status === "idle") void external.load();
      return;
    }
    if (this.#owned !== undefined) return;
    const client = this.client;
    const source =
      this.#source ??
      (client?.can("read_calls") === true ? createApiCallLogSource(client) : undefined);
    if (source === undefined) return;
    this.#owned = new CallLogController(source);
    this.controller = this.#owned;
    void this.#owned.load();
  }
  #dispose(): void {
    if (this.#owned === undefined) return;
    const owned = this.#owned;
    this.#owned = undefined;
    if (this.controller === owned) this.controller = undefined;
    owned.dispose();
  }

  #emit(type: string, detail: unknown): void {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true, composed: true }));
  }

  #summary(entry: CallLogEntry): string {
    const kind: MessageKey =
      entry.outcome === "missed" && entry.direction === "inbound"
        ? "callLog.missedCall"
        : entry.outcome === "declined"
          ? "callLog.declined"
          : entry.outcome === "failed"
            ? "callLog.failed"
            : entry.outcome === "ongoing"
              ? "callLog.ongoing"
              : entry.direction === "inbound"
                ? "callLog.incoming"
                : "callLog.outgoing";
    const code = this.locale().code;
    const when =
      new Date(entry.startedAt).toDateString() === new Date().toDateString()
        ? (formatMessageTime(entry.startedAt, code) ?? "")
        : formatDayLabel(entry.startedAt, code, {
            today: this.text("chat.today"),
            yesterday: this.text("chat.yesterday"),
          });
    return [
      `${this.text(kind)} ${this.text(entry.video ? "callLog.video" : "callLog.voice")}`,
      when,
      entry.outcome === "answered" && entry.durationSeconds !== undefined ? duration(entry.durationSeconds) : "",
    ]
      .filter((part) => part !== "")
      .join(" · ");
  }

  protected renderContent(snapshot: CallLogSnapshot | undefined): readonly Node[] {
    const controller = this.configuredController<CallLogController>();
    const focused = (this.root.activeElement as HTMLElement | null)?.dataset.focusKey;
    const root = this.decorate(element("section"), "callLog");
    root.className = this.rootClass("pmfa-inbox-list pmfa-call-log");
    root.setAttribute("aria-labelledby", "pmfa-call-log-title");
    const head = element("div");
    head.className = "pmfa-inbox-head";
    const heading = element("div");
    heading.className = "pmfa-inbox-heading";
    const title = textElement("h2", this.text("callLog.title"));
    title.className = "pmfa-inbox-title";
    title.id = "pmfa-call-log-title";
    const actions = document.createElement("slot");
    actions.name = "actions";
    heading.append(title, actions);
    const filters = element("div");
    filters.className = "pmfa-inbox-filters";
    filters.setAttribute("role", "group");
    filters.setAttribute("aria-label", this.text("callLog.filters"));
    for (const filter of ["all", "missed"] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.focusKey = `filter:${filter}`;
      button.setAttribute("aria-pressed", String(snapshot?.filter === filter));
      button.textContent = this.text(filter === "all" ? "callLog.all" : "callLog.missed");
      button.addEventListener("click", () => controller?.setFilter(filter));
      filters.append(button);
    }
    head.append(heading, filters);
    root.append(head);
    if (snapshot === undefined || snapshot.status === "idle" || snapshot.status === "loading") {
      const state = textElement("p", this.text("callLog.loading"));
      state.className = "pmfa-newchat-state";
      state.setAttribute("role", "status");
      root.append(state);
    } else if (snapshot.status === "error") {
      const state = element("div");
      state.className = "pmfa-newchat-state";
      state.setAttribute("role", "alert");
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "pmfa-btn";
      retry.textContent = this.text("common.retry");
      retry.addEventListener("click", () => void controller?.load());
      state.append(textElement("p", this.text("callLog.loadError")), retry);
      root.append(state);
    } else if (snapshot.groups.length === 0) {
      const state = textElement("p", this.text(snapshot.filter === "missed" ? "callLog.noMissed" : "callLog.empty"));
      state.className = "pmfa-newchat-state";
      root.append(state);
    } else {
      const list = this.decorate(element("ul"), "callLog");
      list.className = "pmfa-call-rows";
      list.setAttribute("aria-label", this.text("callLog.title"));
      list.addEventListener("keydown", (event) => {
        if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
        const rows = Array.from(list.querySelectorAll<HTMLButtonElement>("button[data-call-id]"));
        const index = rows.indexOf(event.target as HTMLButtonElement);
        if (index < 0) return;
        event.preventDefault();
        const target = event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : index + (event.key === "ArrowDown" ? 1 : -1);
        rows[Math.max(0, Math.min(rows.length - 1, target))]?.focus();
      });
      for (const group of snapshot.groups) list.append(this.#row(group.latest, group.entries.length));
      if (snapshot.hasMore) {
        const more = document.createElement("button");
        more.type = "button";
        more.className = "pmfa-btn pmfa-btn-ghost pmfa-call-more";
        more.dataset.focusKey = "more";
        more.disabled = snapshot.status === "loading_more";
        more.textContent = this.text("callLog.loadMore");
        more.addEventListener("click", () => void controller?.loadMore());
        const item = element("li");
        item.append(more);
        list.append(item);
      }
      root.append(list);
    }
    if (focused !== undefined)
      queueMicrotask(() =>
        this.root.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true }),
      );
    return [root];
  }

  #row(entry: CallLogEntry, count: number): HTMLElement {
    const name = entry.peer.name ?? entry.peer.phoneNumber ?? entry.peer.id ?? "?";
    const missed = entry.outcome === "missed" && entry.direction === "inbound";
    const item = element("li");
    item.className = "pmfa-call-entry";
    const row = this.decorate(document.createElement("button"), "callLogItem");
    row.type = "button";
    row.className = `pmfa-person pmfa-call${missed ? " pmfa-call-missed" : ""}`;
    row.dataset.callId = entry.id;
    row.dataset.focusKey = `call:${entry.id}`;
    const summary = this.#summary(entry);
    const countText = count > 1 ? ` ${this.text("callLog.count", { count: String(count) })}` : "";
    row.setAttribute("aria-label", `${name}${countText}, ${summary}`);
    const conversation: InboxConversation | undefined =
      entry.conversationId === undefined
        ? undefined
        : {
            id: entry.conversationId,
            kind: "direct",
            ...(entry.session === undefined ? {} : { session: entry.session }),
            ...(entry.peer.name === undefined ? {} : { name: entry.peer.name }),
            ...(entry.peer.phoneNumber === undefined ? {} : { phoneNumber: entry.peer.phoneNumber }),
            lastActivity: 0,
            unreadCount: 0,
          };
    row.disabled = conversation === undefined;
    row.addEventListener("click", () => {
      if (conversation !== undefined) this.#emit("pmfa-open", conversation);
    });
    const avatar = this.decorate(element("span"), "avatar");
    avatar.className = "pmfa-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.style.setProperty("--pmfa-avatar-hue", String(hue(entry.peer.id ?? entry.id)));
    avatar.textContent = initials(name);
    const text = element("span");
    text.className = "pmfa-person-text";
    const nameNode = textElement("span", name);
    nameNode.className = "pmfa-person-name";
    if (count > 1) {
      const counter = textElement("span", countText);
      counter.className = "pmfa-call-count";
      nameNode.append(counter);
    }
    const sub = element("span");
    sub.className = "pmfa-person-sub pmfa-call-sub";
    const direction = icon(entry.direction === "inbound" ? "callIn" : "callOut");
    direction.classList.add("pmfa-call-dir");
    sub.append(direction, document.createTextNode(summary));
    text.append(nameNode, sub);
    row.append(avatar, text);
    item.append(row);
    if (entry.peer.phoneNumber !== undefined && !this.hasAttribute("no-call-back")) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "pmfa-btn pmfa-btn-ghost pmfa-btn-icon pmfa-call-back";
      back.dataset.focusKey = `back:${entry.id}`;
      const label = this.text(entry.video ? "callLog.videoBack" : "callLog.callBack", { name });
      back.setAttribute("aria-label", label);
      back.title = label;
      back.append(icon(entry.video ? "video" : "phone"));
      back.addEventListener("click", () => this.#emit("pmfa-call", entry));
      item.append(back);
    }
    return item;
  }
}

export function defineCallLogElements(
  registry: CustomElementRegistry = customElements,
): void {
  if (registry.get("pmfa-call-log") === undefined)
    registry.define("pmfa-call-log", PolymorfaCallLogElement);
}
