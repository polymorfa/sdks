<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

use Polymorfa\WebhookEvent;

/** Deterministic handwritten policy for the 24 stored native webhook kinds. */
final class EventReducer
{
    public const TYPES = ['blocklist.update','chat.archive','chat.clear','chat.delete','chat.mute','chat.read','contact.update','group.participant','group.update','history.sync','labels.update','message.ack','message.delete','message.edited','message.reaction','message.received','message.revoked','message.sent','message.update','message.vote','newsletter.update','session.connected','session.logged_out','session.status'];
    public static function reduce(WebhookEvent $event): Batch
    {
        return new Batch($event->session, self::operations($event->event, $event->session, Reduction::record($event->payload), Reduction::iso($event->timestamp)), $event->id, $event->event);
    }
    public static function ackStatus(?string $v): ?string
    {
        return $v === null ? null : (['pending' => 'pending','error' => 'failed','failed' => 'failed','sent' => 'sent','server' => 'sent','server_ack' => 'sent','delivered' => 'delivered','delivery' => 'delivered','delivery_ack' => 'delivered','read' => 'read','read-self' => 'read','read_self' => 'read','played' => 'played','played-self' => 'played'][strtolower($v)] ?? null);
    }

    /**
     * @param array<string,mixed> $p
     * @return list<Upsert|Delete|ClearChat|Checkpoint> */
    private static function operations(string $kind, string $s, array $p, int|float $at): array
    {
        if (in_array($kind, ['message.received','message.update','message.edited','message.sent'], true)) {
            return self::message($s, $p, $at, $kind === 'message.edited' || ($p['edited'] ?? null) === true, $kind === 'message.sent');
        }
        if (in_array($kind, ['message.reaction','message.revoked','message.delete','message.ack','message.vote'], true)) {
            return self::action($kind, $s, $p, $at);
        }
        $f = [];
        if (in_array($kind, ['chat.archive','chat.mute','chat.read','chat.clear','chat.delete'], true)) {
            $chat = Reduction::text(Reduction::record($p['from'] ?? null)['id'] ?? null);
            if ($chat === null || !$at) {
                return [];
            }
            if ($kind === 'chat.archive') {
                foreach (['archived' => 'archive','pinned' => 'pinned'] as $target => $source) {
                    Reduction::put($f, $target, array_key_exists($source, $p) ? $p[$source] : Unspecified::Value, $at);
                }
            } elseif ($kind === 'chat.mute') {
                Reduction::put($f, 'muted', array_key_exists('muted', $p) ? $p['muted'] : Unspecified::Value, $at);
                Reduction::put($f, 'muteEndAt', ($p['muted'] ?? false) ? Reduction::millis($p['muteEndTimestamp'] ?? null) : null, $at);
            } elseif ($kind === 'chat.read') {
                Reduction::put($f, 'markedUnread', !($p['read'] ?? false), $at);
                if ($p['read'] ?? false) {
                    Reduction::put($f, 'unreadCount', 0, $at);
                }
            } else {
                Reduction::put($f, $kind === 'chat.clear' ? 'clearedAt' : 'deletedAt', $at, $at);
                return [new Upsert('chats', ['sessionId' => $s,'chatId' => $chat], $f),new ClearChat($s, $chat, $at)];
            }
            return $f === [] ? [] : [new Upsert('chats', ['sessionId' => $s,'chatId' => $chat], $f)];
        }
        if (in_array($kind, ['session.connected','session.status','session.logged_out'], true)) {
            if ($kind === 'session.connected') {
                Reduction::put($f, 'connected', true, $at);
                foreach (['phoneNumber' => 'phoneNumber','waId' => 'id','pushName' => 'pushName','phonePlatform' => 'phonePlatform','accountType' => 'accountType','businessName' => 'businessName'] as $target => $source) {
                    Reduction::present($f, $target, Reduction::text($p[$source] ?? null), $at);
                }
            } elseif ($kind === 'session.status') {
                if (!is_string($p['status'] ?? null)) {
                    return [];
                } Reduction::put($f, 'status', $p['status'], $at);
                Reduction::put($f, 'statusReason', $p['statusReason'] ?? null, $at);
            } else {
                Reduction::put($f, 'connected', false, $at);
                Reduction::present($f, 'loggedOutReason', Reduction::text($p['reason'] ?? null), $at);
                Reduction::present($f, 'loggedOutCode', Reduction::number($p['code'] ?? null), $at);
            }
            return [new Upsert('sessions', ['sessionId' => $s], $f)];
        }
        if ($kind === 'contact.update') {
            $id = Reduction::text($p['id'] ?? null);
            if ($id === null) {
                return [];
            }
            foreach (['phoneNumber','bsuid','username','fullName','firstName','pushName','businessName'] as $name) {
                Reduction::present($f, $name, Reduction::text($p[$name] ?? null), $at);
            }
            if (($p['pictureRemoved'] ?? null) === true) {
                Reduction::put($f, 'pictureId', null, $at);
            } else {
                Reduction::present($f, 'pictureId', Reduction::text($p['pictureId'] ?? null), $at);
            }
            return $f === [] ? [] : [new Upsert('contacts', ['sessionId' => $s,'contactId' => $id], $f)];
        }
        if ($kind === 'blocklist.update') {
            $ops = [];
            foreach (Reduction::records($p['changes'] ?? null) as $change) {
                $id = Reduction::text($change['id'] ?? null);
                $action = strtolower(Reduction::text($change['action'] ?? null) ?? '');
                if ($id === null || !in_array($action, ['block','unblock'], true)) {
                    continue;
                } $f = ['blocked' => new FieldWrite($action === 'block', $at)];
                Reduction::present($f, 'phoneNumber', Reduction::text($change['phoneNumber'] ?? null), $at);
                $ops[] = new Upsert('contacts', ['sessionId' => $s,'contactId' => $id], $f);
            } return $ops;
        }
        if ($kind === 'group.update') {
            $id = Reduction::text($p['id'] ?? null);
            if ($id === null) {
                return [];
            }
            foreach (['subject' => 'newSubject','lastAction' => 'action','inviteLink' => 'inviteLink'] as $target => $source) {
                Reduction::present($f, $target, Reduction::text($p[$source] ?? null), $at);
            }
            foreach (['description' => 'newDescription','joinApprovalRequired' => 'joinApprovalRequired'] as $target => $source) {
                Reduction::put($f, $target, array_key_exists($source, $p) ? $p[$source] : Unspecified::Value, $at);
            }
            $chat = ['kind' => new FieldWrite('group', 0)];
            Reduction::present($chat, 'name', Reduction::text($p['newSubject'] ?? null), $at);
            return [new Upsert('groups', ['sessionId' => $s,'groupId' => $id], $f),new Upsert('chats', ['sessionId' => $s,'chatId' => $id], $chat)];
        }
        if ($kind === 'group.participant') {
            $group = Reduction::text($p['id'] ?? null);
            if ($group === null) {
                return [];
            } $ops = [new Upsert('groups', ['sessionId' => $s,'groupId' => $group], [])];
            foreach (['joined','left','promoted','demoted'] as $action) {
                foreach (Reduction::records($p[$action] ?? null) as $person) {
                    $id = Reduction::text($person['id'] ?? null);
                    if ($id === null) {
                        continue;
                    }
                    $f = match($action) {
                        'joined' => ['active' => new FieldWrite(true, $at),'role' => new FieldWrite('member', $at),'leaveReason' => new FieldWrite(null, $at)], 'left' => ['active' => new FieldWrite(false, $at),'leaveReason' => new FieldWrite(Reduction::text($p['reason'] ?? null) ?? 'left', $at)], default => ['role' => new FieldWrite($action === 'promoted' ? 'admin' : 'member', $at)]
                    };
                    Reduction::present($f, 'phoneNumber', Reduction::text($person['phoneNumber'] ?? null), $at);
                    Reduction::put($f, 'changedAt', $at, $at);
                    $ops[] = new Upsert('group_participants', ['sessionId' => $s,'groupId' => $group,'participantId' => $id], $f);
                }
            } return $ops;
        }
        if ($kind === 'newsletter.update') {
            $id = Reduction::text($p['id'] ?? null);
            if ($id === null) {
                return [];
            } $f['kind'] = new FieldWrite('channel', 0);
            Reduction::put($f, 'muted', array_key_exists('muted', $p) ? $p['muted'] : Unspecified::Value, $at);
            return [new Upsert('chats', ['sessionId' => $s,'chatId' => $id], $f)];
        }
        if ($kind === 'history.sync' && ($p['kind'] ?? null) !== 'history') {
            return HistoryReducer::progress($s, HistoryReducer::syncType($p['syncType'] ?? null), Reduction::number($p['chunkOrder'] ?? null), Reduction::number($p['progress'] ?? null), Reduction::number($p['conversationCount'] ?? null), Reduction::number($p['messageCount'] ?? null), Reduction::number($p['pushNameCount'] ?? null));
        }
        if ($kind === 'labels.update') {
            $version = Reduction::millis($p['observedAt'] ?? null) ?? $at;
            $label = Reduction::text($p['labelId'] ?? null);
            $action = $p['action'] ?? null;
            if ($action === 'label_edit' && $label !== null) {
                Reduction::present($f, 'name', Reduction::text($p['name'] ?? null) ?? Reduction::text($p['label'] ?? null), $version);
                foreach (['color','orderIndex'] as $name) {
                    Reduction::present($f, $name, Reduction::number($p[$name] ?? null), $version);
                } Reduction::put($f, 'deleted', $p['deleted'] ?? false, $version);
                return [new Upsert('labels', ['sessionId' => $s,'labelId' => $label], $f)];
            }
            if (in_array($action, ['label_association_chat','label_association_message'], true) && $label !== null && is_bool($p['labeled'] ?? null)) {
                $target = $action === 'label_association_chat' ? Reduction::text(Reduction::record($p['from'] ?? null)['id'] ?? null) : Reduction::text($p['messageId'] ?? null);
                if ($target !== null) {
                    return [new Upsert('label_associations', ['sessionId' => $s,'labelId' => $label,'targetKind' => $action === 'label_association_chat' ? 'chat' : 'message','targetId' => $target], ['labeled' => new FieldWrite($p['labeled'], $version),'changedAt' => new FieldWrite($version, $version)])];
                }
            }
            if ($action === 'star' && Reduction::text($p['messageId'] ?? null) !== null && is_bool($p['starred'] ?? null)) {
                Reduction::put($f, 'starred', $p['starred'], $version);
                Reduction::present($f, 'chatId', Reduction::text(Reduction::record($p['from'] ?? null)['id'] ?? null), 0);
                return [new Upsert('messages', ['sessionId' => $s,'messageId' => $p['messageId']], $f)];
            }
        }
        return [];
    }

