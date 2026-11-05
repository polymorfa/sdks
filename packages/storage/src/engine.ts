import { canonicalJson, emptyRow, mergeFields, publicRow } from "./merge.js";
import {
  encodeKey,
  entityDefinition,
  type EntityName,
  STORAGE_SCHEMA,
} from "./schema.js";
import type {
  CheckpointOperation,
  ClearChatOperation,
  FieldValue,
  IndexQuery,
  JsonValue,
  OperationBatch,
  RowKey,
  RowWrite,
  StorageAdapter,
  StorageOperation,
  StoredRow,
} from "./types.js";

export class StorageConflictError extends Error {
  override readonly name = "StorageConflictError";
  constructor(readonly ids: readonly string[]) {
    super(
      `Storage writes kept conflicting after retries (${ids.length} rows). Another writer is updating the same rows.`,
    );
  }
}

export interface CreateStorageOptions {
  /** Retries per commit when another writer changed a row. Default 8. */
  readonly maxRetries?: number;
  /** Rows deleted per page by `clearChat`. Default 200. */
  readonly clearPageSize?: number;
  /** Fenced per-session lease duration. Default 30 seconds. */
  readonly leaseDurationMs?: number;
  /** Maximum wait to acquire a busy lease. Default 30 seconds. */
  readonly leaseWaitMs?: number;
  readonly now?: () => number;
}

export interface ApplyResult {
  /** `false` when the event ID was already applied. */
  readonly applied: boolean;
  /** Rows written or deleted. */
  readonly writes: number;
}

export interface Checkpoint {
  readonly cursor: string;
  readonly position: JsonValue;
  readonly updatedAt: number | null;
}

export interface QueryPage {
  readonly rows: readonly Record<string, FieldValue>[];
  /** Pass as `after` for the next page, or `undefined` at the end. */
  readonly next: { readonly sort: number; readonly id: string } | undefined;
}

export interface Storage {
  readonly adapter: StorageAdapter;
  /**
   * Applies one batch. Idempotent: replaying a batch, or batches in another
   * order, gives the same stored state (see the README's consistency model).
   */
  apply(batch: OperationBatch): Promise<ApplyResult>;
  get(
    entity: EntityName,
    key: RowKey,
  ): Promise<Record<string, FieldValue> | null>;
  query(entity: EntityName, query: IndexQuery): Promise<QueryPage>;
  getCheckpoint(sessionId: string, stream: string): Promise<Checkpoint | null>;
  hasEvent(sessionId: string, eventId: string): Promise<boolean>;
}

export class StorageLeaseLostError extends Error {
  override readonly name = "StorageLeaseLostError";
  constructor() {
    super(
      "The storage write lease expired or changed. Replay from the saved checkpoint.",
    );
  }
}
export class StorageCheckpointConflictError extends Error {
  override readonly name = "StorageCheckpointConflictError";
  constructor() {
    super(
      "The storage checkpoint changed. Stop this consumer and resume from the saved checkpoint.",
    );
  }
}

type RowOperation = Exclude<StorageOperation, ClearChatOperation>;

