<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

use Polymorfa\HistorySyncData;

/** Pure complete decoded-history reduction, source SDK 3bacf46. */
final class HistoryReducer
{
    public const TYPES = ['INITIAL_BOOTSTRAP' => 0,'INITIAL_STATUS_V3' => 1,'FULL' => 2,'RECENT' => 3,'PUSH_NAME' => 4,'NON_BLOCKING_DATA' => 5,'ON_DEMAND' => 6];
    public static function syncType(mixed $value): string
    {
        if (is_int($value) || is_float($value)) {
            foreach (self::TYPES as $name => $code) {
                if ($value == $code) {
                    return $name;
                }
            } return (string)$value;
        } return is_string($value) && $value !== '' ? (isset(self::TYPES[strtoupper($value)]) ? strtoupper($value) : $value) : 'UNKNOWN';
    }
    /**
     * @param array<string,int> $names */
    private static function enum(mixed $value, array $names): ?int
    {
        if (is_string($value)) {
            return $names[strtoupper($value)] ?? null;
        } $n = Reduction::number($value);
        return $n !== null && floor((float)$n) == $n ? (int)$n : null;
    }
    /**
     * @return list<Upsert> */
    public static function progress(string $session, string $type, int|float|null $order, int|float|null $progress, int|float|null $conversations = null, int|float|null $messages = null, int|float|null $pushnames = null): array
    {
        $ops = [];
        if ($order !== null) {
            $fields = [];
            foreach (['progress' => $progress,'conversationCount' => $conversations,'messageCount' => $messages,'pushnameCount' => $pushnames] as $name => $value) {
                Reduction::present($fields, $name, $value, 0);
            } $ops[] = new Upsert('history_chunks', ['sessionId' => $session,'syncType' => $type,'chunkOrder' => Rows::canonical($order)], $fields);
        }
        $fields = [];
        Reduction::present($fields, 'progress', $progress, $progress ?? 0);
        Reduction::present($fields, 'lastChunkOrder', $order, $order ?? 0);
        $ops[] = new Upsert('history_progress', ['sessionId' => $session,'syncType' => $type], $fields);
        return $ops;
    }
    /**
     * @param array<string,mixed> $content
     * @return array<string,mixed> */
    private static function unwrap(array $content): array
    {
        for ($i = 0; $i < 5; $i++) {
            $inner = null;
            foreach (['ephemeralMessage','viewOnceMessage','viewOnceMessageV2','documentWithCaptionMessage','editedMessage'] as $name) {
                $value = Reduction::record($content[$name] ?? null)['message'] ?? null;
                if ($value !== null) {
                    $inner = $value;
                    break;
                }
            } if (!is_array($inner) && !$inner instanceof \stdClass) {
                break;
            } $content = Reduction::record($inner);
        } return $content;
    }
    /**
     * @param array<string,mixed> $content
     * @return array{string,array<string,FieldWrite>,?string,array{string,array<string,mixed>}|null}|null */
    private static function content(array $content, int|float $version): ?array
    {
        $fields = Reduction::cleared(Reduction::CONTENT, $version);
        $quoted = null;
        $media = null;
        if (Reduction::text($content['conversation'] ?? null) !== null) {
            $kind = 'text';
            $fields['text'] = new FieldWrite($content['conversation'], $version);
        } elseif (!empty($content['extendedTextMessage'])) {
            $kind = 'text';
            $m = Reduction::record($content['extendedTextMessage']);
            $fields['text'] = new FieldWrite(Reduction::text($m['text'] ?? null), $version);
            $quoted = Reduction::text(Reduction::record($m['contextInfo'] ?? null)['stanzaId'] ?? null);
        } else {
            $selected = null;
            foreach (['imageMessage' => 'image','videoMessage' => 'video','ptvMessage' => 'video','audioMessage' => 'audio','documentMessage' => 'document','stickerMessage' => 'sticker'] as $name => $type) {
                if (!empty($content[$name])) {
                    $selected = [$name,$type];
                    break;
                }
            }
            if ($selected !== null) {
                [$name,$kind] = $selected;
                $m = Reduction::record($content[$name]);
                foreach (['caption' => 'caption','mimeType' => 'mimetype','fileName' => 'fileName','title' => 'title'] as $target => $source) {
                    $fields[$target] = new FieldWrite(Reduction::text($m[$source] ?? null), $version);
                } $fields['extra'] = new FieldWrite(($m['ptt'] ?? null) === true ? (object)['ptt' => true] : null, $version);
                $quoted = Reduction::text(Reduction::record($m['contextInfo'] ?? null)['stanzaId'] ?? null);
                $media = [$kind,$m];
            } elseif (!empty($content['locationMessage'])) {
                $kind = 'location';
                $m = Reduction::record($content['locationMessage']);
                foreach (['latitude' => 'degreesLatitude','longitude' => 'degreesLongitude'] as $target => $source) {
                    $fields[$target] = new FieldWrite($m[$source] ?? null, $version);
                } $fields['title'] = new FieldWrite(Reduction::text($m['name'] ?? null), $version);
                $quoted = Reduction::text(Reduction::record($m['contextInfo'] ?? null)['stanzaId'] ?? null);
            } elseif (!empty($content['contactMessage'])) {
                $kind = 'contact';
                $fields['displayName'] = new FieldWrite(Reduction::text(Reduction::record($content['contactMessage'])['displayName'] ?? null), $version);
            } else {
                $poll = null;
                foreach (['pollCreationMessage','pollCreationMessageV2','pollCreationMessageV3'] as $name) {
                    if (!empty($content[$name])) {
                        $poll = Reduction::record($content[$name]);
                        break;
                    }
                } if ($poll === null) {
                    return null;
                } $kind = 'poll';
                $fields['title'] = new FieldWrite(Reduction::text($poll['name'] ?? null), $version);
                $options = [];
                foreach (Reduction::records($poll['options'] ?? null) as $option) {
                    $name = Reduction::text($option['optionName'] ?? null);
                    if ($name !== null) {
                        $options[] = (object)['name' => $name];
                    }
                } $fields['pollOptions'] = new FieldWrite($options, $version);
                $quoted = Reduction::text(Reduction::record($poll['contextInfo'] ?? null)['stanzaId'] ?? null);
            }
        }
        return [$kind,$fields,$quoted,$media];
    }

