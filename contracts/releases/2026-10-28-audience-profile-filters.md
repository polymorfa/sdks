# Audience profile list filters: source record

API source: 561c9ebcefdf05784870e8ad5a88652f721da82a, merged API #567.
Management spec SHA256: 3a4370816296cf96296d643e3d823185c64d354ca29ac24343cebff774d43319.
The supplement contains eight existing operations and their eight-component reference closure. Runtime changes add only profile LIST tag/phonePrefix validation and serialization across the six SDKs.

## Compatibility and authority

Preserve organization-only clients, nested imports/csvBase64, UUID cursor and integer limits, strict response/options validation, omission and mutation retries. Consent accepts cursor/limit only. Go unkeyed parameter literals and Rust exhaustive struct literals need named/default fields after adding the optional filters. .NET positional construction/deconstruction remains unchanged. Deprecated aliases are not restored.

Global API source 171a9683ff45d11a4b5d3917dc428ad2722b0d99 and Polymorfa-Version 2026-09-22 remain unchanged, as do Testing 2f1510 and all other supplement pins. The real documentation generator binds its exact committed SDK inputs through sourceCommit/sourceFilesSha256; existing recipe omissions retain cURL fallback.

## Six-part assessment and release gates

- API: accepted source binding only; no route, SQL, scope or feature-policy change.
- SDKs: six implementations and native test counterparts. Qualification is limited to actual new-head evidence in the owning PR/receipt. Registry packages and installed/environment acceptance remain open.
- CLI: CLI72/79 retain pins and holds, adapter and filter refusals. CLI76 is independent display/help work.
- Docs: source examples and provenance updated; no shipped changelog or installation claim.
- Feature release: no audience, enrollment, activation or contract-date advancement. Publication needs containing source, package receipts and matching API acceptance.
- Admin: no capability, MCP, state, configuration or UI change.

The original SDK350 history, canonical 1eff source and failed checks remain preserved in the Campaigns owner receipt. Core operation hunks are contained/adapted to main; common-client exposure, flat imports/raw CSV and API532 binding are historical. The PR is not wholly redundant. Release owns merges. Source rollback does not undo external effects or publication.

SDK input commit: 725c5ab530e73a17e007c397430b32f53df26442. The export commit is the later commit containing this record and generated catalog. No registry artifact is established by either commit.

Corrected SDK input commit: 7b8ef11e176dfbb3ada805daf98b919134ac253c. Native Rust compilation caught the canonical patch adding fields to recipient-export parameters; this child restores that unrelated struct and adds the fields only to profile-list parameters. Earlier source/export commits and the compiler failure remain preserved.
