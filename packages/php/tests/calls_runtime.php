<?php

declare(strict_types=1);
require_once dirname(__DIR__).'/vendor/autoload.php';
use Polymorfa\{CallsTokenSource,CallsTokenRequest,CallsToken,Credential,CancellationToken,CancelledException,CallsClient,CallsOptions,NativeCallSocket,AudioFrame,CallReporter,ConfigurationException};

function callsCheck(bool $condition, string $message): void
{
    if (!$condition) {
        throw new RuntimeException($message);
    }
}
$old = Credential::projectToken('pmfa_pt_'.str_repeat('a', 93).'A');
$fresh = Credential::projectToken('pmfa_pt_'.str_repeat('a', 93).'Q');
$now = 100.;
$count = 0;
$refreshes = [];
$source = new CallsTokenSource(function (CallsTokenRequest $request) use (&$count, &$refreshes, $old, $fresh, &$now): CallsToken {
    ++$count;
    $refreshes[] = $request->refresh;
    return new CallsToken($request->refresh ? $fresh : $old, $now + 40);
}, now:static function () use (&$now): float {
    return $now;
});
callsCheck($source->get()->credential === $old && $source->get()->credential === $old && $count === 1, 'Token cache');
$now = 111.;
callsCheck($source->get()->credential === $old && $count === 2, 'Expiry skew');
callsCheck($source->get(new CallsTokenRequest(true))->credential === $fresh && $refreshes === [false,false,true], 'Explicit refresh');
$source->invalidate();
$source->get();
callsCheck($count === 4, 'Invalidation');
$providerCancel = null;
$fetches = 0;
$shared = new CallsTokenSource(function (CallsTokenRequest $request) use (&$providerCancel, &$fetches, $old): CallsToken {
    ++$fetches;
    $providerCancel = $request->cancellation;
    Fiber::suspend();
    Fiber::suspend();
    return new CallsToken($old);
});
$a = new CancellationToken();
$b = new CancellationToken();
$firstCancelled = false;
$secondToken = null;
$one = new Fiber(function () use ($shared, $a, &$firstCancelled): void {
    try {
        $shared->get(new CallsTokenRequest(cancellation:$a));
    } catch (CancelledException) {
        $firstCancelled = true;
    }
});
$two = new Fiber(function () use ($shared, $b, &$secondToken): void {
    $secondToken = $shared->get(new CallsTokenRequest(cancellation:$b));
});
$one->start();
$two->start();
$a->cancel();
$one->resume();
callsCheck($firstCancelled && !$providerCancel->isCancelled() && $fetches === 1, 'Cancelled waiter cannot abort peer');
$shared->poll();
callsCheck($secondToken?->credential === $old && $two->isTerminated(), 'Shared Fiber provider finishes survivor');
$aloneCancel = null;
$alone = new CallsTokenSource(function (CallsTokenRequest $request) use (&$aloneCancel, $old): CallsToken {
    $aloneCancel = $request->cancellation;
    Fiber::suspend();
    return new CallsToken($old);
});
$cancel = new CancellationToken();
$waiter = new Fiber(function () use ($alone, $cancel): void {
    try {
        $alone->get(new CallsTokenRequest(cancellation:$cancel));
    } catch (CancelledException) {
    }
});
$waiter->start();
$cancel->cancel();
$waiter->resume();
callsCheck($aloneCancel->isCancelled(), 'Last cancelled waiter aborts provider');
$alone->poll();
// A newer refresh must not receive or cache the older provider result.
$generation = new CallsTokenSource(function (CallsTokenRequest $request) use ($old, $fresh): CallsToken {
    if (!$request->refresh) {
        Fiber::suspend();
        Fiber::suspend();
    } return new CallsToken($request->refresh ? $fresh : $old);
});
$oldResult = null;
$pending = new Fiber(function () use ($generation, &$oldResult): void {
    $oldResult = $generation->get();
});
$pending->start();
callsCheck($generation->get(new CallsTokenRequest(true))->credential === $fresh, 'Refresh skips non-refresh pending provider');
$generation->poll();
$generation->poll();
callsCheck($oldResult?->credential === $old && $generation->get()->credential === $fresh, 'Old completion cannot overwrite fresh cache');
echo "Calls token cache, expiry, refresh, independent Fiber cancellation and generation tests passed.\n";
$work = getenv('POLYMORFA_TEST_WORK_DIR') ?: getenv('HOME').'/.polymorfa-agent-work/php-sdk-tests';
if (!is_dir($work)) {
    mkdir($work, 0700, true);
}
$state = $work.'/calls-'.bin2hex(random_bytes(8));
$env = getenv();
$env['POLYMORFA_CALLS_TEST_STATE'] = $state;
$httpSocket = stream_socket_server('tcp://127.0.0.1:0');
$address = stream_socket_get_name($httpSocket, false);
fclose($httpSocket);
$httpUrl = 'http://'.$address;
$http = proc_open([PHP_BINARY,'-S',$address,__DIR__.'/calls-runtime-http.php'], [['pipe','r'],['pipe','w'],['pipe','w']], $httpPipes, null, $env);
$ws = proc_open([PHP_BINARY,__DIR__.'/calls-runtime-server.php'], [['pipe','r'],['pipe','w'],['pipe','w']], $wsPipes, null, $env);
try {
    $wire = json_decode(fgets($wsPipes[1]), true, flags:JSON_THROW_ON_ERROR);
    $wsUrl = $wire['url'];
    $ready = false;
    for ($i = 0;$i < 100;$i++) {
        if (@file_get_contents($httpUrl.'/__ready') !== false) {
            $ready = true;
            break;
        } usleep(10000);
    } callsCheck($ready, 'Native HTTP server ready');
    $refreshRequests = [];
    $tokens = new CallsTokenSource(function (CallsTokenRequest $request) use ($old, $fresh, &$refreshRequests): CallsToken {
        $refreshRequests[] = $request->refresh;
        return new CallsToken($request->refresh ? $fresh : $old);
    });
    $client = new CallsClient($tokens, new CallsOptions(session:'support', baseUrl:$httpUrl, heartbeat:0.1, minBackoff:0.01, maxBackoff:0.02, diagnostics:false), connector:static function (string $url, ?string $protocol, float $timeout) use ($httpUrl, $wsUrl): NativeCallSocket {
        return new NativeCallSocket(str_replace('http://', 'ws://', str_replace($httpUrl, $wsUrl, str_replace('ws://', 'http://', $url))), $protocol, $timeout);
    });
    $client->connect();
    callsCheck($client->connected && $client->participant === 'server:default', 'Authenticated native lifecycle');
    $events = [];
    for ($i = 0;$i < 10;$i++) {
        $events = array_merge($events, $client->poll());
        if ($client->getCall('incoming_1')?->canJoin) {
            break;
        }
    }
    $incoming = $client->getCall('incoming_1');
    callsCheck($incoming !== null && $incoming->canJoin && !$incoming->claimedByOther, 'Accepted unclaimed inbound can join');
    callsCheck(count(array_filter($events, static fn ($event): bool => $event->type === 'incoming')) === 1 && $client->getCall('ghost') === null, 'Early terminal does not ring ghost');
    file_put_contents($state.'.events', json_encode(['close' => 4401])."\n", FILE_APPEND | LOCK_EX);
    for ($i = 0;$i < 100;$i++) {
        $client->poll();
        if ($client->connected && in_array(true, $refreshRequests, true)) {
            break;
        } usleep(2000);
    }
    callsCheck($client->connected && in_array(true, $refreshRequests, true), 'Lifecycle 4401 forces fresh credential on reconnect');
    $incoming->join(false);
    callsCheck($incoming->state === 'connected' && $incoming->sampleRate === 16000, 'Native REST answer + media attachment');
    $incoming->setMediaState(audioMuted:true, videoEnabled:false);
    for ($i = 0;$i < 5;$i++) {
        $events = array_merge($events, $client->poll());
    }
    callsCheck(isset($incoming->participants['15550000001']) && $incoming->remoteAudioMuted === true && $incoming->videoSources[42]->connectionParticipant === 'server:other', 'Typed roster, remote audio, and video owner');
    callsCheck(count(array_filter($events, static fn ($event): bool => $event->value instanceof AudioFrame && $event->value->samples === [2,-2])) >= 1, 'Native PCM decoded');
    $incoming->writeAudio([1,-1]);
    for ($i = 0;$i < 100;$i++) {
        $client->poll();
        if ($incoming->reconnects === 1 && $incoming->state === 'connected') {
            break;
        } usleep(2000);
    }
    callsCheck($incoming->state === 'connected' && $incoming->reconnects === 1 && $incoming->audioMuted && in_array(true, $refreshRequests, true), '4401 refresh + same-ID reattach + acknowledged preference restore');
    $incoming->invite('15550000002');
    $incoming->ring('15550000002');
    $incoming->sendReaction('👍');
    $incoming->setHandRaised(true);
    callsCheck($incoming->handRaised, 'Participant and social controls');
    $outbound = $client->placePhone('15550000004');
    for ($i = 0;$i < 100;$i++) {
        $client->poll();
        if ($outbound->state === 'connected') {
            break;
        } usleep(2000);
    }
    callsCheck($outbound->state === 'connected', 'Native outgoing lifecycle accepted attaches media');
    $incoming->leave();
    $outbound->end();
    foreach ([['ended_1',1000,'','remote_hangup'],['claimed_1',4409,'call claimed','claimed']] as [$id,$status,$reason,$expected]) {
        file_put_contents($state.'.events', json_encode(['event' => 'call.received','callId' => $id,'payload' => ['from' => '15550000005']], JSON_THROW_ON_ERROR)."\n", FILE_APPEND | LOCK_EX);
        for ($i = 0;$i < 100 && $client->getCall($id) === null;$i++) {
            $client->poll();
        }
        $closedCall = $client->getCall($id);
        callsCheck($closedCall !== null, 'Native closed-call fixture created');
        $closedCall->answer(video:false);
        file_put_contents($state.'.events', json_encode(['mediaClose' => $status,'callId' => $id,'reason' => $reason], JSON_THROW_ON_ERROR)."\n", FILE_APPEND | LOCK_EX);
        for ($i = 0;$i < 100 && $closedCall->state !== 'ended';$i++) {
            $client->poll();
        }
        callsCheck($closedCall->state === 'ended' && $closedCall->endReason === $expected && $closedCall->reconnects === 0, 'Native media close ended/claimed classification never retries');
    }
    $client->disconnect();
    callsCheck($client->activeCalls() === [] && !$client->connected, 'Native leave/end/disconnect cleanup');
    $httpRecords = array_map(static fn (string $line): array => json_decode($line, true, flags:JSON_THROW_ON_ERROR), file($state.'.http', FILE_IGNORE_NEW_LINES));
    $wsRecords = array_map(static fn (string $line): array => json_decode($line, true, flags:JSON_THROW_ON_ERROR), file($state.'.ws', FILE_IGNORE_NEW_LINES));
    callsCheck(count(array_filter($httpRecords, static fn (array $entry): bool => $entry['path'] === '/messaging/voip/calls/incoming_1/leave' && $entry['body'] === ['connectionId' => $incoming->connectionId] && $entry['idempotency'] !== null)) === 1, 'Native leave identity and replay safety');
    callsCheck(count(array_filter($wsRecords, static fn (array $entry): bool => ($entry['type'] ?? '') === 'preferences' && ($entry['callId'] ?? '') === 'incoming_1' && ($entry['audioMuted'] ?? false))) === 2, 'Only acknowledged preferences replay once on reconnect');
    callsCheck(count(array_filter($wsRecords, static fn (array $entry): bool => ($entry['type'] ?? '') === 'pcm')) === 1, 'Uncertain PCM not replayed');
    echo "Actual native HTTP + phrity lifecycle/media, token refresh, reconnect, preferences, PCM, roster, social and release checks passed.\n";
} finally {
    foreach ([[$http,$httpPipes],[$ws,$wsPipes]] as [$process,$pipes]) {
        proc_terminate($process);
        foreach ($pipes as $pipe) {
            fclose($pipe);
        } proc_close($process);
    }
    foreach (glob($state.'.*') as $file) {
        unlink($file);
    }
}