    /**
     * @param array<string,mixed> $info
     * @return list<Upsert> */
    public static function message(array $info, string $session, HistoryKeys $keys, string $chatJid = ''): array
    {
        $key = Reduction::record($info['key'] ?? null);
        $jid = Reduction::text($key['remoteJid'] ?? null) ?? $chatJid;
        if ($jid === '') {
            return [];
        } $id = $keys->message($key, $jid);
        if ($id === null) {
            return [];
        }
        $chat = $keys->chat($jid);
        $mine = ($key['fromMe'] ?? null) === true;
        $group = Reduction::chatKind(HistoryKeys::normalize($jid)) === 'group';
        $senderJid = $mine ? null : (Reduction::text($key['participant'] ?? null) ?? Reduction::text($info['participant'] ?? null) ?? ($group ? null : $jid));
        $sender = $mine ? 'self' : ($senderJid === null ? null : $keys->contact($senderJid));
        $timestamp = Reduction::millis($info['messageTimestamp'] ?? null);
        $guard = $timestamp === null ? null : new Watermark($session, $chat, $timestamp);
        $content = self::unwrap(Reduction::record($info['message'] ?? null));
        $protocol = Reduction::record($content['protocolMessage'] ?? null);
        $messageKey = ['sessionId' => $session,'messageId' => $id];
        if ($protocol !== []) {
            $target = $keys->message(Reduction::record($protocol['key'] ?? null), $jid);
            if ($target === null) {
                return [];
            } $targetKey = ['sessionId' => $session,'messageId' => $target];
            $code = self::enum($protocol['type'] ?? null, ['REVOKE' => 0,'MESSAGE_EDIT' => 14]);
            if ($code === 0) {
                $f = Reduction::cleared(Reduction::CONTENT);
                $f['chatId'] = new FieldWrite($chat, 0);
                $f['revokedAt'] = new FieldWrite($timestamp ?? 0, Rows::FINAL_VERSION);
                return [new Upsert('messages', $targetKey, $f),new Upsert('media', $targetKey, Reduction::cleared(Reduction::MEDIA_SECRETS))];
            }
            if ($code === 14 && !empty($protocol['editedMessage'])) {
                $v = Reduction::millis($protocol['timestampMs'] ?? null) ?? $timestamp ?? 0;
                $mapped = self::content(self::unwrap(Reduction::record($protocol['editedMessage'])), $v);
                if ($mapped !== null) {
                    $f = $mapped[1];
                    $f['chatId'] = new FieldWrite($chat, 0);
                    $f['editedAt'] = new FieldWrite($v, $v);
                    return [new Upsert('messages', $targetKey, $f, $guard)];
                }
            } return [];
        }
        $reaction = Reduction::record($content['reactionMessage'] ?? null);
        if ($reaction !== []) {
            $target = $keys->message(Reduction::record($reaction['key'] ?? null), $jid);
            if ($target === null || $sender === null) {
                return [];
            } $v = Reduction::millis($reaction['senderTimestampMs'] ?? null) ?? $timestamp ?? 0;
            return [new Upsert('reactions', ['sessionId' => $session,'messageId' => $target,'senderId' => $sender], ['chatId' => new FieldWrite($chat, 0),'emoji' => new FieldWrite($reaction['text'] ?? '', $v),'timestamp' => new FieldWrite($v, $v)])];
        }
        $f = ['chatId' => new FieldWrite($chat, 0),'fromMe' => new FieldWrite($mine, 0),'timestamp' => new FieldWrite($timestamp ?? 0, 0)];
        Reduction::present($f, 'senderId', $sender, 0);
        Reduction::present($f, 'senderJid', $senderJid === null ? null : HistoryKeys::normalize($senderJid), 0);
        Reduction::present($f, 'waMessageId', Reduction::text($key['id'] ?? null), 0);
        if (!$mine) {
            Reduction::present($f, 'pushName', Reduction::text($info['pushName'] ?? null), 0);
        } if (is_bool($info['starred'] ?? null)) {
            $f['starred'] = new FieldWrite($info['starred'], 0);
        }
        $status = [0 => 'failed',1 => 'pending',2 => 'sent',3 => 'delivered',4 => 'read',5 => 'played'][self::enum($info['status'] ?? null, ['ERROR' => 0,'PENDING' => 1,'SERVER_ACK' => 2,'DELIVERY_ACK' => 3,'READ' => 4,'PLAYED' => 5]) ?? -1] ?? null;
        if ($mine && $status !== null) {
            Reduction::status($f, $status);
        } $ops = [];
        $media = null;
        if (self::enum($info['messageStubType'] ?? null, ['REVOKE' => 1]) === 1) {
            $f = array_replace($f, Reduction::cleared(Reduction::CONTENT));
            $f['revokedAt'] = new FieldWrite(Reduction::millis($info['revokeMessageTimestamp'] ?? null) ?? $timestamp ?? 0, Rows::FINAL_VERSION);
            $ops[] = new Upsert('media', $messageKey, Reduction::cleared(Reduction::MEDIA_SECRETS));
        } elseif ($content !== []) {
            $mapped = self::content($content, 0);
            if ($mapped !== null) {
                [$kind,$mappedFields,$quoted,$media] = $mapped;
                $f = array_replace($f, $mappedFields);
                $f['type'] = new FieldWrite($kind, 0);
                Reduction::present($f, 'quotedId', $quoted, 0);
            } else {
                $f['type'] = new FieldWrite('unknown', 0);
            }
        }
        $ops[] = new Upsert('messages', $messageKey, $f, $guard);
        if ($media !== null) {
            [$kind,$m] = $media;
            $mf = ['chatId' => new FieldWrite($chat, 0),'kind' => new FieldWrite($kind, 0)];
            foreach (['mimeType' => 'mimetype','fileName' => 'fileName','fileSha256' => 'fileSha256','fileEncSha256' => 'fileEncSha256','directPath' => 'directPath','mediaKey' => 'mediaKey'] as $target => $source) {
                Reduction::present($mf, $target, Reduction::text($m[$source] ?? null), 0);
            } Reduction::present($mf, 'fileLength', Reduction::number($m['fileLength'] ?? null), 0);
            Reduction::present($mf, 'mediaKeyTimestamp', Reduction::millis($m['mediaKeyTimestamp'] ?? null), 0);
            $ops[] = new Upsert('media', $messageKey, $mf, $guard);
        }
        foreach (Reduction::records($info['userReceipt'] ?? null) as $receipt) {
            $user = Reduction::text($receipt['userJid'] ?? null);
            $state = null;
            foreach (['played' => 'playedTimestamp','read' => 'readTimestamp','delivered' => 'receiptTimestamp'] as $name => $source) {
                $v = Reduction::millis($receipt[$source] ?? null);
                if ($v !== null) {
                    $state = [$name,$v];
                    break;
                }
            } if ($user !== null && $state !== null) {
                $rf = ['chatId' => new FieldWrite($chat, 0)];
                Reduction::status($rf, $state[0], $state[1]);
                $rf['timestamp'] = $rf['statusAt'];
                unset($rf['statusAt']);
                $ops[] = new Upsert('receipts', ['sessionId' => $session,'messageId' => $id,'recipientId' => $keys->contact($user)], $rf, $guard);
            }
        }
        foreach (Reduction::records($info['reactions'] ?? null) as $reaction) {
            $rk = Reduction::record($reaction['key'] ?? null);
            $reactor = ($rk['fromMe'] ?? false) ? 'self' : (Reduction::text($rk['participant'] ?? null) ?? ($group ? null : $jid));
            if ($reactor !== null) {
                $v = Reduction::millis($reaction['senderTimestampMs'] ?? null) ?? $timestamp ?? 0;
                $ops[] = new Upsert('reactions', ['sessionId' => $session,'messageId' => $id,'senderId' => $reactor === 'self' ? 'self' : $keys->contact($reactor)], ['chatId' => new FieldWrite($chat, 0),'emoji' => new FieldWrite($reaction['text'] ?? '', $v),'timestamp' => new FieldWrite($v, $v)], $guard);
            }
        }
        if (!$mine && $senderJid !== null && Reduction::text($info['pushName'] ?? null) !== null && $timestamp !== null) {
            $ops[] = new Upsert('contacts', ['sessionId' => $session,'contactId' => $keys->contact($senderJid)], ['jid' => new FieldWrite(HistoryKeys::normalize($senderJid), 0),'pushName' => new FieldWrite($info['pushName'], $timestamp)]);
        }
        return $ops;
    }

