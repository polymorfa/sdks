import {
  InboxController,
  MessageComposerController,
  PolymorfaClient,
  connectWhatsApp,
  createConversationComposerActions,
  createHandlerInboxSource,
  warnMissingPermission,
  type InboxConversation,
  type InboxDataSource,
  type InboxSnapshot,
  type PolymorfaClientSnapshot,
  type PolymorfaPermission,
} from "@polymorfa/browser";
import {
  CHAT_ICONS,
  formatDayLabel,
  formatMessageTime,
  type AppearanceInput,
  type ChatIconName,
  type Locale,
} from "@polymorfa/ui";

import {
  PolymorfaElement,
  element,
  textElement,
  type ElementConfiguration,
} from "./base.js";
import { defineCallElements } from "./calls.js";
import {
  PolymorfaComposeBoxElement,
  PolymorfaMessageListElement,
  defineChatElements,
} from "./chat.js";
import { defineTemplateElements } from "./templates.js";

let defaultClient: PolymorfaClient | undefined;
let defaultConfiguration: ElementConfiguration | undefined;

export interface DefinePolymorfaOptions {
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
export function definePolymorfa(
  options: DefinePolymorfaOptions = {},
): PolymorfaClient {
  defaultClient?.dispose();
  const client =
    options.client ??
    new PolymorfaClient(
      options.tokenEndpoint === undefined
        ? {}
        : { tokenEndpoint: options.tokenEndpoint },
    );
  client.start();
  defaultClient = client;
  defaultConfiguration = {
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
}

function icon(name: ChatIconName): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "pmfa-icon");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", CHAT_ICONS[name]);
  svg.append(path);
  return svg;
}

/** Shared base: a provider client, its permissions and one warning each. */
abstract class ClientElement<T extends object> extends PolymorfaElement<T> {
  #client: PolymorfaClient | undefined;
  #unsubscribeClient: (() => void) | undefined;
  #configured = false;

  /** Defaults to the client from `definePolymorfa()`. */
  get client(): PolymorfaClient | undefined {
    return this.#client ?? defaultClient;
  }
  set client(value: PolymorfaClient | undefined) {
    this.#unbindClient();
    this.#client = value;
    if (this.isConnected) this.#bindClient();
    this.render();
  }

  override connectedCallback(): void {
    if (!this.#configured && defaultConfiguration !== undefined) {
      this.#configured = true;
      this.configuration = { ...defaultConfiguration, ...this.configuration };
    }
    this.#bindClient();
    super.connectedCallback();
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#unbindClient();
  }

  protected clientSnapshot(): PolymorfaClientSnapshot | undefined {
    return this.client?.getSnapshot();
  }
  /** Whether a control may render; warns once when a minted grant lacks it. */
  protected allowed(
    component: string,
    control: string,
    permission: PolymorfaPermission,
  ): boolean {
    const snapshot = this.clientSnapshot();
    if (snapshot === undefined) return false;
    const allowed = snapshot.grant?.allow.includes(permission) === true;
    if (!allowed && snapshot.grant !== undefined)
      warnMissingPermission(component, control, permission);
    return allowed;
  }
  protected onClientChange(): void {
    this.render();
  }

  #bindClient(): void {
    const client = this.client;
    if (client === undefined || this.#unsubscribeClient !== undefined) return;
    try {
      this.#unsubscribeClient = client.subscribe(() => this.onClientChange());
    } catch {
      // Disposed client.
    }
  }
  #unbindClient(): void {
    this.#unsubscribeClient?.();
    this.#unsubscribeClient = undefined;
  }
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
 * `<pmfa-inbox>`: conversation list and chat. Uses the `definePolymorfa()`
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
    const selected = snapshot?.conversations.find(
      (conversation) => conversation.id === snapshot.selectedId,
    );
    shell.dataset.view = selected === undefined ? "list" : "thread";
    this.#renderList(snapshot, controller);
    const thread = this.#renderThread(selected, controller);
    shell.replaceChildren(this.#list!, thread);
    return [shell];
  }

  #renderList(
    snapshot: InboxSnapshot | undefined,
    controller: InboxController | undefined,
  ): void {
    const list = this.#list!;
    list.className = "pmfa-inbox-list";
    this.decorate(list, "conversationList");
    const focusedId = (this.root.activeElement as HTMLElement | null)?.dataset
      ?.conversationId;
    const head = element("div");
    head.className = "pmfa-inbox-head";
    const title = textElement("h2", this.text("inbox.title"));
    title.className = "pmfa-inbox-title";
    head.append(title);
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
    } else if (snapshot.conversations.length === 0) {
      const state = element("div");
      state.className = "pmfa-inbox-state";
      state.append(
        icon("inbox"),
        document.createTextNode(this.text("inbox.empty")),
      );
      body.push(this.decorate(state, "empty"));
    } else {
      const items = element("ul");
      items.className = "pmfa-convs";
      for (const conversation of snapshot.conversations)
        items.append(this.#row(conversation, snapshot, controller));
      body.push(items);
    }
    list.replaceChildren(...body);
    if (focusedId !== undefined)
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
    if (conversation.unreadCount > 0) row.dataset.unread = "";
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
    row.append(avatar, nameNode, time, preview);
    if (conversation.unreadCount > 0) {
      const badge = this.decorate(element("span"), "unreadBadge");
      badge.className = "pmfa-badge";
      badge.textContent = String(Math.min(conversation.unreadCount, 99));
      badge.setAttribute(
        "aria-label",
        this.text("inbox.unread", { count: String(conversation.unreadCount) }),
      );
      row.append(badge);
    }
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
    const key = `${conversation.id}:${canSend}`;
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

function initials(name: string): string {
  const letters = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => Array.from(word)[0] ?? "");
  const first = letters[0] ?? "";
  const last = letters.length > 1 ? (letters[letters.length - 1] ?? "") : "";
  return (first + last).toUpperCase() || "#";
}

function hue(id: string): number {
  let hash = 0;
  for (const character of id)
    hash = Math.imul(hash ^ character.charCodeAt(0), 2654435761);
  return Math.round(Math.abs(hash % 360) * 137.508) % 360;
}

/** @internal Clears the `definePolymorfa()` client, for tests. */
export function resetDefinePolymorfa(): void {
  defaultClient?.dispose();
  defaultClient = undefined;
  defaultConfiguration = undefined;
}
