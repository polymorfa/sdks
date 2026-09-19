import {
  InboxController,
  MessageComposerController,
  TemplateBuilderController,
  connectWhatsApp,
  createConversationComposerActions,
  createHandlerInboxSource,
  createSameOriginTemplateBuilderTransport,
  type ConnectWhatsAppOptions,
  type ConnectWhatsAppResult,
  type ConversationController,
  type ConversationMessage,
  type InboxContact,
  type InboxConversation,
  type InboxDataSource,
  type InboxSnapshot,
  type PolymorfaClientStatus,
  type ProjectTemplateDocument,
  type TemplateDraft,
} from "@polymorfa/browser";
import {
  formatDayLabel,
  formatMessageTime,
  type SlotClassNames,
} from "@polymorfa/ui";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  ComposeBox,
  Icon,
  MessageList,
  TemplateBuilder,
  text,
  useShell,
  useSlots,
  type ComposeBoxProps,
  type Slots,
} from "./components.js";
import {
  useOptionalPolymorfaClient,
  usePermission,
  usePermissions,
  usePolymorfa,
  usePolymorfaClient,
} from "./context.js";
import { useController, useOwnedController } from "./hooks.js";
import { CallButton } from "./call-button.js";

type Configuration = ReturnType<typeof usePolymorfa>;

// ── Shared pieces ─────────────────────────────────────────────────────

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

function displayName(conversation: {
  readonly id: string;
  readonly name?: string;
  readonly phoneNumber?: string;
}): string {
  return conversation.name ?? conversation.phoneNumber ?? conversation.id;
}

