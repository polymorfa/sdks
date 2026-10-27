import {
  ObservableController,
  type ControllerSnapshot,
} from "../controller.js";
import type { PolymorfaClient } from "../dropin/client.js";
import type { EventSourceLike, RelayedEvent } from "../dropin/inbox.js";

/** How a call ended, from this account's side. */
export type CallLogOutcome =
  "answered" | "missed" | "declined" | "failed" | "ongoing";

/** One call. `peer` is the other party, as your records hold it. */
export interface CallLogEntry {
  readonly id: string;
  readonly session?: string;
  readonly direction: "inbound" | "outbound";
  readonly outcome: CallLogOutcome;
  readonly video: boolean;
  /** Epoch milliseconds. */
  readonly startedAt: number;
  /** Connected time; omitted when unknown or never connected. */
  readonly durationSeconds?: number;
  readonly peer: {
    readonly id?: string;
    readonly phoneNumber?: string;
    readonly name?: string;
  };
  /** The one-to-one conversation with the peer, to open from the log. */
  readonly conversationId?: string;
}

export interface CallLogPage {
  /** Newest first. */
  readonly entries: readonly CallLogEntry[];
  readonly nextCursor?: string;
}

/**
 * Where a call log reads from. Polymorfa Call Records keep the other party
 * only as a pseudonym, so a log that names people reads your own records:
 * `createHandlerCallLogSource` (your handler's `history/calls` route and
 * live `call.*` events) or `createStoreCallLogSource` from
 * `@polymorfa/ui-kit/store`.
 */
export interface CallLogSource {
  list(cursor?: string, signal?: AbortSignal): Promise<CallLogPage>;
  /** Live changes; an entry replaces any entry with the same ID. */
  subscribe?(listener: (entry: CallLogEntry) => void): () => void;
  close?(): void;
}

/** Consecutive calls WhatsApp shows as one row, with a count. */
export interface CallLogGroup {
  readonly key: string;
  /** Newest first. */
  readonly entries: readonly CallLogEntry[];
  readonly latest: CallLogEntry;
}

export type CallLogFilter = "all" | "missed";

export interface CallLogSnapshot extends ControllerSnapshot {
  readonly status: "idle" | "loading" | "ready" | "loading_more" | "error";
  /** Every loaded call, newest first. */
  readonly entries: readonly CallLogEntry[];
  readonly filter: CallLogFilter;
  /** Rows to show for `filter`. */
  readonly groups: readonly CallLogGroup[];
  readonly hasMore: boolean;
  readonly cursor?: string;
  readonly error?: string;
}

