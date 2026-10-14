# Customer-owned storage

`@polymorfa/storage` consumes verified Polymorfa events and decoded linked-device history into a database that your application owns. The package is a development reference; this branch does not publish it or establish deployed feature availability.

```ts
import { Client } from "@polymorfa/sdk";
import { createStorage, syncToStorage } from "@polymorfa/storage";
import { postgresAdapter } from "@polymorfa/storage/postgres";
import { Pool } from "pg";

const adapter = postgresAdapter(
  new Pool({ connectionString: process.env.CUSTOMER_DATABASE_URL }),
);
await adapter.setup();
const storage = createStorage(adapter);
const client = new Client({
  credential: {
    type: "projectToken",
    value: process.env.POLYMORFA_PROJECT_TOKEN!,
  },
  projectId: "your-project",
});
const sync = syncToStorage(client.events, storage);
await sync.done;
```

Run one consumer per project/checkpoint. Credentials and database connections stay in your application. The package does not log payloads, connection strings, credentials or media keys. Restrict access to stored message content, identifiers, media metadata and checkpoints using your database's authorization controls. Never use a browser-supplied tenant name as authority.

For webhook delivery, pass the result of `constructWebhookEvent` to `storageWebhookHandler(storage)` and respond successfully only after the returned promise resolves. The storage handler does not verify signatures itself. `applyEvent` accepts the same verified event without running a stream.

## Consistency and recovery

Every adapter implements atomic conditional commits. The shared engine obtains a durable session lease and includes its revision fence in each commit. An expired writer cannot overwrite a later writer or mark an unfinished event as complete. Lease rows remain after release so a generation is never reused. All writers must use the same namespace, adapter tables, merge contract and synchronized clocks; do not bypass the engine or delete lease rows while writers are active. Stop writers before a database reset or destructive maintenance.

A large event/history chunk spans multiple atomic commits. Rows from its completed commits can be visible before the whole event finishes. Its deduplication marker is stored last; replay after failure converges through field-version merges. This is not a transaction over the entire event. Field versions resolve arrival-order differences; receipts preserve progression, revocation clears content, and chat-clearing watermarks reject older copies. The exported conformance suite and portable fixtures define these merge rules.

`syncToStorage` resumes a saved cursor, requests manual acknowledgement, applies each event, conditionally saves the cursor, then ACKs the delivered sequence. An ACK failure leaves the saved cursor durable; replay skips the completed event. A concurrent checkpoint change raises `StorageCheckpointConflictError`. A stale fence raises `StorageLeaseLostError`; restart from the saved checkpoint. A missing event body or retention gap stops synchronization without advancing past that item. Reconcile customer-owned history before restarting after a gap. `requirePayload: false` explicitly enables metadata-only cursor consumption; it does not reconstruct missing content. Storage consumption does not turn on HMS or change server retention.

Provide `decodeHistory` to download/decrypt/decode linked history with the owning SDK's media/history helpers. The callback returns a `HistorySyncChunk` or null. A decoded chunk and its progress use the same shared reducer and completion marker. Keep downloaded plaintext within your own trust boundary.

## Adapters

Import only the adapter you use. Install its client dependency separately.

| Export        | Client / prerequisites                                                                                                                     |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `./memory`    | Volatile reference adapter, no persistence                                                                                                 |
| `./postgres`  | `pg` Pool or `postgres` SQL client; PostgreSQL transactions; customer connections can target Supabase/Neon                                 |
| `./mysql`     | `mysql2/promise` Pool; MySQL 8 InnoDB transactions; customer connections can target PlanetScale                                            |
| `./sqlite`    | Node 22.13+ `node:sqlite` DatabaseSync or compatible synchronous SQLite driver                                                             |
| `./libsql`    | `@libsql/client` Client with atomic batch support                                                                                          |
| `./d1`        | Cloudflare D1 binding with transactional batch support                                                                                     |
| `./mongodb`   | `mongodb` MongoClient + Db; replica set/sharded cluster supporting transactions; standalone mode fails                                     |
| `./dynamodb`  | AWS DynamoDBClient + table with string `pk` and `sk`; transactional writes; optional table creation                                        |
| `./firestore` | Admin `@google-cloud/firestore` Firestore; transaction support; backend authorization remains application-owned                            |
| `./convex`    | Convex client + application-registered query/mutation references and `polymorfaStorage` table; trusted server tenant resolver required     |
| `./cosmos`    | Azure Cosmos DB Container; partition key exactly `/namespace`; one namespace per atomic batch                                              |
| `./indexeddb` | Browser IndexedDB or an injected IDBFactory; one owner namespace per database; blocked upgrades fail and require closing other connections |

