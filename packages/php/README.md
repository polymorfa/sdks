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