    /**
     * @param array<string,mixed> $c
     * @return list<Upsert> */
    private static function conversation(string $session, array $c, HistoryKeys $keys): array
    {
        $jid = Reduction::text($c['id'] ?? null);
        if ($jid === null) {
            return [];
        } $bare = HistoryKeys::normalize($jid);
        $chat = $keys->chat($bare);
        $kind = Reduction::chatKind($bare);
        $last = Reduction::millis($c['lastMsgTimestamp'] ?? null);
        $snapshot = max(Reduction::millis($c['conversationTimestamp'] ?? null) ?? 0, $last ?? 0);
        $f = ['jid' => new FieldWrite($bare, 0)];
        Reduction::present($f, 'kind', $kind, 0);
        Reduction::present($f, 'name', Reduction::text($c['name'] ?? null) ?? Reduction::text($c['displayName'] ?? null), $snapshot);
        Reduction::present($f, 'username', Reduction::text($c['username'] ?? null), $snapshot);
        $pn = Reduction::text($c['pnJid'] ?? null);
        if ($kind === 'direct' && $pn !== null) {
            $f['phoneNumber'] = new FieldWrite('+'.explode('@', HistoryKeys::normalize($pn), 2)[0], $snapshot);
        }
        foreach (['archived' => 'archived','markedUnread' => 'markedAsUnread','unreadCount' => 'unreadCount','readOnly' => 'readOnly','ephemeralExpiration' => 'ephemeralExpiration'] as $target => $source) {
            Reduction::present($f, $target, $c[$source] ?? null, $snapshot);
        }
        $pinned = Reduction::number($c['pinned'] ?? null);
        $mute = Reduction::number($c['muteEndTime'] ?? null);
        if ($pinned !== null) {
            $f['pinned'] = new FieldWrite($pinned > 0, $snapshot);
        } if ($mute !== null) {
            $f['muted'] = new FieldWrite($mute != 0, $snapshot);
            $f['muteEndAt'] = new FieldWrite($mute > 0 ? Reduction::millis($mute) : null, $snapshot);
        } Reduction::present($f, 'lastMessageAt', $last, $last ?? 0);
        $ops = [new Upsert('chats', ['sessionId' => $session,'chatId' => $chat], $f)];
        if ($kind === 'group') {
            $gf = ['jid' => new FieldWrite($bare, 0)];
            Reduction::present($gf, 'subject', Reduction::text($c['name'] ?? null), $snapshot);
            Reduction::present($gf, 'description', Reduction::text($c['description'] ?? null), $snapshot);
            Reduction::present($gf, 'createdAt', Reduction::millis($c['createdAt'] ?? null), 0);
            $creator = Reduction::text($c['createdBy'] ?? null);
            Reduction::present($gf, 'createdBy', $creator === null ? null : HistoryKeys::normalize($creator), 0);
            $ops[] = new Upsert('groups', ['sessionId' => $session,'groupId' => $chat], $gf);
            foreach (Reduction::records($c['participant'] ?? null) as $person) {
                $user = Reduction::text($person['userJid'] ?? null);
                if ($user !== null) {
                    $role = [0 => 'member',1 => 'admin',2 => 'superadmin'][self::enum($person['rank'] ?? null, ['REGULAR' => 0,'ADMIN' => 1,'SUPERADMIN' => 2]) ?? 0] ?? 'member';
                    $ops[] = new Upsert('group_participants', ['sessionId' => $session,'groupId' => $chat,'participantId' => $keys->contact($user)], ['jid' => new FieldWrite(HistoryKeys::normalize($user), 0),'role' => new FieldWrite($role, $snapshot),'active' => new FieldWrite(true, $snapshot),'changedAt' => new FieldWrite($snapshot, $snapshot)]);
                }
            }
        }
        foreach (Reduction::records($c['messages'] ?? null) as $entry) {
            if (!empty($entry['message'])) {
                array_push($ops, ...self::message(Reduction::record($entry['message']), $session, $keys, $bare));
            }
        } return $ops;
    }