final class CallsTestSocket implements Polymorfa\PollingCallSocket
{
    public array $sent = [];
    public bool $closed = false;
    public function __construct(public array $frames = [])
    {
    }
    public function send(string $data, bool $binary = false): void
    {
        $this->sent[] = ['data' => $data,'binary' => $binary];
    }
    public function receive(): array
    {
        return $this->poll(1) ?? throw new Polymorfa\TimeoutException('Fixture idle.', 'request_timeout');
    }
    public function poll(float $timeout): ?array
    {
        if ($this->frames === []) {
            return null;
        }
        $frame = array_shift($this->frames);
        if ($frame instanceof Throwable) {
            throw $frame;
        }
        return ['data' => is_string($frame) ? $frame : json_encode($frame, JSON_THROW_ON_ERROR),'binary' => false];
    }
    public function close(): void
    {
        $this->closed = true;
    }
}
$tokenCalls = [];
$expiryWire = new CallsTestSocket([['type' => 'ready','participant' => 'client:one']]);
$expiring = new CallsTokenSource(function (CallsTokenRequest $request) use (&$tokenCalls): CallsToken {
    $tokenCalls[] = $request->refresh;
    return new CallsToken(Credential::clientToken($request->refresh ? 'pmfa_ct_replaced' : 'pmfa_ct_initial'), $request->refresh ? microtime(true) + 600 : microtime(true) + 0.02);
}, expirySkew:0);
$expiryClient = new CallsClient($expiring, new CallsOptions(heartbeat:0, refreshBeforeExpiry:0.01, diagnostics:false), connector:static function (string $url, ?string $protocol, float $timeout) use ($expiryWire): CallsTestSocket {
    callsCheck($url === 'wss://api.polymorfa.com/voip/ws' && $protocol === null, 'Client lifecycle has no query identity');
    return $expiryWire;
});
$expiryClient->connect();
usleep(1050000);
$expiryClient->poll();
callsCheck($tokenCalls === [false,true] && json_decode($expiryWire->sent[1]['data'], true) === ['type' => 'auth','token' => 'pmfa_ct_replaced'], 'Expiry replacement authenticates same lifecycle connection');
$expiryClient->disconnect();
$claimWire = new CallsTestSocket([
 ['type' => 'ready','participant' => 'client:self'],
 ['type' => 'event','event' => 'call.received','callId' => 'claimed','payload' => ['direction' => 'incoming','from' => '15550000001']],
 ['type' => 'event','event' => 'call.accepted','callId' => 'claimed','payload' => ['answeredBy' => 'client:other','exclusive' => true]],
 ['type' => 'event','event' => 'call.received','callId' => 'claimed','payload' => ['direction' => 'incoming','from' => '15550000001']],
]);
$claimed = new CallsClient(new CallsTokenSource(Credential::clientToken('pmfa_ct_one')), new CallsOptions(heartbeat:0, diagnostics:false), connector:static fn (): CallsTestSocket => $claimWire, clientFactory:static function (): never {
    throw new RuntimeException('Claimed call must never be rejected or released.');
});
$claimed->connect();
$claimEvents = [];
for ($i = 0;$i < 3;$i++) {
    $claimEvents = array_merge($claimEvents, $claimed->poll());
}
callsCheck($claimed->getCall('claimed')?->claimedByOther && $claimed->getCall('claimed')?->state === 'incoming' && count(array_filter($claimEvents, static fn ($event): bool => $event->type === 'incoming')) === 1 && count(array_filter($claimEvents, static fn ($event): bool => $event->type === 'claim')) === 1, 'Exclusive foreign claim ends locally once without decline');
$claimed->disconnect();
$refusedWire = new CallsTestSocket([['type' => 'ready'],Polymorfa\CallsSocketErrors::closed(4400)]);
$connections = 0;
$refused = new CallsClient(new CallsTokenSource($old), new CallsOptions(session:'support', heartbeat:0, minBackoff:0.001, maxBackoff:0.001), connector:static function () use (&$connections, $refusedWire): CallsTestSocket {
    ++$connections;
    return $refusedWire;
});
$refused->connect();
$refused->poll();
usleep(2000);
$refused->poll();
callsCheck(!$refused->connected && $connections === 1, 'Invalid lifecycle request is not retried');
$refused->disconnect();
$cancelled = new CancellationToken();
$cancelled->cancel();
try {
    $refused->poll(cancellation:$cancelled);
    throw new RuntimeException('Expected cancellation.');
} catch (CancelledException) {
}
// Exact HTTP wire reports, bounded quality/error budgets and permanent refusal stop.
$reports = [];
$reportStatus = 200;
$handler = static function (Psr\Http\Message\RequestInterface $request, array $options) use (&$reports, &$reportStatus): GuzzleHttp\Promise\PromiseInterface {
    $reports[] = json_decode((string)$request->getBody(), true, flags:JSON_THROW_ON_ERROR);
    callsCheck($request->getUri()->getPath() === '/messaging/voip/calls/reported/reports', 'Diagnostic route');
    return GuzzleHttp\Promise\Create::promiseFor(new GuzzleHttp\Psr7\Response($reportStatus, ['content-type' => 'application/json'], $reportStatus === 200 ? '{"success":true}' : '{"error":{"code":"forbidden"}}'));
};
$reportClient = new CallsClient(new CallsTokenSource($old), new CallsOptions(session:'support'), clientFactory:static fn (Credential $credential): Polymorfa\MessagingClient => new Polymorfa\MessagingClient($credential, http:new GuzzleHttp\Client(['handler' => $handler])));
$reportCall = new Polymorfa\Call($reportClient, 'reported', 'inbound', '15550000001', false);
$clock = 100.;
$reporter = new CallReporter($reportClient, $reportCall, static function () use (&$clock): float {
    return $clock;
});
$reporter->quality(['rttMs' => 70000.8,'jitterMs' => -1,'audioCodec' => 'opus','videoCodec' => '<bad>','candidateType' => 'relay','secret' => 'must disappear']);
$reporter->quality(['rttMs' => 1]);
for ($i = 0;$i < 30;$i++) {
    $reporter->error('unknown_secret_error');
}
callsCheck(count($reports) === 21 && $reports[0]['quality'] === ['rttMs' => 60000,'jitterMs' => 0,'audioCodec' => 'opus','candidateType' => 'relay'] && $reports[1]['error'] === ['code' => 'other'], 'Diagnostic sanitize / 5 second quality / 20 per minute error budget');
$clock = 161.;
$reportStatus = 403;
$reporter->error('ice_failed');
$reporter->error('media_timeout');
$reporter->quality(['rttMs' => 1]);
callsCheck(count($reports) === 22, 'Permanent 4xx stops best-effort reports');
echo "Lifecycle expiry/refusal/claim/cancellation and bounded diagnostic failure tests passed.\n";

