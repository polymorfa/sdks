import {
  MemoryBackend,
  openIndexedDbBackend,
  type InternalStoreName,
  type KeyRange,
  type Row,
  type StoreBackend,
  type SweepRule,
  type WriteOp,
} from "./backend.js";
import {
  BUILT_IN_REDUCERS,
  keyHints,
  pick,
  upsertMessage,
  type ReducerContext,
  type StoreReducer,
} from "./reducers.js";
import {
  DATA_STORE_NAMES,
  type Checkpoint,
  type DataStoreName,
  type PolymorfaEvent,
  type StoreChange,
  type StoreChangeListener,
  type StoreRowMap,
  type StoredAttachment,
  type StoredCall,
  type StoredContact,
  type StoredConversation,
  type StoredEvent,
  type StoredLabel,
  type StoredMessage,
  type StoredMessageStatus,
  type StoredPresence,
  type StoredSession,
  type StoredTemplate,
} from "./types.js";

const DAY = 24 * 60 * 60 * 1000;

export interface RetentionRule {
  /** Rows whose newest event is older than this are removed. */
  readonly maxAgeMs?: number;
  /** Oldest rows beyond this count are removed. */
  readonly maxRows?: number;
}

export type RetentionOptions = Partial<
  Record<DataStoreName, RetentionRule | false>
>;

export const DEFAULT_RETENTION: Readonly<Record<DataStoreName, RetentionRule>> =
  {
    conversations: { maxRows: 10_000 },
    messages: { maxRows: 100_000 },
    contacts: { maxRows: 20_000 },
    presence: { maxAgeMs: DAY, maxRows: 5_000 },
    calls: { maxAgeMs: 90 * DAY, maxRows: 5_000 },
    labels: { maxRows: 1_000 },
    sessions: { maxRows: 100 },
    templates: { maxRows: 2_000 },
    events: { maxAgeMs: 7 * DAY, maxRows: 10_000 },
    custom: { maxAgeMs: 30 * DAY, maxRows: 5_000 },
  };

/** Fields sealed by `encrypt` in each store. */
export const SENSITIVE_FIELDS: Readonly<
  Record<DataStoreName, readonly string[]>
> = {
  conversations: ["name", "description", "lastMessage"],
  messages: [
    "text",
    "caption",
    "filename",
    "mediaUrl",
    "attachments",
    "pushName",
    "reactions",
    "votes",
  ],
  contacts: [
    "phoneNumber",
    "username",
    "fullName",
    "firstName",
    "pushName",
    "businessName",
  ],
  presence: [],
  calls: ["from", "participants"],
  labels: ["name"],
  sessions: ["phoneNumber", "pushName", "businessName"],
  templates: [],
  events: ["payload"],
  custom: ["payload"],
};

export interface SealContext {
  readonly store: DataStoreName;
  readonly id: string;
}

export interface RedactRule {
  /** Exact event type, a `prefix.*` pattern, or `*`. */
  readonly events: string;
  /** Dotted payload paths to remove, for example `text` or `conversation.phoneNumber`. */
  readonly paths: readonly string[];
}

export interface BroadcastChannelLike {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: MessageEvent) => void) | null;
}

export interface PolymorfaStoreOptions {
  /**
   * Database name. Include the signed-in user and session so data never
   * crosses accounts, for example `support:user_123`.
   */
  readonly name: string;
  /**
   * Application data version. When it changes, stored data is wiped on
   * open, because it is a cache of events the backend still holds.
   */
  readonly version?: number;
  /** Only events for this session are stored. */
  readonly session?: string;
  readonly retention?: RetentionOptions;
  /** How often to sweep, in milliseconds. `0` sweeps only on open. */
  readonly sweepIntervalMs?: number;
  /** Defaults to `globalThis.indexedDB`; `null` forces memory mode. */
  readonly indexedDB?: IDBFactory | null;
  /** Defaults to `globalThis.BroadcastChannel`; `null` disables tab sync. */
  readonly broadcastChannel?: ((name: string) => BroadcastChannelLike) | null;
  /** Seals `SENSITIVE_FIELDS` before they are written. Needs `decrypt`. */
  readonly encrypt?: (
    fields: Record<string, unknown>,
    context: SealContext,
  ) => unknown;
  readonly decrypt?: (
    sealed: unknown,
    context: SealContext,
  ) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /** Payload fields removed before an event is reduced or logged. */
  readonly redact?: readonly RedactRule[];
  /** Maximum events per write transaction. */
  readonly batchSize?: number;
  readonly now?: () => number;
  /** Reports a failed background sweep. */
  readonly onError?: (error: unknown) => void;
}

