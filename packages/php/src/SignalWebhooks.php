<?php

declare(strict_types=1);

namespace Polymorfa;

final class SignalWebhooks
{
    public static function constructEvent(#[\SensitiveParameter] string $raw, string $signature, string $timestamp, string $eventId, #[\SensitiveParameter] string $secret, int $toleranceSeconds = 300, ?int $nowUnixSeconds = null): SignalEvent
    {
        $invalid = static function (): never {
            throw new WebhookSignatureException('Signal webhook verification failed.', 'invalid_signal_webhook_signature');
        };
        if ($toleranceSeconds < 0) {
            throw new ConfigurationException('tolerance');
        }if (!SignalCodec::secret($secret) || strlen($raw) > SignalCodec::MAX_BYTES || !preg_match('/^v1=[a-f0-9]{64}$/D', $signature) || !preg_match('/^[0-9]{1,19}$/D', $timestamp) || $eventId === '') {
            $invalid();
        }
        $seconds = filter_var($timestamp, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
        $now = $nowUnixSeconds ?? time();
        if ($seconds === false || abs($now - $seconds) > $toleranceSeconds || !hash_equals('v1='.hash_hmac('sha256', $timestamp.'.'.$raw, $secret), $signature)) {
            $invalid();
        }
        try {
            $event = SignalEvent::fromJson($raw);
        } catch (SignalSidecarException) {
            $invalid();
        }if ($event->id !== $eventId) {
            $invalid();
        }return $event;
    }
    /** @param \Closure(SignalEvent):mixed $persistOnce */
    private static function apply(\Closure $persistOnce, SignalEvent $event): bool
    {
        $result = $persistOnce($event);
        if (!is_bool($result)) {
            throw new SignalSidecarException('Signal webhook persistence was not confirmed.', 'signal_webhook_persistence_failed');
        }
        return $result;
    }
    /** persistOnce must atomically deduplicate and durably commit the event and
     * effects. true means newly applied, false means already applied. An HTTP
     * handler may return 2xx only after this succeeds; no in-memory fallback.
     * @param \Closure(SignalEvent):bool $persistOnce
     * @return array{event:SignalEvent,duplicate:bool} */
    public static function process(#[\SensitiveParameter] string $raw, string $signature, string $timestamp, string $eventId, #[\SensitiveParameter] string $secret, \Closure $persistOnce, int $toleranceSeconds = 300, ?int $nowUnixSeconds = null): array
    {
        $event = self::constructEvent($raw, $signature, $timestamp, $eventId, $secret, $toleranceSeconds, $nowUnixSeconds);
        try {
            $applied = self::apply($persistOnce, $event);
        } catch (\Throwable) {
            throw new SignalSidecarException('Signal webhook persistence was not confirmed.', 'signal_webhook_persistence_failed');
        }
        return ['event' => $event,'duplicate' => !$applied];
    }
}
