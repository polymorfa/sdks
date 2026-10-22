<?php

declare(strict_types=1);

namespace Polymorfa\Tests;

use Polymorfa\{HistorySyncCodec,HistorySyncData,MessagingClient};

final class HistoryTypes
{
    public static function consumer(MessagingClient $client, string $compressed): void
    {
        $chunk = HistorySyncCodec::download($compressed, decoder:static fn (string $raw): string => hash('sha256', $raw));
        self::history($chunk);
        foreach ($chunk->conversations as $conversation) {
            self::text($conversation->id);
            foreach ($conversation->messages as $message) {
                self::text($message->protobuf);
            }
        }
        self::text($client->historySync->requestChunkRetry('session', ['syncType' => 'FULL','chunkOrder' => 0])->data['data']['requestId']);
        self::text($client->historySync->deleteChunk('session', '/fixture', str_repeat('x', 32))->data['data']['status']);
    }
    private static function text(string $value): void
    {
    }
    private static function history(HistorySyncData $value): void
    {
    }
}
