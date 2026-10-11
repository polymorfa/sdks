# Polymorfa PHP SDK

Handwritten server SDK for PHP 8.2+, with Guzzle, OpenSSL and cURL. Package identity: `polymorfa/sdk`. This source package is a development build and has not been published to Packagist.

```php
use Polymorfa\{Credential, MessagingClient, RequestOptions};

$client = new MessagingClient(Credential::organizationApiKey(getenv('POLYMORFA_API_KEY')));
$response = $client->messages->send('support', [
    'conversation' => ['phoneNumber' => '+15551234567'],
    'content' => ['text' => 'Hello'],
], new RequestOptions(idempotencyKey: 'order-123-confirmation'));
$messageId = $response->data['data']['id'];
$requestId = $response->metadata->requestId;
```

`Client` manages Platform resources; `Client::project($projectId)` returns an immutable project view. `ProjectClient` accepts an organization API key or project token and cannot rebind to another project. `MessagingClient` also accepts constrained client tokens for supported messaging actions; server-only operations reject them before a request.

Response array shapes have handwritten PHPStan types. Responses retain metadata, including status, attempts, version and request ID. Errors use status-specific exception classes and retain safe server error fields. Raw access is an explicit escape hatch, and project raw access remains confined to its project. Request options include per-request version, timeout, idempotency key, headers and cooperative cancellation. Reserved authentication headers cannot be overridden.

Reads retry transient failures at most twice by default. Writes retry only when an idempotency key exists; send and react create one key for each call when omitted. Retry-After is bounded, and a replayed final result never retries. Storage redirects do not receive API credentials.

```php
use Polymorfa\Webhooks;

$event = Webhooks::constructEvent($rawBody, $signatureHeader, $signingSecret);
// Pass the exact HTTP request bytes. Unknown events retain their payload.
```

Native webhook signatures authenticate bytes with HMAC-SHA256. They have no timestamp or replay window; delivery deduplication belongs to the application. Do not parse or re-encode JSON before verification.

The package's `coverage.json` attributes each operation to native test evidence and records unfinished typed resources. The presence of a method does not imply full SDK parity or access to a gated service feature. Existing API authorization, enrollment, entitlements and availability checks still apply.

Development checks:

```sh
composer validate --strict
composer install
composer lint
composer format:check
composer typecheck
composer test
composer build
```

Tests require Node.js to run the shared local HTTP fixture server. `Dockerfile.test` supplies PHP 8.2, cURL, Composer and Node. `POLYMORFA_BUILD_DIR` selects the destination for the standalone source archive.

`$client->clientTokens->mint()` accepts one session or Customer target.
`retrieveRules()`, `updateRules()` and `deleteRules()` manage session client
rules. These methods require server credentials; API eligibility and
ownership checks govern Customer tokens.

`WhatsAppMedia::decode()`, `download()` and `decrypt()` handle existing media
for image, video, audio, document and sticker messages. Downloading requires
a plaintext hash and checks the encrypted hash, MAC, plaintext hash and
size. CDN fallback and redirects remain within WhatsApp CDN hosts and never
receive API credentials. Media key values are hidden in debug output.

Install `phrity/websocket:^4.0` to use `MediaSocket` with native sockets.
It authenticates in the first frame and uses `pmfa.calls.v2` for PCM and
H.264 media. Applications drive this synchronous socket's receive loop;
additional lifecycle orchestration remains unfinished.
`WebhookRequest::fromSymfony()`, `fromLaravel()` and `fromPsr()` authenticate
raw framework bodies; install the relevant framework package. Application
examples are in `examples/php` in the source tree.

`chats` provides typed stored history pages, message media downloads,
message edits, archive controls and service-window observations. The API
requires HMS enrollment for hosted history and separate Official API
eligibility for service-window access. `business` provides typed profile,
catalog, product, collection, order, compliance, linked-account and
eligibility methods, including asynchronous accepted response variants.

`voip` provides typed Calls REST controls, permission checks, participant
controls, call settings and quality/error reports. Call-link creation and
preview reject idempotency keys and never retry. Reactions and hand-state
changes also never retry. Other call writes retry only with an explicit
idempotency key. Client tokens cannot select a server participant and are
refused by server-only link, permission, check and settings operations.

`banSafe` reads and changes project ceilings, warmup plans, insurance
evidence, health policies and Number overrides with server credentials.
Platform equivalents are under `Client::$projects` and `Client::$sessions`.
Responses retain entitlement and applied-state fields; configuring a
setting does not grant access. Send the version from a recent health-policy
read when updating it.