/** Wraps a storage-only adapter with the shared merge and dedupe rules. */
export function createStorage(
  adapter: StorageAdapter,
  options: CreateStorageOptions = {},
): Storage {
  if (
    !adapter.capabilities.atomicCommit ||
    !Number.isSafeInteger(adapter.capabilities.maxCommitSize) ||
    adapter.capabilities.maxCommitSize < 2
  )
    throw new TypeError(
      "Storage requires atomic conditional commits with capacity for a row and its lease fence.",
    );
  const maxRetries = options.maxRetries ?? 8;
  const now = options.now ?? Date.now;
  const leaseDuration = options.leaseDurationMs ?? 30_000;
  const leaseWait = options.leaseWaitMs ?? 30_000;
  if (
    !Number.isFinite(leaseDuration) ||
    leaseDuration <= 0 ||
    !Number.isFinite(leaseWait) ||
    leaseWait < 0
  )
    throw new TypeError(
      "Storage lease durations must be finite and non-negative.",
    );
  const clearPageSize = options.clearPageSize ?? 200;
  if (
    !Number.isSafeInteger(maxRetries) ||
    maxRetries < 0 ||
    maxRetries > 100 ||
    !Number.isSafeInteger(clearPageSize) ||
    clearPageSize < 1 ||
    clearPageSize > 10_000
  )
    throw new TypeError("Storage retry and clear-page bounds are invalid.");
  const commitSize = adapter.capabilities.maxCommitSize - 1;
  // Scoped by the durable session lease, not by a process-local mutex.
  interface Lease {
    row: StoredRow;
    lost: boolean;
  }
  async function acquire(sessionId: string): Promise<Lease> {
    const id = encodeKey(STORAGE_SCHEMA.leases, { sessionId });
    const owner = crypto.randomUUID();
    const deadline = performance.now() + leaseWait;
    for (;;) {
      const existing = (await adapter.get("leases", [id])).get(id);
      if (!existing || !existing.owner || Number(existing.expiresAt) <= now()) {
        const row: StoredRow = {
          ...(existing ?? emptyRow(STORAGE_SCHEMA.leases, { sessionId })),
          owner,
          expiresAt: now() + leaseDuration,
          _rev: (existing?._rev ?? 0) + 1,
        };
        const result = await adapter.commit([
          {
            kind: "put",
            entity: "leases",
            row,
            expectedRev: existing?._rev ?? null,
          },
        ]);
        if (result.ok) return { row, lost: false };
      }
      if (performance.now() >= deadline) throw new StorageLeaseLostError();
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  async function fencedCommit(lease: Lease, writes: readonly RowWrite[]) {
    if (lease.lost || Number(lease.row.expiresAt) <= now())
      throw new StorageLeaseLostError();
    const next: StoredRow = {
      ...lease.row,
      expiresAt: now() + leaseDuration,
      _rev: lease.row._rev + 1,
    };
    const result = await adapter.commit([
      ...writes,
      { kind: "put", entity: "leases", row: next, expectedRev: lease.row._rev },
    ]);
    if (result.ok) lease.row = next;
    else if (result.conflicts.includes(lease.row._id)) {
      const current = (await adapter.get("leases", [lease.row._id])).get(
        lease.row._id,
      );
      if (
        current?._rev !== lease.row._rev ||
        current.owner !== lease.row.owner
      ) {
        lease.lost = true;
        throw new StorageLeaseLostError();
      }
    }
    return result;
  }
  async function release(lease: Lease) {
    // Do not delete the row: its revision prevents a stale writer from reusing a generation.
    await adapter.commit([
      {
        kind: "put",
        entity: "leases",
        row: {
          ...lease.row,
          owner: null,
          expiresAt: 0,
          _rev: lease.row._rev + 1,
        },
        expectedRev: lease.row._rev,
      },
    ]);
  }

  async function readMany(
    entity: EntityName,
    ids: readonly string[],
  ): Promise<ReadonlyMap<string, StoredRow>> {
    if (ids.length === 0) return new Map();
    const result = new Map<string, StoredRow>();
    for (let offset = 0; offset < ids.length; offset += 500) {
      const page = await adapter.get(entity, ids.slice(offset, offset + 500));
      for (const [id, row] of page) result.set(id, row);
    }
    return result;
  }

  /** Merges operations onto the stored rows and returns the needed writes. */
  async function plan(
    operations: readonly RowOperation[],
  ): Promise<RowWrite[]> {
    const byEntity = new Map<EntityName, Set<string>>();
    for (const operation of operations) {
      const entity = operationEntity(operation);
      const id = operationId(operation);
      let ids = byEntity.get(entity);
      if (!ids) byEntity.set(entity, (ids = new Set()));
      ids.add(id);
    }
    const stored = new Map<string, StoredRow | undefined>();
    const original = new Map<string, StoredRow | undefined>();
    for (const [entity, ids] of byEntity) {
      const rows = await readMany(entity, [...ids]);
      for (const id of ids) {
        stored.set(`${entity}\u0000${id}`, rows.get(id));
        original.set(`${entity}\u0000${id}`, rows.get(id));
      }
    }
    const deleted = new Set<string>();
    for (const operation of operations) {
      const entity = operationEntity(operation);
      const definition = entityDefinition(entity);
      const slot = `${entity}\u0000${operationId(operation)}`;
      const current = stored.get(slot);
      switch (operation.kind) {
        case "delete":
          stored.set(slot, undefined);
          deleted.add(slot);
          break;
        case "checkpoint": {
          if (
            operation.expectedCursor !== undefined &&
            (current?.cursor ?? null) !== operation.expectedCursor
          )
            throw new StorageCheckpointConflictError();
          const base =
            current ??
            emptyRow(definition, {
              sessionId: operation.sessionId,
              stream: operation.stream,
            });
          stored.set(slot, {
            ...base,
            cursor: operation.cursor,
            position: operation.position ?? null,
            updatedAt: operation.updatedAt ?? null,
          });
          deleted.delete(slot);
          break;
        }
        case "patch":
        case "upsert": {
          if (!current && operation.kind === "patch") break;
          const base = current ?? emptyRow(definition, operation.key);
          const merged = mergeFields(definition, base, operation.fields);
          if (merged.changed || !current) stored.set(slot, merged.row);
          deleted.delete(slot);
          break;
        }
      }
    }
    const writes: RowWrite[] = [];
    for (const [slot, row] of stored) {
      const [entity, id] = slot.split("\u0000") as [EntityName, string];
      const before = original.get(slot);
      if (row === undefined) {
        if (before && deleted.has(slot))
          writes.push({ kind: "delete", entity, id, expectedRev: before._rev });
        continue;
      }
      if (before === row) continue;
      if (before && sameRow(entity, before, row)) continue;
      writes.push({
        kind: "put",
        entity,
        row: { ...row, _rev: (before?._rev ?? 0) + 1 },
        expectedRev: before ? before._rev : null,
      });
    }
    return writes;
  }

  /** Applies row operations, retrying when another writer got there first. */
  async function applyRows(
    operations: readonly RowOperation[],
    extra: readonly RowWrite[] = [],
    lease: Lease,
  ): Promise<number> {
    let total = 0;
    // Plan in groups so a huge history chunk is not held in memory twice.
    const groupSize = Math.max(commitSize, 500);
    for (let offset = 0; offset < operations.length || offset === 0;) {
      const group = operations.slice(offset, offset + groupSize);
      offset += groupSize;
      const last = offset >= operations.length;
      total += await commitWithRetry(group, last ? extra : [], lease);
      if (last) break;
    }
    return total;
  }

  async function commitWithRetry(
    group: readonly RowOperation[],
    extra: readonly RowWrite[],
    lease: Lease,
  ): Promise<number> {
    let conflicts: readonly string[] = [];
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const writes = [...(await plan(group)), ...extra];
      if (writes.length === 0) return 0;
      let failed: readonly string[] = [];
      for (let start = 0; start < writes.length; start += commitSize) {
        const result = await fencedCommit(
          lease,
          writes.slice(start, start + commitSize),
        );
        if (!result.ok) failed = [...failed, ...result.conflicts];
      }
      if (failed.length === 0) return writes.length;
      conflicts = failed;
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(200, 5 * 2 ** attempt)),
      );
    }
    throw new StorageConflictError(conflicts);
  }

  async function clearChat(
    operation: ClearChatOperation,
    lease: Lease,
  ): Promise<number> {
    let removed = 0;
    for (;;) {
      const messages = await adapter.query("messages", {
        index: "by_chat",
        equals: { sessionId: operation.sessionId, chatId: operation.chatId },
        range: { lte: operation.upTo },
        order: "asc",
        limit: clearPageSize,
      });
      if (messages.length === 0) return removed;
      const deletes: RowOperation[] = [];
      for (const message of messages) {
        const messageId = String(message.messageId);
        const key = { sessionId: operation.sessionId, messageId };
        deletes.push({ kind: "delete", entity: "media", key });
        for (const entity of ["reactions", "receipts", "poll_votes"] as const) {
          for (;;) {
            const children = await adapter.query(entity, {
              index: "by_message",
              equals: key,
              order: "asc",
              limit: 500,
            });
            if (children.length === 0) break;
            const childWrites: RowWrite[] = children.map((row) => ({
              kind: "delete",
              entity,
              id: row._id,
            }));
            for (
              let start = 0;
              start < childWrites.length;
              start += commitSize
            ) {
              const result = await fencedCommit(
                lease,
                childWrites.slice(start, start + commitSize),
              );
              if (!result.ok) throw new StorageConflictError(result.conflicts);
            }
            removed += children.length;
            if (children.length < 500) break;
          }
        }
        deletes.push({ kind: "delete", entity: "messages", key });
      }
      removed += await applyRows(deletes, [], lease);
    }
  }

  async function watermarks(
    operations: readonly RowOperation[],
  ): Promise<RowOperation[]> {
    const chatIds = new Map<string, RowKey>();
    for (const operation of operations) {
      if (
        (operation.kind === "upsert" || operation.kind === "patch") &&
        operation.guard
      ) {
        const key = {
          sessionId: operation.guard.sessionId,
          chatId: operation.guard.chatId,
        };
        chatIds.set(encodeKey(STORAGE_SCHEMA.chats, key), key);
      }
    }
    if (chatIds.size === 0) return [...operations];
    const chats = await readMany("chats", [...chatIds.keys()]);
    return operations.filter((operation) => {
      if (
        (operation.kind !== "upsert" && operation.kind !== "patch") ||
        !operation.guard
      )
        return true;
      const chat = chats.get(
        encodeKey(STORAGE_SCHEMA.chats, {
          sessionId: operation.guard.sessionId,
          chatId: operation.guard.chatId,
        }),
      );
      if (!chat) return true;
      const mark = Math.max(
        typeof chat.clearedAt === "number" ? chat.clearedAt : -Infinity,
        typeof chat.deletedAt === "number" ? chat.deletedAt : -Infinity,
      );
      return operation.guard.timestamp > mark;
    });
  }

  const storage: Storage = {
    adapter,
    async apply(batch) {
      if (!batch.sessionId)
        throw new TypeError("A storage session is required.");
      for (const operation of batch.operations) {
        const session =
          operation.kind === "clearChat" || operation.kind === "checkpoint"
            ? operation.sessionId
            : operation.key.sessionId;
        if (
          session !== batch.sessionId ||
          ((operation.kind === "upsert" || operation.kind === "patch") &&
            operation.guard &&
            operation.guard.sessionId !== batch.sessionId)
        )
          throw new TypeError(
            "A storage batch cannot write a foreign session.",
          );
        if (
          operation.kind !== "clearChat" &&
          operation.kind !== "checkpoint" &&
          operation.entity === "leases"
        )
          throw new TypeError("Storage lease rows are owned by the engine.");
      }
      const lease = await acquire(batch.sessionId);
      try {
        const eventsDefinition = STORAGE_SCHEMA.events;
        let marker: RowWrite[] = [];
        if (batch.eventId !== undefined) {
          const key = { sessionId: batch.sessionId, eventId: batch.eventId };
          const id = encodeKey(eventsDefinition, key);
          const existing = await adapter.get("events", [id]);
          if (existing.has(id)) return { applied: false, writes: 0 };
          marker = [
            {
              kind: "put",
              entity: "events",
              row: {
                ...emptyRow(eventsDefinition, key),
                type: batch.eventType ?? null,
                _rev: 1,
              },
              expectedRev: null,
            },
          ];
        }
        const plain: RowOperation[] = [];
        const guarded: RowOperation[] = [];
        const clears: ClearChatOperation[] = [];
        for (const operation of batch.operations) {
          if (operation.kind === "clearChat") clears.push(operation);
          else if (
            (operation.kind === "upsert" || operation.kind === "patch") &&
            operation.guard
          )
            guarded.push(operation);
          else plain.push(operation);
        }
        let writes = 0;
        writes += await applyRows(plain, [], lease);
        for (const clear of clears) writes += await clearChat(clear, lease);
        const kept = await watermarks(guarded);
        try {
          writes += await applyRows(kept, marker, lease);
        } catch (error) {
          // A concurrent apply of the same event wrote the marker first.
          if (
            marker.length > 0 &&
            error instanceof StorageConflictError &&
            error.ids.length === 1 &&
            error.ids[0] === (marker[0] as { row: StoredRow }).row._id
          )
            return { applied: false, writes };
          throw error;
        }
        return { applied: true, writes };
      } finally {
        await release(lease);
      }
    },
    async get(entity, key) {
      const definition = entityDefinition(entity);
      const id = encodeKey(definition, key);
      const row = (await adapter.get(entity, [id])).get(id);
      return row ? publicRow(definition, row) : null;
    },
    async query(entity, query) {
      const definition = entityDefinition(entity);
      const index = definition.indexes.find(({ name }) => name === query.index);
      if (!index)
        throw new TypeError(`${entity} has no index named ${query.index}`);
      const rows = await adapter.query(entity, query);
      const last = rows.at(-1);
      return {
        rows: rows.map((row) => publicRow(definition, row)),
        next:
          last && rows.length >= query.limit
            ? { sort: Number(last[index.sort] ?? 0), id: last._id }
            : undefined,
      };
    },
    async getCheckpoint(sessionId, stream) {
      const row = await storage.get("checkpoints", { sessionId, stream });
      if (!row || typeof row.cursor !== "string") return null;
      return {
        cursor: row.cursor,
        position: row.position ?? null,
        updatedAt: typeof row.updatedAt === "number" ? row.updatedAt : null,
      };
    },
    async hasEvent(sessionId, eventId) {
      return (await storage.get("events", { sessionId, eventId })) !== null;
    },
  };
  return storage;
}

function operationEntity(operation: RowOperation): EntityName {
  return operation.kind === "checkpoint" ? "checkpoints" : operation.entity;
}

function operationId(operation: RowOperation): string {
  if (operation.kind === "checkpoint")
    return encodeKey(STORAGE_SCHEMA.checkpoints, {
      sessionId: operation.sessionId,
      stream: operation.stream,
    });
  return encodeKey(entityDefinition(operation.entity), operation.key);
}

function sameRow(entity: EntityName, a: StoredRow, b: StoredRow): boolean {
  const definition = entityDefinition(entity);
  for (const field of Object.keys(definition.fields))
    if ((a[field] ?? null) !== (b[field] ?? null)) {
      if (
        typeof a[field] === "object" &&
        typeof b[field] === "object" &&
        canonicalJson(a[field]) === canonicalJson(b[field])
      )
        continue;
      return false;
    }
  const left = a._v;
  const right = b._v;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) if (left[key] !== right[key]) return false;
  return true;
}

export type { CheckpointOperation };
