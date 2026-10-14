# D1 bridge contract

`@polymorfa/storage/d1-bridge` exports `createD1StorageBridge`, `D1_BRIDGE_CONTRACT` and `D1_BRIDGE_HEADERS`. The bridge is a customer-hosted Worker using a D1 binding. Each commit invokes the same `d1Adapter` as the TypeScript reference, whose batch applies all conditional writes or rolls them back. Native clients must not advertise D1 administrative REST calls as atomic storage commits.

The wire contract is `polymorfa-d1-storage-v1`, storage schema 2. Authority and SQL table prefix are immutable Worker configuration, not request-selected tenant scopes. Give every authority an independent application secret, Worker binding and trusted prefix. The secret is 32–256 visible ASCII characters; it is not a Polymorfa project, organization or client credential. The bridge accepts no SQL, reducer, truncate operation, caller database connection or browser Origin header.

Every request includes these headers:

| Header                        | Value                                                               |
| ----------------------------- | ------------------------------------------------------------------- |
| `Authorization`               | `Bearer ` followed by the customer application secret               |
| `Polymorfa-Storage-Authority` | Expected fixed authority                                            |
| `Polymorfa-Storage-Prefix`    | Expected fixed table prefix                                         |
| `Polymorfa-Storage-Nonce`     | Fresh 32 random bytes encoded as unpadded base64url (43 characters) |
| `Polymorfa-Storage-Signature` | `v1=` followed by lowercase hexadecimal HMAC-SHA256                 |
| `Content-Type`                | `application/json` for POST                                         |

Sign the UTF-8 bytes of `nonce + "." + method + "." + path + "." + exactBody` with the application secret. Paths below are exact, with no trailing slash, base path or query string. GET has an empty body. Do not log these headers, bodies, URLs or database exceptions. HTTPS is required outside loopback fixtures; native clients must disable redirects and Origin, cookie and Polymorfa credential forwarding.

| Method/path      | JSON request     | `data` in response                                                                                                                         |
| ---------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /handshake` | No body          | `{atomicCommit:true,maxCommitSize:50,maxGetSize:1000,maxQuerySize:1000,maxBodyBytes:8388608,conditionalDeletes:true,setupAllowed:boolean}` |
| `POST /setup`    | `{}`             | `{ok:true}`; requires operator-configured `allowSetup:true`                                                                                |
| `POST /get`      | `{entity,ids}`   | Array of stored rows                                                                                                                       |
| `POST /commit`   | `{writes}`       | `{ok:true}` or `{ok:false,conflicts:[id,...]}`                                                                                             |
| `POST /query`    | `{entity,query}` | Ordered array of stored rows                                                                                                               |

Successful and authenticated operation-error responses contain `{contract,schemaVersion,authority,tablePrefix,data}`. Verify all four identity fields on every response. Responses include the same nonce header and a signature over UTF-8 bytes of `nonce + "." + decimalStatus + "." + exactResponseBody`. Verify the fresh nonce and signature before parsing or trusting capabilities, errors or rows. Initial authentication, routing, body-size and oversized-response failures have safe unsigned errors; clients must treat an unsigned response as untrusted failure. No redirects are emitted or accepted.

Before returning an adapter with `atomicCommit:true`, a native constructor must make a fresh signed handshake and validate contract, schema 2, authority, prefix, atomic capability, maximum commit size 50, conditional deletes and size bounds. Close or fail construction on mismatch. Every subsequent response repeats the identity check. A signature alone does not identify the correct database; the expected authority and prefix must come from trusted application configuration.

Requests and responses are limited to 8 MiB. A get accepts at most 1000 IDs; commits accept at most 50 writes; index limits are 0–1000; page larger reads with a signed cursor request. Query scopes and row keys use the shared schema. Unknown top-level/row fields, duplicate writes, malformed revisions, non-finite numbers, JSON nesting beyond 64 and JSON structures above 200000 nodes fail before a storage operation. `put` requires `expectedRev:null` for an absent row or a positive existing revision. A remote `delete` requires a positive `expectedRev`, or a same-session lease update with its revision CAS in the same atomic batch. The latter supports the reference engine's chat-clear child deletions without weakening its durable fence. A standalone unconditional delete is rejected.

The bridge does not provide transport-level exactly-once delivery. After a timeout or cancellation, a commit may have completed. Retry through the native engine with conditional revisions, durable event markers, session leases and checkpoint CAS; never assume cancellation undid a write. Do not weaken preconditions after a conflict. Configure application and database authorization for stored customer message content. Do not expose authority-selection controls to untrusted callers.

The conformance test bundles this bridge as a real Worker and exercises it through Miniflare's actual D1 binding, including the 2000-message history fixture, stale leases, checkpoint conflicts, all-row rollback, replay and tenant/wire rejection paths. This is local runtime proof, not deployed availability or registry publication.
