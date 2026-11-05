<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

final readonly class HistoryIdentityIndex
{
    /**
     * @param array<string,string> $conversations
     * @param array<string,string> $contacts
     * @param list<array{nativeId:string,id:string,chatId:string,fromMe?:bool|null}> $messages */
    public function __construct(public array $conversations = [], public array $contacts = [], public array $messages = [])
    {
    }
    /**
     * @param array<string,mixed> $payload */
    public static function fromPayload(array $payload): self
    {
        $messages = [];
        foreach (Reduction::records($payload['messages'] ?? null) as $message) {
            $native = Reduction::text(Reduction::record($message['whatsapp_ids'] ?? null)['linked_devices'] ?? null);
            $chat = Reduction::text(Reduction::record($message['conversation'] ?? null)['id'] ?? null);
            $id = Reduction::text($message['id'] ?? null);
            if ($native !== null && $chat !== null && $id !== null) {
                $messages[] = ['nativeId' => $native,'id' => $id,'chatId' => $chat,'fromMe' => is_bool($message['fromMe'] ?? null) ? $message['fromMe'] : null];
            }
        }
        return new self(messages:$messages);
    }
}
