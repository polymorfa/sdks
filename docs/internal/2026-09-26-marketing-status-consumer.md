# Raw Marketing Messages WABA status consumer

`MessagingClient.cloudMarketing.status` consumes Polymorfa API PR #383 at
`1e1d613de599c2b4334f8de81fab087c74f31424`, with Graph OpenAPI copy
`docs/api-reference/openapi.graph.json` SHA-256
`1270c8fb32a09cb717f3ea8edd6bd657e8ff3110e03a6286e68d5e16affff474`.
The exact operation is `graphGetMarketingStatus`. It reads raw optional WABA
status strings and preserves the API's Graph error behavior. No status value is
mapped to accepted terms, eligibility, insight availability, or a send decision.

API: merged as polymorfa PR #383 and pinned at dev 29abb7b; not deployed by this SDK
change. SDKs: TypeScript server Messaging resource and public type updated;
other language clients in this workspace do not expose this Graph facade
resource and remain unaffected by the current contract. CLI: companion
read-only command is stacked separately and needs a published SDK artifact.
Docs: this SDK's overview and TypeScript page are updated; API public method
documentation remains in the API PR. Feature release: the existing Graph beta
gate is unchanged; installed SDK code is not customer availability. Admin:
no capability or staff state changes.

No tests, typechecks, builds, documentation checks or live Meta calls were run
at the user's request. Publication, exact package integrity, CLI pin, and live
account acceptance remain separate gates.
