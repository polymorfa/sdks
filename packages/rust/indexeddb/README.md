# Polymorfa IndexedDB storage

Browser-local WASM adapter for customer-owned IndexedDB. It shares the exact
schema, validation, merge engine and lease fences in `polymorfa-storage-core`.
The server SDK remains server-only. No API client, browser API credential,
Signal acknowledgement or remote grant is included.

This crate is unpublished. Publish and verify the exact storage-core dependency
first. Local package/browser acceptance does not establish crates.io availability.

Compile for `wasm32-unknown-unknown` and bundle the JavaScript snippets emitted
by the matching `wasm-bindgen` CLI. Create `IndexedDbStorageAdapter` with
`IndexedDbOptions::new("customer_archive")`, call `setup().await`, then pass the
adapter in an `Arc` to `core::Storage::new`. Apply explicit operation batches,
persist the checkpoint, then acknowledge the application event separately.

Namespaces start with a letter and contain 1 to 64 letters, digits, underscores
or hyphens. The default database name is `polymorfa_<namespace>`; set
`database_name` to select another name. A saved owner receipt prevents binding
the same database to a different namespace. Browser origin and application code
control access; namespacing does not grant tenant authority.

The adapter installs all 17 schema-2 object stores at database version 2. Each
commit uses one native readwrite transaction over every affected store, with at
most 1,000 writes including the engine's session fence. Revision checks and writes
share that transaction. A stale revision or request error aborts earlier writes.
Queries require complete named index scope and filter a bounded scan;
`max_query_rows` defaults to 100,000 and accepts 1 to 1,000,000. Exceeding the bound
returns an error rather than partial results. JSON fields and revision metadata
are preserved. The exact source contract is
`3bacf46f9c4213426314001586f5bae43aaa77de`.

`close()` releases the connection; later operations reopen it. Dropping a polled
operation future signals cancellation and aborts an active transaction. An
operation committed before cancellation remains committed. Reconcile uncertain
outcomes through saved revisions, event markers and checkpoints. Schema
initialization may finish after cancellation without storing customer rows.
Browser denial and blocked upgrades fail with sanitized errors.

Actual Chromium acceptance covers all 17 entities, JSON, 2,000-message pagination,
atomic CAS and provider-error rollback, independent-client CAS, lease replacement,
replay, checkpoints, chat clear, bounded scans, namespace refusal, dropped futures,
opaque-origin storage denial and reopening in a fresh page. The `tests/browser`
fixture invokes the real Rust core and adapter through WASM and native IndexedDB.
Build its Cargo manifest for `wasm32-unknown-unknown`, generate web bindings using
`wasm-bindgen`, then run `tests/browser/run.mjs` with Playwright installed and the
generated directory as its argument. `CHROMIUM_EXECUTABLE` optionally selects a
task-owned Chromium installation.

Normal Cargo package verification can use a temporary command-line patch pointing
to the unpacked exact core `.crate` artifact. That proves local package composition
without bypassing verification. The core still needs to be published and verified
before dependent packages can be installed from a registry.
