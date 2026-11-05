# Customer-owned D1 bridge

`worker.ts` hosts the shared `@polymorfa/storage/d1-bridge` implementation for native applications. Bind your D1 database as `DB`, set a fixed `STORAGE_AUTHORITY` and `STORAGE_TABLE_PREFIX`, and provision a separate `STORAGE_APPLICATION_SECRET` of 32–256 visible ASCII characters. Keep this secret on your application server and Worker; it is distinct from Polymorfa credentials. Use HTTPS and do not expose it to browsers.

Create schema-2 tables with the matching prefix during controlled setup. The example keeps remote schema creation disabled. If an operator enables `allowSetup` for initial creation, disable it after setup. This example deploys no resources and publishes no package.

All clients verify the expected authority, prefix, schema and signed nonce handshake before accepting the bridge's atomic commit capability. Atomicity comes from the Worker's D1 binding transaction, not the D1 administrative REST API. Merge rules, leases, deduplication and checkpoint planning stay in each native SDK. See [the bridge protocol](../../../packages/storage/D1-BRIDGE.md).
