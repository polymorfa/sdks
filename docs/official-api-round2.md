# Official API round-2 betas

These client additions prepare the six merged backend contracts in
`contracts/official-api-round2.json`. They do not establish a published package,
deployment or enabled audience. Use the matching accepted SDK prerelease after
publication. API contract dates are independent of package timestamps.

| Item  | TypeScript surface                                                                              | Scope                                                                                                                                                                                                                                                                                                                               |
| ----- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OA-03 | `quickLinks.retrieve`, `CloudReadinessFailureCode`, named send errors                           | Readiness is checked by the backend. `meta_readiness_unknown` stays pending until cancellation or expiry; it never proves readiness.                                                                                                                                                                                                |
| OA-16 | `catalogs.list/retrieve/sync/listProducts`, incoming `order` in webhook/history types           | Native Number routes, `business:read`, enrolled beta. Reads use the snapshot; sync explicitly reads Meta. Prices remain provider values. An invalid order cart is omitted as a whole.                                                                                                                                               |
| OA-17 | `cloudMarketing.getStatus`, refreshed Graph `cloudMarketing.status`, two lifecycle events       | Native beta requires `sessions:read`. Unknown values never grant eligibility. Terms are accepted in WhatsApp Manager. The deprecated MM Lite Graph field is removed from the current response type.                                                                                                                                 |
| OA-18 | `contacts.block/unblock`, `parentBsuid`, `contact.update.identityChange`                        | Use public contact IDs for native blocks. Parent BSUIDs are metadata, never recipients or block targets. Previous identities stay separate. Reuse the existing native methods and caller idempotency keys; inspect uncertain outcomes before starting another operation.                                                            |
| OA-21 | `officialGroups.setPicture`, `groups.setPicture`, `chats` history                               | Official-only picture is a multipart JPEG, square, at least 192 x 192 pixels, at most 5 MB. Server validation checks bytes/dimensions. Hybrid operations use `groups` through Linked Devices only. `hybrid_group_linked_devices_unavailable` means not executed; never retry through Official. History remains opt-in and regional. |
| OA-30 | Platform `client.webhooks.create/update`, `constructWebhookDelivery`, `webhooks.verifyDelivery` | Native-format enrolled beta, opt-in/default off. The older `messaging.webhooks` resource does not accept batching.                                                                                                                                                                                                                  |

`feature_unavailable` is a normal typed `PolymorfaError` with its HTTP status,
request ID and code retained. Do not fall back to another API or bypass access
checks. Transport errors and unknown provider results must remain visible.

Catalog IDs are strings of 1-32 digits. Product pages accept `limit` 1-100
(default 50) and the API's opaque `nextCursor`. Sync may run for 50 seconds;
its SDK timeout defaults to 60 seconds. It is sent once, even with retry overrides.
A new attempt within 120 seconds returns `catalog_sync_cooldown` with Retry-After.
A failed attempt preserves the previous snapshot except definite `not_linked`.

Batch settings are `{enabled, maxEvents?, windowMs?}`. Limits are 2-100 events
and 100-1000 ms; defaults are 100 and 1000. Omission on create keeps single
delivery. Omission on update preserves stored settings. Disabling remains
available after beta withdrawal. The server verifies saved format and access.

Before enabling batching, replace a single-only receiver's
`constructWebhookEvent` with `constructWebhookDelivery`. The result is either
the existing event or `{object:"event_batch",version:1,id,events}`. A window may
contain one event. The original parser still accepts only a single event.
Verify the signature over the whole raw request. Deduplicate individual event
IDs and batch IDs in durable storage. Acknowledge only the whole request;
partial acknowledgement is unsupported. Batch retries retain bytes, membership,
order and IDs. Later admitted work may wait behind earlier endpoint deliveries.

