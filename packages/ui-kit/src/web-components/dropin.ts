import {
  InboxController,
  MessageComposerController,
  PolymorfaClient,
  connectWhatsApp,
  createConversationComposerActions,
  isQuickLinkUrl,
  warnInvalidQuickLink,
  createHandlerInboxSource,
  warnMissingPermission,
  type CallLogSource,
  type ContactDirectorySource,
  type GroupSource,
  type InboxConversation,
  type InboxDataSource,
  type InboxSnapshot,
  type PolymorfaClientSnapshot,
  type PolymorfaPermission,
} from "../browser/index.js";
import {
  CHAT_ICONS,
  filterInboxRows,
  messagePresentationStatus,
  type InboxFilter,
  formatDayLabel,
  formatMessageTime,
  type AppearanceInput,
  type ChatIconName,
  type Locale,
} from "../appearance/index.js";

import {
  PolymorfaElement,
  element,
  textElement,
  type ElementConfiguration,
} from "./base.js";
import { defineCallElements } from "./calls.js";
import { ClientElement, defaults, hue, icon, initials } from "./client.js";
import {
  PolymorfaComposeBoxElement,
  PolymorfaMessageListElement,
  defineChatElements,
} from "./chat.js";
import { defineTemplateElements } from "./templates.js";
import {
  PolymorfaGroupDetailsElement,
  PolymorfaNewChatElement,
  defineContactElements,
} from "./contacts.js";
import {
  PolymorfaCallLogElement,
  defineCallLogElements,
} from "./call-log.js";


export interface DefineUiKitOptions {
  /** Your handler's token route. Default `/api/polymorfa/token`. */
  readonly tokenEndpoint?: string;
  /** A client you created yourself; takes precedence over `tokenEndpoint`. */
  readonly client?: PolymorfaClient;
  readonly appearance?: AppearanceInput;
  readonly locale?: Locale;
  readonly registry?: CustomElementRegistry;
}

/**
 * The Web Components equivalent of `<PolymorfaProvider tokenEndpoint>`:
 * creates one client that fetches and refreshes client tokens, then defines
 * every element. `<pmfa-inbox>`, `<pmfa-connect-whatsapp>` and
 * `<pmfa-session-status>` use that client unless given their own.
 */
export function defineUiKit(options: DefineUiKitOptions = {}): PolymorfaClient {
  defaults.client?.dispose();
  const client =
    options.client ??
    new PolymorfaClient(
      options.tokenEndpoint === undefined
        ? {}
        : { tokenEndpoint: options.tokenEndpoint },
    );
  client.start();
  defaults.client = client;
  defaults.configuration = {
    ...(options.appearance === undefined
      ? {}
      : { appearance: options.appearance }),
    ...(options.locale === undefined ? {} : { locale: options.locale }),
  };
  const registry = options.registry ?? customElements;
  defineChatElements(registry);
  defineTemplateElements(registry);
  defineCallElements(registry);
  defineDropInElements(registry);
  return client;
}

export function defineDropInElements(
  registry: CustomElementRegistry = customElements,
): void {
  if (registry.get("pmfa-inbox") === undefined)
    registry.define("pmfa-inbox", PolymorfaInboxElement);
  if (registry.get("pmfa-connect-whatsapp") === undefined)
    registry.define("pmfa-connect-whatsapp", PolymorfaConnectWhatsAppElement);
  if (registry.get("pmfa-session-status") === undefined)
    registry.define("pmfa-session-status", PolymorfaSessionStatusElement);
  if (registry.get("pmfa-quicklink-button") === undefined)
    registry.define("pmfa-quicklink-button", PolymorfaQuickLinkButtonElement);
  defineContactElements(registry);
  defineCallLogElements(registry);
}



/** `<pmfa-connect-whatsapp>`: opens Polymorfa's hosted QuickLink page. */
export class PolymorfaConnectWhatsAppElement extends ClientElement<object> {
  static readonly observedAttributes = ["target", "label"];
  #busy = false;
  #failed = false;

  attributeChangedCallback(): void {
    if (this.isConnected) this.render();
  }

