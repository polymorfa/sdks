# Storage reference acceptance, 2026-10-14

This is implementation and local acceptance evidence for an unpublished development package. It does not establish a production deployment or registry availability.

The preserved storage producer starts at `dd98f52` / `ed63081`. Event and webhook types were compared with SDK main `daac84b1bd24c9460a2bcad555629a5466d85e2c`; that main delta changes campaign follow-ups, not the storage event contract. The parent owns integration with the media/history producer `f193276` and the primary API contract pinned by the program handoff. Schema revision is 2. Portable fixtures record that explicit SDK source revision.

## Adapter evidence

Each passing row ran all 15 shared adapter cases: replay/order convergence, merge rules, paging, a 2,000-message history chunk, concurrent writers, field types, atomic rollback/stale delete, expired-writer fencing, conditional checkpoints and session scope.

| Adapter boundary                                                     | Result                                                                                                                                                                                |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Memory reference                                                     | Passed                                                                                                                                                                                |
| Node 24.15.0 `node:sqlite`                                           | Passed                                                                                                                                                                                |
| `@libsql/client` 0.18.0, in-memory database                          | Passed                                                                                                                                                                                |
| PostgreSQL 16, `pg` 8.23.1                                           | Passed against own Docker database                                                                                                                                                    |
| PostgreSQL 16, `postgres` 3.4.9                                      | Passed against own Docker database                                                                                                                                                    |
| MySQL 8.4.11, `mysql2` 3.24.5                                        | Passed against own Docker database                                                                                                                                                    |
| D1, stable Miniflare 4.20260730.0 and actual workerd                 | Passed, compatibility date 2026-07-30                                                                                                                                                 |
| MongoDB 7 replica set, client 7.7.0                                  | Passed against own Docker replica set                                                                                                                                                 |
| DynamoDB Local 3.3.1, AWS client 3.1149.0                            | Passed against own Docker service                                                                                                                                                     |
| Firestore, Admin client 9.3.1 and official Cloud CLI emulator        | Passed against own Docker emulator                                                                                                                                                    |
| Convex 1.46.0, official `convex-test` 0.0.61 backend                 | Passed; deployed query/mutation RPC and authenticated cloud deployment not exercised                                                                                                  |
| IndexedDB, `fake-indexeddb` 6.2.5                                    | Passed                                                                                                                                                                                |
| IndexedDB, actual T3 browser Chrome 152.0.7977.130 / Electron 44.4.2 | Passed in a separate background collaborative tab                                                                                                                                     |
| Cosmos DB, SDK 4.10.1                                                | Typechecked and negative receipt validation passed. Native acceptance blocked: two pulls of the official `vnext-latest` image failed with EOF. No transactional cloud/emulator claim. |

Supabase's preset ran against PostgreSQL roles with FORCE RLS. Live membership reads, foreign-session denial, content-write denial, membership-write denial and immediate revocation passed. The test supplies a synthetic `auth.uid()` fixture; hosted Supabase authentication is not exercised. Drizzle 0.45.4 read actual PostgreSQL, MySQL and libSQL tables created and written by the shared engine. Prisma 7.10.0 validates all three generated PostgreSQL/MySQL/SQLite schemas; generated Prisma Client queries were not exercised.

Node 24 native checks pass 199 cases with Cosmos's 15 cases explicitly excluded; an additional trusted Convex tenant/application-schema test passes. Node 20.15.0 local checks pass 92 cases with the Node 22+ built-in SQLite and external services explicitly skipped. The Node 24 and actual browser proofs retain the full SQLite/IndexedDB checks.

The package builds and typechecks. Storage ESLint and Prettier checks pass. A real archive installs into a fresh consumer without optional database drivers; core, memory, SQL, D1, IndexedDB, Supabase and Prisma exports execute. Optional provider clients are typechecked against actual installed packages and exercised as listed above. No package was published.

Six durable stream tests pass: manual ACK ordering, checkpoint resume, missing-body refusal, explicit metadata-only mode, retention-gap stop, ACK failure/replay and the real project-bound SDK source type. Portable fixtures assert fixed reduced event/history outputs and replay. Negative adapter tests cover namespace ownership, unsupported atomic guarantees, incomplete scope, duplicate writes and malformed remote receipts.

Production dependency audit has zero advisories. The development audit retains the preserved workspace's six advisory chains (`@vitest/mocker`, `brace-expansion`, `js-yaml`, `source-map-js`, `tinypool`, `vitest`). Miniflare's added `sharp` and `undici` chains are patched through scoped overrides. This slice does not widen into the existing workspace test-toolchain upgrade.

## Ownership and six-part impact

- API: unchanged handlers, credentials, scopes, webhooks and retention. This package consumes the pinned contract; authenticated deployed event/history acceptance remains owned by the program's API thread.
- SDKs: TypeScript storage package and workspace/export wiring updated. Handwritten native ports remain pending this producer pin and the exact accepted provider/language matrix; no native parity claim.
- CLI: unchanged. No command, flag or output invokes this new storage package.
- Docs: package README and this internal acceptance record updated. Parent owns the same-change public SDK documentation and changelog at actual release availability.
- Feature releases: unpublished development reference only; no flags, entitlements, enrollment, server retention switches, publication or rollout changed. Code and local acceptance do not grant customer access.
- Admin: unchanged. Customer-owned database state adds no control-plane state or staff database credential. Existing API-owned retention/enrollment controls remain authoritative; no staff view or action is introduced.

The customer owns content, database connections, roles, namespaces, migrations and cleanup. SQL owners use separate schemas/prefixes and roles; non-SQL adapters require namespaces; IndexedDB refuses rebinding a database to another owner; Convex requires a trusted server tenant resolver. Namespace syntax is not authentication. The package emits no payload, credential or media-key logs. Fixtures contain synthetic identities and local-only database credentials. Emulator success does not prove cloud IAM, hosted provider behavior, production credentials, server retention or Signal custody. This producer implements no Signal work.