export interface IngestResult {
  readonly accepted: number;
  readonly duplicates: number;
  /** Events dropped for a different session or a malformed envelope. */
  readonly ignored: number;
}

export interface MessageListQuery {
  readonly conversationId: string;
  /** Only messages created before this epoch-millisecond time. */
  readonly before?: number;
  readonly limit?: number;
  /** Include deleted and revoked messages. */
  readonly includeDeleted?: boolean;
}

export interface MessageInput {
  readonly id: string;
  readonly conversationId: string;
  readonly createdAt: number;
  readonly fromMe: boolean;
  readonly text?: string;
  readonly clientId?: string;
  readonly status?: StoredMessageStatus;
  readonly attachments?: readonly StoredAttachment[];
}

export interface ListOptions {
  readonly limit?: number;
}

export interface EventListQuery {
  readonly types?: readonly string[];
  /** Epoch milliseconds, inclusive. */
  readonly since?: number;
  readonly limit?: number;
}

export interface StoreUsage {
  readonly usage?: number;
  readonly quota?: number;
}

export type StoreMode = "indexeddb" | "memory";

export interface PolymorfaStore {
  readonly name: string;
  /** `memory` when IndexedDB was unavailable; data then lasts for the page. */
  readonly mode: StoreMode;
  /** Why the store fell back to memory. */
  readonly fallbackReason?: string;
  ingest(
    events: PolymorfaEvent | readonly PolymorfaEvent[],
  ): Promise<IngestResult>;
  /** Adds a reducer for `type`. It runs after any built-in reducer. */
  registerReducer(type: string, reducer: StoreReducer): () => void;
  readonly conversations: {
    get(id: string): Promise<StoredConversation | undefined>;
    /** Most recent activity first. */
    list(
      query?: ListOptions & { readonly unreadOnly?: boolean },
    ): Promise<StoredConversation[]>;
  };
  readonly messages: {
    get(id: string): Promise<StoredMessage | undefined>;
    /** Newest first. */
    list(query: MessageListQuery): Promise<StoredMessage[]>;
    /** Writes messages from a backend history read; newer state wins. */
    upsert(
      messages: readonly MessageInput[],
      options?: { readonly session?: string },
    ): Promise<void>;
  };
  readonly contacts: StoreReader<StoredContact>;
  readonly presence: StoreReader<StoredPresence>;
  readonly calls: StoreReader<StoredCall>;
  readonly labels: StoreReader<StoredLabel>;
  readonly sessions: StoreReader<StoredSession>;
  readonly templates: StoreReader<StoredTemplate>;
  readonly events: {
    get(id: string): Promise<StoredEvent | undefined>;
    /** Oldest first. */
    list(query?: EventListQuery): Promise<StoredEvent[]>;
  };
  readonly custom: {
    get(id: string): Promise<StoredEvent | undefined>;
    list(query?: EventListQuery): Promise<StoredEvent[]>;
  };
  readonly checkpoints: {
    get(id: string): Promise<Checkpoint | undefined>;
    set(id: string, cursor: string): Promise<void>;
  };
  /** Listens for committed changes in this tab and other tabs. */
  subscribe(
    store: DataStoreName | "*",
    listener: StoreChangeListener,
  ): () => void;
  /** Applies retention now. */
  sweep(): Promise<void>;
  /** Removes all stored data, for example on sign-out. */
  clear(): Promise<void>;
  close(): void;
  estimateUsage(): Promise<StoreUsage | undefined>;
  /** Asks the browser not to evict this origin's storage. */
  persist(): Promise<boolean>;
}

