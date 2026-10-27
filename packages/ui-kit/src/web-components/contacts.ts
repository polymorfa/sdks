import {
  ContactDirectoryController,
  GroupController,
  NewChatController,
  contactDisplayName,
  createApiContactSource,
  createApiGroupSource,
  filterContacts,
  type ContactDirectorySnapshot,
  type ContactDirectorySource,
  type DirectoryContact,
  type GroupSettingChange,
  type GroupSnapshot,
  type GroupSource,
  type InboxConversation,
  type NewChatSnapshot,
} from "../browser/index.js";
import type { BrowserGroupParticipant } from "../browser/messaging/types.js";
import type { MessageKey } from "../appearance/index.js";
import { element, textElement } from "./base.js";
import { ClientElement, hue, icon, initials } from "./client.js";

function avatar(id: string, name: string, src?: string): HTMLElement {
  const node = element("span");
  node.className = "pmfa-avatar";
  node.setAttribute("aria-hidden", "true");
  node.style.setProperty("--pmfa-avatar-hue", String(hue(id)));
  if (src !== undefined) {
    const image = document.createElement("img");
    image.src = src;
    image.alt = "";
    image.addEventListener("error", () => node.replaceChildren(initials(name)));
    node.append(image);
  } else node.textContent = initials(name);
  return node;
}

function actionButton(
  label: string,
  className: string,
  action: () => void,
): HTMLButtonElement {
  const value = document.createElement("button");
  value.type = "button";
  value.className = className;
  value.textContent = label;
  value.addEventListener("click", action);
  return value;
}

