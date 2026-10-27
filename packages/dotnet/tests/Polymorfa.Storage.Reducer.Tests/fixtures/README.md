The storage schema and reducer contract is pinned to TypeScript producer `3bacf46f9c4213426314001586f5bae43aaa77de`.

`storage-3bac.json` is the producer's unchanged `packages/storage/conformance-fixtures.json`. It supplies independent final public-row outcomes and replay inputs.

`reducer-batches-3bac.json` records exact batches emitted by the rebuilt producer's `reduceEvent` and `reduceHistoryChunk`. The original 30 events are supplemented with inputs for all six missing stored event names, message label association, star, descriptor-only media, sent messages, inline history and an unknown event. Fifteen decoded-history cases cover the original fixture, media references, protocol edits/revokes, reactions, polls, wrappers, location, contacts, replies, unknown content, identity mapping, groups, past participants, byte vectors, wide integers, numeric-string radices, JavaScript exponent formatting, unknown enums and ambiguous native IDs. The fixture contains synthetic identifiers and no live credentials or keys.

The test compares operation JSON before applying it, then independently checks fixed final rows, typed 2,000-message history, replay and persistence/checkpoint/ACK failures. Native TCP tests exercise the SDK's real fragmented SSE decoder and HTTP acknowledgement route. These are local contract checks, not live WhatsApp acceptance.
