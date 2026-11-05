import {
  BatchGetItemCommand,
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
  QueryCommand,
  TransactWriteItemsCommand,
  TransactionCanceledException,
  ResourceNotFoundException,
  type QueryCommandOutput,
  type AttributeValue,
} from "@aws-sdk/client-dynamodb";
import { marshall, unmarshall } from "@aws-sdk/util-dynamodb";
import { entityDefinition } from "../schema.js";
import type { StorageAdapter, StoredRow } from "../types.js";
import { filterRows } from "./shared.js";
import { namespace, validateCommit, validateQuery } from "./validation.js";

export interface DynamoAdapterOptions {
  readonly namespace: string;
  readonly tableName: string;
  readonly createTable?: boolean;
  readonly closeClient?: boolean;
  readonly maxQueryRows?: number;
}
export function dynamodbAdapter(
  client: DynamoDBClient,
  options: DynamoAdapterOptions,
): StorageAdapter {
  const owner = namespace(options.namespace);
  const pk = (entity: string) => `${owner}:${entity}`;
  const key = (entity: string, id: string) =>
    marshall({ pk: pk(entity), sk: id });
  return {
    name: "dynamodb",
    capabilities: { atomicCommit: true, maxCommitSize: 100 },
    async setup() {
      try {
        await client.send(
          new DescribeTableCommand({ TableName: options.tableName }),
        );
      } catch (error) {
        if (
          !(error instanceof ResourceNotFoundException) ||
          !options.createTable
        )
          throw error;
        await client.send(
          new CreateTableCommand({
            TableName: options.tableName,
            KeySchema: [
              { AttributeName: "pk", KeyType: "HASH" },
              { AttributeName: "sk", KeyType: "RANGE" },
            ],
            AttributeDefinitions: [
              { AttributeName: "pk", AttributeType: "S" },
              { AttributeName: "sk", AttributeType: "S" },
            ],
            BillingMode: "PAY_PER_REQUEST",
          }),
        );
      }
    },
    async get(entity, ids) {
      const result = new Map<string, StoredRow>();
      for (let start = 0; start < ids.length; start += 100) {
        let pending = {
          [options.tableName]: {
            Keys: ids.slice(start, start + 100).map((id) => key(entity, id)),
            ConsistentRead: true,
          },
        };
        for (let attempt = 0; Object.keys(pending).length; attempt++) {
          if (attempt >= 8)
            throw new Error("DynamoDB left storage reads unprocessed.");
          const response = await client.send(
            new BatchGetItemCommand({ RequestItems: pending }),
          );
          for (const raw of response.Responses?.[options.tableName] ?? []) {
            const row = unmarshall(raw).row as StoredRow;
            result.set(row._id, row);
          }
          pending = (response.UnprocessedKeys as typeof pending) ?? {};
          if (Object.keys(pending).length)
            await new Promise((resolve) =>
              setTimeout(resolve, Math.min(500, 10 * 2 ** attempt)),
            );
        }
      }
      return result;
    },
    async commit(writes) {
      validateCommit(writes, 100);
      if (!writes.length) return { ok: true };
      try {
        await client.send(
          new TransactWriteItemsCommand({
            TransactItems: writes.map((write) => {
              const id = write.kind === "put" ? write.row._id : write.id;
              const condition =
                write.kind === "put" && write.expectedRev === null
                  ? { ConditionExpression: "attribute_not_exists(pk)" }
                  : write.expectedRev !== undefined
                    ? {
                        ConditionExpression: "#row.#rev = :rev",
                        ExpressionAttributeNames: {
                          "#row": "row",
                          "#rev": "_rev",
                        },
                        ExpressionAttributeValues: marshall({
                          ":rev": write.expectedRev,
                        }),
                      }
                    : {};
              return write.kind === "put"
                ? {
                    Put: {
                      TableName: options.tableName,
                      Item: marshall({
                        pk: pk(write.entity),
                        sk: id,
                        row: write.row,
                      }),
                      ...condition,
                    },
                  }
                : {
                    Delete: {
                      TableName: options.tableName,
                      Key: key(write.entity, id),
                      ...condition,
                    },
                  };
            }),
          }),
        );
        return { ok: true };
      } catch (error) {
        if (
          error instanceof TransactionCanceledException &&
          error.CancellationReasons?.some(
            (reason) =>
              reason.Code === "ConditionalCheckFailed" ||
              reason.Code === "TransactionConflict",
          )
        )
          return {
            ok: false,
            conflicts: writes.map((write) =>
              write.kind === "put" ? write.row._id : write.id,
            ),
          };
        throw error;
      }
    },
    async query(entity, query) {
      validateQuery(entity, query);
      const rows: StoredRow[] = [];
      let cursor: Record<string, AttributeValue> | undefined;
      do {
        const response: QueryCommandOutput = await client.send(
          new QueryCommand({
            TableName: options.tableName,
            KeyConditionExpression: "pk = :pk",
            ExpressionAttributeValues: marshall({ ":pk": pk(entity) }),
            ConsistentRead: true,
            ...(cursor ? { ExclusiveStartKey: cursor } : {}),
          }),
        );
        for (const raw of response.Items ?? [])
          rows.push(unmarshall(raw).row as StoredRow);
        if (rows.length > (options.maxQueryRows ?? 100_000))
          throw new RangeError(
            "The storage index query exceeds the configured read bound.",
          );
        cursor = response.LastEvaluatedKey;
      } while (cursor);
      return filterRows(entityDefinition(entity), rows, query);
    },
    async close() {
      if (options.closeClient) client.destroy();
    },
  };
}