export interface StoreReader<T> {
  get(id: string): Promise<T | undefined>;
  /** Most recently updated first. */
  list(options?: ListOptions): Promise<T[]>;
}

const SECRET_KEY =
  /(^|_|-)(token|secret|password|authorization|api_?key|credential)s?$/i;

/** Removes token-like fields and values anywhere in a payload. */
export function stripSecrets(value: unknown, depth = 0): unknown {
  if (depth > 32) return undefined;
  if (typeof value === "string")
    return /^pmfa_[a-z]+_/i.test(value) ? "[redacted]" : value;
  if (Array.isArray(value))
    return value.map((entry) => stripSecrets(entry, depth + 1));
  if (typeof value !== "object" || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (SECRET_KEY.test(key) || /[a-z]Token$/.test(key)) continue;
    result[key] = stripSecrets(entry, depth + 1);
  }
  return result;
}

function matches(pattern: string, type: string): boolean {
  if (pattern === "*" || pattern === type) return true;
  return pattern.endsWith(".*") && type.startsWith(pattern.slice(0, -1));
}

function removePath(value: unknown, path: readonly string[]): void {
  if (typeof value !== "object" || value === null) return;
  const [head, ...rest] = path;
  if (head === undefined) return;
  const record = value as Record<string, unknown>;
  if (rest.length === 0) delete record[head];
  else removePath(record[head], rest);
}

function isEnvelope(value: unknown): value is PolymorfaEvent {
  if (typeof value !== "object" || value === null) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.id === "string" &&
    event.id !== "" &&
    typeof event.event === "string" &&
    typeof event.session === "string" &&
    typeof event.timestamp === "string"
  );
}

const changeChannel = (name: string) => `polymorfa-store:${name}`;

interface ChangeSet {
  readonly keys: Map<DataStoreName, Set<string>>;
  readonly deleted: Map<DataStoreName, Set<string>>;
}

class Draft {
  readonly #rows = new Map<string, Row | null>();
  readonly #ops = new Map<string, WriteOp>();
  #ranges = 0;

  constructor(
    private readonly load: (
      requests: readonly (readonly [DataStoreName, string])[],
    ) => Promise<(Row | undefined)[]>,
  ) {}

  static key(store: string, id: string) {
    return `${store}\u0000${id}`;
  }