    /**
     * @param array<string,mixed> $p
     * @return array{string,string,int|float|null,bool,string|null}|null */
    private static function identity(array $p): ?array
    {
        $id = Reduction::text($p['id'] ?? null);
        $conversation = Reduction::record($p['conversation'] ?? null);
        $chat = Reduction::text($conversation['id'] ?? null);
        if ($id === null || $chat === null) {
            return null;
        } $mine = ($p['fromMe'] ?? null) === true;
        $sender = $mine ? 'self' : (Reduction::text(Reduction::record($conversation['sender'] ?? null)['id'] ?? null) ?? (($p['isGroup'] ?? null) === true ? null : $chat));
        return [$id,$chat,Reduction::millis($p['timestamp'] ?? null),$mine,$sender];
    }
    /**
     * @param array<string,mixed> $p
     * @return list<Upsert> */
    private static function chat(string $s, array $p, int|float|null $timestamp, ?bool $group): array
    {
        $c = Reduction::record($p['conversation'] ?? null);
        $id = Reduction::text($c['id'] ?? null);
        if ($id === null) {
            return [];
        } $f = [];
        if ($group !== null) {
            $f['kind'] = new FieldWrite($group ? 'group' : 'direct', 0);
        }
        if ($group !== true) {
            foreach (['phoneNumber','bsuid','username'] as $name) {
                Reduction::present($f, $name, Reduction::text($c[$name] ?? null), $timestamp ?? 0);
            }
        }
        Reduction::present($f, 'lastMessageAt', $timestamp, $timestamp ?? 0);
        return [new Upsert('chats', ['sessionId' => $s,'chatId' => $id], $f)];
    }
    /**
     * @param array<string,mixed> $p
     * @return array<string,FieldWrite> */
    private static function content(array $p, int|float $version): array
    {
        $f = Reduction::cleared(Reduction::CONTENT, $version);
        Reduction::put($f, 'text', Reduction::text($p['text'] ?? null) ?? Reduction::text(Reduction::record($p['text'] ?? null)['body'] ?? null), $version);
        foreach (['caption' => 'caption','mimeType' => 'mimeType','fileName' => 'filename','displayName' => 'displayName','title' => 'title'] as $target => $source) {
            Reduction::put($f, $target, Reduction::text($p[$source] ?? null), $version);
        }
        foreach (['latitude','longitude'] as $name) {
            Reduction::put($f, $name, Reduction::number($p[$name] ?? null), $version);
        }
        Reduction::put($f, 'pollOptions', $p['pollOptions'] ?? null, $version);
        $extra = array_intersect_key($p, array_flip(['ptt','nativeFlowResponse','replyChoice','unavailable','unavailableReason','interactive','referral']));
        Reduction::put($f, 'extra', $extra === [] ? null : (object)$extra, $version);
        return $f;
    }
    /**
     * @param array<string,mixed> $p
     * @return list<Upsert> */
    private static function message(string $s, array $p, int|float $at, bool $edit, bool $sent): array
    {
        if ($sent) {
            $p['fromMe'] = true;
        } $identity = self::identity($p);
        if ($identity === null) {
            return [];
        } [$id,$chat,$timestamp,$mine,$sender] = $identity;
        $kind = Reduction::text($p['type'] ?? null);
        if (in_array($kind, ['reaction','revoke'], true)) {
            return self::action($kind === 'reaction' ? 'message.reaction' : 'message.revoked', $s, $p, $at);
        }
        $f = ['chatId' => new FieldWrite($chat, 0),'fromMe' => new FieldWrite($mine, 0)];
        Reduction::present($f, 'senderId', $sender, 0);
        if (!$edit) {
            $f['timestamp'] = new FieldWrite($timestamp ?? 0, 0);
        }
        $ids = Reduction::record($p['whatsapp_ids'] ?? null);
        Reduction::present($f, 'waMessageId', Reduction::text($ids['linked_devices'] ?? null), 0);
        Reduction::present($f, 'cloudMessageId', Reduction::text($ids['official_api'] ?? null), 0);
        $guard = $timestamp === null ? null : new Watermark($s, $chat, $timestamp);
        $group = is_bool($p['isGroup'] ?? null) ? $p['isGroup'] : null;
        $key = ['sessionId' => $s,'messageId' => $id];
        if ($sent) {
            Reduction::present($f, 'type', $kind, 0);
            Reduction::status($f, 'sent', $timestamp);
            return [...self::chat($s, $p, $timestamp, null),new Upsert('messages', $key, $f, $guard)];
        }
        Reduction::present($f, 'quotedId', Reduction::text($p['parentMessageId'] ?? null), 0);
        if (!$mine) {
            Reduction::present($f, 'pushName', Reduction::text($p['pushName'] ?? null) ?? Reduction::text($p['senderName'] ?? null), 0);
        }
        if ($edit) {
            $version = $timestamp ?? $at;
            $f = array_replace($f, self::content($p, $version));
            $f['editedAt'] = new FieldWrite($version, $version);
        } else {
            Reduction::present($f, 'type', $kind, 0);
            $f = array_replace($f, self::content($p, 0));
        }
        $ops = [...self::chat($s, $p, $edit ? null : $timestamp, $group),new Upsert('messages', $key, $f, $guard)];
        if (Reduction::text($p['media'] ?? null) !== null || Reduction::text($p['mediaUrl'] ?? null) !== null || in_array($kind, ['image','video','audio','document','sticker'], true)) {
            $media = ['chatId' => new FieldWrite($chat, 0)];
            Reduction::present($media, 'kind', $kind, 0);
            foreach (['mimeType' => 'mimeType','fileName' => 'filename','descriptor' => 'media','downloadUrl' => 'mediaUrl'] as $target => $source) {
                Reduction::present($media, $target, Reduction::text($p[$source] ?? null), $edit ? ($timestamp ?? $at) : 0);
            } $ops[] = new Upsert('media', $key, $media, $guard);
        }
        $push = Reduction::text($p['pushName'] ?? null) ?? Reduction::text($p['senderName'] ?? null);
        if (!$mine && $sender !== null && $push !== null && $timestamp !== null) {
            $f = ['pushName' => new FieldWrite($push, $timestamp)];
            $c = Reduction::record($p['conversation'] ?? null);
            $ref = $group ? Reduction::record($c['sender'] ?? null) : $c;
            Reduction::present($f, 'phoneNumber', Reduction::text($ref['phoneNumber'] ?? null), $timestamp);
            $ops[] = new Upsert('contacts', ['sessionId' => $s,'contactId' => $sender], $f);
        }
        return $ops;
    }
    /**
     * @param array<string,mixed> $p
     * @return list<Upsert> */
    private static function action(string $kind, string $s, array $p, int|float $at): array
    {
        $identity = self::identity($p);
        $chat = Reduction::text(Reduction::record($p['conversation'] ?? null)['id'] ?? null);
        if ($kind === 'message.reaction') {
            $target = Reduction::text($p['reactionTo'] ?? null);
            if ($identity === null || $target === null || $identity[4] === null) {
                return [];
            } $v = $identity[2] ?? $at;
            return [new Upsert('reactions', ['sessionId' => $s,'messageId' => $target,'senderId' => $identity[4]], ['chatId' => new FieldWrite($identity[1], 0),'emoji' => new FieldWrite(is_string($p['reaction'] ?? null) ? $p['reaction'] : '', $v),'timestamp' => new FieldWrite($v, $v)])];
        }
        if (in_array($kind, ['message.revoked','message.delete'], true)) {
            $target = Reduction::text($p[$kind === 'message.revoked' ? 'revokedId' : 'id'] ?? null);
            if ($target === null || $chat === null || ($kind === 'message.revoked' && $identity === null)) {
                return [];
            } $f = Reduction::cleared(Reduction::CONTENT);
            $f['chatId'] = new FieldWrite($chat, 0);
            $f[$kind === 'message.revoked' ? 'revokedAt' : 'deletedAt'] = new FieldWrite($kind === 'message.revoked' ? ($identity[2] ?? $at) : $at, Rows::FINAL_VERSION);
            $key = ['sessionId' => $s,'messageId' => $target];
            return [new Upsert('messages', $key, $f),new Upsert('media', $key, Reduction::cleared(Reduction::MEDIA_SECRETS))];
        }
        if ($kind === 'message.ack') {
            $status = self::ackStatus(Reduction::text($p['type'] ?? null));
            if ($status === null || $chat === null) {
                return [];
            } $v = Reduction::millis($p['timestamp'] ?? null) ?? $at;
            $recipient = Reduction::text(Reduction::record($p['from'] ?? null)['id'] ?? null) ?? Reduction::text(Reduction::record($p['sender'] ?? null)['id'] ?? null) ?? $chat;
            $ops = [];
            foreach (Reduction::records($p['messages'] ?? null) as $entry) {
                $id = Reduction::text($entry['id'] ?? null);
                if ($id === null) {
                    continue;
                } $f = ['chatId' => new FieldWrite($chat, 0)];
                Reduction::status($f, $status, $v);
                $ops[] = new Upsert('messages', ['sessionId' => $s,'messageId' => $id], $f);
                $f['timestamp'] = $f['statusAt'];
                unset($f['statusAt']);
                $ops[] = new Upsert('receipts', ['sessionId' => $s,'messageId' => $id,'recipientId' => $recipient], $f);
            } return $ops;
        }
        if ($kind === 'message.vote') {
            $id = Reduction::text($p['pollMessageId'] ?? null);
            $voter = Reduction::text(Reduction::record($p['voter'] ?? null)['id'] ?? null);
            if ($id === null || $voter === null || $chat === null) {
                return [];
            } $v = Reduction::millis($p['timestamp'] ?? null) ?? $at;
            return [new Upsert('poll_votes', ['sessionId' => $s,'messageId' => $id,'voterId' => $voter], ['chatId' => new FieldWrite($chat, 0),'selectedHashes' => new FieldWrite($p['selectedHashes'] ?? [], $v),'timestamp' => new FieldWrite($v, $v)])];
        }
        return [];
    }
}