  protected renderContent(): readonly Node[] {
    if (!this.allowed("pmfa-connect-whatsapp", "button", "connect_whatsapp"))
      return [];
    const wrapper = element("span");
    wrapper.className = this.rootClass("");
    const control = this.decorate(
      document.createElement("button"),
      "connectButton",
    );
    control.type = "button";
    control.className = "pmfa-btn pmfa-btn-primary pmfa-connect";
    control.disabled = this.#busy;
    if (this.#busy) control.setAttribute("aria-busy", "true");
    control.append(
      icon("link"),
      document.createTextNode(
        this.#busy
          ? this.text("connect.opening")
          : (this.getAttribute("label") ?? this.text("connect.button")),
      ),
    );
    control.addEventListener("click", () => this.#connect());
    wrapper.append(control);
    if (this.#failed) {
      const error = textElement("p", this.text("connect.failed"));
      error.className = "pmfa-error";
      error.setAttribute("role", "alert");
      wrapper.append(this.decorate(error, "error"));
    }
    return [wrapper];
  }

  #connect(): void {
    const client = this.client;
    if (client === undefined || this.#busy) return;
    this.#busy = true;
    this.#failed = false;
    this.render();
    connectWhatsApp(client, {
      target: this.getAttribute("target") === "popup" ? "popup" : "redirect",
    }).then(
      (result) => {
        this.#busy = false;
        this.render();
        this.dispatchEvent(
          new CustomEvent("pmfa-connect", {
            detail: result,
            bubbles: true,
            composed: true,
          }),
        );
      },
      (error: unknown) => {
        this.#busy = false;
        this.#failed = true;
        this.render();
        this.dispatchEvent(
          new CustomEvent("pmfa-error", {
            detail: error,
            bubbles: true,
            composed: true,
          }),
        );
      },
    );
  }
}

/**
 * `<pmfa-quicklink-button url="…">`: a link styled as the Connect WhatsApp
 * button for a QuickLink your server already created. It creates nothing and
 * needs no client token. The URL is the recipient's only credential.
 */
export class PolymorfaQuickLinkButtonElement extends PolymorfaElement<object> {
  static readonly observedAttributes = ["url", "target", "label"];
  #configured = false;

  attributeChangedCallback(): void {
    if (this.isConnected) this.render();
  }

  override connectedCallback(): void {
    if (!this.#configured && defaults.configuration !== undefined) {
      this.#configured = true;
      this.configuration = { ...defaults.configuration, ...this.configuration };
    }
    super.connectedCallback();
  }

  protected renderContent(): readonly Node[] {
    const url = this.getAttribute("url");
    // A missing or blank URL is one the host is still creating.
    const pending = url === null || url.trim() === "";
    if (!isQuickLinkUrl(url)) {
      if (!pending) warnInvalidQuickLink("pmfa-quicklink-button");
      return [];
    }
    const link = document.createElement("a");
    link.className = this.rootClass("pmfa-btn pmfa-btn-primary pmfa-connect");
    this.decorate(link, "connectButton");
    link.href = url;
    link.rel = "noopener noreferrer";
    if (this.getAttribute("target") === "popup") link.target = "_blank";
    link.append(
      icon("link"),
      document.createTextNode(
        this.getAttribute("label") ?? this.text("connect.button"),
      ),
    );
    link.addEventListener("click", () =>
      this.dispatchEvent(
        new CustomEvent("pmfa-open", { bubbles: true, composed: true }),
      ),
    );
    return [link];
  }
}

/** `<pmfa-session-status>`: the client's connection state. */
export class PolymorfaSessionStatusElement extends ClientElement<object> {
  protected renderContent(): readonly Node[] {
    const status = this.clientSnapshot()?.status ?? "idle";
    const badge = this.decorate(element("span"), "sessionStatus");
    badge.className = this.rootClass("pmfa-session");
    badge.dataset.status = status;
    badge.setAttribute("role", "status");
    const label = this.text(`status.${status}`);
    badge.setAttribute(
      "aria-label",
      this.text("status.label", { status: label }),
    );
    const dot = element("span");
    dot.className = "pmfa-session-dot";
    const words = textElement("span", label);
    words.setAttribute("aria-hidden", "true");
    badge.append(dot, words);
    if (
      status === "error" ||
      status === "retrying" ||
      status === "unauthenticated"
    ) {
      const retry = textElement("button", this.text("common.retry"));
      (retry as HTMLButtonElement).type = "button";
      retry.className = "pmfa-btn pmfa-btn-ghost";
      retry.addEventListener("click", () => {
        void this.client?.refresh().catch(() => undefined);
      });
      badge.append(retry);
    }
    return [badge];
  }
}

/**
 * `<pmfa-inbox>`: conversation list and chat. Uses the `defineUiKit()`
 * client and your handler's history and events routes unless you set
 * `source` or `controller`.
 */
export class PolymorfaInboxElement extends ClientElement<InboxSnapshot> {
  #source: InboxDataSource | undefined;
  #owned: InboxController | undefined;
  #list: HTMLElement | undefined;
  #thread: HTMLElement | undefined;
  #threadFor: string | undefined;
  #composerController: MessageComposerController | undefined;
  #shell: HTMLElement | undefined;
  #shellGeneration = -1;
  #query = "";
  #filter: InboxFilter = "all";
  #contacts: ContactDirectorySource | undefined;
  #groups: GroupSource | undefined;
  #composing = false;
  #newChat: PolymorfaNewChatElement | undefined;
  #infoOpen = false;
  #info: PolymorfaGroupDetailsElement | undefined;
  #callLogSource: CallLogSource | undefined;
  #view: "chats" | "calls" = "chats";
  #calls: PolymorfaCallLogElement | undefined;

  /** Where the Calls view reads from. Defaults to the API (`read_calls`). */
  get callLog(): CallLogSource | undefined {
    return this.#callLogSource;
  }
  set callLog(value: CallLogSource | undefined) {
    this.#callLogSource = value;
    this.#calls = undefined;
    this.render();
  }

  static get observedAttributes(): string[] {
    return ["self-id", "no-new-chat", "no-calls"];
  }
  attributeChangedCallback(): void {
    this.render();
  }

  /** Contacts for "New chat" and adding group members. Defaults to the API. */
  get contacts(): ContactDirectorySource | undefined {
    return this.#contacts;
  }
  set contacts(value: ContactDirectorySource | undefined) {
    this.#contacts = value;
    this.#newChat = undefined;
    this.#info = undefined;
    this.render();
  }
  /** Group reads and changes. Defaults to the API (`groups_read`, `groups_manage`). */
  get groups(): GroupSource | undefined {
    return this.#groups;
  }
  set groups(value: GroupSource | undefined) {
    this.#groups = value;
    this.#newChat = undefined;
    this.#info = undefined;
    this.render();
  }

  get source(): InboxDataSource | undefined {
    return this.#source;
  }
  set source(value: InboxDataSource | undefined) {
    this.#source = value;
    this.#disposeOwned();
    if (this.isConnected) this.#ensureController();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#ensureController();
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#disposeOwned();
  }
  protected override onClientChange(): void {
    this.#ensureController();
    this.render();
  }

  #ensureController(): void {
    if (this.controller !== undefined && this.controller !== this.#owned) {
      this.#maybeLoad(this.controller as InboxController);
      return;
    }
    if (this.#owned === undefined) {
      const client = this.client;
      const source =
        this.#source ??
        (client === undefined ? undefined : createHandlerInboxSource(client));
      if (source === undefined) return;
      this.#owned = new InboxController(source);
      this.controller = this.#owned;
    }
    this.#maybeLoad(this.#owned);
  }

  #maybeLoad(controller: InboxController): void {
    const snapshot = this.clientSnapshot();
    const ready =
      this.#source !== undefined ||
      snapshot?.grant?.allow.includes("read_messages") === true;
    if (ready && controller.getSnapshot().status === "idle")
      void controller.load();
  }

