<?php

declare(strict_types=1);

namespace Polymorfa;

/** Server Calls orchestration. Applications drive timers and socket reads with poll(). */
final class CallsClient
{
    public bool $connected = false;
    public ?string $participant = null;
    private bool $closed = true;
    private int $generation = 0;
    private ?PollingCallSocket $socket = null;
    private ?CallsToken $token = null;
    private ?string $boundSession = null;
    private bool $refreshNext = false;
    private int $attempt = 0;
    private float $retryAt = 0;
    private float $refreshAt = INF;
    private float $beatAt = 0;
    private bool $awaitingPong = false;
    /** @var array<string,Call> */ private array $calls = [];
    /** @var list<CallsEvent> */ private array $events = [];
    /** @var array<string,list<array{event:string,payload:array<string,mixed>}>> */ private array $early = [];
    /** @var array<string,true> */ private array $ended = [];
    /** @var \Closure(string,?string,float):CallSocket */ private readonly \Closure $connector;
    /** @var \Closure(Credential):MessagingClient */ private readonly \Closure $clientFactory;
    /** @param callable(string,?string,float):CallSocket|null $connector
     * @param callable(Credential):MessagingClient|null $clientFactory */
    public function __construct(
        public readonly CallsTokenSource $tokens,
        public readonly CallsOptions $options = new CallsOptions(),
        ?callable $connector = null,
        ?callable $clientFactory = null
    ) {
        $this->connector = \Closure::fromCallable($connector ?? static fn (string $url, ?string $protocol, float $timeout): CallSocket => new NativeCallSocket($url, $protocol, $timeout));
        $this->clientFactory = \Closure::fromCallable($clientFactory ?? fn (Credential $credential): MessagingClient => new MessagingClient($credential, baseUrl:$options->baseUrl, timeout:$options->connectTimeout));
    }
    public function session(): ?string
    {
        return $this->options->session ?? $this->boundSession;
    }
    /** @return list<Call> */ public function activeCalls(): array
    {
        return array_values($this->calls);
    }
    public function getCall(string $id): ?Call
    {
        return $this->calls[$id] ?? null;
    }
    /** @internal
     * @phpstan-impure */ public function api(?CancellationToken $cancellation = null): Resources\Voip
    {
        return ($this->clientFactory)($this->tokens->get(new CallsTokenRequest(cancellation:$cancellation))->credential)->voip;
    }
    /** @internal */ public function emit(CallsEvent $event): void
    {
        if (count($this->events) >= 256) {
            array_shift($this->events);
        }
        $this->events[] = $event;
    }
    public function connect(?CancellationToken $cancellation = null): void
    {
        if ($this->connected) {
            return;
        }
        $this->closed = false;
        ++$this->generation;
        try {
            $this->open($cancellation);
        } catch (PolymorfaException $error) {
            $this->dropped($error);
            throw $error;
        } catch (\Throwable) {
            $error = new ConnectionException('Calls connection failed.', 'connection_error');
            $this->dropped($error);
            throw $error;
        }
    }
    private function open(?CancellationToken $cancellation): void
    {
        $this->token = $this->tokens->get(new CallsTokenRequest($this->refreshNext, $cancellation));
        $this->refreshNext = false;
        $credential = $this->token->credential;
        $url = preg_replace('/^http/', 'ws', rtrim($this->options->baseUrl, '/')).'/voip/ws';
        if ($credential->kind !== 'client_token') {
            if ($this->options->session === null) {
                throw new ConfigurationException('session');
            }
            $query = ['session' => $this->options->session];
            if ($this->options->participant !== null) {
                $query['participant'] = $this->options->participant;
            }
            $url .= '?'.http_build_query($query, '', '&', PHP_QUERY_RFC3986);
        }
        $socket = ($this->connector)($url, null, $this->options->connectTimeout);
        if (!$socket instanceof PollingCallSocket) {
            $socket->close();
            throw new ConfigurationException('pollingSocket');
        }
        $this->socket = $socket;
        $socket->send(json_encode(['type' => 'auth','token' => substr($credential->authorization(), 7)], JSON_THROW_ON_ERROR));
        $deadline = microtime(true) + $this->options->connectTimeout;
        while (microtime(true) < $deadline) {
            $cancellation?->throwIfCancelled();
            $frame = $this->read(min(0.1, max(0.001, $deadline - microtime(true))));
            if ($frame === null) {
                continue;
            }
            if (($frame['type'] ?? null) === 'ready') {
                if (is_string($frame['session'] ?? null)) {
                    $this->boundSession = $frame['session'];
                }
                $this->participant = is_string($frame['participant'] ?? null) ? $frame['participant'] : $this->options->participant;
                $this->connected = true;
                $this->attempt = 0;
                $this->awaitingPong = false;
                $this->beatAt = microtime(true) + $this->options->heartbeat;
                $this->scheduleRefresh();
                $this->emit(new CallsEvent('connected'));
                return;
            }
            $this->frame($frame);
        }
        throw new TimeoutException('Calls readiness timed out.', 'request_timeout');
    }
    /** Poll socket reads using the supplied timeout; reconnect and REST work use their own bounded timeouts.
     * Call repeatedly while the application is running.
     * @return list<CallsEvent> */
    public function poll(float $timeout = 0.01, ?CancellationToken $cancellation = null): array
    {
        if ($timeout <= 0 || !is_finite($timeout)) {
            throw new ConfigurationException('pollTimeout');
        }
        $cancellation?->throwIfCancelled();
        $this->tokens->poll();
        if (!$this->closed) {
            if (!$this->connected && microtime(true) >= $this->retryAt) {
                try {
                    $this->open($cancellation);
                } catch (CancelledException $error) {
                    throw $error;
                } catch (PolymorfaException $error) {
                    $this->dropped($error);
                } catch (\Throwable) {
                    $this->dropped(new ConnectionException('Calls reconnect failed.', 'connection_error'));
                }
            }
            if ($this->connected) {
                try {
                    if (microtime(true) >= $this->refreshAt) {
                        try {
                            $replacement = $this->tokens->get(new CallsTokenRequest(true, $cancellation));
                            $this->socket?->send(json_encode(['type' => 'auth','token' => substr($replacement->credential->authorization(), 7)], JSON_THROW_ON_ERROR));
                            $this->token = $replacement;
                            $this->scheduleRefresh();
                        } catch (CancelledException $error) {
                            throw $error;
                        } catch (\Throwable $error) {
                            $this->refreshAt = microtime(true) + 5;
                            $this->emit(new CallsEvent('error', value:$error instanceof PolymorfaException ? $error : new ConnectionException('Calls token replacement failed.', 'token_provider_failed')));
                        }
                    }
                    $now = microtime(true);
                    if ($this->options->heartbeat > 0 && $now >= $this->beatAt) {
                        if ($this->awaitingPong) {
                            throw new TimeoutException('Calls heartbeat timed out.', 'request_timeout');
                        }
                        $this->socket?->send('{"type":"ping"}');
                        $this->awaitingPong = true;
                        $this->beatAt = $now + $this->options->heartbeat;
                    }
                    $frame = $this->read($timeout);
                    if ($frame !== null) {
                        $this->frame($frame);
                    }
                } catch (CancelledException $error) {
                    throw $error;
                } catch (PolymorfaException $error) {
                    $this->dropped($error);
                } catch (\Throwable) {
                    $this->dropped(new ConnectionException('Calls socket failed.', 'connection_error'));
                }
            }
            foreach ($this->calls as $call) {
                $call->pollMedia(0.001, $cancellation);
            }
        }
        $events = $this->events;
        $this->events = [];
        return $events;
    }
    /** @return array<string,mixed>|null */ private function read(float $timeout): ?array
    {
        $wire = $this->socket?->poll($timeout);
        if ($wire === null || $wire['binary']) {
            return null;
        }
        $data = json_decode($wire['data'], true);
        if (!is_array($data) || array_is_list($data)) {
            return null;
        }
        /** @var array<string,mixed> $data */ return $data;
    }
    /** @param array<string,mixed> $frame */ private function frame(array $frame): void
    {
        $type = $frame['type'] ?? null;
        if ($type === 'error' && is_string($frame['code'] ?? null)) {
            throw CallsSocketErrors::control($frame['code']);
        }
        if ($type === 'pong') {
            $this->awaitingPong = false;
            return;
        }
        if ($type !== 'event' || !is_string($frame['event'] ?? null) || !is_string($frame['callId'] ?? null)
            || !is_array($frame['payload'] ?? null) || array_is_list($frame['payload'])) {
            return;
        }
        /** @var array<string,mixed> $payload */ $payload = $frame['payload'];
        $id = $frame['callId'];
        $event = $frame['event'];
        if ($event === 'call.received') {
            if (($payload['direction'] ?? '') === 'outgoing' || isset($this->calls[$id]) || isset($this->ended[$id])) {
                return;
            }
            $from = is_string($payload['from'] ?? null) ? $payload['from'] : '';
            if (is_array($payload['from'] ?? null)) {
                foreach (['phoneNumber','lid','id'] as $key) {
                    if (is_string($payload['from'][$key] ?? null) && $payload['from'][$key] !== '') {
                        $from = $payload['from'][$key];
                        break;
                    }
                }
            }
            $call = new Call($this, $id, 'inbound', $from, ($payload['hasVideo'] ?? $payload['has_video'] ?? false) === true);
            $call->lifecycle('capabilities', $payload);
            $this->calls[$id] = $call;
            $this->replay($call);
            if ($call->state !== 'ended') {
                $this->emit(new CallsEvent('incoming', $call));
            }
            return;
        }
        if (isset($this->calls[$id])) {
            $this->calls[$id]->lifecycle($event, $payload);
            return;
        }
        if (isset($this->ended[$id])) {
            return;
        }
        if (!in_array($event, ['call.accepted','call.ended','call.missed','call.rejected','call.participant_joined','call.participant_state','call.participant_left'], true)) {
            return;
        }
        if (count($this->early) >= 128 && !isset($this->early[$id])) {
            array_shift($this->early);
        }
        if (in_array($event, ['call.ended','call.missed','call.rejected'], true)) {
            $this->early[$id] = [];
        }
        if (count($this->early[$id] ?? []) < 32) {
            $this->early[$id][] = ['event' => $event,'payload' => $payload];
        }
        if (in_array($event, ['call.ended','call.missed','call.rejected'], true)) {
            $this->rememberEnded($id);
        }
    }
    private function replay(Call $call): void
    {
        foreach ($this->early[$call->id] ?? [] as $frame) {
            $call->lifecycle($frame['event'], $frame['payload']);
        }
        unset($this->early[$call->id]);
    }
    private function dropped(PolymorfaException $error): void
    {
        $this->connected = false;
        $this->closeSocket();
        $this->refreshNext = $error instanceof AuthenticationException;
        if ($error instanceof AuthorizationException || $error instanceof ConfigurationException || $error instanceof CancelledException) {
            $this->closed = true;
        }
        $this->retryAt = microtime(true) + min($this->options->maxBackoff, $this->options->minBackoff * 2 ** min(10, $this->attempt++));
        $this->emit(new CallsEvent('error', value:$error));
    }
    public function placePhone(string $to, bool $video = false, ?CancellationToken $cancellation = null, ?bool $exclusive = null, ?string $idempotencyKey = null): Call
    {
        return $this->place(['to' => $to,'video' => $video], $to, $cancellation, $exclusive, $idempotencyKey);
    }
    /** @param list<string> $participants */ public function placeParticipants(array $participants, bool $video = false, ?CancellationToken $cancellation = null, ?bool $exclusive = null, ?string $idempotencyKey = null): Call
    {
        return $this->place(['participants' => $participants,'video' => $video], $participants[0] ?? '', $cancellation, $exclusive, $idempotencyKey);
    }
    public function placeGroup(string $groupId, bool $video = false, ?CancellationToken $cancellation = null, ?bool $exclusive = null, ?string $idempotencyKey = null): Call
    {
        return $this->place(['groupId' => $groupId,'video' => $video], $groupId, $cancellation, $exclusive, $idempotencyKey);
    }
    /** @param array{to?:string,participants?:list<string>,groupId?:string,video:bool} $body */
    private function place(array $body, string $peer, ?CancellationToken $cancellation, ?bool $exclusive, ?string $idempotencyKey): Call
    {
        if ($this->closed) {
            throw new ConfigurationException('callsConnection');
        }
        $generation = $this->generation;
        $credential = $this->tokens->get(new CallsTokenRequest(cancellation:$cancellation))->credential;
        if ($this->disconnectedSince($generation)) {
            throw new CancelledException('Calls placement cancelled.', 'request_cancelled');
        }
        if ($exclusive !== null) {
            $body['exclusive'] = $exclusive;
        }
        if ($credential->kind !== 'client_token') {
            $body['session'] = $this->options->session ?? throw new ConfigurationException('session');
            if ($this->options->participant !== null) {
                $body['participant'] = $this->options->participant;
            }
        }
        $response = $this->api($cancellation)->place($body, (new RequestOptions(idempotencyKey:$idempotencyKey, cancellation:$cancellation))->withIdempotencyKey());
        if ($this->disconnectedSince($generation)) {
            try {
                $this->api()->end($response->data['data']['callId'], new RequestOptions(timeout:5, maxNetworkRetries:0));
            } catch (\Throwable) {
            } throw new CancelledException('Calls disconnected while placement was pending.', 'request_cancelled');
        }
        $this->poll(0.001, $cancellation);
        $id = $response->data['data']['callId'];
        $call = new Call($this, $id, 'outbound', $peer, $response->data['data']['video'], $exclusive === true);
        $this->calls[$id] = $call;
        $this->replay($call);
        return $call;
    }
    /** @internal */ public function media(Call $call, bool $refresh = false, ?CancellationToken $cancellation = null): MediaSocket
    {
        $credential = $this->tokens->get(new CallsTokenRequest($refresh, $cancellation))->credential;
        return new MediaSocket(
            $credential,
            $call->id,
            $call->connectionId,
            $credential->kind === 'client_token' ? null : $this->options->participant,
            $this->options->baseUrl,
            $this->options->connectTimeout,
            $this->connector
        );
    }
    /** @internal */ public function serverParticipant(): ?string
    {
        return $this->tokens->get()->credential->kind === 'client_token' ? null : $this->options->participant;
    }
    /** @internal */ public function finished(Call $call): void
    {
        unset($this->calls[$call->id]);
        $this->rememberEnded($call->id);
    }
    private function rememberEnded(string $id): void
    {
        $this->ended[$id] = true;
        if (count($this->ended) > 256) {
            array_shift($this->ended);
        }
    }
    public function disconnect(): void
    {
        $this->closed = true;
        ++$this->generation;
        $this->connected = false;
        $this->closeSocket();
        foreach (array_values($this->calls) as $call) {
            try {
                $call->disconnect();
            } catch (\Throwable) {
                $call->finish('left');
            }
        }
        $this->calls = [];
        $this->early = [];
    }
    private function scheduleRefresh(): void
    {
        $expiry = $this->token?->expiresAt;
        if ($expiry === null) {
            $this->refreshAt = INF;
            return;
        }
        $now = microtime(true);
        $remaining = $expiry - $now;
        $lead = $this->options->refreshBeforeExpiry;
        $this->refreshAt = $now + max(1, $remaining > $lead * 2 ? $remaining - $lead : $remaining / 2);
    }
    private function disconnectedSince(int $generation): bool
    {
        return $this->closed || $generation !== $this->generation;
    }
    private function closeSocket(): void
    {
        try {
            $this->socket?->close();
        } catch (\Throwable) {
        } $this->socket = null;
    }
}
