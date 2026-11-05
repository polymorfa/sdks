<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

final class HistoryKeys
{
    /**
     * @var array<string,string> */ private array $chats = [];
    /**
     * @var array<string,string> */ private array $contacts = [];
    /**
     * @var array<string,list<array{nativeId:string,id:string,chatId:string,fromMe?:bool|null}>> */ private array $messages = [];
    /**
     * @param array<string,mixed> $chunk */
    public function __construct(?HistoryIdentityIndex $index = null, array $chunk = [])
    {
        $index ??= new HistoryIdentityIndex();
        foreach ($index->conversations as $jid => $id) {
            $this->chats[self::normalize($jid)] = $id;
        }
        foreach ($index->contacts as $jid => $id) {
            $this->contacts[self::normalize($jid)] = $id;
        }
        foreach ($index->messages as $message) {
            $this->messages[$message['nativeId']][] = $message;
        }
        foreach (Reduction::records($chunk['conversations'] ?? null) as $conversation) {
            $jid = Reduction::text($conversation['id'] ?? null);
            if ($jid === null || isset($this->chats[self::normalize($jid)])) {
                continue;
            } $found = [];
            foreach (Reduction::records($conversation['messages'] ?? null) as $entry) {
                $key = Reduction::record(Reduction::record($entry['message'] ?? null)['key'] ?? null);
                $native = Reduction::text($key['id'] ?? null);
                $mine = $key['fromMe'] ?? null;
                foreach ($this->messages[$native ?? ''] ?? [] as $candidate) {
                    if (($candidate['fromMe'] ?? null) === null || $mine === null || $candidate['fromMe'] === $mine) {
                        $found[$candidate['chatId']] = true;
                    }
                }
            }
            if (count($found) === 1) {
                $this->chats[self::normalize($jid)] = (string)array_key_first($found);
            }
        }
    }
    public static function normalize(string $jid): string
    {
        $parts = explode('@', $jid, 2);
        return strtolower(count($parts) === 2 ? explode('_', explode(':', $parts[0], 2)[0], 2)[0].'@'.$parts[1] : $jid);
    }
    public function chat(string $jid): string
    {
        $bare = self::normalize($jid);
        return $this->chats[$bare] ?? 'wa:'.$bare;
    }
    public function contact(string $jid): string
    {
        $bare = self::normalize($jid);
        return $this->contacts[$bare] ?? (Reduction::chatKind($bare) === 'direct' ? ($this->chats[$bare] ?? 'wa:'.$bare) : 'wa:'.$bare);
    }
    /**
     * @param array<string,mixed> $key */
    public function message(array $key, string $chatJid): ?string
    {
        $native = Reduction::text($key['id'] ?? null);
        if ($native === null) {
            return null;
        }
        $jid = self::normalize(Reduction::text($key['remoteJid'] ?? null) ?? $chatJid);
        $mine = ($key['fromMe'] ?? null) === true;
        $chat = $this->chat($jid);
        $candidates = array_values(array_filter($this->messages[$native] ?? [], static fn (array $item): bool => $item['chatId'] === $chat && (($item['fromMe'] ?? null) === null || $item['fromMe'] === $mine)));
        if (count($candidates) === 1) {
            return $candidates[0]['id'];
        }
        $participant = Reduction::text($key['participant'] ?? null);
        $sender = !$mine && Reduction::chatKind($jid) === 'group' && $participant !== null ? self::normalize($participant) : '';
        return 'wa:'.$jid.':'.($mine ? '1' : '0').':'.$sender.':'.$native;
    }
}