  #disposeOwned(): void {
    this.#composerController?.dispose();
    this.#composerController = undefined;
    this.#threadFor = undefined;
    if (this.#owned !== undefined) {
      const owned = this.#owned;
      this.#owned = undefined;
      if (this.controller === owned) this.controller = undefined;
      owned.dispose();
    }
  }

  #can(permission: PolymorfaPermission, control: string): boolean {
    // A custom source without a client renders every control; the source
    // enforces access.
    if (this.client === undefined) return true;
    return this.allowed("pmfa-inbox", control, permission);
  }

  protected renderContent(
    snapshot: InboxSnapshot | undefined,
  ): readonly Node[] {
    const controller = this.configuredController<InboxController>();
    if (
      this.#shell === undefined ||
      this.#shellGeneration !== this.generation
    ) {
      this.#shellGeneration = this.generation;
      this.#shell = element("div");
      this.#list = element("section");
      this.#thread = undefined;
      this.#threadFor = undefined;
    }
    const shell = this.#shell;
    shell.className = this.rootClass("pmfa-inbox");
    this.decorate(shell, "inbox");
    const selected =
      snapshot?.conversations.find(
        (conversation) => conversation.id === snapshot.selectedId,
      ) ??
      (snapshot?.draft !== undefined &&
      snapshot.draft.id === snapshot.selectedId
        ? snapshot.draft
        : undefined);
    shell.dataset.view = selected === undefined ? "list" : "thread";
    const thread = this.#renderThread(selected, controller);
    const children: Node[] = [];
    const newChat =
      this.#composing && controller !== undefined
        ? this.#renderNewChat(controller)
        : undefined;
    const calls =
      this.#view === "calls" && controller !== undefined
        ? this.#renderCalls(controller)
        : undefined;
    if (calls !== undefined) children.push(calls);
    else if (newChat !== undefined) children.push(newChat);
    else {
      this.#composing = false;
      this.#renderList(snapshot, controller);
      children.push(this.#list!);
    }
    children.push(thread);
    const info =
      this.#infoOpen && selected?.kind === "group"
        ? this.#renderGroupInfo(selected)
        : undefined;
    if (info !== undefined) {
      shell.dataset.contactOpen = "";
      children.push(info);
    } else delete shell.dataset.contactOpen;
    shell.replaceChildren(...children);
    return [shell];
  }

  #renderList(
    snapshot: InboxSnapshot | undefined,
    controller: InboxController | undefined,
  ): void {
    const list = this.#list!;
    list.className = "pmfa-inbox-list";
    this.decorate(list, "conversationList");
    const active = this.root.activeElement as HTMLElement | null;
    const focusedId = active?.dataset.conversationId;
    const searchFocused = active?.hasAttribute("data-inbox-search");
    const selection = searchFocused
      ? ([
          (active as HTMLInputElement).selectionStart,
          (active as HTMLInputElement).selectionEnd,
        ] as const)
      : undefined;
    const filterFocused = active?.dataset.inboxFilter;
    const head = element("div");
    head.className = "pmfa-inbox-head";
    const heading = element("div");
    heading.className = "pmfa-inbox-heading";
    const title = textElement("h2", this.text("inbox.title"));
    title.className = "pmfa-inbox-title";
    heading.append(title);
    const views = this.#viewSwitch();
    if (views !== undefined) heading.append(views);
    if (this.#canNewChat()) {
      const start = document.createElement("button");
      start.type = "button";
      start.className = "pmfa-btn pmfa-btn-ghost pmfa-btn-icon";
      start.dataset.inboxNewChat = "";
      start.setAttribute("aria-label", this.text("inbox.newChat"));
      start.title = this.text("inbox.newChat");
      start.append(icon("plus"));
      start.addEventListener("click", () => {
        this.#composing = true;
        this.render();
      });
      heading.append(start);
    }
    head.append(heading);
    const search = element("div");
    search.className = "pmfa-search";
    const input = document.createElement("input");
    input.type = "search";
    input.className = "pmfa-input";
    input.dataset.inboxSearch = "";
    input.setAttribute("aria-label", this.text("inbox.search"));
    input.placeholder = this.text("inbox.search");
    input.value = this.#query;
    input.addEventListener("input", (event) => {
      this.#query = input.value;
      // Re-rendering replaces this input and would cancel an IME composition.
      if ((event as InputEvent).isComposing) return;
      this.render();
    });
    input.addEventListener("compositionend", () => {
      this.#query = input.value;
      this.render();
    });
    input.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        list
          .querySelector<HTMLButtonElement>("button[data-conversation-id]")
          ?.focus();
      }
      if (event.key === "Escape") {
        this.#query = "";
        this.render();
      }
    });
    search.append(icon("search"), input);
    head.append(search);
    const filters = element("div");
    filters.className = "pmfa-inbox-filters";
    filters.setAttribute("role", "group");
    filters.setAttribute("aria-label", this.text("inbox.filters"));
    const choices: InboxFilter[] = ["all", "unread"];
    if (snapshot?.conversations.some((row) => row.archived))
      choices.push("archived");
    for (const value of choices) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.inboxFilter = value;
      button.setAttribute("aria-pressed", String(this.#filter === value));
      button.textContent = this.text(
        value === "unread" ? "inbox.unreadFilter" : `inbox.${value}`,
      );
      button.addEventListener("click", () => {
        this.#filter = value;
        this.render();
      });
      filters.append(button);
    }
    head.append(filters);
    const visible = filterInboxRows(
      snapshot?.conversations ?? [],
      this.#filter,
      this.#query,
    );
    const body: Node[] = [head];
    if (
      snapshot === undefined ||
      snapshot.status === "idle" ||
      snapshot.status === "loading"
    ) {
      const skeleton = element("div");
      skeleton.className = "pmfa-skeleton";
      skeleton.setAttribute("aria-busy", "true");
      skeleton.append(element("span"), element("span"), element("span"));
      body.push(skeleton);
    } else if (snapshot.status === "error") {
      const state = element("div");
      state.className = "pmfa-inbox-state";
      state.setAttribute("role", "alert");
      const retry = textElement("button", this.text("common.retry"));
      (retry as HTMLButtonElement).type = "button";
      retry.className = "pmfa-btn";
      retry.addEventListener("click", () => void controller?.load());
      state.append(textElement("p", this.text("inbox.loadError")), retry);
      body.push(state);
    } else if (visible.length === 0) {
      const state = element("div");
      state.className = "pmfa-inbox-state";
      state.append(
        icon("inbox"),
        document.createTextNode(
          this.text(
            this.#query || this.#filter !== "all"
              ? "inbox.noMatches"
              : "inbox.empty",
          ),
        ),
      );
      body.push(this.decorate(state, "empty"));
    } else {
      const items = element("ul");
      items.className = "pmfa-convs";
      for (const conversation of visible)
        items.append(this.#row(conversation, snapshot, controller));
      body.push(items);
    }
    list.replaceChildren(...body);
    if (searchFocused) {
      input.focus({ preventScroll: true });
      if (selection?.[0] != null && selection[1] != null)
        input.setSelectionRange(selection[0], selection[1]);
    } else if (filterFocused)
      filters
        .querySelector<HTMLElement>(`[data-inbox-filter="${filterFocused}"]`)
        ?.focus({ preventScroll: true });
    else if (focusedId !== undefined)
      list
        .querySelector<HTMLElement>(
          `[data-conversation-id="${CSS.escape(focusedId)}"]`,
        )
        ?.focus({ preventScroll: true });
  }

  #row(
    conversation: InboxConversation,
    snapshot: InboxSnapshot,
    controller: InboxController | undefined,
  ): HTMLElement {
    const item = element("li");
    const name =
      conversation.name ?? conversation.phoneNumber ?? conversation.id;
    const row = this.decorate(
      document.createElement("button"),
      "conversationItem",
    );
    row.type = "button";
    row.className = "pmfa-conv";
    row.dataset.conversationId = conversation.id;
    if (conversation.id === snapshot.selectedId)
      row.setAttribute("aria-current", "true");
    if (conversation.unreadCount > 0 || conversation.markedUnread)
      row.dataset.unread = "";
    const avatar = this.decorate(element("span"), "avatar");
    avatar.className = "pmfa-avatar";
    avatar.setAttribute("aria-hidden", "true");
    avatar.textContent = initials(name);
    avatar.style.setProperty("--pmfa-avatar-hue", String(hue(conversation.id)));
    const nameNode = textElement("span", name);
    nameNode.className = "pmfa-conv-name";
    const time = textElement(
      "span",
      conversation.lastActivity > 0
        ? new Date().toDateString() ===
          new Date(conversation.lastActivity).toDateString()
          ? (formatMessageTime(conversation.lastActivity, this.locale().code) ??
            "")
          : formatDayLabel(conversation.lastActivity, this.locale().code, {
              today: this.text("chat.today"),
              yesterday: this.text("chat.yesterday"),
            })
        : "",
    );
    time.className = "pmfa-conv-time";
    const last = conversation.lastMessage;
    const preview = textElement(
      "span",
      last === undefined
        ? (conversation.phoneNumber ?? "")
        : `${last.direction === "outbound" ? this.text("inbox.you") : ""}${last.text}`,
    );
    preview.className = "pmfa-conv-preview";
    if (last?.direction === "outbound" && last.status !== undefined) {
      preview.textContent = last.text;
      preview.prepend(
        icon(
          messagePresentationStatus({
            status: last.status,
            ...(last.receipt === undefined ? {} : { receipt: last.receipt }),
          }),
        ),
      );
    }
    row.append(avatar, nameNode, time, preview);
    if (conversation.subtitle) {
      const subtitle = textElement("span", conversation.subtitle);
      subtitle.className = "pmfa-conv-subtitle";
      row.append(subtitle);
    }
    const indicators = element("span");
    indicators.className = "pmfa-conv-indicators";
    if (conversation.pinned) indicators.append(icon("pin"));
    if (conversation.unreadCount > 0 || conversation.markedUnread) {
      const badge = this.decorate(element("span"), "unreadBadge");
      badge.className = "pmfa-badge";
      badge.textContent =
        conversation.unreadCount > 99
          ? "99+"
          : conversation.unreadCount > 0
            ? String(conversation.unreadCount)
            : "";
      badge.setAttribute(
        "aria-label",
        this.text("inbox.unread", {
          count: String(conversation.unreadCount || 1),
        }),
      );
      indicators.append(badge);
    }
    row.append(indicators);
    row.addEventListener("keydown", (event) => {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const rows = Array.from(
        this.#list!.querySelectorAll<HTMLButtonElement>(
          "button[data-conversation-id]",
        ),
      );
      const index = rows.indexOf(row);
      event.preventDefault();
      rows[
        Math.max(
          0,
          Math.min(
            rows.length - 1,
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? rows.length - 1
                : index + (event.key === "ArrowDown" ? 1 : -1),
          ),
        )
      ]?.focus();
    });
    row.addEventListener("click", () => {
      controller?.select(conversation.id);
      this.dispatchEvent(
        new CustomEvent("pmfa-select", {
          detail: conversation,
          bubbles: true,
          composed: true,
        }),
      );
    });
    item.append(row);
    return item;
  }

  #canNewChat(): boolean {
    if (this.hasAttribute("no-new-chat")) return false;
    return (
      this.#contacts !== undefined ||
      this.clientSnapshot()?.grant?.allow.includes("read_contact") === true
    );
  }

  #canCalls(): boolean {
    if (this.hasAttribute("no-calls")) return false;
    return (
      this.#callLogSource !== undefined ||
      this.clientSnapshot()?.grant?.allow.includes("read_calls") === true
    );
  }

  #viewSwitch(): HTMLElement | undefined {
    if (!this.#canCalls()) return undefined;
    const group = element("div");
    group.className = "pmfa-inbox-views";
    group.setAttribute("role", "group");
    group.setAttribute("aria-label", this.text("inbox.views"));
    for (const value of ["chats", "calls"] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.inboxView = value;
      button.setAttribute("aria-pressed", String(this.#view === value));
      button.textContent = this.text(value === "chats" ? "inbox.chats" : "inbox.calls");
      button.addEventListener("click", () => {
        this.#view = value;
        this.#composing = false;
        this.render();
        queueMicrotask(() => {
          const target =
            value === "calls"
              ? this.#calls?.querySelector<HTMLElement>(`[data-inbox-view="calls"]`)
              : this.root.querySelector<HTMLElement>(`[data-inbox-view="chats"]`);
          target?.focus();
        });
      });
      group.append(button);
    }
    return group;
  }

  #renderCalls(controller: InboxController): HTMLElement | undefined {
    if (!this.#canCalls()) return undefined;
    if (this.#calls === undefined) {
      const log = document.createElement("pmfa-call-log") as PolymorfaCallLogElement;
      log.configuration = this.configuration;
      if (this.client !== undefined) log.client = this.client;
      if (this.#callLogSource !== undefined) log.source = this.#callLogSource;
      log.className = "pmfa-inbox-calls";
      log.addEventListener("pmfa-open", (event) => {
        event.stopPropagation();
        const conversation = (event as CustomEvent<InboxConversation>).detail;
        controller.open(conversation);
        this.#infoOpen = false;
        this.render();
        this.dispatchEvent(
          new CustomEvent("pmfa-select", { detail: conversation, bubbles: true, composed: true }),
        );
      });
      this.#calls = log;
    }
    const views = this.#viewSwitch()!;
    views.slot = "actions";
    this.#calls.replaceChildren(views);
    return this.#calls;
  }

  #canGroups(): boolean {
    return (
      this.#groups !== undefined ||
      this.clientSnapshot()?.grant?.allow.includes("groups_read") === true
    );
  }

  #renderNewChat(controller: InboxController): HTMLElement | undefined {
    if (!this.#canNewChat()) return undefined;
    if (this.#newChat === undefined) {
      const panel = document.createElement(
        "pmfa-new-chat",
      ) as PolymorfaNewChatElement;
      panel.setAttribute("closable", "");
      panel.configuration = this.configuration;
      if (this.client !== undefined) panel.client = this.client;
      if (this.#contacts !== undefined) panel.contacts = this.#contacts;
      if (this.#groups !== undefined) panel.groups = this.#groups;
      panel.className = "pmfa-inbox-newchat";
      panel.addEventListener("pmfa-open", (event) => {
        event.stopPropagation();
        const conversation = (event as CustomEvent<InboxConversation>).detail;
        controller.open(conversation);
        this.#composing = false;
        this.#infoOpen = false;
        this.render();
        this.dispatchEvent(
          new CustomEvent("pmfa-select", {
            detail: conversation,
            bubbles: true,
            composed: true,
          }),
        );
      });
      panel.addEventListener("pmfa-close", (event) => {
        event.stopPropagation();
        this.#composing = false;
        this.render();
        queueMicrotask(() =>
          this.root
            .querySelector<HTMLElement>("[data-inbox-new-chat]")
            ?.focus(),
        );
      });
      this.#newChat = panel;
    }
    return this.#newChat;
  }

  #renderGroupInfo(conversation: InboxConversation): HTMLElement | undefined {
    if (!this.#canGroups()) return undefined;
    let info = this.#info;
    if (info === undefined || info.getAttribute("group-id") !== conversation.id) {
      info = document.createElement(
        "pmfa-group-details",
      ) as PolymorfaGroupDetailsElement;
      info.setAttribute("closable", "");
      info.configuration = this.configuration;
      if (this.client !== undefined) info.client = this.client;
      if (this.#groups !== undefined) info.source = this.#groups;
      if (this.#contacts !== undefined) info.contacts = this.#contacts;
      info.setAttribute("group-id", conversation.id);
      info.className = "pmfa-inbox-group";
      info.addEventListener("pmfa-close", (event) => {
        event.stopPropagation();
        this.#infoOpen = false;
        this.render();
        queueMicrotask(() =>
          this.root.querySelector<HTMLElement>("[data-group-info]")?.focus(),
        );
      });
      this.#info = info;
    }
    const self = this.getAttribute("self-id");
    if (self === null) info.removeAttribute("self-id");
    else info.setAttribute("self-id", self);
    return info;
  }

  #renderThread(
    conversation: InboxConversation | undefined,
    controller: InboxController | undefined,
  ): HTMLElement {
    if (conversation === undefined || controller === undefined) {
      this.#threadFor = undefined;
      const empty = this.decorate(element("section"), "thread");
      empty.className = "pmfa-thread";
      const state = element("div");
      state.className = "pmfa-inbox-state";
      state.append(
        icon("inbox"),
        document.createTextNode(this.text("inbox.select")),
      );
      empty.append(state);
      return empty;
    }
    const canSend = this.#can("send_message", "composer");
    const key = `${conversation.id}:${canSend}:${conversation.kind ?? ""}:${this.#canGroups()}`;
    if (this.#thread !== undefined && this.#threadFor === key)
      return this.#thread;
    this.#threadFor = key;
    this.#composerController?.dispose();
    this.#composerController = undefined;
    const conversationController = controller.conversation(conversation);
    const thread = this.decorate(element("section"), "thread");
    thread.className = "pmfa-thread";
    thread.setAttribute("aria-label", conversation.name ?? conversation.id);
    const header = this.decorate(element("header"), "threadHeader");
    header.className = "pmfa-thread-head";
    const back = this.decorate(document.createElement("button"), "backButton");
    back.type = "button";
    back.className = "pmfa-btn pmfa-btn-ghost pmfa-btn-icon pmfa-back";
    back.setAttribute("aria-label", this.text("inbox.back"));
    back.append(icon("back"));
    back.addEventListener("click", () => controller.select(undefined));
    const who = element("div");
    who.className = "pmfa-thread-who";
    const name = textElement(
      "span",
      conversation.name ?? conversation.phoneNumber ?? conversation.id,
    );
    name.className = "pmfa-thread-name";
    who.append(name);
    if (
      conversation.phoneNumber !== undefined &&
      conversation.name !== undefined
    ) {
      const sub = textElement("span", conversation.phoneNumber);
      sub.className = "pmfa-thread-sub";
      who.append(sub);
    }
    header.append(back, who);
    if (conversation.kind === "group" && this.#canGroups()) {
      const actions = element("div");
      actions.className = "pmfa-thread-actions";
      const toggle = this.decorate(document.createElement("button"), "button");
      toggle.type = "button";
      toggle.className = "pmfa-btn pmfa-btn-ghost pmfa-btn-icon";
      toggle.dataset.groupInfo = "";
      toggle.title = this.text("group.info");
      const sync = () => {
        toggle.setAttribute("aria-expanded", String(this.#infoOpen));
        toggle.setAttribute(
          "aria-label",
          this.text(this.#infoOpen ? "group.hideInfo" : "group.showInfo"),
        );
      };
      sync();
      toggle.append(icon("info"));
      toggle.addEventListener("click", () => {
        this.#infoOpen = !this.#infoOpen;
        sync();
        this.render();
      });
      actions.append(toggle);
      header.append(actions);
    }
    const configuration = this.configuration;
    const messages = document.createElement(
      "pmfa-message-list",
    ) as PolymorfaMessageListElement;
    messages.configuration = configuration;
    messages.controller = conversationController;
    messages.style.flex = "1";
    messages.style.minHeight = "0";
    const foot = element("div");
    foot.className = "pmfa-thread-foot";
    if (canSend) {
      this.#composerController = new MessageComposerController(
        createConversationComposerActions(conversationController, async () => {
          throw new Error("Attachments need an upload adapter.");
        }),
      );
      const composer = document.createElement(
        "pmfa-compose-box",
      ) as PolymorfaComposeBoxElement;
      composer.configuration = configuration;
      composer.setAttribute("attachments", "false");
      composer.setAttribute("voice-notes", "false");
      composer.controller = this.#composerController;
      composer.conversation = conversationController;
      const composerController = this.#composerController;
      messages.onReply = (message) => composerController.setReplyTo(message.id);
      foot.append(composer);
    } else {
      const note = textElement("p", this.text("inbox.readOnly"));
      note.className = "pmfa-readonly";
      foot.append(note);
    }
    thread.append(header, messages, foot);
    this.#thread = thread;
    return thread;
  }
}



/** @internal Clears the `defineUiKit()` client, for tests. */
export function resetDefineUiKit(): void {
  defaults.client?.dispose();
  defaults.client = undefined;
  defaults.configuration = undefined;
}