  async preload(keys: readonly (readonly [DataStoreName, string])[]) {
    const missing = [
      ...new Map(
        keys
          .filter(([store, id]) => !this.#rows.has(Draft.key(store, id)))
          .map((entry) => [Draft.key(...entry), entry] as const),
      ).values(),
    ];
    if (missing.length === 0) return;
    const rows = await this.load(missing);
    missing.forEach(([store, id], index) =>
      this.#rows.set(Draft.key(store, id), rows[index] ?? null),
    );
  }

  async get(store: DataStoreName, id: string): Promise<Row | undefined> {
    const key = Draft.key(store, id);
    if (!this.#rows.has(key)) await this.preload([[store, id]]);
    const row = this.#rows.get(key);
    return row === null || row === undefined ? undefined : structuredClone(row);
  }

  put(store: DataStoreName, row: Row) {
    const key = Draft.key(store, row.id);
    this.#rows.set(key, structuredClone(row));
    this.#ops.delete(key);
    this.#ops.set(key, { kind: "put", store, row });
  }

  delete(store: DataStoreName, id: string) {
    const key = Draft.key(store, id);
    this.#rows.set(key, null);
    this.#ops.delete(key);
    this.#ops.set(key, { kind: "delete", store, key: id });
  }

  deleteConversationMessages(conversationId: string) {
    // Drop pending and cached rows the range covers so later reads agree.
    for (const [key, row] of this.#rows)
      if (
        row !== null &&
        key.startsWith("messages\u0000") &&
        row.conversationId === conversationId
      ) {
        this.#rows.set(key, null);
        this.#ops.delete(key);
      }
    const range: KeyRange = {
      lower: [conversationId, -Infinity],
      upper: [conversationId, Infinity],
    };
    this.#ops.set(`range\u0000${(this.#ranges += 1)}`, {
      kind: "deleteRange",
      store: "messages",
      index: "by_conversation",
      range,
    });
  }

  get size() {
    return this.#ops.size;
  }

  ops(): WriteOp[] {
    return [...this.#ops.values()];
  }
}

export async function createPolymorfaStore(
  options: PolymorfaStoreOptions,
): Promise<PolymorfaStore> {
  if (typeof options.name !== "string" || options.name.trim() === "")
    throw new TypeError("createPolymorfaStore requires a non-empty name.");
  if ((options.encrypt === undefined) !== (options.decrypt === undefined))
    throw new TypeError("Pass both encrypt and decrypt, or neither.");
  const now = options.now ?? Date.now;
  const batchSize = Math.max(1, options.batchSize ?? 250);
  const databaseName = `polymorfa-store:${options.name}`;

  let backend: StoreBackend;
  let fallbackReason: string | undefined;
  const factory =
    options.indexedDB === undefined
      ? (globalThis as { indexedDB?: IDBFactory }).indexedDB
      : options.indexedDB;
  if (factory === null || factory === undefined) {
    backend = new MemoryBackend();
    fallbackReason = "IndexedDB is not available in this environment.";
  } else {
    try {
      backend = await openIndexedDbBackend(factory, databaseName);
    } catch (cause) {
      backend = new MemoryBackend();
      fallbackReason = `IndexedDB could not be opened: ${
        cause instanceof Error ? cause.message : String(cause)
      }`;
    }
  }

  const reducers = new Map<string, StoreReducer[]>();
  const listeners = new Map<string, Set<StoreChangeListener>>();
  let closed = false;
  let queue: Promise<unknown> = Promise.resolve();

  const channelFactory =
    options.broadcastChannel === undefined
      ? typeof BroadcastChannel === "function"
        ? (name: string) => new BroadcastChannel(name) as BroadcastChannelLike
        : null
      : options.broadcastChannel;
  const channel =
    backend.mode === "indexeddb" && channelFactory !== null
      ? channelFactory(changeChannel(options.name))
      : undefined;

  const notify = (change: StoreChange) => {
    for (const key of [change.store, "*"])
      for (const listener of listeners.get(key) ?? []) {
        try {
          listener(change);
        } catch (error) {
          options.onError?.(error);
        }
      }
  };

  if (channel !== undefined)
    channel.onmessage = (message: MessageEvent) => {
      const data = message.data as Partial<StoreChange> | undefined;
      if (
        data === undefined ||
        typeof data.store !== "string" ||
        !DATA_STORE_NAMES.includes(data.store) ||
        !Array.isArray(data.keys) ||
        !Array.isArray(data.deleted)
      )
        return;
      notify({
        store: data.store,
        keys: data.keys,
        deleted: data.deleted,
        ...(data.cleared === true ? { cleared: true } : {}),
        origin: "remote",
      });
    };

  const publish = (changes: ChangeSet) => {
    for (const store of DATA_STORE_NAMES) {
      const keys = [...(changes.keys.get(store) ?? [])];
      const deleted = [...(changes.deleted.get(store) ?? [])];
      if (keys.length === 0 && deleted.length === 0) continue;
      const change: StoreChange = { store, keys, deleted, origin: "local" };
      notify(change);
      channel?.postMessage({ store, keys, deleted });
    }
  };

  const serial = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(() => {
      if (closed) throw new Error("The Polymorfa store is closed.");
      return task();
    });
    queue = run.catch(() => undefined);
    return run;
  };

  const seal = async (store: DataStoreName, row: Row): Promise<Row> => {
    if (options.encrypt === undefined) return row;
    const fields: Record<string, unknown> = {};
    const plain: Record<string, unknown> = { ...row };
    for (const field of SENSITIVE_FIELDS[store])
      if (field in plain) {
        fields[field] = plain[field];
        delete plain[field];
      }
    plain._sealed = await options.encrypt(fields, { store, id: row.id });
    return plain as Row;
  };

  const unseal = async <T>(store: DataStoreName, row: Row): Promise<T> => {
    const { _sealed: sealed, ...plain } = row;
    if (sealed === undefined || options.decrypt === undefined)
      return plain as T;
    const fields = await options.decrypt(sealed, { store, id: row.id });
    return { ...plain, ...fields } as T;
  };

  const loadRows = async (
    requests: readonly (readonly [DataStoreName, string])[],
  ) => {
    const rows = await backend.getMany(
      requests.map(([store, key]) => ({ store, key })),
    );
    return Promise.all(
      rows.map((row, index) =>
        row === undefined
          ? undefined
          : unseal<Row>(
              (requests[index] as readonly [DataStoreName, string])[0],
              row,
            ),
      ),
    );
  };

  const commit = async (draft: Draft, changes: ChangeSet) => {
    const ops = await Promise.all(
      draft.ops().map(async (op): Promise<WriteOp> => {
        if (op.kind !== "put") return op;
        return {
          ...op,
          row: await seal(op.store as DataStoreName, op.row),
        };
      }),
    );
    const removed = await backend.commit(ops);
    for (const op of ops) {
      const store = op.store as DataStoreName;
      if (op.kind === "put") addChange(changes.keys, store, op.row.id);
      else if (op.kind === "delete") addChange(changes.deleted, store, op.key);
    }
    for (const [store, keys] of removed)
      for (const key of keys)
        addChange(changes.deleted, store as DataStoreName, key);
  };

  const contextFor = (draft: Draft, time: number): ReducerContext => ({
    time,
    get: (store, id) =>
      draft.get(store, id) as Promise<StoreRowMap[typeof store] | undefined>,
    put: (store, row) => draft.put(store, row as unknown as Row),
    delete: (store, id) => draft.delete(store, id),
    deleteConversationMessages: (conversationId) =>
      draft.deleteConversationMessages(conversationId),
  });

  const prepare = (event: PolymorfaEvent): PolymorfaEvent => {
    let payload = stripSecrets(structuredClone(event.payload));
    for (const rule of options.redact ?? [])
      if (matches(rule.events, event.event))
        for (const path of rule.paths) removePath(payload, path.split("."));
    if (payload === undefined) payload = null;
    return {
      id: event.id,
      session: event.session,
      ...(event.externalId === undefined
        ? {}
        : { externalId: event.externalId }),
      timestamp: event.timestamp,
      event: event.event,
      payload,
    };
  };

  const ingestBatch = async (
    events: readonly PolymorfaEvent[],
    result: { accepted: number; duplicates: number; ignored: number },
    changes: ChangeSet,
  ) => {
    const draft = new Draft(loadRows);
    const valid = events.filter((event) => {
      const ok =
        isEnvelope(event) &&
        (options.session === undefined || event.session === options.session);
      if (!ok) result.ignored += 1;
      return ok;
    });
    await draft.preload([
      ...valid.map((event) => ["events", event.id] as const),
      ...valid.flatMap((event) => keyHints(event)),
    ]);
    for (const raw of valid) {
      if ((await draft.get("events", raw.id)) !== undefined) {
        result.duplicates += 1;
        continue;
      }
      const event = prepare(raw);
      const parsed = Date.parse(event.timestamp);
      const time = Number.isNaN(parsed) ? now() : parsed;
      const logged: StoredEvent = {
        id: event.id,
        _t: time,
        type: event.event,
        session: event.session,
        ...(event.externalId === undefined
          ? {}
          : { externalId: event.externalId }),
        timestamp: event.timestamp,
        payload: event.payload,
      };
      draft.put("events", logged as unknown as Row);
      const handlers = [
        ...(BUILT_IN_REDUCERS[event.event] === undefined
          ? []
          : [BUILT_IN_REDUCERS[event.event] as StoreReducer]),
        ...(reducers.get(event.event) ?? []),
      ];
      let filed = false;
      const context = contextFor(draft, time);
      for (const handler of handlers)
        if ((await handler(event, context)) !== false) filed = true;
      if (!filed) draft.put("custom", logged as unknown as Row);
      result.accepted += 1;
    }
    await commit(draft, changes);
  };

  const emptyChanges = (): ChangeSet => ({
    keys: new Map(),
    deleted: new Map(),
  });

  const sweep = async () => {
    const rules = new Map<InternalStoreName, SweepRule>();
    for (const store of DATA_STORE_NAMES) {
      const configured = options.retention?.[store];
      if (configured === false) continue;
      const rule = configured ?? DEFAULT_RETENTION[store];
      rules.set(
        store,
        pick({
          olderThan:
            rule.maxAgeMs === undefined ? undefined : now() - rule.maxAgeMs,
          maxRows: rule.maxRows,
        }),
      );
    }
    const removed = await backend.sweep(rules);
    const changes = emptyChanges();
    for (const [store, keys] of removed)
      for (const key of keys)
        addChange(changes.deleted, store as DataStoreName, key);
    publish(changes);
  };

  const readRows = async <T>(
    store: DataStoreName,
    query: Parameters<StoreBackend["query"]>[1],
  ): Promise<T[]> => {
    const rows = await backend.query(store, query);
    return Promise.all(rows.map((row) => unseal<T>(store, row)));
  };

  const getRow = async <T>(
    store: DataStoreName,
    id: string,
  ): Promise<T | undefined> => {
    const [row] = await backend.getMany([{ store, key: id }]);
    return row === undefined ? undefined : unseal<T>(store, row);
  };

  const reader = <S extends DataStoreName>(
    store: S,
  ): StoreReader<StoreRowMap[S]> => ({
    get: (id) => getRow(store, id),
    list: (query = {}) =>
      readRows(store, {
        index: "by_time",
        direction: "prev",
        ...(query.limit === undefined ? {} : { limit: query.limit }),
      }),
  });

  const eventReader = (store: "events" | "custom") => ({
    get: (id: string) => getRow<StoredEvent>(store, id),
    list: (query: EventListQuery = {}) => {
      const types =
        query.types === undefined ? undefined : new Set(query.types);
      return readRows<StoredEvent>(store, {
        index: "by_time",
        direction: "next",
        ...(query.since === undefined ? {} : { range: { lower: query.since } }),
        ...(query.limit === undefined ? {} : { limit: query.limit }),
        ...(types === undefined
          ? {}
          : { filter: (row: Row) => types.has(row.type as string) }),
      });
    },
  });

  // Version handling: stored data is a cache and is wiped on a change.
  const appVersion = options.version ?? 0;
  const [meta] = await backend.getMany([{ store: "meta", key: "version" }]);
  if (meta !== undefined && meta.value !== appVersion) await backend.clear();
  if (meta?.value !== appVersion)
    await backend.commit([
      {
        kind: "put",
        store: "meta",
        row: { id: "version", value: appVersion },
      },
    ]);

  try {
    await sweep();
  } catch (error) {
    options.onError?.(error);
  }
  const interval = options.sweepIntervalMs ?? 60 * 60 * 1000;
  const timer =
    interval > 0
      ? setInterval(() => {
          void serial(sweep).catch((error: unknown) =>
            options.onError?.(error),
          );
        }, interval)
      : undefined;
  (timer as { unref?: () => void } | undefined)?.unref?.();

  const store: PolymorfaStore = {
    name: options.name,
    mode: backend.mode,
    ...(fallbackReason === undefined ? {} : { fallbackReason }),
    ingest: (input) =>
      serial(async () => {
        const events = Array.isArray(input)
          ? (input as readonly PolymorfaEvent[])
          : [input as PolymorfaEvent];
        const result = { accepted: 0, duplicates: 0, ignored: 0 };
        const changes = emptyChanges();
        for (let start = 0; start < events.length; start += batchSize)
          await ingestBatch(
            events.slice(start, start + batchSize),
            result,
            changes,
          );
        publish(changes);
        return result;
      }),
    registerReducer(type, reducer) {
      const list = reducers.get(type) ?? [];
      list.push(reducer);
      reducers.set(type, list);
      return () => {
        const current = reducers.get(type) ?? [];
        reducers.set(
          type,
          current.filter((candidate) => candidate !== reducer),
        );
      };
    },
    conversations: {
      get: (id) => getRow("conversations", id),
      list: (query = {}) =>
        readRows<StoredConversation>("conversations", {
          index: "by_activity",
          direction: "prev",
          ...(query.limit === undefined ? {} : { limit: query.limit }),
          filter: (row) =>
            row.deleted !== true &&
            (query.unreadOnly !== true ||
              (row.unreadCount as number) > 0 ||
              row.markedUnread === true),
        }),
    },
    messages: {
      get: (id) => getRow("messages", id),
      list: (query) =>
        readRows<StoredMessage>("messages", {
          index: "by_conversation",
          direction: "prev",
          range: {
            lower: [query.conversationId, -Infinity],
            upper: [query.conversationId, query.before ?? Infinity],
            upperOpen: query.before !== undefined,
          },
          limit: query.limit ?? 50,
          filter: (row) =>
            row.stub !== true &&
            (query.includeDeleted === true || row.deleted !== true),
        }),
      upsert: (messages, upsertOptions = {}) =>
        serial(async () => {
          const draft = new Draft(loadRows);
          const time = now();
          const context = contextFor(draft, time);
          for (const message of messages)
            await upsertMessage(
              context,
              pick({
                id: message.id,
                session: upsertOptions.session ?? options.session ?? "",
                conversationId: message.conversationId,
                createdAt: message.createdAt,
                fromMe: message.fromMe,
                text: message.text,
                clientId: message.clientId,
                attachments: message.attachments,
              }),
              // History reads are older than any live event for the message.
              message.createdAt,
              {
                content: true,
                ...(message.status === undefined
                  ? {}
                  : { status: message.status }),
              },
            );
          const changes = emptyChanges();
          await commit(draft, changes);
          publish(changes);
        }),
    },
    contacts: reader("contacts"),
    presence: reader("presence"),
    calls: reader("calls"),
    labels: reader("labels"),
    sessions: reader("sessions"),
    templates: reader("templates"),
    events: eventReader("events"),
    custom: eventReader("custom"),
    checkpoints: {
      get: async (id) => {
        const [row] = await backend.getMany([
          { store: "checkpoints", key: id },
        ]);
        return row as Checkpoint | undefined;
      },
      set: (id, cursor) =>
        serial(async () => {
          await backend.commit([
            {
              kind: "put",
              store: "checkpoints",
              row: { id, cursor, updatedAt: now() },
            },
          ]);
        }),
    },
    subscribe(name, listener) {
      const set = listeners.get(name) ?? new Set();
      set.add(listener);
      listeners.set(name, set);
      return () => set.delete(listener);
    },
    sweep: () => serial(sweep),
    clear: () =>
      serial(async () => {
        await backend.clear();
        await backend.commit([
          {
            kind: "put",
            store: "meta",
            row: { id: "version", value: appVersion },
          },
        ]);
        for (const name of DATA_STORE_NAMES) {
          notify({
            store: name,
            keys: [],
            deleted: [],
            cleared: true,
            origin: "local",
          });
          channel?.postMessage({
            store: name,
            keys: [],
            deleted: [],
            cleared: true,
          });
        }
      }),
    close() {
      if (closed) return;
      closed = true;
      if (timer !== undefined) clearInterval(timer);
      channel?.close();
      listeners.clear();
      void queue.then(() => backend.close());
    },
    async estimateUsage() {
      const storage = (
        globalThis as {
          navigator?: {
            storage?: { estimate?: () => Promise<StorageEstimate> };
          };
        }
      ).navigator?.storage;
      if (storage?.estimate === undefined) return undefined;
      const estimate = await storage.estimate();
      return pick({ usage: estimate.usage, quota: estimate.quota });
    },
    async persist() {
      const storage = (
        globalThis as {
          navigator?: { storage?: { persist?: () => Promise<boolean> } };
        }
      ).navigator?.storage;
      if (storage?.persist === undefined) return false;
      return storage.persist();
    },
  };
  return store;
}

function addChange(
  target: Map<DataStoreName, Set<string>>,
  store: DataStoreName,
  key: string,
) {
  const set = target.get(store) ?? new Set();
  set.add(key);
  target.set(store, set);
}