function dayKey(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function peerKey(entry: CallLogEntry): string {
  return (
    entry.peer.id ??
    entry.peer.phoneNumber?.replace(/\D/g, "") ??
    entry.conversationId ??
    `call:${entry.id}`
  );
}

/**
 * Merge consecutive calls with the same person, direction, kind and
 * outcome on the same day, as WhatsApp's call log does. Ongoing calls stay
 * on their own row.
 */
export function groupCallLog(
  entries: readonly CallLogEntry[],
): CallLogGroup[] {
  const groups: { key: string; entries: CallLogEntry[] }[] = [];
  for (const entry of entries) {
    const last = groups[groups.length - 1];
    const head = last?.entries[0];
    const same =
      head !== undefined &&
      head.outcome !== "ongoing" &&
      entry.outcome !== "ongoing" &&
      peerKey(head) === peerKey(entry) &&
      head.direction === entry.direction &&
      head.video === entry.video &&
      (head.outcome === "missed") === (entry.outcome === "missed") &&
      dayKey(head.startedAt) === dayKey(entry.startedAt);
    if (same) last!.entries.push(entry);
    else groups.push({ key: entry.id, entries: [entry] });
  }
  return groups.map((group) => ({ ...group, latest: group.entries[0]! }));
}

function sortEntries(entries: Iterable<CallLogEntry>): CallLogEntry[] {
  return [...entries].sort((a, b) => b.startedAt - a.startedAt);
}

/** Framework-neutral state for a call log: pages, live updates and a filter. */
export class CallLogController extends ObservableController<CallLogSnapshot> {
  readonly source: CallLogSource;
  #abort = new AbortController();
  #unsubscribe: (() => void) | undefined;

  constructor(source: CallLogSource, options: { readonly now?: () => number } = {}) {
    super(
      { status: "idle", entries: [], filter: "all", groups: [], hasMore: false },
      options.now,
    );
    this.source = source;
  }

  async load(): Promise<void> {
    this.assertActive();
    this.#abort.abort();
    const abort = new AbortController();
    this.#abort = abort;
    const filter = this.getSnapshot().filter;
    this.transition({ status: "loading", entries: [], filter, groups: [], hasMore: false });
    try {
      const page = await this.source.list(undefined, abort.signal);
      if (abort.signal.aborted) return;
      this.#set(page.entries, "ready", page.nextCursor);
      this.#unsubscribe?.();
      this.#unsubscribe = this.source.subscribe?.((entry) => this.#upsert(entry));
    } catch (cause) {
      if (!abort.signal.aborted)
        this.transition({
          status: "error",
          entries: [],
          filter: this.getSnapshot().filter,
          groups: [],
          hasMore: false,
          error: cause instanceof Error ? cause.message : String(cause),
        });
    }
  }

  async loadMore(): Promise<void> {
    const current = this.getSnapshot();
    if (current.status !== "ready" || current.cursor === undefined) return;
    const signal = this.#abort.signal;
    this.#set(current.entries, "loading_more", current.cursor);
    try {
      const page = await this.source.list(current.cursor, signal);
      if (signal.aborted) return;
      this.#set([...this.getSnapshot().entries, ...page.entries], "ready", page.nextCursor);
    } catch (cause) {
      if (signal.aborted) return;
      this.#set(this.getSnapshot().entries, "ready", current.cursor, cause instanceof Error ? cause.message : String(cause));
    }
  }

  setFilter(filter: CallLogFilter): void {
    const current = this.getSnapshot();
    if (current.filter === filter) return;
    this.#set(current.entries, current.status, current.cursor, current.error, filter);
  }

  protected override onDispose(): void {
    this.#abort.abort();
    this.#unsubscribe?.();
    this.source.close?.();
  }

  #upsert(entry: CallLogEntry): void {
    const current = this.getSnapshot();
    if (current.status !== "ready" && current.status !== "loading_more") return;
    this.#set(
      [entry, ...current.entries.filter((item) => item.id !== entry.id)],
      current.status,
      current.cursor,
      current.error,
    );
  }

  #set(
    entries: readonly CallLogEntry[],
    status: CallLogSnapshot["status"],
    cursor: string | undefined,
    error?: string,
    filter: CallLogFilter = this.getSnapshot().filter,
  ): void {
    const byId = new Map<string, CallLogEntry>();
    for (const entry of entries) if (!byId.has(entry.id)) byId.set(entry.id, entry);
    const sorted = sortEntries(byId.values());
    const shown = filter === "missed" ? sorted.filter((entry) => entry.outcome === "missed") : sorted;
    try {
      this.transition({
        status,
        entries: sorted,
        filter,
        groups: groupCallLog(shown),
        hasMore: cursor !== undefined,
        ...(cursor === undefined ? {} : { cursor }),
        ...(error === undefined ? {} : { error }),
      });
    } catch {
      // Disposed while a page was in flight.
    }
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;
}

/**
 * Folds relayed `call.*` events into entries. `from` is the other party for
 * both directions, matching Polymorfa's call recorder.
 */
