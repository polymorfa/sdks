# Polymorfa storage core

Portable schema-2 contracts, canonical merge rules, validation, memory adapter,
event/history reducers and fenced storage engine. The native SDK re-exports this crate through
`polymorfa_sdk::storage`; browser storage uses the same types and implementation.
Source contract: `3bacf46f9c4213426314001586f5bae43aaa77de`.

Native futures and adapters retain `Send`/`Sync` bounds and Tokio timers. WASM
uses browser-local futures, browser clocks/timers and cryptographic UUIDs.
Neither runtime accepts Polymorfa API credentials or enables hosted retention.
Application event acknowledgement remains explicit.

`reducer::events::reduce_event` maps all 24 `STORED_EVENT_TYPES` to pure operation
batches. `reducer::history` exposes typed decoded chunks, messages, media,
receipts, reactions, groups, progress and PN/LID identity indexes. Integer inputs
accept native signed/unsigned numbers, floats or decimal strings; bytes accept
base64 or byte vectors. Unknown decoded fields are ignored. The caller supplies
complete decoded input; these reducers do not decode raw protobuf or opaque
media descriptors. Event media stores only the declared descriptor/download
fields. Explicit decoded history media can store its supplied keys and hashes.

`sync::apply_event` optionally calls the application's `HistoryChunkDecoder` for
linked history, combines its operations with event progress, then records the
event marker. Replays skip the decoder. `StorageWebhookHandler::handle` accepts
an already verified event: verify its signature and principal first and send a
successful HTTP response only after the helper succeeds.

`sync::sync_to_storage` accepts an application-owned `StorageEventSource` and
uses the saved cursor with manual ACK. It stores content and the event marker,
conditionally advances the checkpoint, then explicitly acknowledges the stream
item. Absent bodies fail closed unless `require_payload = false` is explicit;
retention gaps, stale checkpoints and decoder/provider errors stop progress.
The applied callback runs after ACK. ACK or callback failure can leave a saved
cursor; reconcile/replay using event markers. `StorageSyncStop::stop` prevents
the next admission and lets an admitted event finish. Dropping the future can
interrupt an await and leave the provider outcome uncertain; a future drop
does not guarantee rollback. Construction never starts persistence.

The committed fixtures contain exact producer operation batches at the source
revision above. Native SQLite and actual Chromium IndexedDB run the same tests
for all 24 events, final rows, decoded 2,000-message chunks and ordered sync.
Checks cover replay, checkpoint/ACK/callback/decoder/source failures, competing
checkpoints, missing bodies, gaps, admitted stop and dropped pending writes.
Run `cargo test` here; run the manifest in `tests/native-driver` for native SQL,
and the IndexedDB browser fixture for actual WASM/browser acceptance. The latter
two fixtures are repository checks; they are not registry packages.

This crate is unpublished. Publish and verify its exact version before packages
that depend on it. Successful local package tests do not establish registry or
customer environment availability.