Platform account resources expose organization details, members, API-key and
project-token metadata. `projects` creates development projects, lists Hybrid
Link merge candidates and submits or approves production enrollment. `sessions`
provides lifecycle and batch controls, tier quotes, quote confirmation and
WhatsApp capability observations. Quote requests reject simultaneous merge and
resolution choices; tier confirmation requires a reviewed quote ID.

`auditLogs`, `sessionBans`, `securityIncidents` and `optOuts` preserve their
native Platform envelopes. `billing` reads balances, transactions, pricing,
limits and priorities, and writes revision-guarded controls. Billing methods
validate UUIDs, revisions, priorities and six-decimal credit quantities before
sending a request. Passing validation grants no billing authority or feature
access. These families have native HTTP socket tests in addition to PHPStan
shape checks.

`customers` covers Customer lifecycle, masked Number inventory, event records,
pairing links and confirmed transfers. Nullable update fields remain distinct
from omitted fields, and a replayed pairing-link creation can return a null URL.
`usage` unwraps measured records and gate observations and follows cursors lazily
through `iterateRecords()`. Project views always select their own usage project.
A usage record or configured gate does not establish a customer charge.

`sipTrunks` provides typed trunk configuration, endpoint discovery and credential
rotation. For organization clients, `list($projectId)` and
`create($input, $projectId)` select a project. Project views use their own project.
When a project view uses an organization key, writes first verify the trunk's
project using a read without the write's idempotency key. An environment without
SIP hosting returns the `sip_not_hosted` endpoint variant.

`quickLinkSettings` reads nullable saved branding settings and preserves explicit
null and false updates. `sessionConfiguration` reads and updates saved defaults
with their revisions. Both bind project views to the project's identity.

`ProjectClient::$functions` manages Functions, deployments, secret versions and
invocation receipts. Its requests always carry the owning project. Canonical
lowercase UUIDs and positive revisions are validated locally. Every Function
write runs once, including keyed invocations: after an uncertain result, inspect
the receipt before deciding on another invocation. Invocation creation requires
a printable idempotency key of 1 through 128 characters. Replayed results may
omit the original response, and `responseRetained` remains false.

Platform developer resources expose typed event, operation, webhook and delivery
records with payload availability and idempotency receipts. `events.listIndexed`
keeps 64-bit ingestion offsets as decimal strings and rejects non-advancing pages.
`operations.wait` uses bounded server long polls; cancellation creates one
idempotency key per invocation. Organization and immutable project views use
their respective native routes. `requestLogs.list`, `follow` and `tail` read the
project log; tail reverses backfill into chronological order, follows new records,
honors cancellation and bounds `Retry-After` delays.

`officialGroups` provides typed Official API group reads and writes. Every change
is sent once, including keyed requests with retry overrides. The API enforces
Number eligibility and enrollment. `hybridLink`, `observationPolicies`,
`cloudOnboarding` and `testing` follow the existing server contracts.
`SystemClient` sends credential-free liveness and version probes; `BridgeClient`
accepts only a project token and resolves regional Bridge routes.

Both campaign resources keep the API's campaign fields, recipient delivery
history, send windows, A/B variants and conversion reports typed. Messaging
creates and lifecycle actions create one invocation idempotency key. Platform
create sends once and ignores retry/key overrides. Recipient and audience
appends default to one attempt; an explicit retry override and key can re-enable
retries, which the API may process as another append. Reconcile a lost response
before appending again. Conversion report totals remain decimal strings of minor
units and currencies remain separate.

`ApiResponse` suppresses payload contents in `var_dump` to protect one-time
secrets and signed URLs. Access `data` explicitly when consuming a response.

`messages.send` accepts the complete typed content union, including interactive
and payment-order messages. `messages.operationStatus` reads the durable receipt
without resending. QuickLink models preserve connection goals, configuration
choices and separate Cloud sync request receipts from delivery progress.

`media.downloadStream` returns a PSR body to consume once or close.
`downloadUrl` returns a signed storage URL without following it, or reports that
the API streams the body. Storage requests omit API credentials and caller
headers. `downloadToFile` writes a private sibling and replaces the destination
only after completion; bounded, cancelled or failed reads preserve the previous
file. Media filenames are display names stripped of path segments and controls.