// Unknown media effects must not become preferences or be retried on a fresh attachment.
$httpEffects = [];
$effectHandler = static function (Psr\Http\Message\RequestInterface $request, array $options) use (&$httpEffects): GuzzleHttp\Promise\PromiseInterface {
    $httpEffects[] = $request->getUri()->getPath();
    $body = str_ends_with($request->getUri()->getPath(), '/accept') ? '{"success":true,"data":{"answered":true,"answeredBy":"server:default","exclusive":false}}' : '{"success":true}';
    return GuzzleHttp\Promise\Create::promiseFor(new GuzzleHttp\Psr7\Response(200, ['content-type' => 'application/json'], $body));
};
$effectApi = static fn (Credential $credential): Polymorfa\MessagingClient => new Polymorfa\MessagingClient($credential, http:new GuzzleHttp\Client(['handler' => $effectHandler]));
$effectLifecycle = new CallsTestSocket([['type' => 'ready','participant' => 'server:default'],['type' => 'event','event' => 'call.received','callId' => 'effects','payload' => ['from' => '15550000001']]]);
$firstMedia = new CallsTestSocket([['type' => 'ready','sampleRate' => 16000,'video' => false]]);
$secondMedia = new CallsTestSocket([['type' => 'ready','sampleRate' => 16000,'video' => false]]);
$thirdMedia = new CallsTestSocket([Polymorfa\CallsSocketErrors::closed(4401)]);
$mediaAttempt = 0;
$effects = new CallsClient(new CallsTokenSource($old), new CallsOptions(session:'support', heartbeat:0, mediaHeartbeat:0, controlTimeout:0.01, minBackoff:0.001, maxBackoff:0.001, maxMediaReattach:1, diagnostics:false), connector:static function (string $url) use ($effectLifecycle, $firstMedia, $secondMedia, $thirdMedia, &$mediaAttempt): CallsTestSocket {
    return str_contains($url, '/media') ? (++$mediaAttempt === 1 ? $firstMedia : ($mediaAttempt === 2 ? $secondMedia : $thirdMedia)) : $effectLifecycle;
}, clientFactory:$effectApi);
$effects->connect();
$effects->poll();
$effectCall = $effects->getCall('effects');
$effectCall->answer(video:false);
try {
    $effectCall->setMediaState(audioMuted:true);
    throw new RuntimeException('Expected unknown-effect timeout.');
} catch (Polymorfa\TimeoutException $error) {
    callsCheck($error->errorCode === 'media_control_timeout' && !$effectCall->audioMuted, 'Missing acknowledgement cannot mutate preferences');
}
$firstMedia->frames[] = Polymorfa\CallsSocketErrors::closed(4401);
$effects->poll();
usleep(2000);
$effects->poll();
callsCheck($mediaAttempt === 2 && count($secondMedia->sent) === 1 && json_decode($firstMedia->sent[0]['data'], true)['connectionId'] === json_decode($secondMedia->sent[0]['data'], true)['connectionId'], 'Unknown media command is not replayed on stable-ID reattach');
$before = count($secondMedia->sent);
$cancelled = new CancellationToken();
$cancelled->cancel();
try {
    $effectCall->setMediaState(audioMuted:true, cancellation:$cancelled);
} catch (CancelledException) {
} callsCheck(count($secondMedia->sent) === $before, 'Already-cancelled media command has no effect');
$secondMedia->frames[] = new Polymorfa\ConnectionException('lost', 'connection_error');
$effects->poll();
usleep(2000);
$effects->poll();
usleep(2000);
$effects->poll();
callsCheck($effectCall->state === 'ended' && $effectCall->endReason === 'connection_failed' && $httpEffects === ['/messaging/voip/calls/effects/accept','/messaging/voip/calls/effects/leave'], 'Bounded reattach exhaustion releases one accepted call');
$effects->disconnect();
// Acceptance can suspend in an application Fiber; disconnect must release a late success.
$lateRequests = [];
$lateHandler = static function (Psr\Http\Message\RequestInterface $request, array $options) use (&$lateRequests): GuzzleHttp\Promise\PromiseInterface {
    $lateRequests[] = $request->getUri()->getPath();
    if (str_ends_with($request->getUri()->getPath(), '/accept')) {
        Fiber::suspend();
        $body = '{"success":true,"data":{"answered":true,"answeredBy":"server:default","exclusive":false}}';
    } else {
        $body = '{"success":true}';
    } return GuzzleHttp\Promise\Create::promiseFor(new GuzzleHttp\Psr7\Response(200, ['content-type' => 'application/json'], $body));
};
$lateWire = new CallsTestSocket([['type' => 'ready'],['type' => 'event','event' => 'call.received','callId' => 'late','payload' => ['from' => '15550000001']]]);
$lateClient = new CallsClient(new CallsTokenSource($old), new CallsOptions(session:'support', heartbeat:0, diagnostics:false), connector:static fn (): CallsTestSocket => $lateWire, clientFactory:static fn (Credential $credential): Polymorfa\MessagingClient => new Polymorfa\MessagingClient($credential, http:new GuzzleHttp\Client(['handler' => $lateHandler])));
$lateClient->connect();
$lateClient->poll();
$lateCall = $lateClient->getCall('late');
$lateCancelled = false;
$lateFiber = new Fiber(function () use ($lateCall, &$lateCancelled): void {
    try {
        $lateCall->answer(video:false);
    } catch (CancelledException) {
        $lateCancelled = true;
    }
});
$lateFiber->start();
$lateClient->disconnect();
$lateFiber->resume();
callsCheck($lateCancelled && $lateCall->state === 'ended' && $lateRequests === ['/messaging/voip/calls/late/accept','/messaging/voip/calls/late/leave'], 'Late acceptance released after disconnect, never resurrected');
echo "Unknown media effects, cancellation, bounded exhaustion and in-flight acceptance cleanup passed.\n";

