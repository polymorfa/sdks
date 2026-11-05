import {
  BulkOperationType,
  type Container,
  type OperationInput,
} from "@azure/cosmos";
import { entityDefinition } from "../schema.js";
import type { StorageAdapter, StoredRow } from "../types.js";
import { filterRows } from "./shared.js";
import { namespace, validateCommit, validateQuery } from "./validation.js";
interface DocumentRow {
  [key: string]: unknown;
  id: string;
  namespace: string;
  entity: string;
  row: StoredRow | null;
  deleted: boolean;
  _etag?: string;
}
export interface CosmosAdapterOptions {
  readonly namespace: string;
  readonly maxQueryRows?: number;
}
/** Container partition key must be /namespace. Every commit stays in that one
 * customer-owned partition. Conditional deletes replace the payload with a
 * tombstone because the Cosmos batch Delete shape has no ifMatch token. */
export function cosmosAdapter(
  container: Container,
  options: CosmosAdapterOptions,
): StorageAdapter {
  const owner = namespace(options.namespace);
  const id = (entity: string, key: string) => `${entity}:${key}`;
  const read = async (
    entity: string,
    key: string,
  ): Promise<DocumentRow | undefined> => {
    try {
      const response = await container
        .item(id(entity, key), owner)
        .read<DocumentRow>();
      return response.resource;
    } catch (error) {
      if (Number((error as { code?: unknown }).code) === 404) return undefined;
      throw error;
    }
  };
  return {
    name: "cosmos",
    capabilities: { atomicCommit: true, maxCommitSize: 100 },
    async setup() {
      const response = await container.read();
      const paths = response.resource?.partitionKey?.paths;
      if (paths?.length !== 1 || paths[0] !== "/namespace")
        throw new TypeError(
          "Cosmos storage requires the /namespace partition key.",
        );
    },
    async get(entity, ids) {
      const rows = new Map<string, StoredRow>();
      for (const key of ids) {
        const doc = await read(entity, key);
        if (doc?.row && !doc.deleted) rows.set(key, doc.row);
      }
      return rows;
    },
    async commit(writes) {
      validateCommit(writes, 100);
      const operations: OperationInput[] = [];
      for (const write of writes) {
        const key = write.kind === "put" ? write.row._id : write.id;
        const current = await read(write.entity, key);
        const row = current?.deleted ? undefined : current?.row;
        if (
          write.kind === "put"
            ? write.expectedRev === null
              ? row != null
              : row?._rev !== write.expectedRev
            : write.expectedRev !== undefined && row?._rev !== write.expectedRev
        )
          return { ok: false, conflicts: [key] };
        if (!current && write.kind === "delete") continue;
        const body: DocumentRow = {
          id: id(write.entity, key),
          namespace: owner,
          entity: write.entity,
          row: write.kind === "put" ? write.row : null,
          deleted: write.kind === "delete",
        };
        if (current) {
          if (!current._etag)
            throw new Error(
              "Cosmos storage did not return an ETag for a conditional write.",
            );
          operations.push({
            operationType: BulkOperationType.Replace,
            id: body.id,
            resourceBody: JSON.parse(JSON.stringify(body)) as Extract<
              OperationInput,
              { operationType: typeof BulkOperationType.Create }
            >["resourceBody"],
            ifMatch: current._etag,
          });
        } else
          operations.push({
            operationType: BulkOperationType.Create,
            resourceBody: JSON.parse(JSON.stringify(body)) as Extract<
              OperationInput,
              { operationType: typeof BulkOperationType.Create }
            >["resourceBody"],
          });
      }
      if (!operations.length) return { ok: true };
      const response = await container.items.batch(operations, owner);
      if (
        response.result?.length === operations.length &&
        response.result.every(
          (result) => result.statusCode >= 200 && result.statusCode < 300,
        )
      )
        return { ok: true };
      if (
        response.result?.length === operations.length &&
        response.result.every(
          (result) =>
            (result.statusCode >= 200 && result.statusCode < 300) ||
            [404, 409, 412, 424, 449].includes(result.statusCode),
        ) &&
        response.result.some((result) =>
          [404, 409, 412, 449].includes(result.statusCode),
        )
      )
        return {
          ok: false,
          conflicts: writes.map((write) =>
            write.kind === "put" ? write.row._id : write.id,
          ),
        };
      throw new Error("Cosmos storage rejected an atomic batch.");
    },
    async query(entity, query) {
      validateQuery(entity, query);
      const iterator = container.items.query<DocumentRow>(
        {
          query:
            "SELECT * FROM c WHERE c.namespace = @namespace AND c.entity = @entity AND c.deleted = false",
          parameters: [
            { name: "@namespace", value: owner },
            { name: "@entity", value: entity },
          ],
        },
        { partitionKey: owner },
      );
      const rows: StoredRow[] = [];
      while (iterator.hasMoreResults()) {
        const response = await iterator.fetchNext();
        for (const document of response.resources)
          if (document.row) rows.push(document.row);
        if (rows.length > (options.maxQueryRows ?? 100_000))
          throw new RangeError(
            "The storage index query exceeds the configured read bound.",
          );
      }
      return filterRows(entityDefinition(entity), rows, query);
    },
  };
}