/** Focus survives a re-render when the focused node has a stable key. */
function focusKey(root: ShadowRoot): string | undefined {
  return (root.activeElement as HTMLElement | null)?.dataset.focusKey;
}
function restoreFocus(root: ParentNode, key: string | undefined): void {
  if (key === undefined) return;
  root
    .querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`)
    ?.focus({ preventScroll: true });
}

function arrowNavigation(list: HTMLElement): void {
  list.addEventListener("keydown", (event) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const rows = Array.from(
      list.querySelectorAll<HTMLButtonElement>("button[data-contact-id]"),
    );
    const index = rows.indexOf(event.target as HTMLButtonElement);
    if (index < 0) return;
    event.preventDefault();
    const target =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? rows.length - 1
          : index + (event.key === "ArrowDown" ? 1 : -1);
    rows[Math.max(0, Math.min(rows.length - 1, target))]?.focus();
  });
}

/** Shared pieces for elements that own a contacts directory. */
abstract class DirectoryElement<T extends object> extends ClientElement<T> {
  #directoryUnsubscribe: (() => void) | undefined;
  #watched: ContactDirectoryController | undefined;

  protected watchDirectory(directory: ContactDirectoryController | undefined): void {
    if (directory === this.#watched) return;
    this.#directoryUnsubscribe?.();
    this.#directoryUnsubscribe = undefined;
    this.#watched = directory;
    if (directory !== undefined && this.isConnected)
      this.#directoryUnsubscribe = directory.subscribe(() => this.render());
  }

  override connectedCallback(): void {
    super.connectedCallback();
    const watched = this.#watched;
    this.#watched = undefined;
    this.watchDirectory(watched);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#directoryUnsubscribe?.();
    this.#directoryUnsubscribe = undefined;
  }

  protected contactRows(
    contacts: readonly DirectoryContact[],
    options: {
      readonly label: string;
      readonly selectable: boolean;
      readonly selected: ReadonlySet<string>;
      readonly onSelect: (contact: DirectoryContact) => void;
    },
  ): HTMLElement {
    const list = this.decorate(element("ul"), "contactList");
    list.className = "pmfa-contact-list";
    list.setAttribute("aria-label", options.label);
    arrowNavigation(list);
    for (const contact of contacts) {
      const name = contactDisplayName(contact);
      const checked = options.selected.has(contact.id);
      const row = this.decorate(document.createElement("button"), "contactItem");
      row.type = "button";
      row.className = `pmfa-person${checked ? " pmfa-person-selected" : ""}`;
      row.dataset.contactId = contact.id;
      row.dataset.focusKey = `contact:${contact.id}`;
      if (options.selectable) {
        row.setAttribute("role", "checkbox");
        row.setAttribute("aria-checked", String(checked));
      }
      const textNode = element("span");
      textNode.className = "pmfa-person-text";
      const nameNode = textElement("span", name);
      nameNode.className = "pmfa-person-name";
      textNode.append(nameNode);
      const secondary =
        contact.phoneNumber !== undefined && contact.phoneNumber !== name
          ? contact.phoneNumber
          : contact.pushName !== undefined && contact.pushName !== name
            ? `~${contact.pushName}`
            : undefined;
      if (secondary !== undefined) {
        const sub = textElement("span", secondary);
        sub.className = "pmfa-person-sub";
        textNode.append(sub);
      }
      row.append(avatar(contact.id, name, contact.avatarUrl), textNode);
      if (options.selectable) {
        const check = element("span");
        check.className = "pmfa-person-check";
        check.setAttribute("aria-hidden", "true");
        if (checked) check.append(icon("check"));
        row.append(check);
      }
      row.addEventListener("click", () => options.onSelect(contact));
      const item = element("li");
      item.append(row);
      list.append(item);
    }
    return list;
  }

  protected directoryState(
    snapshot: ContactDirectorySnapshot,
    onRetry: () => void,
  ): HTMLElement | undefined {
    if (snapshot.status === "loading" && snapshot.contacts.length === 0) {
      const node = textElement("p", this.text("newChat.loading"));
      node.className = "pmfa-newchat-state";
      node.setAttribute("role", "status");
      return node;
    }
    if (snapshot.status === "error") {
      const node = element("div");
      node.className = "pmfa-newchat-state";
      node.setAttribute("role", "alert");
      const permission = snapshot.errorKind === "permission";
      node.append(
        textElement(
          "p",
          this.text(permission ? "newChat.permission" : "newChat.loadError"),
        ),
      );
      if (!permission)
        node.append(actionButton(this.text("common.retry"), "pmfa-btn", onRetry));
      return node;
    }
    if (snapshot.status === "ready" && snapshot.results.length === 0) {
      const node = textElement(
        "p",
        this.text(
          snapshot.query.trim() === "" ? "newChat.empty" : "newChat.noMatches",
        ),
      );
      node.className = "pmfa-newchat-state";
      return node;
    }
    return undefined;
  }

  protected searchField(
    directory: ContactDirectoryController,
    input: HTMLInputElement,
  ): HTMLElement {
    const search = this.decorate(element("div"), "newChatSearch");
    search.className = "pmfa-search";
    input.type = "search";
    input.className = "pmfa-input";
    input.dataset.focusKey = "search";
    input.placeholder = this.text("newChat.search");
    input.setAttribute("aria-label", this.text("newChat.search"));
    const value = directory.getSnapshot().query;
    if (input.value !== value) input.value = value;
    search.append(icon("search"), input);
    return search;
  }

  protected bindSearch(
    input: HTMLInputElement,
    directory: () => ContactDirectoryController | undefined,
    escape: () => void,
  ): void {
    input.addEventListener("input", (event) => {
      if ((event as InputEvent).isComposing) return;
      directory()?.setQuery(input.value);
    });
    input.addEventListener("compositionend", () =>
      directory()?.setQuery(input.value),
    );
    input.addEventListener("keydown", (event) => {
      if (event.isComposing) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.root
          .querySelector<HTMLButtonElement>("button[data-contact-id]")
          ?.focus();
      } else if (event.key === "Escape") {
        if (input.value !== "") {
          event.preventDefault();
          event.stopPropagation();
          directory()?.setQuery("");
        } else escape();
      }
    });
  }
}

/**
 * `<pmfa-new-chat>`: search the account's contacts, check an unsaved number,
 * or create a group. Fires `pmfa-open` with the conversation to open and
 * `pmfa-close` from its back button. It never sends a message by itself.
 *
 * Attributes: `closable` shows the back button; `no-groups` hides "New
 * group". Properties: `client`, `contacts`, `groups`, `controller`.
 */
export class PolymorfaNewChatElement extends DirectoryElement<NewChatSnapshot> {
  static get observedAttributes(): string[] {
    return ["closable", "no-groups"];
  }
  #contacts: ContactDirectorySource | undefined;
  #groups: Pick<GroupSource, "create"> | undefined;
  #owned: NewChatController | undefined;
  #input: HTMLInputElement | undefined;
  #inputGeneration = -1;
  #view: NewChatSnapshot["view"] | undefined;

  get contacts(): ContactDirectorySource | undefined {
    return this.#contacts;
  }
  set contacts(value: ContactDirectorySource | undefined) {
    this.#contacts = value;
    this.#reset();
  }
  /** Group creation; defaults to the API when the token allows `groups_manage`. */
  get groups(): Pick<GroupSource, "create"> | undefined {
    return this.#groups;
  }
  set groups(value: Pick<GroupSource, "create"> | undefined) {
    this.#groups = value;
    this.#reset();
  }

  attributeChangedCallback(name: string): void {
    if (name === "no-groups") this.#reset();
    else this.render();
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

  #controller(): NewChatController | undefined {
    return this.configuredController<NewChatController>();
  }

  #reset(): void {
    this.#dispose();
    if (this.isConnected) this.#ensure();
  }
  #dispose(): void {
    if (this.#owned === undefined) return;
    const owned = this.#owned;
    this.#owned = undefined;
    if (this.controller === owned) this.controller = undefined;
    this.watchDirectory(undefined);
    owned.dispose();
  }
  #ensure(): void {
    const external = this.#controller();
    if (external !== undefined && external !== this.#owned) {
      this.watchDirectory(external.directory);
      external.start();
      return;
    }
    if (this.#owned !== undefined) return;
    const client = this.client;
    const contacts =
      this.#contacts ??
      (client !== undefined && client.getSnapshot().grant !== undefined
        ? createApiContactSource(client)
        : undefined);
    if (contacts === undefined) return;
    const groups = this.hasAttribute("no-groups")
      ? undefined
      : (this.#groups ??
        (client?.can("groups_manage") === true
          ? createApiGroupSource(client)
          : undefined));
    this.#owned = new NewChatController({
      contacts,
      ...(groups === undefined ? {} : { groups }),
      onOpen: (conversation: InboxConversation) =>
        this.dispatchEvent(
          new CustomEvent<InboxConversation>("pmfa-open", {
            detail: conversation,
            bubbles: true,
            composed: true,
          }),
        ),
    });
    this.controller = this.#owned;
    this.watchDirectory(this.#owned.directory);
    this.#owned.start();
  }

  #close(): void {
    this.dispatchEvent(new CustomEvent("pmfa-close", { bubbles: true, composed: true }));
  }

  protected renderContent(snapshot: NewChatSnapshot | undefined): readonly Node[] {
    const controller = this.#controller();
    const root = this.decorate(element("section"), "newChat");
    root.className = this.rootClass("pmfa-newchat");
    if (controller === undefined || snapshot === undefined) {
      root.setAttribute("aria-busy", "true");
      return [root];
    }
    const focused = focusKey(this.root);
    const viewChanged = this.#view !== snapshot.view;
    this.#view = snapshot.view;
    if (this.#input === undefined || this.#inputGeneration !== this.generation) {
      this.#inputGeneration = this.generation;
      this.#input = document.createElement("input");
      this.bindSearch(this.#input, () => this.#controller()?.directory, () => {
        if (this.#controller()?.getSnapshot().view !== "contacts")
          this.#controller()?.back();
        else if (this.hasAttribute("closable")) this.#close();
      });
    }
    const directory = controller.directory.getSnapshot();
    root.dataset.view = snapshot.view;
    const headingId = "pmfa-newchat-title";
    root.setAttribute("aria-labelledby", headingId);
    const head = this.decorate(element("header"), "newChatHeader");
    head.className = "pmfa-newchat-head";
    const back =
      snapshot.view !== "contacts"
        ? () => controller.back()
        : this.hasAttribute("closable")
          ? () => this.#close()
          : undefined;
    if (back !== undefined) {
      const button = this.decorate(document.createElement("button"), "backButton");
      button.type = "button";
      button.className = "pmfa-btn pmfa-btn-ghost pmfa-btn-icon";
      button.dataset.focusKey = "back";
      button.setAttribute(
        "aria-label",
        this.text(snapshot.view === "contacts" ? "common.close" : "inbox.back"),
      );
      button.append(icon("back"));
      button.addEventListener("click", back);
      head.append(button);
    }
    const title = textElement(
      "h2",
      this.text(
        snapshot.view === "contacts"
          ? "newChat.title"
          : snapshot.view === "groupMembers"
            ? "newChat.addMembers"
            : "newChat.newGroup",
      ),
    );
    title.className = "pmfa-newchat-title";
    title.id = headingId;
    head.append(title);
    root.append(head);

    if (snapshot.view === "groupDetails") {
      root.append(this.#groupForm(controller, snapshot));
    } else {
      if (snapshot.view === "groupMembers" && snapshot.selected.length > 0)
        root.append(this.#chips(controller, snapshot, true));
      root.append(this.searchField(controller.directory, this.#input));
      const body = element("div");
      body.className = "pmfa-newchat-body";
      body.setAttribute("aria-busy", String(directory.status === "loading"));
      if (snapshot.view === "contacts" && controller.canCreateGroup) {
        const action = this.decorate(document.createElement("button"), "newChatAction");
        action.type = "button";
        action.className = "pmfa-person pmfa-newchat-action";
        action.dataset.focusKey = "new-group";
        const badge = element("span");
        badge.className = "pmfa-avatar pmfa-newchat-action-icon";
        badge.setAttribute("aria-hidden", "true");
        badge.append(icon("group"));
        const label = element("span");
        label.className = "pmfa-person-text";
        const name = textElement("span", this.text("newChat.newGroup"));
        name.className = "pmfa-person-name";
        label.append(name);
        action.append(badge, label);
        action.addEventListener("click", () => controller.startGroup());
        body.append(action);
      }
      if (snapshot.view === "contacts") {
        const phone = this.#phoneRow(controller, directory);
        if (phone !== undefined) body.append(phone);
      }
      const state = this.directoryState(directory, () => void controller.directory.retry());
      if (state !== undefined) body.append(state);
      if (directory.results.length > 0) {
        const heading = textElement("h3", this.text("newChat.contacts"));
        heading.className = "pmfa-newchat-section";
        body.append(
          heading,
          this.contactRows(directory.results, {
            label: this.text("newChat.contacts"),
            selectable: snapshot.view === "groupMembers",
            selected: new Set(snapshot.selected.map((contact) => contact.id)),
            onSelect: (contact) =>
              snapshot.view === "groupMembers"
                ? controller.toggle(contact)
                : controller.open(contact),
          }),
        );
      }
      root.append(body);
      if (snapshot.view === "groupMembers") {
        const foot = element("footer");
        foot.className = "pmfa-newchat-foot";
        const count = textElement(
          "span",
          this.text("newChat.selected", {
            count: new Intl.NumberFormat(this.locale().code).format(snapshot.selected.length),
          }),
        );
        count.className = "pmfa-newchat-note";
        count.setAttribute("role", "status");
        const next = actionButton(this.text("newChat.next"), "pmfa-btn pmfa-btn-primary", () =>
          controller.next(),
        );
        next.dataset.focusKey = "next";
        next.disabled = snapshot.selected.length === 0;
        foot.append(count, next);
        root.append(foot);
      }
    }
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && event.target !== this.#input && back !== undefined) {
        event.preventDefault();
        back();
      }
    });
    queueMicrotask(() => {
      if (viewChanged) this.root.querySelector<HTMLElement>("[data-focus-key=search], [data-focus-key=group-name]")?.focus();
      else restoreFocus(this.root, focused);
    });
    return [root];
  }

  #phoneRow(
    controller: NewChatController,
    snapshot: ContactDirectorySnapshot,
  ): HTMLElement | undefined {
    const phone = snapshot.phone;
    if (phone === undefined || !controller.directory.canLookup) return undefined;
    const digits = phone.replace(/\D/g, "");
    if (snapshot.results.some((contact) => contact.phoneNumber?.replace(/\D/g, "") === digits))
      return undefined;
    const { lookup } = snapshot;
    if (lookup.status === "found") {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "pmfa-person";
      row.dataset.focusKey = "phone";
      const label = element("span");
      label.className = "pmfa-person-text";
      const name = textElement("span", this.text("newChat.message", { phone }));
      name.className = "pmfa-person-name";
      label.append(name);
      row.append(avatar(lookup.contact.id, phone), label);
      row.addEventListener("click", () => controller.open(lookup.contact));
      return row;
    }
    const wrap = element("div");
    wrap.className = "pmfa-newchat-lookup";
    const check = actionButton(this.text("newChat.checkNumber", { phone }), "pmfa-btn", () =>
      void controller.directory.lookupPhone(),
    );
    check.prepend(icon("search"));
    check.dataset.focusKey = "lookup";
    check.disabled = lookup.status === "checking";
    const note = textElement(
      "p",
      lookup.status === "checking"
        ? this.text("newChat.checking", { phone })
        : lookup.status === "not_found"
          ? this.text("newChat.notOnWhatsApp", { phone })
          : lookup.status === "error"
            ? this.text("newChat.lookupError", { phone })
            : "",
    );
    note.className = "pmfa-newchat-note";
    note.setAttribute("role", "status");
    wrap.append(check, note);
    return wrap;
  }

  #chips(controller: NewChatController, snapshot: NewChatSnapshot, removable: boolean): HTMLElement {
    const chips = element("ul");
    chips.className = "pmfa-pick-chips";
    chips.setAttribute(
      "aria-label",
      this.text("newChat.selected", { count: String(snapshot.selected.length) }),
    );
    for (const contact of snapshot.selected) {
      const name = contactDisplayName(contact);
      const chip = textElement("li", name);
      chip.className = "pmfa-pick-chip";
      if (removable) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "pmfa-pick-chip-remove";
        remove.dataset.focusKey = `chip:${contact.id}`;
        remove.setAttribute("aria-label", this.text("newChat.removeMember", { name }));
        remove.append(icon("close"));
        remove.addEventListener("click", () => controller.toggle(contact));
        chip.append(remove);
      }
      chips.append(chip);
    }
    return chips;
  }

  #groupForm(controller: NewChatController, snapshot: NewChatSnapshot): HTMLElement {
    const form = document.createElement("form");
    form.className = "pmfa-newchat-group";
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      void controller.createGroup();
    });
    const field = this.decorate(element("label"), "field");
    field.className = "pmfa-field";
    const label = textElement("span", this.text("newChat.groupName"));
    label.className = "pmfa-label";
    const input = document.createElement("input");
    input.className = "pmfa-input";
    input.dataset.focusKey = "group-name";
    input.value = snapshot.groupName;
    input.maxLength = 100;
    input.required = true;
    input.autocomplete = "off";
    input.addEventListener("input", () => controller.setGroupName(input.value));
    field.append(label, input);
    const count = textElement(
      "p",
      this.text("group.members", {
        count: new Intl.NumberFormat(this.locale().code).format(snapshot.selected.length),
      }),
    );
    count.className = "pmfa-newchat-note";
    form.append(field, count, this.#chips(controller, snapshot, false));
    if (snapshot.error !== undefined) {
      const error = textElement("p", `${this.text("newChat.createError")}: ${snapshot.error}`);
      error.className = "pmfa-error";
      error.setAttribute("role", "alert");
      form.append(error);
    }
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.className = "pmfa-btn pmfa-btn-primary";
    submit.dataset.focusKey = "create";
    submit.textContent = this.text(snapshot.creating ? "newChat.creating" : "newChat.create");
    submit.disabled = snapshot.creating || snapshot.groupName.trim() === "";
    form.append(submit);
    return form;
  }
}

const SETTINGS: readonly {
  readonly label: MessageKey;
  readonly options: readonly { readonly label: MessageKey; readonly change: GroupSettingChange }[];
}[] = [
  {
    label: "group.editInfo",
    options: [
      { label: "group.everyone", change: { setting: "infoEditing", adminsOnly: false } },
      { label: "group.adminsOnly", change: { setting: "infoEditing", adminsOnly: true } },
    ],
  },
  {
    label: "group.sendMessages",
    options: [
      { label: "group.everyone", change: { setting: "messaging", adminsOnly: false } },
      { label: "group.adminsOnly", change: { setting: "messaging", adminsOnly: true } },
    ],
  },
  {
    label: "group.addOthers",
    options: [
      { label: "group.everyone", change: { setting: "memberAdd", mode: "all_member_add" } },
      { label: "group.adminsOnly", change: { setting: "memberAdd", mode: "admin_add" } },
    ],
  },
  {
    label: "group.approve",
    options: [
      { label: "group.on", change: { setting: "joinApproval", required: true } },
      { label: "group.off", change: { setting: "joinApproval", required: false } },
    ],
  },
];

/**
 * `<pmfa-group-details group-id="…">`: a group's details and roster with
 * the changes the token allows. WhatsApp decides whether this account may
 * make each change. Fires `pmfa-close` and `pmfa-left`.
 *
 * Attributes: `group-id`, `self-id` (marks "You"), `closable`. Properties:
 * `client`, `source`, `contacts` (enables "Add members"), `resolveName`,
 * `controller`.
 */
export class PolymorfaGroupDetailsElement extends DirectoryElement<GroupSnapshot> {
  static get observedAttributes(): string[] {
    return ["group-id", "self-id", "closable"];
  }
  #source: GroupSource | undefined;
  #contacts: ContactDirectorySource | undefined;
  #directory: ContactDirectoryController | undefined;
  #owned: GroupController | undefined;
  #editing: "name" | "description" | undefined;
  #adding = false;
  #picked = new Set<string>();
  #confirmLeave = false;
  #copied = false;
  #addInput: HTMLInputElement | undefined;
  #status: string | undefined;
  /** Names for participants, for example from your contacts. */
  resolveName: ((participant: BrowserGroupParticipant) => string | undefined) | undefined;

  get source(): GroupSource | undefined {
    return this.#source;
  }
  set source(value: GroupSource | undefined) {
    this.#source = value;
    this.#reset();
  }
  get contacts(): ContactDirectorySource | undefined {
    return this.#contacts;
  }
  set contacts(value: ContactDirectorySource | undefined) {
    this.#contacts = value;
    this.#directory?.dispose();
    this.#directory = undefined;
    this.watchDirectory(undefined);
    this.render();
  }

  attributeChangedCallback(name: string, previous: string | null, next: string | null): void {
    if (name === "group-id" && previous !== next) this.#reset();
    else this.render();
  }
  override connectedCallback(): void {
    super.connectedCallback();
    this.#ensure();
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#dispose();
    this.#directory?.dispose();
    this.#directory = undefined;
  }
  protected override onClientChange(): void {
    this.#ensure();
    this.render();
  }

  #controller(): GroupController | undefined {
    return this.configuredController<GroupController>();
  }
  #reset(): void {
    this.#dispose();
    this.#editing = undefined;
    this.#adding = false;
    this.#picked.clear();
    this.#confirmLeave = false;
    if (this.isConnected) this.#ensure();
  }
  #dispose(): void {
    if (this.#owned === undefined) return;
    const owned = this.#owned;
    this.#owned = undefined;
    if (this.controller === owned) this.controller = undefined;
    owned.dispose();
  }
  #ensure(): void {
    const external = this.#controller();
    if (external !== undefined && external !== this.#owned) {
      if (external.getSnapshot().status === "idle") void external.load();
      return;
    }
    if (this.#owned !== undefined) return;
    const groupId = this.getAttribute("group-id");
    const client = this.client;
    if (groupId === null) return;
    const source =
      this.#source ??
      (client !== undefined && client.getSnapshot().grant !== undefined
        ? createApiGroupSource(client)
        : undefined);
    if (source === undefined) return;
    this.#owned = new GroupController(source, groupId, {
      canManage: this.#source !== undefined || client?.can("groups_manage") === true,
    });
    this.controller = this.#owned;
    void this.#owned.load();
    // Name participants from the address book when contacts are readable.
    const directory = this.#directoryController();
    if (directory?.getSnapshot().status === "idle") void directory.load();
  }

  #directoryController(): ContactDirectoryController | undefined {
    if (this.#directory !== undefined) return this.#directory;
    const client = this.client;
    const source =
      this.#contacts ??
      (client?.can("read_contact") === true ? createApiContactSource(client) : undefined);
    if (source === undefined) return undefined;
    this.#directory = new ContactDirectoryController(source);
    this.watchDirectory(this.#directory);
    return this.#directory;
  }

  #nameOf(participant: BrowserGroupParticipant): string {
    if (participant.id === this.getAttribute("self-id")) return this.text("group.you");
    const known = this.#directory
      ?.getSnapshot()
      .contacts.find((contact) => contact.id === participant.id);
    return (
      this.resolveName?.(participant) ??
      (known === undefined ? undefined : contactDisplayName(known)) ??
      participant.phoneNumber ??
      participant.username ??
      participant.id
    );
  }

  protected renderContent(snapshot: GroupSnapshot | undefined): readonly Node[] {
    const controller = this.#controller();
    const focused = focusKey(this.root);
    const root = this.decorate(element("section"), "groupDetails");
    root.className = this.rootClass("pmfa-group");
    root.setAttribute("aria-labelledby", "pmfa-group-title");
    const busy = snapshot?.pending !== undefined;
    root.setAttribute("aria-busy", String(snapshot?.status === "loading" || busy));
    const head = this.decorate(element("header"), "drawerHeader");
    head.className = "pmfa-group-head";
    const title = textElement("h2", this.text("group.info"));
    title.className = "pmfa-group-title";
    title.id = "pmfa-group-title";
    head.append(title);
    if (this.hasAttribute("closable")) {
      const close = this.decorate(document.createElement("button"), "drawerClose");
      close.type = "button";
      close.className = "pmfa-btn pmfa-btn-ghost pmfa-btn-icon";
      close.dataset.focusKey = "close";
      close.setAttribute("aria-label", this.text("common.close"));
      close.append(icon("close"));
      close.addEventListener("click", () =>
        this.dispatchEvent(new CustomEvent("pmfa-close", { bubbles: true, composed: true })),
      );
      head.append(close);
    }
    root.append(head);
    const status = textElement("p", "");
    status.className = "pmfa-group-status";
    status.setAttribute("role", "status");
    root.append(status);
    if (controller === undefined || snapshot === undefined) return [root];
    status.textContent =
      snapshot.pending !== undefined
        ? ""
        : snapshot.failed !== undefined && snapshot.failed !== "load"
          ? this.text("group.failed", { error: snapshot.error ?? "" })
          : snapshot.done !== undefined &&
              snapshot.done !== "leave" &&
              snapshot.done !== "inviteCode"
            ? this.text("group.saved")
            : "";
    if (snapshot.status === "left") {
      if (this.#status !== "left") {
        this.#status = "left";
        queueMicrotask(() =>
          this.dispatchEvent(new CustomEvent("pmfa-left", { bubbles: true, composed: true })),
        );
      }
      const note = textElement("p", this.text("group.left"));
      note.className = "pmfa-newchat-state";
      root.append(note);
      return [root];
    }
    this.#status = snapshot.status;
    const info = snapshot.group;
    if (info === undefined) {
      if (snapshot.status === "error") {
        const node = element("div");
        node.className = "pmfa-newchat-state";
        node.setAttribute("role", "alert");
        node.append(
          textElement("p", this.text("group.loadError")),
          actionButton(this.text("common.retry"), "pmfa-btn", () => void controller.load()),
        );
        root.append(node);
      } else {
        const node = textElement("p", this.text("group.loading"));
        node.className = "pmfa-newchat-state";
        node.setAttribute("role", "status");
        root.append(node);
      }
      return [root];
    }
    const manage = controller.canManage;
    const body = element("div");
    body.className = "pmfa-group-body";
    const hero = element("div");
    hero.className = "pmfa-group-hero";
    const big = avatar(info.id, info.name);
    big.classList.add("pmfa-avatar-l");
    hero.append(big, this.#field("name", info.name, manage, busy, controller));
    const meta = textElement(
      "p",
      this.text("group.members", {
        count: new Intl.NumberFormat(this.locale().code).format(info.participants.length),
      }) +
        (info.createdAt > 0
          ? ` · ${this.text("group.created", {
              date: new Intl.DateTimeFormat(this.locale().code, { dateStyle: "medium" }).format(
                info.createdAt * 1000,
              ),
            })}`
          : ""),
    );
    meta.className = "pmfa-group-meta";
    hero.append(meta);
    body.append(hero, this.#field("description", info.description, manage, busy, controller));
    if (manage) {
      const add = this.#addMembers(info.participants, busy, controller);
      if (add !== undefined) body.append(add);
    }
    body.append(this.#members(info.participants, manage, busy, controller));
    body.append(this.#invite(snapshot, manage, busy, controller));
    if (manage) body.append(this.#settings(busy, controller));
    else {
      const note = textElement("p", this.text("group.readOnly"));
      note.className = "pmfa-newchat-note";
      body.append(note);
    }
    root.append(body);
    queueMicrotask(() => restoreFocus(this.root, focused));
    return [root];
  }

  #field(
    kind: "name" | "description",
    value: string,
    manage: boolean,
    busy: boolean,
    controller: GroupController,
  ): HTMLElement {
    const label = this.text(kind === "name" ? "group.rename" : "group.description");
    if (this.#editing === kind) {
      const form = document.createElement("form");
      form.className = "pmfa-group-edit";
      const id = `pmfa-group-${kind}`;
      const labelNode = textElement("label", label);
      labelNode.className = "pmfa-label";
      labelNode.setAttribute("for", id);
      const input =
        kind === "description" ? document.createElement("textarea") : document.createElement("input");
      input.id = id;
      input.className = "pmfa-input";
      input.dataset.focusKey = `edit:${kind}`;
      input.value = value;
      input.maxLength = kind === "name" ? 100 : 2048;
      if (input instanceof HTMLTextAreaElement) input.rows = 3;
      else input.required = true;
      const actions = element("span");
      actions.className = "pmfa-group-edit-actions";
      const cancel = actionButton(this.text("common.cancel"), "pmfa-btn pmfa-btn-ghost", () => {
        this.#editing = undefined;
        this.render();
      });
      const save = document.createElement("button");
      save.type = "submit";
      save.className = "pmfa-btn pmfa-btn-primary";
      save.textContent = this.text("common.save");
      save.disabled = busy;
      actions.append(cancel, save);
      form.append(labelNode, input, actions);
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const run = kind === "name" ? controller.rename(input.value) : controller.describe(input.value);
        void run.then((ok) => {
          if (ok) {
            this.#editing = undefined;
            this.render();
          }
        });
      });
      queueMicrotask(() => input.focus());
      return form;
    }
    const field = element("div");
    field.className = `pmfa-group-field pmfa-group-field-${kind === "name" ? "title" : "text"}`;
    if (kind === "description") {
      const labelNode = textElement("span", label);
      labelNode.className = "pmfa-label";
      field.append(labelNode);
    }
    const shown = textElement(
      "span",
      value === "" && kind === "description" ? this.text("group.noDescription") : value,
    );
    shown.className = value === "" ? "pmfa-group-empty" : "pmfa-group-value";
    field.append(shown);
    if (manage) {
      const edit = actionButton(this.text("group.edit"), "pmfa-btn pmfa-btn-ghost", () => {
        this.#editing = kind;
        this.render();
      });
      edit.dataset.focusKey = `edit-button:${kind}`;
      edit.setAttribute("aria-label", `${this.text("group.edit")}: ${label}`);
      edit.disabled = busy;
      field.append(edit);
    }
    return field;
  }

  #members(
    participants: readonly BrowserGroupParticipant[],
    manage: boolean,
    busy: boolean,
    controller: GroupController,
  ): HTMLElement {
    const self = this.getAttribute("self-id");
    const sorted = [...participants].sort(
      (a, b) =>
        Number(b.id === self) - Number(a.id === self) ||
        Number(b.isAdmin || b.isSuperAdmin) - Number(a.isAdmin || a.isSuperAdmin),
    );
    const list = this.decorate(element("ul"), "groupParticipants");
    list.className = "pmfa-group-members";
    list.setAttribute("aria-label", this.text("group.members", { count: String(participants.length) }));
    for (const participant of sorted) {
      const name = this.#nameOf(participant);
      const admin = participant.isAdmin || participant.isSuperAdmin;
      const item = element("li");
      item.className = "pmfa-person pmfa-group-member";
      const text = element("span");
      text.className = "pmfa-person-text";
      const nameNode = textElement("span", name);
      nameNode.className = "pmfa-person-name";
      text.append(nameNode);
      if (participant.phoneNumber !== undefined && participant.phoneNumber !== name) {
        const sub = textElement("span", participant.phoneNumber);
        sub.className = "pmfa-person-sub";
        text.append(sub);
      }
      item.append(avatar(participant.id, name), text);
      if (admin) {
        const badge = textElement("span", this.text("group.admin"));
        badge.className = "pmfa-group-badge";
        item.append(badge);
      }
      if (manage && participant.id !== self) {
        const menu = document.createElement("details");
        menu.className = "pmfa-conv-menu";
        const summary = document.createElement("summary");
        summary.dataset.focusKey = `member:${participant.id}`;
        summary.setAttribute("aria-label", this.text("group.memberActions", { name }));
        summary.append(icon("more"));
        const items = element("div");
        items.className = "pmfa-conv-menu-items";
        const close = () => {
          menu.open = false;
        };
        const role = actionButton(
          this.text(admin ? "group.dismissAdmin" : "group.makeAdmin"),
          "",
          () => {
            close();
            void controller.participants(admin ? "demote" : "promote", [participant.id]);
          },
        );
        const remove = actionButton(this.text("group.remove"), "pmfa-menu-danger", () => {
          close();
          void controller.participants("remove", [participant.id]);
        });
        role.disabled = busy;
        remove.disabled = busy;
        items.append(role, remove);
        menu.append(summary, items);
        menu.addEventListener("keydown", (event) => {
          if (event.key === "Escape") {
            menu.open = false;
            summary.focus();
          }
        });
        item.append(menu);
      }
      list.append(item);
    }
    return list;
  }

  #addMembers(
    participants: readonly BrowserGroupParticipant[],
    busy: boolean,
    controller: GroupController,
  ): HTMLElement | undefined {
    if (!this.#adding) {
      if (this.#contacts === undefined && this.client?.can("read_contact") !== true) return undefined;
      const open = actionButton(this.text("group.addMembers"), "pmfa-btn", () => {
        this.#adding = true;
        const directory = this.#directoryController();
        if (directory?.getSnapshot().status === "idle") void directory.load();
        this.render();
      });
      open.prepend(icon("plus"));
      open.dataset.focusKey = "add-open";
      open.disabled = busy;
      return open;
    }
    const directory = this.#directoryController();
    if (directory === undefined) return undefined;
    const wrap = element("div");
    wrap.className = "pmfa-group-add";
    if (this.#addInput === undefined) {
      this.#addInput = document.createElement("input");
      this.bindSearch(this.#addInput, () => this.#directory, () => {
        this.#adding = false;
        this.render();
      });
    }
    wrap.append(this.searchField(directory, this.#addInput));
    const snapshot = directory.getSnapshot();
    const state = this.directoryState(snapshot, () => void directory.retry());
    if (state !== undefined) wrap.append(state);
    const members = new Set(participants.map((participant) => participant.id));
    wrap.append(
      this.contactRows(
        filterContacts(snapshot.contacts, snapshot.query).filter((contact) => !members.has(contact.id)),
        {
          label: this.text("group.addMembers"),
          selectable: true,
          selected: this.#picked,
          onSelect: (contact) => {
            if (this.#picked.has(contact.id)) this.#picked.delete(contact.id);
            else this.#picked.add(contact.id);
            this.render();
          },
        },
      ),
    );
    const actions = element("span");
    actions.className = "pmfa-group-edit-actions";
    const cancel = actionButton(this.text("common.cancel"), "pmfa-btn pmfa-btn-ghost", () => {
      this.#adding = false;
      this.#picked.clear();
      this.render();
    });
    const add = actionButton(this.text("group.add"), "pmfa-btn pmfa-btn-primary", () => {
      void controller.participants("add", [...this.#picked]).then((ok) => {
        if (ok) {
          this.#adding = false;
          this.#picked.clear();
          this.render();
        }
      });
    });
    add.dataset.focusKey = "add-submit";
    add.disabled = busy || this.#picked.size === 0;
    actions.append(cancel, add);
    wrap.append(actions);
    return wrap;
  }

  #invite(
    snapshot: GroupSnapshot,
    manage: boolean,
    busy: boolean,
    controller: GroupController,
  ): HTMLElement {
    const section = element("section");
    section.className = "pmfa-group-section";
    section.setAttribute("aria-label", this.text("group.inviteLink"));
    const heading = textElement("h3", this.text("group.inviteLink"));
    heading.className = "pmfa-newchat-section";
    section.append(heading);
    if (snapshot.inviteCode !== undefined) {
      const link = `https://chat.whatsapp.com/${snapshot.inviteCode}`;
      const row = element("div");
      row.className = "pmfa-group-invite";
      const code = textElement("code", link);
      code.className = "pmfa-group-code";
      const copy = actionButton(this.text(this.#copied ? "group.copied" : "group.copy"), "pmfa-btn", () => {
        void globalThis.navigator?.clipboard?.writeText(link).then(
          () => {
            this.#copied = true;
            this.render();
          },
          () => undefined,
        );
      });
      copy.dataset.focusKey = "copy";
      row.append(code, copy);
      section.append(row);
    } else {
      const show = actionButton(this.text("group.showInvite"), "pmfa-btn", () => void controller.showInviteCode());
      show.prepend(icon("link"));
      show.dataset.focusKey = "show-invite";
      show.disabled = busy;
      section.append(show);
    }
    if (manage) {
      const reset = actionButton(this.text("group.resetInvite"), "pmfa-btn pmfa-btn-ghost", () => {
        this.#copied = false;
        void controller.revokeInviteCode();
      });
      reset.dataset.focusKey = "reset-invite";
      reset.disabled = busy;
      section.append(reset);
    }
    return section;
  }

  #settings(busy: boolean, controller: GroupController): HTMLElement {
    const section = element("section");
    section.className = "pmfa-group-section";
    const heading = textElement("h3", this.text("group.settings"));
    heading.className = "pmfa-newchat-section";
    const note = textElement("p", this.text("group.settingsNote"));
    note.className = "pmfa-newchat-note";
    section.append(heading, note);
    for (const setting of SETTINGS) {
      const row = element("div");
      row.className = "pmfa-group-setting";
      row.setAttribute("role", "group");
      row.setAttribute("aria-label", this.text(setting.label));
      const label = textElement("span", this.text(setting.label));
      label.className = "pmfa-group-setting-label";
      const options = element("span");
      options.className = "pmfa-segmented";
      for (const option of setting.options) {
        const choice = actionButton(this.text(option.label), "pmfa-btn", () =>
          void controller.changeSetting(option.change),
        );
        choice.dataset.focusKey = `${setting.label}:${option.label}`;
        choice.disabled = busy;
        options.append(choice);
      }
      row.append(label, options);
      section.append(row);
    }
    if (!this.#confirmLeave) {
      const leave = actionButton(this.text("group.leave"), "pmfa-btn pmfa-group-leave", () => {
        this.#confirmLeave = true;
        this.render();
        queueMicrotask(() => this.root.querySelector<HTMLElement>("[data-focus-key=leave-cancel]")?.focus());
      });
      leave.dataset.focusKey = "leave";
      leave.disabled = busy;
      section.append(leave);
    } else {
      const confirm = element("div");
      confirm.className = "pmfa-group-confirm";
      confirm.setAttribute("role", "alertdialog");
      confirm.setAttribute("aria-label", this.text("group.leave"));
      const actions = element("span");
      actions.className = "pmfa-group-edit-actions";
      const cancel = actionButton(this.text("common.cancel"), "pmfa-btn pmfa-btn-ghost", () => {
        this.#confirmLeave = false;
        this.render();
      });
      cancel.dataset.focusKey = "leave-cancel";
      const leave = actionButton(this.text("group.leave"), "pmfa-btn pmfa-btn-danger", () => {
        void controller.leave();
      });
      leave.disabled = busy;
      actions.append(cancel, leave);
      confirm.append(textElement("p", this.text("group.leaveConfirm")), actions);
      section.append(confirm);
    }
    return section;
  }
}

export function defineContactElements(
  registry: CustomElementRegistry = customElements,
): void {
  if (registry.get("pmfa-new-chat") === undefined)
    registry.define("pmfa-new-chat", PolymorfaNewChatElement);
  if (registry.get("pmfa-group-details") === undefined)
    registry.define("pmfa-group-details", PolymorfaGroupDetailsElement);
}