    /**
     * @param array<string,mixed>|HistorySyncData $chunk */
    public static function reduce(string $session, array|HistorySyncData $chunk, ?HistoryIdentityIndex $identities = null, ?string $chunkId = null): Batch
    {
        if ($chunk instanceof HistorySyncData) {
            if (!is_array($chunk->decoded) && !$chunk->decoded instanceof \stdClass) {
                throw new StorageException('history_complete_decoder_required');
            } $chunk = Reduction::record($chunk->decoded);
        }
        Schema::validateJson($chunk);
        $keys = new HistoryKeys($identities, $chunk);
        $ops = [];
        $conversations = Reduction::records($chunk['conversations'] ?? null);
        foreach ($conversations as $conversation) {
            array_push($ops, ...self::conversation($session, $conversation, $keys));
        }
        foreach (Reduction::records($chunk['pushnames'] ?? null) as $entry) {
            $jid = Reduction::text($entry['id'] ?? null);
            $name = Reduction::text($entry['pushname'] ?? null);
            if ($jid !== null && $name !== null && Reduction::chatKind(HistoryKeys::normalize($jid)) === 'direct') {
                $ops[] = new Upsert('contacts', ['sessionId' => $session,'contactId' => $keys->contact($jid)], ['jid' => new FieldWrite(HistoryKeys::normalize($jid), 0),'pushName' => new FieldWrite($name, 0)]);
            }
        }
        foreach (Reduction::records($chunk['phoneNumberToLidMappings'] ?? null) as $mapping) {
            $pn = Reduction::text($mapping['pnJid'] ?? null);
            $lid = Reduction::text($mapping['lidJid'] ?? null);
            if ($pn !== null && $lid !== null) {
                foreach ([$pn,$lid] as $jid) {
                    $ops[] = new Upsert('contacts', ['sessionId' => $session,'contactId' => $keys->contact($jid)], ['phoneNumber' => new FieldWrite('+'.explode('@', HistoryKeys::normalize($pn), 2)[0], 0),'lidJid' => new FieldWrite(HistoryKeys::normalize($lid), 0)]);
                }
            }
        }
        foreach (Reduction::records($chunk['pastParticipants'] ?? null) as $past) {
            $group = Reduction::text($past['groupJid'] ?? null);
            if ($group === null) {
                continue;
            } foreach (Reduction::records($past['pastParticipants'] ?? null) as $person) {
                $user = Reduction::text($person['userJid'] ?? null);
                if ($user !== null) {
                    $at = Reduction::millis($person['leaveTs'] ?? null) ?? 0;
                    $reason = self::enum($person['leaveReason'] ?? null, ['LEFT' => 0,'REMOVED' => 1]);
                    $ops[] = new Upsert('group_participants', ['sessionId' => $session,'groupId' => $keys->chat($group),'participantId' => $keys->contact($user)], ['jid' => new FieldWrite(HistoryKeys::normalize($user), 0),'active' => new FieldWrite(false, $at),'leaveReason' => new FieldWrite($reason === 1 ? 'removed' : 'left', $at),'changedAt' => new FieldWrite($at, $at)]);
                }
            }
        }
        $count = 0;
        foreach ($conversations as $conversation) {
            $count += count(Reduction::records($conversation['messages'] ?? null));
        }
        array_push($ops, ...self::progress($session, self::syncType($chunk['syncType'] ?? null), Reduction::number($chunk['chunkOrder'] ?? null), Reduction::number($chunk['progress'] ?? null), count($conversations), $count, count(Reduction::records($chunk['pushnames'] ?? null))));
        return new Batch($session, $ops, $chunkId === null ? null : 'history:'.$chunkId, 'history.chunk');
    }
}