export function callLogReducer(): (event: RelayedEvent) => CallLogEntry | undefined {
  const calls = new Map<string, CallLogEntry>();
  return (event) => {
    if (!event.event.startsWith("call.")) return undefined;
    const payload = record(event.payload);
    const callId = payload?.callId;
    if (typeof callId !== "string") return undefined;
    const time = Date.parse(event.timestamp);
    const at = Number.isFinite(time) ? time : Date.now();
    const previous = calls.get(callId);
    const from = record(payload?.from);
    const peer = {
      ...previous?.peer,
      ...(typeof from?.id === "string" ? { id: from.id } : {}),
      ...(typeof from?.phoneNumber === "string" ? { phoneNumber: from.phoneNumber } : {}),
    };
    const outcomes: Record<string, CallLogOutcome> = {
      "call.received": "ongoing",
      "call.accepted": "ongoing",
      "call.missed": "missed",
      "call.rejected": "declined",
    };
    let outcome = outcomes[event.event] ?? previous?.outcome;
    let durationSeconds = previous?.durationSeconds;
    if (event.event === "call.ended") {
      const seconds = typeof payload?.durationSeconds === "number" ? payload.durationSeconds : undefined;
      durationSeconds = seconds;
      const reason = typeof payload?.reason === "string" ? payload.reason : "";
      outcome =
        previous?.outcome === "missed" || previous?.outcome === "declined"
          ? previous.outcome
          : seconds !== undefined && seconds > 0
            ? "answered"
            : /fail|error|pod_lost/.test(reason)
              ? "failed"
              : // Never connected: unanswered, in either direction.
                "missed";
    }
    if (outcome === undefined) return undefined;
    const direction =
      payload?.direction === "inbound" || payload?.direction === "outbound"
        ? payload.direction
        : (previous?.direction ?? "inbound");
    const video =
      payload?.hasVideo === true || payload?.hadVideo === true || previous?.video === true;
    const entry: CallLogEntry = {
      id: callId,
      session: event.session,
      direction,
      outcome,
      video,
      startedAt: previous?.startedAt ?? at,
      ...(durationSeconds === undefined ? {} : { durationSeconds }),
      peer,
      ...(peer.id === undefined ? {} : { conversationId: peer.id }),
    };
    calls.set(callId, entry);
    return entry;
  };
}

/**
 * The default call log source: your handler's `history/calls` route (gated
 * by `read_calls`) and live `call.*` events from its `events` route.
 */
export function createHandlerCallLogSource(
  client: PolymorfaClient,
  options: {
    readonly live?: boolean;
    readonly EventSource?: new (
      url: string,
      init?: { withCredentials?: boolean },
    ) => EventSourceLike;
  } = {},
): CallLogSource {
  const EventSourceImpl =
    options.EventSource ??
    (globalThis as unknown as { EventSource?: NonNullable<typeof options.EventSource> })
      .EventSource;
  let source: EventSourceLike | undefined;
  return {
    async list(cursor, signal) {
      const page = await client.request<{ data: CallLogEntry[]; nextCursor?: string | null }>(
        `history/calls${cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`}`,
        signal === undefined ? {} : { signal },
      );
      return {
        entries: page.data,
        ...(typeof page.nextCursor === "string" ? { nextCursor: page.nextCursor } : {}),
      };
    },
    subscribe(listener) {
      if (options.live === false || EventSourceImpl === undefined || !client.can("subscribe_events"))
        return () => undefined;
      const reduce = callLogReducer();
      const events = new EventSourceImpl(client.url("events"), { withCredentials: true });
      source = events;
      events.addEventListener("message", (frame) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(frame.data);
        } catch {
          return;
        }
        for (const item of Array.isArray(parsed) ? parsed : [parsed]) {
          const event = record(item) as RelayedEvent | undefined;
          if (typeof event?.event !== "string" || typeof event.session !== "string") continue;
          const entry = reduce(event);
          if (entry !== undefined) listener(entry);
        }
      });
      return () => {
        events.close();
        source = undefined;
      };
    },
    close() {
      source?.close();
      source = undefined;
    },
  };
}
