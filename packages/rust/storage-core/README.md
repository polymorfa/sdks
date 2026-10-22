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
archive history, combines its operations with event progress, then records the
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

For Rust 1.85 artifact consumers, configure MSRV-aware dependency resolution in
the application's `.cargo/config.toml`:

```toml
[resolver]
incompatible-rust-versions = "fallback"
```

Dependency-local Cargo configuration does not configure the consuming app. The
independent artifact checks use this setting; retain the application's lockfile
for reproducible builds.

### Descriptor history storage

`HistoryChunkDecoder` remains archive-only, with its existing raw payload/event
arguments and nullable progress-only result. Projected media/inline descriptors
use the separate `HistoryDescriptorDecoder` trait. Its `decode` receives the
validated raw public `Value` and original `StorageEvent`, and returns
`StorageFuture<HistorySyncChunk>` without `Option`. For example, configure your
application's decoder with:

```rust,ignore
let options = ApplyEventOptions {
    decode_history_descriptor: Some(&decoder),
    ..Default::default()
};
```

The application owns authorized download, complete-schema decoding and storage
projection. The public history reader preserves verified protobuf and its
documented subset; that subset alone is not a generic full-schema decoder.
Storage-core never downloads media and never imports its consuming SDK.
Missing or failed decoding stops before progress, marker, checkpoint and ACK.
Typed callback results exclude null and invalid projection types; deserialization
failures must return `Err`. A legitimate empty `HistorySyncChunk` is allowed.
Descriptor diagnostics and decoder errors omit keys, hashes and inline bytes.

Default `history_descriptor_mode: HistoryDescriptorMode::Decode` requires the
new callback. Explicit `HistoryDescriptorMode::MetadataOnly` validates and
consumes progress and the event marker, skipping all decoders even when configured.
Stream sync then saves its checkpoint and manually ACKs. Ordinary replay cannot
import this event later because it is deduplicated. No automatic backfill or marker
deletion is provided. Valid duplicates skip decoders before checking availability.
Descriptor notification IDs never map individual messages. Existing native `wa:`
fallback keys retain their limits when joining later opaque IDs. Content/marker
commit precedes checkpoint CAS and ACK; remote ACK failure leaves committed data
intact. Archive and Cloud behavior remain unchanged. Add `..Default::default()` to
exhaustive option literals when adopting the new fields. These are local package
capabilities, without registry or deployed availability claims.

History proto-number strings match the TypeScript producer's finite
`Number(string)` results, including signed zero, exact ECMAScript whitespace and
unsigned radix values beyond uint64. Radix parsing uses bounded significant bits
and one nearest-even rounding, with no added dependency. Strict generic row and
revision checks retain their existing rules. Local native/crate checks and WASM
compilation do not establish registry or browser runtime acceptance.
