<?php

declare(strict_types=1);
/** Checks the public webhook union's consumer narrowing with PHPStan. */
function typedWebhookConsumer(Polymorfa\WebhookEvent $event): void
{
    $known = $event->knownEvent();
    if ($known === null) {
        return;
    }
    switch ($known['event']) {
        case 'customer.pairing_link.connected':
            typedWebhookString($known['payload']['pairingLinkId']);
            typedWebhookString($known['payload']['sessionId']);
            break;
        case 'call.ended':
            typedWebhookNumber($known['payload']['durationSeconds']);
            if ($known['payload']['from'] !== null) {
                typedWebhookString($known['payload']['from']['id']);
            }
            break;
        case 'order.payment_updated':
            if ($known['payload']['kind'] === 'payment_method_selected') {
                typedWebhookString($known['payload']['paymentMethod']);
            } else {
                typedWebhookString($known['payload']['status']);
            }
            break;
        case 'campaign.rescheduled':
            typedWebhookNumber($known['payload']['rescheduledAt']);
            break;
        case 'bansafe.claim':
            typedWebhookNumber($known['payload']['amountCents']);
            break;
        case 'session.capabilities_updated':
            foreach ($known['payload']['changedKeys'] as $key) {
                typedWebhookString($key);
            }
            break;
        case 'message.received':
            if (is_int($known['payload']['timestamp']) || is_float($known['payload']['timestamp'])) {
                typedWebhookBoolean($known['payload']['fromMe']);
            } else {
                typedWebhookString($known['payload']['timestamp']);
            }
            break;
    }
}
function typedWebhookString(string $value): void
{
    echo $value;
}
function typedWebhookNumber(int|float $value): void
{
    echo $value;
}
function typedWebhookBoolean(bool $value): void
{
    echo $value;
}