The compile-checked example is `examples/official-api-round2/index.ts`.
Private Console routes in backend #612, #615 and #616 have no SDK surface.
The same beta delta now has native source and synthetic wire fixtures in Go,
Python, PHP, Rust and C#. The baseline coverage ledger remains separately pinned.
`contracts/native-official-round2.json` attributes the added methods and fields;
it does not certify test execution or package availability. Exact combined-source
hosted qualification is still required. PHP and Rust runtime/package checks have
not run on the constrained local host.

## Native entry points

These calls assume an existing server client with an organization API key or
project token. Client tokens cannot access the Number catalog/status methods or
Official groups. Keep the client's normal cancellation and disposal rules.

| Language   | Number cache                                                          | Number marketing status                             | Official picture                        | Verified delivery              |
| ---------- | --------------------------------------------------------------------- | --------------------------------------------------- | --------------------------------------- | ------------------------------ |
| TypeScript | `client.catalogs.list/retrieve/listProducts/sync`                     | `client.cloudMarketing.getStatus`                   | `client.officialGroups.setPicture`      | `constructWebhookDelivery`     |
| Go         | `client.Catalogs().List/Retrieve/ListProducts/Sync`                   | `client.CloudMarketing().GetStatus`                 | `client.OfficialGroups().SetPicture`    | `ConstructWebhookDelivery`     |
| Python     | `client.catalogs.list/retrieve/list_products/sync`                    | `client.cloud_marketing.get_status`                 | `client.official_groups.set_picture`    | `construct_webhook_delivery`   |
| PHP        | `$client->catalogs->list/retrieve/listProducts/sync`                  | `$client->cloudMarketing->getStatus`                | `$client->officialGroups->setPicture`   | `Webhooks::constructDelivery`  |
| Rust       | `client.catalogs().list/retrieve/list_products/sync`                  | `client.cloud_marketing().get_status`               | `client.official_groups().set_picture`  | `webhooks::construct_delivery` |
| C#         | `client.Catalogs.ListAsync/RetrieveAsync/ListProductsAsync/SyncAsync` | `client.CloudGraph.GetMarketingMessagesStatusAsync` | `client.OfficialGroups.SetPictureAsync` | `Webhooks.ConstructDelivery`   |

Each picture method takes in-memory JPEG bytes, bounds the file to 5 MiB and
sends a multipart `file` with `image/jpeg`. The API checks square dimensions of
at least 192 pixels. The SDK owns the multipart boundary and does not replay an
uncertain upload. The Linked Devices `Groups` picture contract stays separate.

All six Platform webhook resources accept typed `batching` on create/update and
return saved settings on reads. Use the organization or project resource that
owns the endpoint. Changing a format without supplying batching leaves the API
to validate the stored settings. Disabling batching does not require an enabled
beta. Never infer that omission disables an endpoint's saved batching.

Go's `VerifiedWebhookDelivery` holds either `Event` or `Batch`. Python and PHP
return their event or `WebhookEventBatch`. Rust returns `WebhookDelivery::Single`
or `WebhookDelivery::Batch`. C# returns `SingleWebhookDelivery` or
`WebhookEventBatch`. These parsers authenticate the original request body before
any JSON/member decoding. A malformed or nested member rejects the delivery.
Single-only receiver methods keep their existing behavior.

Contact changes keep the new identity on the event and the old identity in
`identityChange.previous`. `parentBsuid` is metadata, never a send/block target.
Incoming `order` values in cloud messages and hosted history contain the API's
validated cart only. They do not imply payment or calculate a total.

QuickLink `errorCode` remains an open nullable string. The named values
`meta_credentials_invalid`, `meta_phone_not_registered`,
`meta_webhook_not_subscribed`, `meta_payment_method_missing`,
`meta_quality_flagged` and `meta_readiness_unknown` belong to that status field.
They are absent from the public error catalog. Future values remain readable.
Public send failures use the separately named `whatsapp_*` codes in the pinned
contract. The shared synthetic fixture is `contracts/fixtures/official-round2.json`.

The native examples under `examples/official-api-round2/` demonstrate explicit
catalog pagination. They make no registry installation or availability claim.