// A late placed call must be ended and never tracked after disconnect.
$placePaths = [];
$latePlaceHandler = static function (Psr\Http\Message\RequestInterface $request, array $options) use (&$placePaths): GuzzleHttp\Promise\PromiseInterface {
    $placePaths[] = $request->getMethod().' '.$request->getUri()->getPath();
    if ($request->getMethod() === 'POST') {
        callsCheck($request->getHeaderLine('Idempotency-Key') === 'placement-key' && json_decode((string)$request->getBody(), true)['exclusive'] === true, 'Explicit placement key and claim');
        Fiber::suspend();
        $body = '{"success":true,"data":{"callId":"late_place","session":"support","video":false}}';
    } else {
        $body = '{"success":true}';
    }
    return GuzzleHttp\Promise\Create::promiseFor(new GuzzleHttp\Psr7\Response(200, ['content-type' => 'application/json'], $body));
};
$placeWire = new CallsTestSocket([['type' => 'ready']]);
$latePlacer = new CallsClient(new CallsTokenSource($old), new CallsOptions(session:'support', heartbeat:0, diagnostics:false), connector:static fn (): CallsTestSocket => $placeWire, clientFactory:static fn (Credential $credential): Polymorfa\MessagingClient => new Polymorfa\MessagingClient($credential, http:new GuzzleHttp\Client(['handler' => $latePlaceHandler])));
$latePlacer->connect();
$placeCancelled = false;
$placeFiber = new Fiber(function () use ($latePlacer, &$placeCancelled): void {
    try {
        $latePlacer->placePhone('15550000001', exclusive:true, idempotencyKey:'placement-key');
    } catch (CancelledException) {
        $placeCancelled = true;
    }
});
$placeFiber->start();
$latePlacer->disconnect();
$placeFiber->resume();
callsCheck($placeCancelled && $latePlacer->activeCalls() === [] && $placePaths === ['POST /messaging/voip/calls','DELETE /messaging/voip/calls/late_place'], 'Late placement ended without resurrection');
echo "Explicit placement claim/idempotency and late placement cleanup passed.\n";

callsCheck(Polymorfa\CallsSocketErrors::closed(4409)->errorCode === 'call_ended' && Polymorfa\CallsSocketErrors::closed(4409, 'call claimed')->errorCode === 'call_claimed' && Polymorfa\CallsSocketErrors::closed(1000, media:true)->errorCode === 'call_ended', 'Close classification matches server Calls ended versus claimed semantics');

$pollCancellation = null;
$pollAbortToken = new CancellationToken();
$pollCancelled = false;
$pollAbort = new CallsTokenSource(function (CallsTokenRequest $request) use (&$pollCancellation, $old): CallsToken {
    $pollCancellation = $request->cancellation;
    Fiber::suspend();
    return new CallsToken($old);
});
$pollWaiter = new Fiber(function () use ($pollAbort, $pollAbortToken, &$pollCancelled): void {
    try {
        $pollAbort->get(new CallsTokenRequest(cancellation:$pollAbortToken));
    } catch (CancelledException) {
        $pollCancelled = true;
    }
});
$pollWaiter->start();
$pollAbortToken->cancel();
$pollAbort->poll();
callsCheck($pollCancelled && $pollCancellation->isCancelled(), 'Poll observes all canceled waiters before accepting provider completion');
