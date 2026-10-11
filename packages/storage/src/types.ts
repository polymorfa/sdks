import type { EntityName } from "./schema.js";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** A stored field value. `json` fields hold any JSON value. */
export type FieldValue = JsonValue;

/**
 * One field write. `version` orders writes to the same field: the higher
 * version wins, and equal versions are broken by comparing the values, so
 * every replica that sees the same writes in any order ends up equal.
 */
export interface FieldWrite {
  readonly value: FieldValue;
  readonly version: number;
}

export type FieldWrites = Readonly<Record<string, FieldWrite>>;

export type RowKey = Readonly<Record<string, string>>;

/**
 * Drops the write when the chat was cleared or deleted at or after
 * `timestamp`, so a late copy of a cleared message does not reappear.
 */
export interface ChatWatermarkGuard {
  readonly sessionId: string;
  readonly chatId: string;
  /** Unix milliseconds of the message the write belongs to. */
  readonly timestamp: number;
}

/** Creates the row when absent and merges `fields` into it. */
export interface UpsertOperation {
  readonly kind: "upsert";
  readonly entity: EntityName;
  readonly key: RowKey;
  readonly fields: FieldWrites;
  readonly guard?: ChatWatermarkGuard;
}

/** Merges `fields` into an existing row; does nothing when the row is absent. */
export interface PatchOperation {
  readonly kind: "patch";
  readonly entity: EntityName;
  readonly key: RowKey;
  readonly fields: FieldWrites;
  readonly guard?: ChatWatermarkGuard;
}

/**
 * Removes a row. This is a hard delete without a version: a later upsert of
 * the same key recreates it. The reducer uses tombstone fields instead.
 */
export interface DeleteOperation {
  readonly kind: "delete";
  readonly entity: EntityName;
  readonly key: RowKey;
}

/**
 * Deletes a chat's messages with `timestamp <= upTo`, with their media,
 * reactions, receipts and poll votes.
 */
export interface ClearChatOperation {
  readonly kind: "clearChat";
  readonly sessionId: string;
  readonly chatId: string;
  readonly upTo: number;
}

/** Saves a resume position. Checkpoints overwrite; they are not merged. */
export interface CheckpointOperation {
  readonly kind: "checkpoint";
  readonly sessionId: string;
  readonly stream: string;
  readonly cursor: string;
  readonly position?: JsonValue;
  /** Unix milliseconds supplied by the caller. */
  readonly updatedAt?: number;
}

export type StorageOperation =
  | UpsertOperation
  | PatchOperation
  | DeleteOperation
  | ClearChatOperation
  | CheckpointOperation;

/** Operations produced from one event or history chunk. */
export interface OperationBatch {
  readonly sessionId: string;
  /**
   * Deduplication key. A batch whose event ID was already applied for the
   * session is skipped. Omit for batches without a stable source ID.
   */
  readonly eventId?: string;
  /** Recorded with the event marker. */
  readonly eventType?: string;
  readonly operations: readonly StorageOperation[];
}

/** A row as adapters store it. */
export interface StoredRow {
  readonly _id: string;
  /** Incremented on every write; used for conditional writes. */
  readonly _rev: number;
  /** Merge version of each field written with a version. */
  readonly _v: Readonly<Record<string, number>>;
  readonly [field: string]: FieldValue;
}

export interface RowPut {
  readonly kind: "put";
  readonly entity: EntityName;
  readonly row: StoredRow;
  /** `null`: the row must not exist. A number: the stored `_rev` must match. */
  readonly expectedRev: number | null;
}

export interface RowDelete {
  readonly kind: "delete";
  readonly entity: EntityName;
  readonly id: string;
  /** When set, the stored `_rev` must match. */
  readonly expectedRev?: number;
}

export type RowWrite = RowPut | RowDelete;

export type CommitResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      /** `_id`s whose precondition failed. */
      readonly conflicts: readonly string[];
    };

export interface IndexRange {
  readonly gt?: number;
  readonly gte?: number;
  readonly lt?: number;
  readonly lte?: number;
}

export interface IndexQuery {
  /** An index name from the entity definition. */
  readonly index: string;
  /** Values for every field in the index's `equals` list. */
  readonly equals: RowKey;
  readonly range?: IndexRange;
  readonly order?: "asc" | "desc";
  /** Maximum rows returned. */
  readonly limit: number;
  /** Continue after this row, in the query order. */
  readonly after?: { readonly sort: number; readonly id: string };
}

export interface StorageCapabilities {
  /** `commit` applies every write or none. */
  readonly atomicCommit: boolean;
  /** Largest number of writes passed to one `commit`. */
  readonly maxCommitSize: number;
}

/**
 * Storage-only adapter. Adapters persist and fetch rows and enforce the
 * write preconditions; merge rules, deduplication and checkpoints live in
 * `createStorage`, so every database behaves the same.
 *
 * Ordering: `query` returns rows ordered by the index sort field, then by
 * `_id`, in the requested direction.
 */
export interface StorageAdapter {
  readonly name: string;
  readonly capabilities: StorageCapabilities;
  /** Creates tables, collections and indexes when the adapter is allowed to. */
  setup?(): Promise<void>;
  get(
    entity: EntityName,
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, StoredRow>>;
  commit(writes: readonly RowWrite[]): Promise<CommitResult>;
  query(entity: EntityName, query: IndexQuery): Promise<readonly StoredRow[]>;
  /** Removes every row. Used by tests and resets. */
  truncate?(): Promise<void>;
  close?(): Promise<void>;
}