/** Initials avatar, or the image when `src` is set. */
export function Avatar({
  id,
  name,
  src,
  size,
  slots,
}: {
  readonly id: string;
  readonly name: string;
  readonly src?: string;
  readonly size?: "s" | "l";
  readonly slots: Slots;
}) {
  const slot = slots(
    "avatar",
    size === undefined ? "pmfa-avatar" : `pmfa-avatar pmfa-avatar-${size}`,
  );
  const [failed, setFailed] = useState(false);
  return (
    <span
      {...slot}
      style={
        {
          ...slot.style,
          "--pmfa-avatar-hue": String(hue(id)),
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {src !== undefined && !failed ? (
        <img src={src} alt="" onError={() => setFailed(true)} />
      ) : (
        initials(name)
      )}
    </span>
  );
}

function conversationTime(
  configuration: Configuration,
  time: number,
  now: number,
): string {
  const today = new Date(now).toDateString() === new Date(time).toDateString();
  if (today) return formatMessageTime(time, configuration.locale.code) ?? "";
  return formatDayLabel(
    time,
    configuration.locale.code,
    {
      today: text(configuration, "chat.today"),
      yesterday: text(configuration, "chat.yesterday"),
    },
    now,
  );
}

// ── ConversationList ──────────────────────────────────────────────────

export interface ConversationListProps {
  readonly controller: InboxController;
  readonly onSelect?: (conversation: InboxConversation) => void;
  /** Heading above the list. Defaults to the locale's `inbox.title`. */
  readonly title?: ReactNode;
  /** Show the search field. Defaults to `true`. */
  readonly search?: boolean;
  readonly className?: string;
  readonly classNames?: SlotClassNames;
}

/** The inbox's conversation list, usable on its own. */
export function ConversationList({
  controller,
  onSelect,
  title,
  search = true,
  className,
  classNames,
}: ConversationListProps) {
  const snapshot: InboxSnapshot = useController(controller);
  const configuration = usePolymorfa();
  const slots = useSlots(classNames);
  const list = slots("conversationList", "pmfa-inbox-list");
  const [query, setQuery] = useState("");
  const headingId = useId();
  const normalized = query.trim().toLowerCase();
  const visible = useMemo(
    () =>
      normalized === ""
        ? snapshot.conversations
        : snapshot.conversations.filter((conversation) =>
            [
              conversation.name,
              conversation.phoneNumber,
              conversation.lastMessage?.text,
            ].some((value) => value?.toLowerCase().includes(normalized)),
          ),
    [snapshot.conversations, normalized],
  );
  const now = Date.now();
  return (
    <section
      {...list}
      className={[list.className, className].filter(Boolean).join(" ")}
      aria-labelledby={headingId}
      data-pmfa="conversation-list"
    >
      <div className="pmfa-inbox-head">
        <h2 className="pmfa-inbox-title" id={headingId}>
          {title ?? text(configuration, "inbox.title")}
        </h2>
        {search && (
          <div {...slots("conversationSearch", "pmfa-search")}>
            <Icon name="search" />
            <input
              {...slots("input", "pmfa-input")}
              type="search"
              value={query}
              placeholder={text(configuration, "inbox.search")}
              aria-label={text(configuration, "inbox.search")}
              onChange={(event) => setQuery(event.currentTarget.value)}
            />
          </div>
        )}
      </div>
      {snapshot.status === "loading" || snapshot.status === "idle" ? (
        <div className="pmfa-skeleton" aria-busy="true">
          <span />
          <span />
          <span />
          <span className="pmfa-sr">
            {text(configuration, "status.loading")}
          </span>
        </div>
      ) : snapshot.status === "error" ? (
        <div className="pmfa-inbox-state" role="alert">
          <p className="pmfa-error">{text(configuration, "inbox.loadError")}</p>
          <button
            type="button"
            {...slots("button", "pmfa-btn")}
            onClick={() => void controller.load()}
          >
            {text(configuration, "common.retry")}
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div {...slots("empty", "pmfa-inbox-state")}>
          <Icon name={normalized === "" ? "inbox" : "search"} />
          {text(
            configuration,
            normalized === "" ? "inbox.empty" : "inbox.noMatches",
          )}
        </div>
      ) : (
        <ul className="pmfa-convs">
          {visible.map((conversation) => {
            const name = displayName(conversation);
            const selected = conversation.id === snapshot.selectedId;
            const last = conversation.lastMessage;
            const unread = conversation.unreadCount;
            return (
              <li key={conversation.id}>
                <button
                  type="button"
                  {...slots("conversationItem", "pmfa-conv")}
                  aria-current={selected ? "true" : undefined}
                  {...(unread > 0 ? { "data-unread": "" } : {})}
                  onClick={() => {
                    controller.select(conversation.id);
                    onSelect?.(conversation);
                  }}
                >
                  <Avatar
                    id={conversation.id}
                    name={name}
                    {...(conversation.avatarUrl === undefined
                      ? {}
                      : { src: conversation.avatarUrl })}
                    slots={slots}
                  />
                  <span className="pmfa-conv-name">{name}</span>
                  <span className="pmfa-conv-time">
                    {conversation.lastActivity > 0
                      ? conversationTime(
                          configuration,
                          conversation.lastActivity,
                          now,
                        )
                      : ""}
                  </span>
                  <span className="pmfa-conv-preview">
                    {last === undefined
                      ? (conversation.phoneNumber ?? "")
                      : `${last.direction === "outbound" ? text(configuration, "inbox.you") : ""}${last.text}`}
                  </span>
                  {unread > 0 && (
                    <span {...slots("unreadBadge", "pmfa-badge")}>
                      <span aria-hidden="true">
                        {unread > 99 ? "99+" : unread}
                      </span>
                      <span className="pmfa-sr">
                        {text(configuration, "inbox.unread", {
                          count: String(unread),
                        })}
                      </span>
                    </span>
                  )}
                </button>
              </li>
            );
          })}
          {snapshot.hasMore && normalized === "" && (
            <li
              className="pmfa-loadmore"
              style={{ alignItems: "center", padding: 8 }}
            >
              <button
                type="button"
                {...slots("loadMore", "pmfa-btn")}
                disabled={snapshot.status === "loading_more"}
                onClick={() => void controller.loadMore()}
              >
                {text(configuration, "inbox.loadMore")}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

// ── ContactPanel ──────────────────────────────────────────────────────

export interface ContactPanelProps {
  readonly conversation: InboxConversation;
  /** Loads the contact. Defaults to the inbox source's `contact()`. */
  readonly load?: (
    conversation: InboxConversation,
    signal: AbortSignal,
  ) => Promise<InboxContact | undefined>;
  readonly onClose?: () => void;
  /** Extra content under the details, such as your CRM fields. */
  readonly children?: ReactNode;
  /** Actions under the name, for example a `<CallButton/>`. */
  readonly actions?: ReactNode;
  readonly className?: string;
  readonly classNames?: SlotClassNames;
}

/** Contact details for a conversation. */
export function ContactPanel({
  conversation,
  load,
  onClose,
  children,
  actions,
  className,
  classNames,
}: ContactPanelProps) {
  const configuration = usePolymorfa();
  const slots = useSlots(classNames);
  const panel = slots("contactPanel", "pmfa-contact");
  const [contact, setContact] = useState<InboxContact | undefined>();
  const headingId = useId();
  useEffect(() => {
    setContact(undefined);
    if (load === undefined) return;
    const abort = new AbortController();
    load(conversation, abort.signal).then(
      (value) => {
        if (!abort.signal.aborted) setContact(value);
      },
      () => undefined,
    );
    return () => abort.abort();
  }, [conversation.id, load]);
  const name = contact?.name ?? displayName(conversation);
  const phone = contact?.phoneNumber ?? conversation.phoneNumber;
  const rows: { label: string; value: string }[] = [];
  if (phone !== undefined)
    rows.push({ label: text(configuration, "inbox.phone"), value: phone });
  if (contact?.email !== undefined)
    rows.push({
      label: text(configuration, "inbox.email"),
      value: contact.email,
    });
  if (contact?.about !== undefined)
    rows.push({
      label: text(configuration, "inbox.about"),
      value: contact.about,
    });
  for (const field of contact?.fields ?? []) rows.push(field);
  const avatar = contact?.avatarUrl ?? conversation.avatarUrl;
  return (
    <aside
      {...panel}
      className={[panel.className, className].filter(Boolean).join(" ")}
      aria-labelledby={headingId}
      data-pmfa="contact-panel"
    >
      <div className="pmfa-contact-head">
        <h3 id={headingId}>{text(configuration, "inbox.contact")}</h3>
        {onClose !== undefined && (
          <button
            type="button"
            {...slots("button", "pmfa-btn pmfa-btn-ghost pmfa-btn-icon")}
            aria-label={text(configuration, "inbox.hideContact")}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        )}
      </div>
      <div className="pmfa-contact-card">
        <Avatar
          id={conversation.id}
          name={name}
          {...(avatar === undefined ? {} : { src: avatar })}
          size="l"
          slots={slots}
        />
        <p className="pmfa-contact-name">{name}</p>
        {phone !== undefined && phone !== name && (
          <span className="pmfa-contact-phone">{phone}</span>
        )}
        {actions !== undefined && (
          <div className="pmfa-contact-actions">{actions}</div>
        )}
      </div>
      {rows.length > 0 && (
        <dl className="pmfa-contact-fields">
          {rows.map((row, index) => (
            <div key={`${row.label}-${index}`}>
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
    </aside>
  );
}

// ── Thread ────────────────────────────────────────────────────────────

const noUpload = async (): Promise<never> => {
  throw new Error("Attachments need an upload adapter.");
};

function Thread({
  inbox,
  conversation,
  slots,
  onBack,
  contactOpen,
  onToggleContact,
  showContactToggle,
  actions,
  composerProps,
}: {
  readonly inbox: InboxController;
  readonly conversation: InboxConversation;
  readonly slots: Slots;
  readonly onBack: () => void;
  readonly contactOpen: boolean;
  readonly onToggleContact: (() => void) | undefined;
  readonly showContactToggle: boolean;
  readonly actions: ReactNode;
  readonly composerProps: InboxProps["composerProps"];
}) {
  const configuration = usePolymorfa();
  const controller: ConversationController = inbox.conversation(conversation);
  const canSend = usePermission("Inbox", "composer", "send_message");
  const ownedComposer = useOwnedController<MessageComposerController>(
    undefined,
    canSend
      ? () =>
          new MessageComposerController(
            createConversationComposerActions(controller, noUpload),
          )
      : undefined,
  );
  // A revoked permission hides the composer even if one was created.
  const composer = canSend ? ownedComposer : undefined;
  const threadRef = useRef<HTMLElement>(null);
  const reply = useCallback(
    (message: ConversationMessage) => {
      composer?.setReplyTo(message.id);
      threadRef.current?.querySelector("textarea")?.focus();
    },
    [composer],
  );
  const name = displayName(conversation);
  const sub =
    conversation.phoneNumber !== undefined && conversation.phoneNumber !== name
      ? conversation.phoneNumber
      : undefined;
  return (
    <section
      {...slots("thread", "pmfa-thread")}
      ref={threadRef}
      aria-label={name}
      data-pmfa="thread"
    >
      <header {...slots("threadHeader", "pmfa-thread-head")}>
        <button
          type="button"
          {...slots(
            "backButton",
            "pmfa-btn pmfa-btn-ghost pmfa-btn-icon pmfa-back",
          )}
          aria-label={text(configuration, "inbox.back")}
          onClick={onBack}
        >
          <Icon name="back" />
        </button>
        <Avatar
          id={conversation.id}
          name={name}
          {...(conversation.avatarUrl === undefined
            ? {}
            : { src: conversation.avatarUrl })}
          size="s"
          slots={slots}
        />
        <div className="pmfa-thread-who">
          <span className="pmfa-thread-name">{name}</span>
          {sub !== undefined && <span className="pmfa-thread-sub">{sub}</span>}
        </div>
        <div className="pmfa-thread-actions">
          {actions}
          {showContactToggle && onToggleContact !== undefined && (
            <button
              type="button"
              {...slots("button", "pmfa-btn pmfa-btn-ghost pmfa-btn-icon")}
              aria-label={text(
                configuration,
                contactOpen ? "inbox.hideContact" : "inbox.showContact",
              )}
              title={text(configuration, "inbox.contact")}
              aria-expanded={contactOpen}
              onClick={onToggleContact}
            >
              <Icon name="info" />
            </button>
          )}
        </div>
      </header>
      <MessageList
        controller={controller}
        {...(composer === undefined ? {} : { onReply: reply })}
      />
      <div className="pmfa-thread-foot">
        {composer !== undefined ? (
          <ComposeBox
            attachments={false}
            voiceNotes={false}
            {...composerProps}
            controller={composer}
            conversation={controller}
          />
        ) : (
          <p className="pmfa-readonly">
            {text(configuration, "inbox.readOnly")}
          </p>
        )}
      </div>
    </section>
  );
}

// ── Inbox ─────────────────────────────────────────────────────────────

export interface InboxProps {
  /**
   * Where conversations come from. Defaults to your handler's history and
   * events routes, through the provider's client.
   */
  readonly source?: InboxDataSource;
  /** Supply your own controller to drive the inbox from outside. */
  readonly controller?: InboxController;
  /** Open this conversation first. */
  readonly defaultConversationId?: string;
  readonly onSelect?: (conversation: InboxConversation | undefined) => void;
  /** Show the contact panel toggle. Defaults to `true`. */
  readonly contactPanel?: boolean;
  /** Extra content inside the contact panel. */
  readonly renderContact?: (conversation: InboxConversation) => ReactNode;
  /**
   * Actions in the thread header. Defaults to a `<CallButton/>` when the
   * grant allows `voip_place` and the conversation has a phone number.
   */
  readonly renderActions?: (conversation: InboxConversation) => ReactNode;
  readonly title?: ReactNode;
  readonly composerProps?: Omit<
    ComposeBoxProps,
    "controller" | "createController" | "conversation"
  >;
  readonly className?: string;
  readonly classNames?: SlotClassNames;
}

/**
 * A complete inbox: conversation list, chat and contact panel. Controls the
 * token does not allow are hidden, with one development warning each.
 */
export function Inbox({
  source,
  controller,
  defaultConversationId,
  onSelect,
  contactPanel = true,
  renderContact,
  renderActions,
  title,
  composerProps,
  className,
  classNames,
}: InboxProps) {
  const client = useOptionalPolymorfaClient();
  const permissions = usePermissions();
  if (controller === undefined && source === undefined && client === undefined)
    throw new Error(
      '<Inbox/> needs <PolymorfaProvider tokenEndpoint="/api/polymorfa/token"> or a source.',
    );
  const inbox = useOwnedController<InboxController>(controller, () => {
    const created = new InboxController(
      source ?? createHandlerInboxSource(client!),
    );
    if (defaultConversationId !== undefined)
      created.select(defaultConversationId);
    return created;
  })!;
  const canRead = usePermission("Inbox", "conversations", "read_messages");
  const ready =
    permissions.status === "unknown" ||
    permissions.snapshot?.grant !== undefined;
  useEffect(() => {
    if (!ready || !canRead) return;
    const status = inbox.getSnapshot().status;
    if (status === "idle") void inbox.load();
  }, [inbox, ready, canRead]);
  const snapshot = useController(inbox);
  const configuration = usePolymorfa();
  const slots = useSlots(classNames);
  const root = useShell(slots, "inbox", "pmfa-inbox", className);
  const contactAllowed = usePermission(
    "Inbox",
    "contact panel",
    "read_contact",
  );
  const canContact = contactPanel && contactAllowed;
  const canCall = permissions.can("voip_place");
  const [contactOpen, setContactOpen] = useState(false);
  const selected = snapshot.conversations.find(
    (conversation) => conversation.id === snapshot.selectedId,
  );
  const latestSelect = useRef(onSelect);
  latestSelect.current = onSelect;
  const loadContact = useMemo(
    () =>
      inbox.source.contact === undefined
        ? undefined
        : (conversation: InboxConversation, signal: AbortSignal) =>
            inbox.source.contact!(conversation, signal),
    [inbox],
  );
  const back = useCallback(() => {
    inbox.select(undefined);
    setContactOpen(false);
    latestSelect.current?.(undefined);
  }, [inbox]);

  if (!canRead && permissions.snapshot?.grant !== undefined)
    return (
      <div {...root} data-pmfa="inbox" data-view="list">
        <div className="pmfa-inbox-state" style={{ gridColumn: "1 / -1" }}>
          <Icon name="inbox" />
          {text(configuration, "inbox.empty")}
        </div>
      </div>
    );

  const actions =
    selected === undefined ? null : renderActions !== undefined ? (
      renderActions(selected)
    ) : canCall && selected.phoneNumber !== undefined ? (
      <CallButton to={selected.phoneNumber} variant="icon" />
    ) : null;
  const showPanel = canContact && contactOpen && selected !== undefined;
  return (
    <div
      {...root}
      data-pmfa="inbox"
      data-view={selected === undefined ? "list" : "thread"}
      {...(showPanel ? { "data-contact-open": "" } : {})}
    >
      <ConversationList
        controller={inbox}
        {...(title === undefined ? {} : { title })}
        {...(classNames === undefined ? {} : { classNames })}
        onSelect={(conversation) => latestSelect.current?.(conversation)}
      />
      {selected === undefined ? (
        <section {...slots("thread", "pmfa-thread")} data-pmfa="thread">
          <div className="pmfa-inbox-state">
            <Icon name="inbox" />
            {text(configuration, "inbox.select")}
          </div>
        </section>
      ) : (
        <Thread
          key={selected.id}
          inbox={inbox}
          conversation={selected}
          slots={slots}
          onBack={back}
          contactOpen={showPanel}
          onToggleContact={
            canContact ? () => setContactOpen((open) => !open) : undefined
          }
          showContactToggle={canContact}
          actions={actions}
          composerProps={composerProps}
        />
      )}
      {showPanel && (
        <ContactPanel
          conversation={selected}
          {...(loadContact === undefined ? {} : { load: loadContact })}
          onClose={() => setContactOpen(false)}
          {...(classNames === undefined ? {} : { classNames })}
        >
          {renderContact?.(selected)}
        </ContactPanel>
      )}
    </div>
  );
}

// ── ConnectWhatsAppButton ─────────────────────────────────────────────

export interface ConnectWhatsAppButtonProps extends Pick<
  ConnectWhatsAppOptions,
  "target" | "open"
> {
  readonly children?: ReactNode;
  readonly onConnect?: (result: ConnectWhatsAppResult) => void;
  readonly onError?: (error: unknown) => void;
  readonly className?: string;
  readonly classNames?: SlotClassNames;
}

/**
 * Creates a QuickLink through your handler and opens Polymorfa's hosted
 * pairing page. The pairing UI is never embedded.
 */
export function ConnectWhatsAppButton({
  target = "redirect",
  open,
  children,
  onConnect,
  onError,
  className,
  classNames,
}: ConnectWhatsAppButtonProps) {
  const client = usePolymorfaClient();
  const configuration = usePolymorfa();
  const slots = useSlots(classNames);
  const root = useShell(
    slots,
    "connectButton",
    "pmfa-btn pmfa-btn-primary pmfa-connect",
    className,
  );
  const allowed = usePermission(
    "ConnectWhatsAppButton",
    "button",
    "connect_whatsapp",
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const errorId = useId();
  if (!allowed) return null;
  return (
    <>
      <button
        type="button"
        {...root}
        data-pmfa="connect-whatsapp"
        aria-busy={busy ? "true" : undefined}
        aria-describedby={failed ? errorId : undefined}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setFailed(false);
          connectWhatsApp(client, {
            target,
            ...(open === undefined ? {} : { open }),
          }).then(
            (result) => {
              setBusy(false);
              onConnect?.(result);
            },
            (error: unknown) => {
              setBusy(false);
              setFailed(true);
              onError?.(error);
            },
          );
        }}
      >
        <Icon name="link" />
        {busy
          ? text(configuration, "connect.opening")
          : (children ?? text(configuration, "connect.button"))}
      </button>
      {failed && (
        <span
          id={errorId}
          role="alert"
          {...slots("error", "pmfa pmfa-error")}
          style={{ display: "block", marginTop: 6 }}
        >
          {text(configuration, "connect.failed")}
        </span>
      )}
    </>
  );
}

// ── SessionStatus ─────────────────────────────────────────────────────

export interface SessionStatusProps {
  /** Show a Retry button after a failure. Defaults to `true`. */
  readonly retry?: boolean;
  readonly className?: string;
  readonly classNames?: SlotClassNames;
}

/** The provider's connection state as a badge, with a retry prompt. */
export function SessionStatus({
  retry = true,
  className,
  classNames,
}: SessionStatusProps) {
  const client = usePolymorfaClient();
  const { snapshot } = usePermissions();
  const configuration = usePolymorfa();
  const slots = useSlots(classNames);
  const root = useShell(slots, "sessionStatus", "pmfa-session", className);
  const status: PolymorfaClientStatus = snapshot?.status ?? "idle";
  const label = text(configuration, `status.${status}`);
  const failed =
    status === "error" || status === "unauthenticated" || status === "retrying";
  return (
    <span
      {...root}
      role="status"
      data-pmfa="session-status"
      data-status={status}
      aria-label={text(configuration, "status.label", { status: label })}
    >
      <span className="pmfa-session-dot" aria-hidden="true" />
      <span aria-hidden="true">{label}</span>
      {retry && failed && (
        <button
          type="button"
          {...slots("button", "pmfa-btn pmfa-btn-ghost")}
          onClick={() => void client.refresh().catch(() => undefined)}
        >
          {text(configuration, "common.retry")}
        </button>
      )}
    </span>
  );
}

// ── TemplateManager ───────────────────────────────────────────────────

export interface TemplateManagerProps {
  /** Starting draft for "New template". */
  readonly newDraft?: TemplateDraft;
  readonly className?: string;
  readonly classNames?: SlotClassNames;
}

const DEFAULT_DRAFT: TemplateDraft = {
  name: "new_template",
  definition: {
    version: 1,
    kind: "standard",
    category: "UTILITY",
    language: "en_US",
    body: "Hello {{name}}",
    variables: [{ name: "name", type: "text", example: "Ada" }],
  },
} as TemplateDraft;

/**
 * Lists your project's templates and edits one with `<TemplateBuilder/>`,
 * through your handler's `templates` route.
 */
export function TemplateManager({
  newDraft = DEFAULT_DRAFT,
  className,
  classNames,
}: TemplateManagerProps) {
  const client = usePolymorfaClient();
  const configuration = usePolymorfa();
  const slots = useSlots(classNames);
  const root = useShell(slots, "templateManager", "pmfa-tm", className);
  const allowed = usePermission(
    "TemplateManager",
    "templates",
    "manage_templates",
  );
  const transport = useMemo(
    () =>
      createSameOriginTemplateBuilderTransport({
        path: client.url("templates"),
        fetch: client.fetch,
      }),
    [client],
  );
  const [templates, setTemplates] = useState<
    readonly ProjectTemplateDocument[] | undefined
  >();
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState<
    { readonly id?: string; readonly key: number } | undefined
  >();
  const reload = useCallback(() => {
    const abort = new AbortController();
    setFailed(false);
    transport.list!(abort.signal).then(setTemplates, () => setFailed(true));
    return () => abort.abort();
  }, [transport]);
  useEffect(() => {
    if (allowed && editing === undefined) return reload();
    return undefined;
  }, [allowed, editing, reload]);
  if (!allowed) return null;
  if (editing !== undefined)
    return (
      <div {...root} data-pmfa="template-manager">
        <div className="pmfa-tm-head">
          <button
            type="button"
            {...slots("backButton", "pmfa-btn pmfa-btn-ghost")}
            onClick={() => setEditing(undefined)}
          >
            <Icon name="back" />
            {text(configuration, "templates.back")}
          </button>
        </div>
        <TemplateEditor
          key={editing.key}
          transport={transport}
          {...(editing.id === undefined ? {} : { templateId: editing.id })}
          draft={newDraft}
          {...(classNames === undefined ? {} : { classNames })}
        />
      </div>
    );
  return (
    <div {...root} data-pmfa="template-manager">
      <div className="pmfa-tm-head">
        <h2>{text(configuration, "templates.list")}</h2>
        <button
          type="button"
          {...slots("primaryButton", "pmfa-btn pmfa-btn-primary")}
          onClick={() => setEditing({ key: Date.now() })}
        >
          <Icon name="plus" />
          {text(configuration, "templates.new")}
        </button>
      </div>
      {failed ? (
        <div className="pmfa-inbox-state" role="alert">
          <p className="pmfa-error">
            {text(configuration, "templates.loadError")}
          </p>
          <button
            type="button"
            {...slots("button", "pmfa-btn")}
            onClick={reload}
          >
            {text(configuration, "common.retry")}
          </button>
        </div>
      ) : templates === undefined ? (
        <div className="pmfa-skeleton" aria-busy="true">
          <span />
          <span />
        </div>
      ) : templates.length === 0 ? (
        <div {...slots("empty", "pmfa-inbox-state")}>
          {text(configuration, "templates.empty")}
        </div>
      ) : (
        <ul {...slots("templateList", "pmfa-tm-list")}>
          {templates.map((template) => (
            <li key={template.id}>
              <button
                type="button"
                {...slots("templateItem", "pmfa-tm-item")}
                onClick={() => setEditing({ id: template.id, key: Date.now() })}
              >
                <span className="pmfa-tm-name">{template.name}</span>
                <span className="pmfa-tm-body">{template.definition.body}</span>
                <span className="pmfa-tm-meta">
                  <span className="pmfa-tag" data-status={template.status}>
                    {template.status}
                  </span>
                  <span className="pmfa-tag">{template.category}</span>
                  <span className="pmfa-tag">{template.language}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TemplateEditor({
  transport,
  templateId,
  draft,
  classNames,
}: {
  readonly transport: ReturnType<
    typeof createSameOriginTemplateBuilderTransport
  >;
  readonly templateId?: string;
  readonly draft: TemplateDraft;
  readonly classNames?: SlotClassNames;
}) {
  const controller = useOwnedController(undefined, () => {
    const created = new TemplateBuilderController(transport);
    if (templateId === undefined) created.create(draft);
    else void created.load(templateId);
    return created;
  })!;
  return (
    <TemplateBuilder
      controller={controller}
      {...(classNames === undefined ? {} : { classNames })}
    />
  );
}
