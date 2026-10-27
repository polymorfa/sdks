import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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
import type { SlotClassNames } from "../appearance/index.js";
import {
  Icon,
  text,
  useShell,
  useSlots,
  type Slots,
} from "./components.js";
import {
  useOptionalPolymorfaClient,
  usePermissions,
  usePolymorfa,
} from "./context.js";
import { Avatar } from "./dropin.js";
import { useController, useOwnedController } from "./hooks.js";

const NO_SUBSCRIPTION = () => () => undefined;
const NO_SNAPSHOT = () => undefined;

/** `useController` for a controller that may be absent. */
function useOptionalController<T>(
  controller: { getSnapshot(): T; subscribe(listener: () => void): () => void } | undefined,
): T | undefined {
  return useSyncExternalStore(
    controller?.subscribe ?? NO_SUBSCRIPTION,
    controller?.getSnapshot ?? NO_SNAPSHOT,
    controller?.getSnapshot ?? NO_SNAPSHOT,
  );
}

type Configuration = ReturnType<typeof usePolymorfa>;

// ── Contact list ──────────────────────────────────────────────────────

interface ContactRowsProps {
  readonly contacts: readonly DirectoryContact[];
  readonly onSelect: (contact: DirectoryContact) => void;
  /** Checkbox rows for picking several people, such as group members. */
  readonly selectable?: boolean;
  readonly selectedIds?: readonly string[];
  /** Accessible name of the list. */
  readonly label: string;
  /** Extra content after the name, for example a role. */
  readonly renderMeta?: (contact: DirectoryContact) => ReactNode;
  readonly slots: Slots;
  /** Root props from `useShell` when the list stands alone. */
  readonly root?: ReturnType<typeof useShell>;
}

