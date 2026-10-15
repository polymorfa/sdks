# Polymorfa storage core

Portable schema-2 contracts, canonical merge rules, validation, memory adapter
and fenced storage engine. The native SDK re-exports this crate through
`polymorfa_sdk::storage`; browser storage uses the same types and implementation.
Source contract: `3bacf46f9c4213426314001586f5bae43aaa77de`.

Native futures and adapters retain `Send`/`Sync` bounds and Tokio timers. WASM
uses browser-local futures, browser clocks/timers and cryptographic UUIDs.
Neither runtime accepts Polymorfa API credentials or enables hosted retention.
Application event acknowledgement remains explicit.

This crate is unpublished. Publish and verify its exact version before packages
that depend on it. Successful local package tests do not establish registry or
customer environment availability.
