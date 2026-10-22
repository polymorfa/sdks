<?php

declare(strict_types=1);

namespace Polymorfa\Tests;

use Polymorfa\{MessagingClient,WhatsAppMediaSendDescriptor};

final class MediaSendTypes
{
    public static function consumer(MessagingClient $client, WhatsAppMediaSendDescriptor $image, WhatsAppMediaSendDescriptor $audio, WhatsAppMediaSendDescriptor $sticker): void
    {
        $client->messages->send('session', ['conversation' => ['id' => 'conversation'],'content' => ['image' => ['descriptor' => $image,'caption' => 'caption']]]);
        $client->messages->send('session', ['conversation' => ['id' => 'conversation'],'content' => ['voice' => ['descriptor' => $audio,'ptt' => true]]]);
        $response = $client->messages->send('session', ['conversation' => ['id' => 'conversation'],'content' => ['sticker' => ['descriptor' => $sticker]]]);
        $content = $response->data['data']['content'] ?? [];
        if (isset($content['sticker'])) {
            self::descriptor($content['sticker']['descriptor']);
        }
    }
    private static function descriptor(WhatsAppMediaSendDescriptor $descriptor): void
    {
    }
}