/** Rows of contacts. Arrow keys, Home and End move between rows. */
function ContactRows({
  contacts,
  onSelect,
  selectable = false,
  selectedIds = [],
  label,
  renderMeta,
  slots,
  root,
}: ContactRowsProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const rows = listRef.current?.querySelectorAll<HTMLButtonElement>(
      "button[data-contact-id]",
    );
    if (rows === undefined || rows.length === 0) return;
    const target =
      event.key === "ArrowDown"
        ? index + 1
        : event.key === "ArrowUp"
          ? index - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? rows.length - 1
              : undefined;
    if (target === undefined) return;
    event.preventDefault();
    rows[Math.max(0, Math.min(target, rows.length - 1))]?.focus();
  }
  return (
    <ul
      {...(root ?? slots("contactList", "pmfa-contact-list"))}
      ref={listRef}
      aria-label={label}
    >
      {contacts.map((contact, index) => {
        const name = contactDisplayName(contact);
        const secondary =
          contact.phoneNumber !== undefined && contact.phoneNumber !== name
            ? contact.phoneNumber
            : contact.pushName !== undefined && contact.pushName !== name
              ? `~${contact.pushName}`
              : undefined;
        const checked = selected.has(contact.id);
        return (
          <li key={contact.id}>
            <button
              type="button"
              {...slots(
                "contactItem",
                `pmfa-person${checked ? " pmfa-person-selected" : ""}`,
              )}
              data-contact-id={contact.id}
              {...(selectable
                ? { role: "checkbox", "aria-checked": checked }
                : {})}
              onClick={() => onSelect(contact)}
              onKeyDown={(event) => move(event, index)}
            >
              <Avatar
                id={contact.id}
                name={name}
                {...(contact.avatarUrl === undefined
                  ? {}
                  : { src: contact.avatarUrl })}
                slots={slots}
              />
              <span className="pmfa-person-text">
                <span className="pmfa-person-name">{name}</span>
                {secondary !== undefined && (
                  <span className="pmfa-person-sub">{secondary}</span>
                )}
              </span>
              {renderMeta?.(contact)}
              {selectable && (
                <span className="pmfa-person-check" aria-hidden="true">
                  {checked && <Icon name="check" />}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export interface ContactListViewProps {
  readonly contacts: readonly DirectoryContact[];
  readonly onSelect: (contact: DirectoryContact) => void;
  /** Checkbox rows for picking several people, such as group members. */
  readonly selectable?: boolean;
  readonly selectedIds?: readonly string[];
  /** Accessible name of the list. */
  readonly label: string;
  /** Extra content after the name, for example a role. */
  readonly renderMeta?: (contact: DirectoryContact) => ReactNode;
  readonly className?: string;
  /** Classes for the `contactList`, `contactItem` and `avatar` slots. */
  readonly classNames?: SlotClassNames;
}

/**
 * Controlled contact rows: you supply the contacts and handle the choice.
 * Arrow keys, Home and End move between rows. Uses the shared stylesheet,
 * theme and `appearance.elements` like every other component.
 */
export function ContactListView({
  className,
  classNames,
  ...props
}: ContactListViewProps) {
  const slots = useSlots(classNames);
  const root = useShell(slots, "contactList", "pmfa-contact-list", className);
  return <ContactRows {...props} slots={slots} root={root} />;
}

export interface ContactListProps {
  /** Supply a directory controller to share it with other components. */
  readonly controller?: ContactDirectoryController;
  /**
   * Where contacts come from. Defaults to the WhatsApp account's contacts
   * through the provider's client token (`read_contact`).
   */
  readonly contacts?: ContactDirectorySource;
  readonly onSelect: (contact: DirectoryContact) => void;
  readonly selectable?: boolean;
  readonly selectedIds?: readonly string[];
  /** Show the search field. Defaults to `true`. */
  readonly search?: boolean;
  readonly title?: ReactNode;
  readonly renderMeta?: (contact: DirectoryContact) => ReactNode;
  readonly className?: string;
  readonly classNames?: SlotClassNames;
}

/**
 * The account's Contacts list on its own: searchable by name (case and
 * accents folded) or number, with loading, empty, error and retry states.
 */
export function ContactList({
  controller,
  contacts,
  onSelect,
  selectable = false,
  selectedIds,
  search = true,
  title,
  renderMeta,
  className,
  classNames,
}: ContactListProps) {
  const client = useOptionalPolymorfaClient();
  if (controller === undefined && contacts === undefined && client === undefined)
    throw new Error(
      '<ContactList/> needs <PolymorfaProvider tokenEndpoint="/api/polymorfa/token"> or a contacts source.',
    );
  const directory = useOwnedController<ContactDirectoryController>(
    controller,
    () => new ContactDirectoryController(contacts ?? createApiContactSource(client!)),
  )!;
  const snapshot: ContactDirectorySnapshot = useController(directory);
  useEffect(() => {
    if (directory.getSnapshot().status === "idle") void directory.load();
  }, [directory]);
  const configuration = usePolymorfa();
  const slots = useSlots(classNames);
  const root = useShell(slots, "contactDirectory", "pmfa-newchat pmfa-contacts", className);
  const headingId = useId();
  const label = text(configuration, "newChat.contacts");
  return (
    <section {...root} aria-labelledby={headingId} data-pmfa="contact-list">
      <header {...slots("newChatHeader", "pmfa-newchat-head")}>
        <h2 className="pmfa-newchat-title" id={headingId}>
          {title ?? label}
        </h2>
      </header>
      {search && (
        <div {...slots("newChatSearch", "pmfa-search")}>
          <Icon name="search" />
          <input
            {...slots("input", "pmfa-input")}
            type="search"
            value={snapshot.query}
            placeholder={text(configuration, "newChat.search")}
            aria-label={text(configuration, "newChat.search")}
            onChange={(event) => directory.setQuery(event.currentTarget.value)}
          />
        </div>
      )}
      <div className="pmfa-newchat-body" aria-busy={snapshot.status === "loading"}>
        <DirectoryState
          snapshot={snapshot}
          configuration={configuration}
          onRetry={() => void directory.retry()}
        />
        {snapshot.results.length > 0 && (
          <ContactRows
            contacts={snapshot.results}
            label={label}
            onSelect={onSelect}
            selectable={selectable}
            {...(selectedIds === undefined ? {} : { selectedIds })}
            {...(renderMeta === undefined ? {} : { renderMeta })}
            slots={slots}
          />
        )}
      </div>
    </section>
  );
}

function DirectoryState({
  snapshot,
  configuration,
  onRetry,
}: {
  readonly snapshot: ContactDirectorySnapshot;
  readonly configuration: Configuration;
  readonly onRetry: () => void;
}) {
  if (snapshot.status === "loading" && snapshot.contacts.length === 0)
    return (
      <p className="pmfa-newchat-state" role="status">
        {text(configuration, "newChat.loading")}
      </p>
    );
  if (snapshot.status === "error")
    return (
      <div className="pmfa-newchat-state" role="alert">
        <p>
          {text(
            configuration,
            snapshot.errorKind === "permission"
              ? "newChat.permission"
              : "newChat.loadError",
          )}
        </p>
        {snapshot.errorKind !== "permission" && (
          <button type="button" className="pmfa-btn" onClick={onRetry}>
            {text(configuration, "common.retry")}
          </button>
        )}
      </div>
    );
  if (snapshot.status === "ready" && snapshot.results.length === 0)
    return (
      <p className="pmfa-newchat-state">
        {text(
          configuration,
          snapshot.query.trim() === "" ? "newChat.empty" : "newChat.noMatches",
        )}
      </p>
    );
  return null;
}

/** "Message +1555…" for a number that is not in the list. */
function PhoneRow({
  snapshot,
  directory,
  configuration,
  onOpen,
  slots,
}: {
  readonly snapshot: ContactDirectorySnapshot;
  readonly directory: ContactDirectoryController;
  readonly configuration: Configuration;
  readonly onOpen: (contact: DirectoryContact) => void;
  readonly slots: Slots;
}) {
  const phone = snapshot.phone;
  if (phone === undefined || !directory.canLookup) return null;
  const digits = phone.replace(/\D/g, "");
  if (
    snapshot.results.some(
      (contact) => contact.phoneNumber?.replace(/\D/g, "") === digits,
    )
  )
    return null;
  const { lookup } = snapshot;
  if (lookup.status === "found")
    return (
      <button
        type="button"
        {...slots("contactItem", "pmfa-person")}
        onClick={() => onOpen(lookup.contact)}
      >
        <Avatar id={lookup.contact.id} name={phone} slots={slots} />
        <span className="pmfa-person-text">
          <span className="pmfa-person-name">
            {text(configuration, "newChat.message", { phone })}
          </span>
        </span>
      </button>
    );
  return (
    <div className="pmfa-newchat-lookup">
      <button
        type="button"
        className="pmfa-btn"
        disabled={lookup.status === "checking"}
        onClick={() => void directory.lookupPhone()}
      >
        <Icon name="search" />
        {text(configuration, "newChat.checkNumber", { phone })}
      </button>
      <p role="status" className="pmfa-newchat-note">
        {lookup.status === "checking"
          ? text(configuration, "newChat.checking", { phone })
          : lookup.status === "not_found"
            ? text(configuration, "newChat.notOnWhatsApp", { phone })
            : lookup.status === "error"
              ? text(configuration, "newChat.lookupError", { phone })
              : ""}
      </p>
    </div>
  );
}

// ── NewChat ───────────────────────────────────────────────────────────

export interface NewChatProps {
  /** Supply a controller to drive the panel from outside. */
  readonly controller?: NewChatController;
  /**
   * Where contacts come from. Defaults to the WhatsApp account's contacts
   * through the provider's client token (`read_contact`).
   */
  readonly contacts?: ContactDirectorySource;
  /**
   * Group creation. Defaults to the API when the token allows
   * `groups_manage`; pass `false` to hide "New group".
   */
  readonly groups?: Pick<GroupSource, "create"> | false;
  /** Called with the conversation to open. */
  readonly onOpen: (conversation: InboxConversation) => void;
  /** Shows a back button that calls this. */
  readonly onClose?: () => void;
  readonly title?: ReactNode;
  readonly className?: string;
  readonly classNames?: SlotClassNames;
}

/**
 * Start a conversation: search the account's contacts, check a number that
 * is not saved, or create a group. Opens the chosen conversation through
 * `onOpen`; it never sends a message by itself.
 */
export function NewChat({
  controller,
  contacts,
  groups,
  onOpen,
  onClose,
  title,
  className,
  classNames,
}: NewChatProps) {
  const client = useOptionalPolymorfaClient();
  const permissions = usePermissions();
  const latestOpen = useRef(onOpen);
  latestOpen.current = onOpen;
  if (controller === undefined && contacts === undefined && client === undefined)
    throw new Error(
      '<NewChat/> needs <PolymorfaProvider tokenEndpoint="/api/polymorfa/token"> or a contacts source.',
    );
  // Without a client the API default does not exist, whatever `can()` says.
  const canCreate =
    groups !== false &&
    (groups !== undefined ||
      (client !== undefined && permissions.can("groups_manage")));
  const newChat = useOwnedController<NewChatController>(
    controller,
    () =>
      new NewChatController({
        contacts: contacts ?? createApiContactSource(client!),
        ...(canCreate
          ? { groups: groups || createApiGroupSource(client!) }
          : {}),
        onOpen: (conversation) => latestOpen.current(conversation),
      }),
  )!;
  const snapshot: NewChatSnapshot = useController(newChat);
  const directory: ContactDirectorySnapshot = useController(newChat.directory);
  useEffect(() => newChat.start(), [newChat]);
  const configuration = usePolymorfa();
  const slots = useSlots(classNames);
  const root = useShell(slots, "newChat", "pmfa-newchat", className);
  const headingId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    searchRef.current?.focus();
  }, [snapshot.view]);
  const back =
    snapshot.view === "contacts" ? onClose : () => newChat.back();
  const heading =
    snapshot.view === "contacts"
      ? (title ?? text(configuration, "newChat.title"))
      : snapshot.view === "groupMembers"
        ? text(configuration, "newChat.addMembers")
        : text(configuration, "newChat.newGroup");
  const selectedIds = snapshot.selected.map((contact) => contact.id);
  const search = (
    <div {...slots("newChatSearch", "pmfa-search")}>
      <Icon name="search" />
      <input
        ref={searchRef}
        {...slots("input", "pmfa-input")}
        type="search"
        value={directory.query}
        placeholder={text(configuration, "newChat.search")}
        aria-label={text(configuration, "newChat.search")}
        onChange={(event) => newChat.directory.setQuery(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            event.currentTarget
              .closest(".pmfa-newchat")
              ?.querySelector<HTMLButtonElement>("button[data-contact-id]")
              ?.focus();
          } else if (event.key === "Escape" && directory.query !== "") {
            event.preventDefault();
            newChat.directory.setQuery("");
          }
        }}
      />
    </div>
  );
  return (
    <section
      {...root}
      aria-labelledby={headingId}
      data-pmfa="new-chat"
      data-view={snapshot.view}
      onKeyDown={(event) => {
        if (event.key === "Escape" && back !== undefined && directory.query === "") {
          event.preventDefault();
          back();
        }
      }}
    >
      <header {...slots("newChatHeader", "pmfa-newchat-head")}>
        {back !== undefined && (
          <button
            type="button"
            {...slots("backButton", "pmfa-btn pmfa-btn-ghost pmfa-btn-icon")}
            aria-label={text(
              configuration,
              snapshot.view === "contacts" ? "common.close" : "inbox.back",
            )}
            onClick={back}
          >
            <Icon name="back" />
          </button>
        )}
        <h2 className="pmfa-newchat-title" id={headingId}>
          {heading}
        </h2>
      </header>

      {snapshot.view === "groupDetails" ? (
        <form
          className="pmfa-newchat-group"
          onSubmit={(event) => {
            event.preventDefault();
            void newChat.createGroup();
          }}
        >
          <label {...slots("field", "pmfa-field")}>
            <span {...slots("label", "pmfa-label")}>
              {text(configuration, "newChat.groupName")}
            </span>
            <input
              ref={searchRef}
              {...slots("input", "pmfa-input")}
              value={snapshot.groupName}
              maxLength={100}
              required
              autoComplete="off"
              onChange={(event) => newChat.setGroupName(event.currentTarget.value)}
            />
          </label>
          <p className="pmfa-newchat-note">
            {text(configuration, "group.members", {
              count: new Intl.NumberFormat(configuration.locale.code).format(
                snapshot.selected.length,
              ),
            })}
          </p>
          <ul className="pmfa-pick-chips">
            {snapshot.selected.map((contact) => (
              <li key={contact.id} className="pmfa-pick-chip">
                {contactDisplayName(contact)}
              </li>
            ))}
          </ul>
          {snapshot.error !== undefined && (
            <p role="alert" {...slots("error", "pmfa-error")}>
              {text(configuration, "newChat.createError")}: {snapshot.error}
            </p>
          )}
          <button
            type="submit"
            {...slots("primaryButton", "pmfa-btn pmfa-btn-primary")}
            disabled={snapshot.creating || snapshot.groupName.trim() === ""}
          >
            {text(
              configuration,
              snapshot.creating ? "newChat.creating" : "newChat.create",
            )}
          </button>
        </form>
      ) : (
        <>
          {snapshot.view === "groupMembers" && snapshot.selected.length > 0 && (
            <ul
              className="pmfa-pick-chips"
              aria-label={text(configuration, "newChat.selected", {
                count: String(snapshot.selected.length),
              })}
            >
              {snapshot.selected.map((contact) => {
                const name = contactDisplayName(contact);
                return (
                  <li key={contact.id} className="pmfa-pick-chip">
                    {name}
                    <button
                      type="button"
                      className="pmfa-pick-chip-remove"
                      aria-label={text(configuration, "newChat.removeMember", {
                        name,
                      })}
                      onClick={() => newChat.toggle(contact)}
                    >
                      <Icon name="close" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {search}
          <div
            className="pmfa-newchat-body"
            aria-busy={directory.status === "loading"}
          >
            {snapshot.view === "contacts" && newChat.canCreateGroup && (
              <button
                type="button"
                {...slots("newChatAction", "pmfa-person pmfa-newchat-action")}
                onClick={() => newChat.startGroup()}
              >
                <span className="pmfa-avatar pmfa-newchat-action-icon" aria-hidden="true">
                  <Icon name="group" />
                </span>
                <span className="pmfa-person-text">
                  <span className="pmfa-person-name">
                    {text(configuration, "newChat.newGroup")}
                  </span>
                </span>
              </button>
            )}
            {snapshot.view === "contacts" && (
              <PhoneRow
                snapshot={directory}
                directory={newChat.directory}
                configuration={configuration}
                onOpen={(contact) => newChat.open(contact)}
                slots={slots}
              />
            )}
            <DirectoryState
              snapshot={directory}
              configuration={configuration}
              onRetry={() => void newChat.directory.retry()}
            />
            {directory.results.length > 0 && (
              <>
                <h3 className="pmfa-newchat-section">
                  {text(configuration, "newChat.contacts")}
                </h3>
                <ContactRows
                  contacts={directory.results}
                  label={text(configuration, "newChat.contacts")}
                  selectable={snapshot.view === "groupMembers"}
                  selectedIds={selectedIds}
                  onSelect={(contact) =>
                    snapshot.view === "groupMembers"
                      ? newChat.toggle(contact)
                      : newChat.open(contact)
                  }
                  slots={slots}
                />
              </>
            )}
          </div>
          {snapshot.view === "groupMembers" && (
            <footer className="pmfa-newchat-foot">
              <span role="status" className="pmfa-newchat-note">
                {text(configuration, "newChat.selected", {
                  count: new Intl.NumberFormat(configuration.locale.code).format(
                    snapshot.selected.length,
                  ),
                })}
              </span>
              <button
                type="button"
                {...slots("primaryButton", "pmfa-btn pmfa-btn-primary")}
                disabled={snapshot.selected.length === 0}
                onClick={() => newChat.next()}
              >
                {text(configuration, "newChat.next")}
              </button>
            </footer>
          )}
        </>
      )}
    </section>
  );
}

// ── GroupDetails ──────────────────────────────────────────────────────

export interface GroupDetailsProps {
  /** Supply a controller to drive the panel from outside. */
  readonly controller?: GroupController;
  /** The group to show when no controller is supplied. */
  readonly groupId?: string;
  /** Defaults to the API through the provider's client token. */
  readonly source?: GroupSource;
  /**
   * The signed-in WhatsApp account's user ID, when your app knows it. It
   * marks "You" and hides actions on yourself. The API does not report it.
   */
  readonly selfId?: string;
  /** Contacts offered by "Add members". Omit to hide adding members. */
  readonly contacts?: ContactDirectorySource | ContactDirectoryController;
  /** Names for participants, for example from your contacts. */
  readonly resolveName?: (participant: BrowserGroupParticipant) => string | undefined;
  readonly onClose?: () => void;
  /** Called after this account exits the group. */
  readonly onLeft?: () => void;
  readonly className?: string;
  readonly classNames?: SlotClassNames;
}

const SETTINGS: readonly {
  readonly label: "group.editInfo" | "group.sendMessages" | "group.addOthers" | "group.approve";
  readonly options: readonly {
    readonly label: "group.everyone" | "group.adminsOnly" | "group.on" | "group.off";
    readonly change: GroupSettingChange;
  }[];
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
 * A group's details and roster, with the changes the token allows. WhatsApp
 * decides whether this account may make each change; a refusal shows as an
 * error and the group reloads after every change that succeeds.
 */
export function GroupDetails({
  controller,
  groupId,
  source,
  selfId,
  contacts,
  resolveName,
  onClose,
  onLeft,
  className,
  classNames,
}: GroupDetailsProps) {
  const client = useOptionalPolymorfaClient();
  const permissions = usePermissions();
  if (controller === undefined && groupId === undefined)
    throw new Error("<GroupDetails/> needs a controller or a groupId.");
  if (controller === undefined && source === undefined && client === undefined)
    throw new Error(
      '<GroupDetails/> needs <PolymorfaProvider tokenEndpoint="/api/polymorfa/token"> or a source.',
    );
  const canManage =
    source !== undefined ||
    (client !== undefined && permissions.can("groups_manage"));
  const group = useOwnedController<GroupController>(
    controller,
    () =>
      new GroupController(source ?? createApiGroupSource(client!), groupId!, {
        canManage,
      }),
  )!;
  const snapshot: GroupSnapshot = useController(group);
  useEffect(() => {
    if (group.getSnapshot().status === "idle") void group.load();
  }, [group]);
  // One directory for "Add members" and for naming participants.
  const directory = useOwnedController<ContactDirectoryController>(
    contacts instanceof ContactDirectoryController ? contacts : undefined,
    contacts === undefined || contacts instanceof ContactDirectoryController
      ? undefined
      : () => new ContactDirectoryController(contacts),
  );
  const people: ContactDirectorySnapshot | undefined = useOptionalController(directory);
  useEffect(() => {
    if (directory?.getSnapshot().status === "idle") void directory.load();
  }, [directory]);
  const known = useMemo(
    () => new Map((people?.contacts ?? []).map((contact) => [contact.id, contactDisplayName(contact)])),
    [people],
  );
  const latestLeft = useRef(onLeft);
  latestLeft.current = onLeft;
  useEffect(() => {
    if (snapshot.status === "left") latestLeft.current?.();
  }, [snapshot.status]);
  const configuration = usePolymorfa();
  const slots = useSlots(classNames);
  const root = useShell(slots, "groupDetails", "pmfa-group", className);
  const headingId = useId();
  const busy = snapshot.pending !== undefined;
  const manage = group.canManage;
  const info = snapshot.group;
  const nameOf = (participant: BrowserGroupParticipant) =>
    participant.id === selfId
      ? text(configuration, "group.you")
      : (resolveName?.(participant) ??
        known.get(participant.id) ??
        participant.phoneNumber ??
        participant.username ??
        participant.id);
  const participants = useMemo(() => {
    const list = [...(info?.participants ?? [])];
    // You first, then admins, then everyone else.
    return list.sort(
      (a, b) =>
        Number(b.id === selfId) - Number(a.id === selfId) ||
        Number(b.isAdmin || b.isSuperAdmin) - Number(a.isAdmin || a.isSuperAdmin),
    );
  }, [info, selfId]);

  return (
    <section
      {...root}
      aria-labelledby={headingId}
      aria-busy={snapshot.status === "loading" || busy}
      data-pmfa="group-details"
    >
      <header {...slots("drawerHeader", "pmfa-group-head")}>
        <h2 id={headingId} className="pmfa-group-title">
          {text(configuration, "group.info")}
        </h2>
        {onClose !== undefined && (
          <button
            type="button"
            {...slots("drawerClose", "pmfa-btn pmfa-btn-ghost pmfa-btn-icon")}
            aria-label={text(configuration, "common.close")}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        )}
      </header>

      <p role="status" className="pmfa-group-status">
        {snapshot.pending !== undefined
          ? ""
          : snapshot.failed !== undefined && snapshot.failed !== "load"
            ? text(configuration, "group.failed", { error: snapshot.error ?? "" })
            : snapshot.done !== undefined &&
                snapshot.done !== "leave" &&
                snapshot.done !== "inviteCode"
              ? text(configuration, "group.saved")
              : ""}
      </p>

      {snapshot.status === "left" ? (
        <p className="pmfa-newchat-state">{text(configuration, "group.left")}</p>
      ) : info === undefined ? (
        snapshot.status === "error" ? (
          <div className="pmfa-newchat-state" role="alert">
            <p>{text(configuration, "group.loadError")}</p>
            <button type="button" className="pmfa-btn" onClick={() => void group.load()}>
              {text(configuration, "common.retry")}
            </button>
          </div>
        ) : (
          <p className="pmfa-newchat-state" role="status">
            {text(configuration, "group.loading")}
          </p>
        )
      ) : (
        <div className="pmfa-group-body">
          <div className="pmfa-group-hero">
            <Avatar id={info.id} name={info.name} size="l" slots={slots} />
            <EditableField
              label={text(configuration, "group.rename")}
              value={info.name}
              editable={manage}
              disabled={busy}
              required
              maxLength={100}
              configuration={configuration}
              onSave={(value) => group.rename(value)}
              display="title"
            />
            <p className="pmfa-group-meta">
              {text(configuration, "group.members", {
                count: new Intl.NumberFormat(configuration.locale.code).format(
                  info.participants.length,
                ),
              })}
              {info.createdAt > 0 &&
                ` · ${text(configuration, "group.created", {
                  date: new Intl.DateTimeFormat(configuration.locale.code, {
                    dateStyle: "medium",
                  }).format(info.createdAt * 1000),
                })}`}
            </p>
          </div>

          <EditableField
            label={text(configuration, "group.description")}
            value={info.description}
            empty={text(configuration, "group.noDescription")}
            editable={manage}
            disabled={busy}
            multiline
            maxLength={2048}
            configuration={configuration}
            onSave={(value) => group.describe(value)}
          />

          {manage && directory !== undefined && (
            <AddMembers
              directory={directory}
              existing={info.participants.map((participant) => participant.id)}
              disabled={busy}
              configuration={configuration}
              slots={slots}
              onAdd={(ids) => group.participants("add", ids)}
            />
          )}

          <ul
            {...slots("groupParticipants", "pmfa-group-members")}
            aria-label={text(configuration, "group.members", {
              count: String(info.participants.length),
            })}
          >
            {participants.map((participant) => {
              const name = nameOf(participant);
              const admin = participant.isAdmin || participant.isSuperAdmin;
              const self = participant.id === selfId;
              return (
                <li key={participant.id} className="pmfa-person pmfa-group-member">
                  <Avatar id={participant.id} name={name} slots={slots} />
                  <span className="pmfa-person-text">
                    <span className="pmfa-person-name">{name}</span>
                    {participant.phoneNumber !== undefined &&
                      participant.phoneNumber !== name && (
                        <span className="pmfa-person-sub">
                          {participant.phoneNumber}
                        </span>
                      )}
                  </span>
                  {admin && (
                    <span className="pmfa-group-badge">
                      {text(configuration, "group.admin")}
                    </span>
                  )}
                  {manage && !self && (
                    <details
                      className="pmfa-conv-menu"
                      onKeyDown={(event) => {
                        if (event.key === "Escape") {
                          event.currentTarget.open = false;
                          event.currentTarget.querySelector<HTMLElement>("summary")?.focus();
                        }
                      }}
                    >
                      <summary
                        aria-label={text(configuration, "group.memberActions", { name })}
                      >
                        <Icon name="more" />
                      </summary>
                      <div className="pmfa-conv-menu-items">
                        <button
                          type="button"
                          
                          disabled={busy}
                          onClick={(event) => {
                            event.currentTarget.closest("details")?.removeAttribute("open");
                            void group.participants(admin ? "demote" : "promote", [participant.id]);
                          }}
                        >
                          {text(configuration, admin ? "group.dismissAdmin" : "group.makeAdmin")}
                        </button>
                        <button
                          type="button"
                          className="pmfa-menu-danger"
                          disabled={busy}
                          onClick={(event) => {
                            event.currentTarget.closest("details")?.removeAttribute("open");
                            void group.participants("remove", [participant.id]);
                          }}
                        >
                          {text(configuration, "group.remove")}
                        </button>
                      </div>
                    </details>
                  )}
                </li>
              );
            })}
          </ul>

          <section className="pmfa-group-section" aria-label={text(configuration, "group.inviteLink")}>
            <h3 className="pmfa-newchat-section">{text(configuration, "group.inviteLink")}</h3>
            {snapshot.inviteCode !== undefined ? (
              <InviteCode code={snapshot.inviteCode} configuration={configuration} />
            ) : (
              <button
                type="button"
                className="pmfa-btn"
                disabled={busy}
                onClick={() => void group.showInviteCode()}
              >
                <Icon name="link" />
                {text(configuration, "group.showInvite")}
              </button>
            )}
            {manage && (
              <button
                type="button"
                className="pmfa-btn pmfa-btn-ghost"
                disabled={busy}
                onClick={() => void group.revokeInviteCode()}
              >
                {text(configuration, "group.resetInvite")}
              </button>
            )}
          </section>

          {manage ? (
            <section className="pmfa-group-section">
              <h3 className="pmfa-newchat-section">{text(configuration, "group.settings")}</h3>
              <p className="pmfa-newchat-note">{text(configuration, "group.settingsNote")}</p>
              {SETTINGS.map((setting) => (
                <div key={setting.label} className="pmfa-group-setting" role="group" aria-label={text(configuration, setting.label)}>
                  <span className="pmfa-group-setting-label">{text(configuration, setting.label)}</span>
                  <span className="pmfa-segmented">
                    {setting.options.map((option) => (
                      <button
                        key={option.label}
                        type="button"
                        className="pmfa-btn"
                        disabled={busy}
                        onClick={() => void group.changeSetting(option.change)}
                      >
                        {text(configuration, option.label)}
                      </button>
                    ))}
                  </span>
                </div>
              ))}
              <LeaveGroup
                disabled={busy}
                configuration={configuration}
                onLeave={() => void group.leave()}
              />
            </section>
          ) : (
            <p className="pmfa-newchat-note">{text(configuration, "group.readOnly")}</p>
          )}
        </div>
      )}
    </section>
  );
}

function EditableField({
  label,
  value,
  empty,
  editable,
  disabled,
  required = false,
  multiline = false,
  maxLength,
  display = "text",
  configuration,
  onSave,
}: {
  readonly label: string;
  readonly value: string;
  readonly empty?: string;
  readonly editable: boolean;
  readonly disabled: boolean;
  readonly required?: boolean;
  readonly multiline?: boolean;
  readonly maxLength: number;
  readonly display?: "title" | "text";
  readonly configuration: Configuration;
  readonly onSave: (value: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<string>();
  const inputId = useId();
  if (draft !== undefined)
    return (
      <form
        className="pmfa-group-edit"
        onSubmit={(event) => {
          event.preventDefault();
          void onSave(draft).then((ok) => {
            if (ok) setDraft(undefined);
          });
        }}
      >
        <label htmlFor={inputId} className="pmfa-label">
          {label}
        </label>
        {multiline ? (
          <textarea
            id={inputId}
            className="pmfa-input"
            value={draft}
            maxLength={maxLength}
            rows={3}
            autoFocus
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
        ) : (
          <input
            id={inputId}
            className="pmfa-input"
            value={draft}
            maxLength={maxLength}
            required={required}
            autoFocus
            onChange={(event) => setDraft(event.currentTarget.value)}
          />
        )}
        <span className="pmfa-group-edit-actions">
          <button type="button" className="pmfa-btn pmfa-btn-ghost" onClick={() => setDraft(undefined)}>
            {text(configuration, "common.cancel")}
          </button>
          <button
            type="submit"
            className="pmfa-btn pmfa-btn-primary"
            disabled={disabled || (required && draft.trim() === "")}
          >
            {text(configuration, "common.save")}
          </button>
        </span>
      </form>
    );
  return (
    <div className={`pmfa-group-field pmfa-group-field-${display}`}>
      {display === "text" && <span className="pmfa-label">{label}</span>}
      <span className={value === "" ? "pmfa-group-empty" : "pmfa-group-value"}>
        {value === "" ? empty : value}
      </span>
      {editable && (
        <button
          type="button"
          className="pmfa-btn pmfa-btn-ghost"
          disabled={disabled}
          aria-label={`${text(configuration, "group.edit")}: ${label}`}
          onClick={() => setDraft(value)}
        >
          {text(configuration, "group.edit")}
        </button>
      )}
    </div>
  );
}

function InviteCode({
  code,
  configuration,
}: {
  readonly code: string;
  readonly configuration: Configuration;
}) {
  const [copied, setCopied] = useState(false);
  const link = `https://chat.whatsapp.com/${code}`;
  return (
    <div className="pmfa-group-invite">
      <code className="pmfa-group-code">{link}</code>
      <button
        type="button"
        className="pmfa-btn"
        onClick={() => {
          void globalThis.navigator?.clipboard
            ?.writeText(link)
            .then(() => setCopied(true))
            .catch(() => setCopied(false));
        }}
      >
        {text(configuration, copied ? "group.copied" : "group.copy")}
      </button>
    </div>
  );
}

function LeaveGroup({
  disabled,
  configuration,
  onLeave,
}: {
  readonly disabled: boolean;
  readonly configuration: Configuration;
  readonly onLeave: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming)
    return (
      <button
        type="button"
        className="pmfa-btn pmfa-group-leave"
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        {text(configuration, "group.leave")}
      </button>
    );
  return (
    <div className="pmfa-group-confirm" role="alertdialog" aria-label={text(configuration, "group.leave")}>
      <p>{text(configuration, "group.leaveConfirm")}</p>
      <span className="pmfa-group-edit-actions">
        <button type="button" className="pmfa-btn pmfa-btn-ghost" autoFocus onClick={() => setConfirming(false)}>
          {text(configuration, "common.cancel")}
        </button>
        <button type="button" className="pmfa-btn pmfa-btn-danger" disabled={disabled} onClick={onLeave}>
          {text(configuration, "group.leave")}
        </button>
      </span>
    </div>
  );
}

function AddMembers({
  directory,
  existing,
  disabled,
  configuration,
  slots,
  onAdd,
}: {
  readonly directory: ContactDirectoryController;
  readonly existing: readonly string[];
  readonly disabled: boolean;
  readonly configuration: Configuration;
  readonly slots: Slots;
  readonly onAdd: (ids: readonly string[]) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<readonly string[]>([]);
  const snapshot: ContactDirectorySnapshot = useController(directory);
  useEffect(() => {
    if (open && directory.getSnapshot().status === "idle") void directory.load();
  }, [open, directory]);
  const members = useMemo(() => new Set(existing), [existing]);
  const candidates = useMemo(
    () => filterContacts(snapshot.contacts, snapshot.query).filter((contact) => !members.has(contact.id)),
    [snapshot.contacts, snapshot.query, members],
  );
  if (!open)
    return (
      <button type="button" className="pmfa-btn" disabled={disabled} onClick={() => setOpen(true)}>
        <Icon name="plus" />
        {text(configuration, "group.addMembers")}
      </button>
    );
  return (
    <div className="pmfa-group-add">
      <div {...slots("newChatSearch", "pmfa-search")}>
        <Icon name="search" />
        <input
          {...slots("input", "pmfa-input")}
          type="search"
          autoFocus
          value={snapshot.query}
          placeholder={text(configuration, "newChat.search")}
          aria-label={text(configuration, "newChat.search")}
          onChange={(event) => directory.setQuery(event.currentTarget.value)}
        />
      </div>
      <DirectoryState snapshot={snapshot} configuration={configuration} onRetry={() => void directory.retry()} />
      <ContactRows
        contacts={candidates}
        label={text(configuration, "group.addMembers")}
        selectable
        selectedIds={picked}
        onSelect={(contact) =>
          setPicked((current) =>
            current.includes(contact.id)
              ? current.filter((id) => id !== contact.id)
              : [...current, contact.id],
          )
        }
        slots={slots}
      />
      <span className="pmfa-group-edit-actions">
        <button
          type="button"
          className="pmfa-btn pmfa-btn-ghost"
          onClick={() => {
            setOpen(false);
            setPicked([]);
          }}
        >
          {text(configuration, "common.cancel")}
        </button>
        <button
          type="button"
          className="pmfa-btn pmfa-btn-primary"
          disabled={disabled || picked.length === 0}
          onClick={() =>
            void onAdd(picked).then((ok) => {
              if (ok) {
                setOpen(false);
                setPicked([]);
              }
            })
          }
        >
          {text(configuration, "group.add")}
        </button>
      </span>
    </div>
  );
}
