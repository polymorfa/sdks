import { describe, it, beforeAll, afterAll } from "vitest";
import { Pool } from "pg";
import postgres from "postgres";
import mysql from "mysql2/promise";
import { createClient } from "@libsql/client";
import { Miniflare } from "miniflare";
import { MongoClient } from "mongodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { Firestore } from "@google-cloud/firestore";
import { CosmosClient } from "@azure/cosmos";
import { indexedDB } from "fake-indexeddb";
import { defineSchema } from "convex/server";
import { convexTest } from "convex-test";
import { defineStorageConformance } from "../src/conformance.js";
import {
  postgresAdapter,
  postgresJsAdapter,
} from "../src/adapters/postgres.js";
import { mysqlAdapter } from "../src/adapters/mysql.js";
import { sqliteAdapter } from "../src/adapters/sqlite.js";
import { libsqlAdapter } from "../src/adapters/libsql.js";
import { d1Adapter } from "../src/adapters/d1.js";
import { mongodbAdapter } from "../src/adapters/mongodb.js";
import { dynamodbAdapter } from "../src/adapters/dynamodb.js";
import { firestoreAdapter } from "../src/adapters/firestore.js";
import { cosmosAdapter } from "../src/adapters/cosmos.js";
import { indexeddbAdapter } from "../src/adapters/indexeddb.js";
import {
  convexStorageTable,
  convexStorageHandlers,
} from "../src/adapters/convex.js";
import type { StorageAdapter } from "../src/types.js";

const api = { describe, it, beforeAll, afterAll };
const native = process.env.POLYMORFA_STORAGE_NATIVE === "1";
const external = { ...api, describe: native ? describe : describe.skip };
const options = { namespace: "zkfixture", closeClient: true };
const pgOptions = {
  host: "127.0.0.1",
  port: 55441,
  user: "postgres",
  password: "synthetic_fixture_only",
  database: "storage_fixture",
};
defineStorageConformance(
  {
    ...api,
    describe:
      Number(process.versions.node.split(".")[0]) >= 22
        ? describe
        : describe.skip,
  },
  "node:sqlite",
  async () => {
    const { DatabaseSync } = await import("node:sqlite");
    return sqliteAdapter(new DatabaseSync(":memory:"), { closeClient: true });
  },
);
defineStorageConformance(api, "libsql", () =>
  libsqlAdapter(createClient({ url: "file::memory:" }), { closeClient: true }),
);
defineStorageConformance(api, "indexeddb", () =>
  indexeddbAdapter({
    namespace: "zkfixture",
    indexedDB,
    databaseName: `zkfixture-${Date.now()}`,
  }),
);
defineStorageConformance(api, "d1-miniflare", async () => {
  const mf = new Miniflare({
    workers: [
      {
        name: "storage",
        modules: true,
        script:
          "export default { fetch() { return new Response('fixture'); } }",
        compatibilityDate: "2026-07-30",
        d1Databases: { DB: "zkfixture" },
      },
    ],
  });
  const adapter = d1Adapter(await mf.getD1Database("DB"));
  return { ...adapter, close: () => mf.dispose() };
});
defineStorageConformance(api, "convex-test", () => {
  const schema = defineSchema({ polymorfaStorage: convexStorageTable() });
  const t = convexTest(schema, {
    "./_generated/server.ts": () => import("convex/server"),
  });
  const handlers = convexStorageHandlers({
    resolveNamespace: () => "zkfixture",
  });
  const adapter: StorageAdapter = {
    name: "convex-test",
    capabilities: { atomicCommit: true, maxCommitSize: 500 },
    async get(entity, ids) {
      const rows = await t.run((ctx) =>
        handlers.get(ctx, { entity, ids: [...ids] }),
      );
      return new Map(rows.map((row) => [row._id, row]));
    },
    async commit(writes) {
      return t.run((ctx) => handlers.commit(ctx, { writes: [...writes] }));
    },
    async query(entity, query) {
      return t.run((ctx) => handlers.query(ctx, { entity, query }));
    },
  };
  return adapter;
});
defineStorageConformance(external, "postgres-pg", () =>
  postgresAdapter(new Pool(pgOptions), {
    tablePrefix: "zkg_",
    closeClient: true,
  }),
);
defineStorageConformance(external, "postgres-js", () =>
  postgresJsAdapter(postgres({ ...pgOptions, max: 8 }), {
    tablePrefix: "zkj_",
    closeClient: true,
  }),
);
defineStorageConformance(external, "mysql2", () =>
  mysqlAdapter(
    mysql.createPool({
      host: "127.0.0.1",
      port: 55442,
      user: "root",
      password: "synthetic_fixture_only",
      database: "storage_fixture",
      connectionLimit: 8,
    }),
    { tablePrefix: "zkm_", closeClient: true },
  ),
);
defineStorageConformance(external, "mongodb-replica", async () => {
  const client = new MongoClient(
    "mongodb://127.0.0.1:55443/?replicaSet=zkrs&directConnection=true",
  );
  await client.connect();
  return mongodbAdapter(client, client.db("zk_storage_fixture"), options);
});
defineStorageConformance(external, "dynamodb-local", () =>
  dynamodbAdapter(
    new DynamoDBClient({
      endpoint: "http://127.0.0.1:55444",
      region: "us-east-1",
      credentials: {
        accessKeyId: "syntheticfixture",
        secretAccessKey: "syntheticfixture",
      },
    }),
    { ...options, tableName: "zk_storage_fixture", createTable: true },
  ),
);
defineStorageConformance(external, "firestore-emulator", () => {
  process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:55445";
  return firestoreAdapter(
    new Firestore({ projectId: "zk-storage-fixture" }),
    options,
  );
});
defineStorageConformance(external, "cosmos-emulator", async () => {
  const client = new CosmosClient({
    endpoint: "http://127.0.0.1:55446",
    key: Buffer.from("synthetic_fixture_only").toString("base64"),
  });
  const { database } = await client.databases.createIfNotExists({
    id: "zk_storage_fixture",
  });
  const { container } = await database.containers.createIfNotExists({
    id: "storage",
    partitionKey: { paths: ["/namespace"] },
  });
  return cosmosAdapter(container, { namespace: "zkfixture" });
});
