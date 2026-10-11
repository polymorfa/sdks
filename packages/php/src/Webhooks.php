<?php

declare(strict_types=1);

namespace Polymorfa;

final class Webhooks
{
    public const KNOWN_TYPES = [
        'bansafe.action', 'bansafe.claim', 'bansafe.health_threshold', 'bansafe.incident', 'blocklist.update',
        'business.quick_reply.update', 'call.accepted', 'call.connection_joined', 'call.connection_left', 'call.ended',
        'call.missed', 'call.participant_joined', 'call.participant_left', 'call.participant_state', 'call.permission_changed',
        'call.received', 'call.rejected', 'call.telemetry', 'campaign.cap_reached', 'campaign.cold_blocked',
        'campaign.completed', 'campaign.failed', 'campaign.launched', 'campaign.paused', 'campaign.recipient_failed',
        'campaign.recipient_sent', 'campaign.recipient_skipped', 'campaign.rescheduled', 'campaign.resumed', 'campaign.stopped',
        'campaign.throttled', 'chat.archive', 'chat.clear', 'chat.delete', 'chat.mute', 'chat.read', 'command.result',
        'contact.opted_in', 'contact.opted_out', 'contact.sync', 'contact.update', 'customer.archived', 'customer.archiving',
        'customer.created', 'customer.enabled', 'customer.number.attached', 'customer.number.disconnected', 'customer.number.transferred',
        'customer.pairing_link.connected', 'customer.pairing_link.created', 'customer.pairing_link.expired', 'customer.pairing_link.failed',
        'customer.pairing_link.opened', 'customer.pairing_link.revoked', 'customer.restored', 'customer.updated', 'group.participant',
        'group.update', 'history.sync', 'labels.update', 'message.ack', 'message.delete', 'message.echo', 'message.edited',
        'message.failed', 'message.reaction', 'message.received', 'message.revoked', 'message.sent', 'message.update', 'message.vote',
        'newsletter.update', 'order.payment_updated', 'presence.update', 'session.capabilities_updated', 'session.connected',
        'session.logged_out', 'session.phone_offline', 'session.restriction_updated', 'session.status', 'template.status',
        'usage.recorded', 'voice.asset_failed', 'voice.asset_ready',
    ];
    public static function verifySignature(string $rawBody, string $signature, #[\SensitiveParameter] string $secret): bool
    {
        $normalized = str_starts_with($signature, 'sha256=') ? substr($signature, 7) : $signature;
        if ($secret === '' || !preg_match('/^[a-fA-F0-9]{64}$/D', $normalized)) {
            return false;
        }
        return hash_equals(hash_hmac('sha256', $rawBody, $secret), strtolower($normalized));
    }
    public static function constructEvent(string $rawBody, string $signature, #[\SensitiveParameter] string $secret): WebhookEvent
    {
        if (!self::verifySignature($rawBody, $signature, $secret)) {
            throw new WebhookSignatureException('Webhook signature verification failed.', 'invalid_webhook_signature');
        }
        return self::parseVerifiedEvent($rawBody);
    }
    public static function parseVerifiedEvent(string $rawBody): WebhookEvent
    {
        try {
            $value = json_decode($rawBody, true, 512, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            throw new ValidationException('Webhook body must be valid UTF-8 JSON.', 'invalid_webhook_json');
        }
        if (!is_array($value) || !isset($value['id'], $value['session'], $value['timestamp'], $value['event'])
            || !is_string($value['session']) || !array_key_exists('payload', $value)) {
            throw new ValidationException('Invalid webhook envelope.', 'invalid_webhook_event');
        }
        foreach (['id', 'timestamp', 'event'] as $key) {
            if (!is_string($value[$key]) || $value[$key] === '') {
                throw new ValidationException('Invalid webhook envelope.', 'invalid_webhook_event');
            }
        }
        /** @var array<string,mixed> $value */
        return new WebhookEvent($value['id'], $value['session'], $value['timestamp'], $value['event'], $value['payload'], $value, in_array($value['event'], self::KNOWN_TYPES, true));
    }
}
