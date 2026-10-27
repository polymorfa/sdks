import {
  ObservableController,
  type ControllerSnapshot,
} from "../controller.js";
import type { InboxConversation } from "../dropin/inbox.js";
import type { BrowserGroup } from "../messaging/types.js";
import {
  ContactDirectoryController,
  contactDisplayName,
  type ContactDirectorySource,
  type DirectoryContact,
} from "./directory.js";
import type { GroupSource } from "./groups.js";

/** WhatsApp allows up to 256 people when a group is created this way. */
export const MAX_NEW_GROUP_PARTICIPANTS = 256;

export type NewChatView = "contacts" | "groupMembers" | "groupDetails";

export interface NewChatSnapshot extends ControllerSnapshot {
  readonly view: NewChatView;
  /** People picked for a new group, in the order they were picked. */
  readonly selected: readonly DirectoryContact[];
  readonly groupName: string;
  readonly creating: boolean;
  readonly error?: string;
}

export interface NewChatControllerOptions {
  /** Contacts to list; a source or an existing directory controller. */
  readonly contacts: ContactDirectorySource | ContactDirectoryController;
  /** Enables "New group". Omit to offer one-to-one chats only. */
  readonly groups?: Pick<GroupSource, "create">;
  /** Called with the conversation to open, after a pick or a created group. */
  readonly onOpen?: (conversation: InboxConversation) => void;
  readonly now?: () => number;
}

/** The one-to-one conversation for a contact. */
export function conversationForContact(
  contact: DirectoryContact,
): InboxConversation {
  return {
    id: contact.id,
    kind: "direct",
    name: contactDisplayName(contact),
    ...(contact.phoneNumber === undefined
      ? {}
      : { phoneNumber: contact.phoneNumber }),
    ...(contact.avatarUrl === undefined ? {} : { avatarUrl: contact.avatarUrl }),
    lastActivity: 0,
    unreadCount: 0,
  };
}

/** The conversation for a group; its ID is the group ID. */
export function conversationForGroup(group: BrowserGroup): InboxConversation {
  return {
    id: group.id,
    kind: "group",
    name: group.name,
    lastActivity: 0,
    unreadCount: 0,
  };
}

/**
 * Framework-neutral state for the new-chat panel: a searchable contacts
 * directory, starting a one-to-one chat, and the two-step new-group flow.
 */
export class NewChatController extends ObservableController<NewChatSnapshot> {
  readonly directory: ContactDirectoryController;
  readonly #ownsDirectory: boolean;
  readonly #groups: Pick<GroupSource, "create"> | undefined;
  readonly #onOpen: ((conversation: InboxConversation) => void) | undefined;
  #create = new AbortController();

  constructor(options: NewChatControllerOptions) {
    super(
      { view: "contacts", selected: [], groupName: "", creating: false },
      options.now,
    );
    this.#ownsDirectory = !(options.contacts instanceof ContactDirectoryController);
    this.directory =
      options.contacts instanceof ContactDirectoryController
        ? options.contacts
        : new ContactDirectoryController(
            options.contacts,
            options.now === undefined ? {} : { now: options.now },
          );
    this.#groups = options.groups;
    this.#onOpen = options.onOpen;
  }

  /** Whether "New group" is offered. */
  get canCreateGroup(): boolean {
    return this.#groups !== undefined;
  }

  /** Load the directory if it has not loaded yet. */
  start(): void {
    if (this.directory.getSnapshot().status === "idle")
      void this.directory.load();
  }

  /** Open the one-to-one conversation with a contact. */
  open(contact: DirectoryContact): InboxConversation {
    const conversation = conversationForContact(contact);
    this.#onOpen?.(conversation);
    return conversation;
  }

  startGroup(): void {
    if (this.#groups === undefined) return;
    this.#set({ view: "groupMembers", selected: [], groupName: "" });
  }

  toggle(contact: DirectoryContact): void {
    const { selected } = this.getSnapshot();
    const exists = selected.some((item) => item.id === contact.id);
    if (!exists && selected.length >= MAX_NEW_GROUP_PARTICIPANTS) return;
    this.#set({
      selected: exists
        ? selected.filter((item) => item.id !== contact.id)
        : [...selected, contact],
    });
  }

  isSelected(contactId: string): boolean {
    return this.getSnapshot().selected.some((item) => item.id === contactId);
  }

  /** Continue from picking members to naming the group. */
  next(): void {
    const current = this.getSnapshot();
    if (current.view === "groupMembers" && current.selected.length > 0)
      this.#set({ view: "groupDetails" });
  }

  /** One step back; from the contacts list this does nothing. */
  back(): void {
    const { view } = this.getSnapshot();
    this.#create.abort();
    if (view === "groupDetails") this.#set({ view: "groupMembers", creating: false });
    else if (view === "groupMembers")
      this.#set({ view: "contacts", selected: [], groupName: "", creating: false });
  }

  /** Return to the contacts list and clear the search and any group draft. */
  reset(): void {
    this.#create.abort();
    this.directory.setQuery("");
    this.#set({ view: "contacts", selected: [], groupName: "", creating: false });
  }

  setGroupName(groupName: string): void {
    this.#set({ groupName });
  }

  /** Create the group and open its conversation. */
  async createGroup(): Promise<BrowserGroup | undefined> {
    const current = this.getSnapshot();
    const name = current.groupName.trim();
    if (
      this.#groups === undefined ||
      current.creating ||
      name === "" ||
      current.selected.length === 0
    )
      return undefined;
    this.#create.abort();
    const abort = new AbortController();
    this.#create = abort;
    this.#set({ creating: true });
    try {
      const group = await this.#groups.create(
        { name, participants: current.selected.map((contact) => contact.id) },
        abort.signal,
      );
      if (abort.signal.aborted) return undefined;
      this.#set({ view: "contacts", selected: [], groupName: "", creating: false });
      this.#onOpen?.(conversationForGroup(group));
      return group;
    } catch (cause) {
      if (!abort.signal.aborted)
        this.#set({
          creating: false,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      return undefined;
    }
  }

  protected override onDispose(): void {
    this.#create.abort();
    if (this.#ownsDirectory) this.directory.dispose();
  }

  #set(fields: Partial<Omit<NewChatSnapshot, "revision" | "updatedAt">>): void {
    try {
      const { revision: _r, updatedAt: _u, error: _e, ...current } =
        this.getSnapshot();
      void _r;
      void _u;
      void _e;
      this.transition({ ...current, ...fields });
    } catch {
      // Disposed while a request was in flight.
    }
  }
}
