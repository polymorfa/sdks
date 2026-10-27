import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import {
  CallLogController,
  createApiCallLogSource,
  type CallLogEntry,
  type CallLogGroup,
  type CallLogSnapshot,
  type CallLogSource,
  type InboxConversation,
} from "../browser/index.js";
import {
  formatDayLabel,
  formatMessageTime,
  type SlotClassNames,
} from "../appearance/index.js";
import { CallButton } from "./call-button.js";
import { Icon, text, useShell, useSlots } from "./components.js";
import {
  useOptionalPolymorfaClient,
  usePermissions,
  usePolymorfa,
} from "./context.js";
import { Avatar } from "./dropin.js";
import { useController, useOwnedController } from "./hooks.js";

type Configuration = ReturnType<typeof usePolymorfa>;

/** The person's name, else their number. */
export function callPeerName(entry: CallLogEntry): string {
  return entry.peer.name ?? entry.peer.phoneNumber ?? entry.peer.id ?? "?";
}

function duration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours > 0
    ? `${hours}:${String(minutes % 60).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}

/** "Missed voice call · 9:41 AM · 2:05", for the row's second line. */
export function callSummary(
  configuration: Configuration,
  entry: CallLogEntry,
  now: number = Date.now(),
): string {
  const kind =
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
  const code = configuration.locale.code;
  const when =
    new Date(entry.startedAt).toDateString() === new Date(now).toDateString()
      ? (formatMessageTime(entry.startedAt, code) ?? "")
      : formatDayLabel(
          entry.startedAt,
          code,
          {
            today: text(configuration, "chat.today"),
            yesterday: text(configuration, "chat.yesterday"),
          },
          now,
        );
  return [
    `${text(configuration, kind)} ${text(configuration, entry.video ? "callLog.video" : "callLog.voice")}`,
    when,
    entry.outcome === "answered" && entry.durationSeconds !== undefined
      ? duration(entry.durationSeconds)
      : "",
  ]
    .filter((part) => part !== "")
    .join(" · ");
}

/** The conversation a call log row opens. */
export function conversationForCall(entry: CallLogEntry): InboxConversation | undefined {
  if (entry.conversationId === undefined) return undefined;
  return {
    id: entry.conversationId,
    kind: "direct",
    ...(entry.session === undefined ? {} : { session: entry.session }),
    ...(entry.peer.name === undefined ? {} : { name: entry.peer.name }),
    ...(entry.peer.phoneNumber === undefined ? {} : { phoneNumber: entry.peer.phoneNumber }),
    lastActivity: 0,
    unreadCount: 0,
  };
}

export interface CallLogProps {
  /** Supply a controller to drive the log from outside. */
  readonly controller?: CallLogController;
  /** Defaults to the API (`GET /messaging/{session}/calls`, `read_calls`). */
  readonly source?: CallLogSource;
  /** Opens the call's conversation. Rows without a conversation do nothing. */
  readonly onOpen?: (conversation: InboxConversation) => void;
  /**
   * Call back. Defaults to a `<CallButton/>` when the grant allows
   * `voip_place` and the call has a number; pass your own handler instead.
   */
  readonly onCall?: (entry: CallLogEntry) => void;
  readonly title?: ReactNode;
  /** Content beside the title, such as the Inbox's Chats and Calls switch. */
  readonly headerActions?: ReactNode;
  readonly className?: string;
  readonly classNames?: SlotClassNames;
}

/**
 * The WhatsApp-style call log: newest first, consecutive calls with the same
 * person merged with a count, missed incoming calls in red, an All/Missed
 * filter and call back.
 */
export function CallLog({
  controller,
  source,
  onOpen,
  onCall,
  title,
  headerActions,
  className,
  classNames,
}: CallLogProps) {
  const client = useOptionalPolymorfaClient();
  const permissions = usePermissions();
  if (controller === undefined && source === undefined && client === undefined)
    throw new Error(
      '<CallLog/> needs <PolymorfaProvider tokenEndpoint="/api/polymorfa/token"> or a source.',
    );
  const log = useOwnedController<CallLogController>(
    controller,
    () => new CallLogController(source ?? createApiCallLogSource(client!)),
  )!;
  const snapshot: CallLogSnapshot = useController(log);
  useEffect(() => {
    if (log.getSnapshot().status === "idle") void log.load();
  }, [log]);
  const configuration = usePolymorfa();
  const slots = useSlots(classNames);
  const root = useShell(slots, "callLog", "pmfa-inbox-list pmfa-call-log", className);
  const headingId = useId();
  const listRef = useRef<HTMLUListElement>(null);
  const canCall = client !== undefined && permissions.can("voip_place");
  function move(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const rows = listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-call-id]");
    if (rows === undefined) return;
    const target =
      event.key === "ArrowDown" ? index + 1 : event.key === "ArrowUp" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? rows.length - 1 : undefined;
    if (target === undefined) return;
    event.preventDefault();
    rows[Math.max(0, Math.min(target, rows.length - 1))]?.focus();
  }
  return (
    <section {...root} aria-labelledby={headingId} data-pmfa="call-log">
      <div className="pmfa-inbox-head">
        <div className="pmfa-inbox-heading">
          <h2 className="pmfa-inbox-title" id={headingId}>
            {title ?? text(configuration, "callLog.title")}
          </h2>
          {headerActions}
        </div>
        <div className="pmfa-inbox-filters" role="group" aria-label={text(configuration, "callLog.filters")}>
          {(["all", "missed"] as const).map((filter) => (
            <button
              key={filter}
              type="button"
              aria-pressed={snapshot.filter === filter}
              onClick={() => log.setFilter(filter)}
            >
              {text(configuration, filter === "all" ? "callLog.all" : "callLog.missed")}
            </button>
          ))}
        </div>
      </div>
      {snapshot.status === "idle" || snapshot.status === "loading" ? (
        <p className="pmfa-newchat-state" role="status">{text(configuration, "callLog.loading")}</p>
      ) : snapshot.status === "error" ? (
        <div className="pmfa-newchat-state" role="alert">
          <p>{text(configuration, "callLog.loadError")}</p>
          <button type="button" className="pmfa-btn" onClick={() => void log.load()}>
            {text(configuration, "common.retry")}
          </button>
        </div>
      ) : snapshot.groups.length === 0 ? (
        <p className="pmfa-newchat-state">
          {text(configuration, snapshot.filter === "missed" ? "callLog.noMissed" : "callLog.empty")}
        </p>
      ) : (
        <ul {...slots("callLog", "pmfa-call-rows")} ref={listRef} aria-label={text(configuration, "callLog.title")}>
          {snapshot.groups.map((group, index) => (
            <CallRow
              key={group.key}
              group={group}
              configuration={configuration}
              slots={slots}
              onOpen={onOpen}
              onCall={onCall}
              canCall={canCall}
              onKeyDown={(event) => move(event, index)}
            />
          ))}
          {snapshot.hasMore && (
            <li>
              <button type="button" className="pmfa-btn pmfa-btn-ghost pmfa-call-more" disabled={snapshot.status === "loading_more"} onClick={() => void log.loadMore()}>
                {text(configuration, "callLog.loadMore")}
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function CallRow({
  group,
  configuration,
  slots,
  onOpen,
  onCall,
  canCall,
  onKeyDown,
}: {
  readonly group: CallLogGroup;
  readonly configuration: Configuration;
  readonly slots: ReturnType<typeof useSlots>;
  readonly onOpen: ((conversation: InboxConversation) => void) | undefined;
  readonly onCall: ((entry: CallLogEntry) => void) | undefined;
  readonly canCall: boolean;
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const entry = group.latest;
  const name = callPeerName(entry);
  const missed = entry.outcome === "missed" && entry.direction === "inbound";
  const conversation = conversationForCall(entry);
  const count = group.entries.length;
  const summary = callSummary(configuration, entry);
  const back = text(configuration, entry.video ? "callLog.videoBack" : "callLog.callBack", { name });
  return (
    <li className="pmfa-call-entry">
      <button
        type="button"
        {...slots("callLogItem", `pmfa-person pmfa-call${missed ? " pmfa-call-missed" : ""}`)}
        data-call-id={entry.id}
        disabled={conversation === undefined || onOpen === undefined}
        aria-label={`${name}${count > 1 ? ` ${text(configuration, "callLog.count", { count: String(count) })}` : ""}, ${summary}`}
        onClick={() => conversation !== undefined && onOpen?.(conversation)}
        onKeyDown={onKeyDown}
      >
        <Avatar id={entry.peer.id ?? entry.id} name={name} slots={slots} />
        <span className="pmfa-person-text">
          <span className="pmfa-person-name">
            {name}
            {count > 1 && <span className="pmfa-call-count"> {text(configuration, "callLog.count", { count: String(count) })}</span>}
          </span>
          <span className="pmfa-person-sub pmfa-call-sub">
            <Icon name={entry.direction === "inbound" ? "callIn" : "callOut"} className="pmfa-icon pmfa-call-dir" />
            {summary}
          </span>
        </span>
      </button>
      {entry.peer.phoneNumber !== undefined &&
        (onCall !== undefined ? (
          <button type="button" className="pmfa-btn pmfa-btn-ghost pmfa-btn-icon pmfa-call-back" aria-label={back} title={back} onClick={() => onCall(entry)}>
            <Icon name={entry.video ? "video" : "phone"} />
          </button>
        ) : canCall ? (
          <span className="pmfa-call-back">
            <CallButton to={entry.peer.phoneNumber} video={entry.video} variant="icon" />
          </span>
        ) : null)}
    </li>
  );
}
