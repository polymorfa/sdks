import {
  ObservableController,
  type ControllerSnapshot,
} from "../controller.js";
import type { PolymorfaClient } from "../dropin/client.js";
import type { BrowserCallRecord } from "../messaging/types.js";
import { missingPermission, withTokenRetry } from "../contacts/directory.js";

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
 * Where a call log reads from. `createApiCallLogSource` reads the number's
 * Call Records from the API with the client token; implement it yourself
 * for another backend or sample data.
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

function entry(record: BrowserCallRecord): CallLogEntry {
  const started = Date.parse(record.startedAt);
  const outcome: CallLogOutcome =
    record.outcome === "in_progress" ? "ongoing" : record.outcome;
  const peer = record.peer ?? {};
  return {
    id: record.callId,
    session: record.sessionId,
    direction: record.direction,
    outcome,
    video: record.hasVideo,
    startedAt: Number.isFinite(started) ? started : 0,
    ...(record.durationSeconds === null ? {} : { durationSeconds: record.durationSeconds }),
    peer: {
      ...(peer.id === undefined ? {} : { id: peer.id }),
      ...(peer.phoneNumber === undefined ? {} : { phoneNumber: peer.phoneNumber }),
      ...(peer.username === undefined ? {} : { name: `@${peer.username}` }),
    },
    ...(peer.id === undefined ? {} : { conversationId: peer.id }),
  };
}

/**
 * The default call log source: `GET /messaging/{session}/calls` with the
 * client token (`read_calls`). Each page returns the callers' identities.
 * Pass `names` to show saved contact names instead of numbers.
 */
export function createApiCallLogSource(
  client: PolymorfaClient,
  options: {
    readonly session?: string;
    /** Calls per page, 1 to 100. Default 50. */
    readonly limit?: number;
    /** A display name for a caller, for example from the contacts directory. */
    readonly names?: (peer: { readonly id?: string; readonly phoneNumber?: string }) => string | undefined;
  } = {},
): CallLogSource {
  return {
    async list(cursor, signal) {
      if (!client.can("read_calls")) missingPermission("read_calls");
      const response = await withTokenRetry(client, () =>
        client.messaging(options.session).calls.list(
          { limit: options.limit ?? 50, ...(cursor === undefined ? {} : { cursor }) },
          signal === undefined ? {} : { signal },
        ),
      );
      const page = response.data;
      return {
        entries: page.data.map((record) => {
          const item = entry(record);
          const name = options.names?.(item.peer);
          return name === undefined ? item : { ...item, peer: { ...item.peer, name } };
        }),
        ...(page.nextCursor === null ? {} : { nextCursor: page.nextCursor }),
      };
    },
  };
}
