<?php

declare(strict_types=1);

namespace Polymorfa;

/** Bounded, best-effort diagnostics; failures never alter call state.
 * @phpstan-import-type Report from VoipModels */
final class CallReporter
{
    private bool $stopped = false;
    private float $lastQuality = -INF;
    private float $minute = 0;
    private int $errors = 0;
    /** @var \Closure():float */ private readonly \Closure $now;
    /** @param callable():float|null $now */ public function __construct(private readonly CallsClient $client, private readonly Call $call, ?callable $now = null)
    {
        $this->now = \Closure::fromCallable($now ?? static fn (): float => microtime(true));
    }
    public function stop(): void
    {
        $this->stopped = true;
    }
    public function error(string $code): void
    {
        if (!in_array($code, ['media_permission_denied','device_not_found','device_in_use','ice_failed','negotiation_failed','media_timeout','reconnect_exhausted','token_refresh_failed','unsupported_browser','other'], true)) {
            $code = 'other';
        }
        $now = ($this->now)();
        if ($now - $this->minute >= 60) {
            $this->minute = $now;
            $this->errors = 0;
        }
        if ($this->stopped || $this->errors >= 20) {
            return;
        } ++$this->errors;
        $this->send(['kind' => 'error','error' => ['code' => $code]]);
    }
    /** @param array<string,mixed> $figures */ public function quality(array $figures): void
    {
        $now = ($this->now)();
        if ($this->stopped || $now - $this->lastQuality < 5) {
            return;
        }
        $quality = [];
        foreach (['rttMs' => 60000,'jitterMs' => 60000,'packetsLost' => 2147483647,'packetsReceived' => 2147483647,'reconnects' => 1000] as $key => $max) {
            $value = $figures[$key] ?? null;
            if ((is_int($value) || is_float($value)) && is_finite((float)$value)) {
                $quality[$key] = (int)max(0, min($max, $value));
            }
        }
        foreach (['audioCodec','videoCodec'] as $key) {
            $value = $figures[$key] ?? null;
            if (is_string($value) && preg_match('/^[A-Za-z0-9\/.-]{1,32}$/D', $value)) {
                $quality[$key] = $value;
            }
        }
        if (in_array($figures['candidateType'] ?? null, ['host','srflx','prflx','relay'], true)) {
            $quality['candidateType'] = $figures['candidateType'];
        }
        if ($quality === []) {
            return;
        } $this->lastQuality = $now;
        $this->send(['kind' => 'quality','quality' => $quality]);
    }
    /** @param array<string,mixed> $body */ private function send(array $body): void
    {
        $body['connectionId'] = $this->call->connectionId;
        $participant = $this->client->serverParticipant();
        if ($participant !== null) {
            $body['participant'] = $participant;
        }
        $body['client'] = ['sdk' => 'polymorfa/sdk','version' => '0.1.0','platform' => 'other'];
        try {
            /** @var Report $body */
            $this->client->api()->report($this->call->id, $body, new RequestOptions(timeout:5, maxNetworkRetries:0));
        } catch (PolymorfaException $error) {
            if ($error->status !== null && $error->status >= 400 && $error->status < 500 && $error->status !== 429) {
                $this->stopped = true;
            }
        } catch (\Throwable) {
        }
    }
}
