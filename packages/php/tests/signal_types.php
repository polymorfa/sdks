<?php

declare(strict_types=1);

namespace Polymorfa\Tests;

use Polymorfa\{SignalEvent,SignalSendRequest,SignalSidecarClient,SignalWebhooks};

final class SignalTypes
{
    public static function consumer(SignalSidecarClient $client, string $raw, string $signature, string $timestamp, string $eventId, string $secret): void
    {
        $client->health();
        foreach ($client->connections()->connections as $connection) {
            self::text($connection->id);
            self::number($connection->leaseGeneration);
        }
        self::text($client->send('connection', new SignalSendRequest('target@lid', 'Hello'))->messageId);
        $stream = $client->events('connection');
        foreach ($stream as $event) {
            self::text($event->messageProto);
            self::number($event->timestamp);
            if ($event->history?->syncType !== null) {
                self::number($event->history->syncType);
            }
            $client->acknowledge($event->id);
            break;
        }
        $stream->close();
        $result = SignalWebhooks::process($raw, $signature, $timestamp, $eventId, $secret, static fn (SignalEvent $event): bool => true);
        self::text($result['event']->rawJson);
    }
    private static function text(string $value): void
    {
    }
    private static function number(int $value): void
    {
    }
}