Non-SQL adapters require a namespace. SQL deployments isolate owners with dedicated databases/schemas/table prefixes and roles. Namespace validation is identifier validation, not authorization. Convex handlers derive the namespace through your authenticated server identity; the browser never supplies it. Firestore administrative clients bypass browser security rules, so grant them only within your trusted backend. Cosmos conditional deletes retain hidden tombstones to keep ETag fencing intact.

Document/IndexedDB adapters bound a scope read before applying the shared index ordering/range/cursor rules; they are not optimized provider-specific secondary indexes. The default read bound is 100,000 rows. Large namespaces require application-specific indexed extensions that pass the same conformance contract. Provider request/document/transaction byte limits can reject large rows even below a write-count limit; failures propagate and the checkpoint is not advanced. No adapter silently falls back to a non-atomic write.

## Schema and ORM exports

Schema version 2 includes durable lease fences. `STORAGE_SCHEMA`, `encodeKey`, `migrationSql` and the adapter subpaths expose the shared entity contract. SQL `setup()` creates missing reference tables; it is not a migration owner for an existing application schema. Review migrations before installation and keep all SDK ports on the same schema revision.

`./drizzle` exports PostgreSQL/MySQL/SQLite schema factories. `./prisma` exports `prismaSchema({ provider, tablePrefix })`; generated schema assets live under `prisma/`. These are application query models. Use the adapter's reviewed migration SQL as the DDL authority for collations, indexes and database permissions. Prisma connection URLs belong in the application's Prisma configuration. ORM writes that bypass field versions and lease fences are unsafe.

`./supabase` exports `supabasePreset`: reference PostgreSQL schema plus FORCE RLS and live session memberships. Install once as a reviewed customer-owned migration. Create its reader and backend writer roles separately. The default reader is `authenticated`; the writer is `polymorfa_storage_writer`. Readers can select only sessions with their own `auth.uid()` membership; they cannot write data or memberships. The named backend writer has explicit storage/membership authority. Never grant that role to browser users or a public API key. Membership and policy administration remain customer-owned.

## Verification and portability

`./conformance` exports `defineStorageConformance(testApi, adapterName, createAdapter)`. Run every test against a real driver and the runtime you will deploy, including transactions, stale deletes, atomic rollback, paused-writer fencing, checkpoint conflicts, ordering, replay and a 2,000-message history chunk. `conformance-fixtures.json` carries fixed events and expected public rows for handwritten language ports; adapter concurrency tests remain required in addition to those fixtures.

Local unit/emulator success does not prove cloud IAM/RLS rules, deployed credentials, vendor-hosted connections, a browser's IndexedDB behavior, event retention availability or registry installation. Consult the change's acceptance report for exact tested versions and blocked boundaries.

## D1 from native applications

Host `@polymorfa/storage/d1-bridge` in your own Worker to reach the atomic D1 binding from a native application. The bridge fixes customer authority and table prefix in trusted configuration and signs a fresh nonce handshake and each response. Native clients must validate that contract before accepting atomic storage support. The D1 administrative REST API is not used as an atomic adapter. See [the bridge contract](./D1-BRIDGE.md) for setup, authentication, conditional deletion and failure semantics.
