# Server Calls

Install `phrity/websocket:^4.0` alongside `polymorfa/sdk` to use the native
WebSocket transport. Use a project token, organization key, or server-minted
client token. Server credentials belong in the PHP process. Browser applications
reuse Polymorfa Web Components and receive short-lived client tokens from their
application backend.

```php
use Polymorfa\{Credential, CallsClient, CallsOptions, CallsTokenSource};

$calls = new CallsClient(
    new CallsTokenSource(Credential::projectToken(getenv('POLYMORFA_PROJECT_TOKEN'))),
    new CallsOptions(session: 'support'),
);
$calls->connect();
try {
    while ($running) {
        foreach ($calls->poll(0.05) as $event) {
            if ($event->type === 'incoming') {
                $event->call->answer(exclusive: false, video: false);
            }
            if ($event->type === 'audio') {
                // $event->value is an AudioFrame with signed 16-bit PCM samples.
            }
        }
    }
} finally {
    $calls->disconnect();
}
```

The application drives `poll()` repeatedly. It advances lifecycle reads,
heartbeats, credential replacement and reconnect attempts. Socket reads use the
supplied timeout; readiness, media acknowledgement and HTTP operations have
separate bounded timeouts. This SDK installs no background scheduler. Arrange
your application's event loop so it keeps polling while calls are active.

`placePhone()`, `placeParticipants()` and `placeGroup()` return a `Call`.
Inbound calls expose `answered`, `answeredBy`, `exclusive`, `claimedByOther` and
`canJoin`; `join()` accepts an answered, unclaimed inbound call. A foreign
exclusive claim remains visible as `claimedByOther` and cannot be answered or joined; the SDK does not decline it. Terminal events that
arrive before call creation do not ring the application later. `disconnect()`
leaves accepted calls, ends outbound ringing calls, and locally dismisses
unanswered inbound calls.

A call supports `answer()`, `reject()`, `join()`, `leave()`, `end()`, `invite()`,
`ring()`, `sendReaction()` and `setHandRaised()`. `writeAudio()` sends signed
16-bit PCM; `writeVideo()` sends an encoded H.264 `VideoFrame`. Incoming audio
and video are emitted as `CallsEvent` values. `participants`, `videoSources`,
`remoteAudioMuted` and hand state follow the server's control frames. Incoming
`VideoFrame` values retain the source handle, microsecond timestamp and keyframe
flag. `video_source` events carry a `CallVideoSource`; `video_source_removed`
events carry its integer handle. `keyframe_request` asks the encoder for decoder
configuration and a keyframe on its next write. Outgoing video uses source zero.
Media disconnection and terminal calls clear the source map. This frame/event
interface is the SDK's neutral audio/video seam; applications supply their own
capture, encoder, decoder and playback.

`setMediaState(audioMuted: true)` waits for the matching acknowledgement.
`audioMuted`, `videoEnabled` and `screenSharing` change after that acknowledgement.
A timed-out command has an unknown effect and is not replayed. A media reconnect
reuses `connectionId` and restores acknowledged preferences; it never replays
PCM, video, reactions or other uncertain effects. `maxMediaReattach` bounds
reattach attempts. A 4401 refusal refreshes the credential; claimed, ended and
invalid requests terminate instead of reconnecting forever.

For renewable credentials, give `CallsTokenSource` a provider accepting a
`CallsTokenRequest` and returning `CallsToken` or `Credential`. `expiresAt` is
Unix epoch seconds. The source caches until the expiry skew, shares in-flight
provider work, and separates each waiter's cancellation. The provider receives
its own cancellation token. Cancelling every cancellable waiter aborts that
provider; cancelling one waiter leaves the others running. Explicit refreshes
never reuse an older fetch that was not asked to refresh. A stale completion
cannot overwrite a newer cache.

A provider may suspend a Fiber while the application performs asynchronous work.
Call `CallsTokenSource::poll()` from the application's scheduler to advance it
and its waiting Fibers. Ordinary synchronous providers need no Fiber machinery.
Cancellation is observed when these waits are polled or resumed; there is no
implicit global Fiber scheduler.

The default transport puts credentials in the first WebSocket frame, never the
URL or handshake headers. Server lifecycle URLs contain only the session and
optional participant. Client-token lifecycle URLs contain neither. A custom
`connector` must return `PollingCallSocket` and preserve those rules; a custom
`clientFactory` can configure the SDK's HTTP proxy or transport. Native socket
TLS uses PHP's configured trust store.

Diagnostics are bounded and best effort: quality reports at most once per five
seconds, at most twenty error reports per minute, numeric limits and a fixed
error vocabulary. Requests have a five-second timeout and no retry; permanent
4xx responses stop reporting. Set `diagnostics: false` to disable them. These
reports do not change call state.

Verification uses actual HTTP and phrity WebSocket peers for authentication,
answer/join, early events, lifecycle and media 4401 refresh, the stable connection
ID, preference acknowledgements/restoration, PCM and H.264, source removal and
keyframe requests, participant controls and
release. Separate tests cover expiry replacement, independent Fiber waiters,
claim/refusal handling, cancellation, diagnostics and unknown-effect timeouts.
Run `php tests/calls_runtime.php` or the package test suite. This proves the SDK
protocol boundary; it does not establish live WhatsApp calling eligibility,
funding, enrollment, deployment or provider acceptance.
