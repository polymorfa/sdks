<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class SignalEvent implements \JsonSerializable
{
    public function __construct(public string $id, public string $type, public string $sessionId, #[\SensitiveParameter] public string $chat, #[\SensitiveParameter] public string $sender, public string $messageId, public int $timestamp, public bool $isFromMe, public bool $redelivered, public bool $identityChanged, #[\SensitiveParameter] public string $messageProto, #[\SensitiveParameter] public string $rawJson, #[\SensitiveParameter] public ?string $senderAlt = null, #[\SensitiveParameter] public ?string $text = null, public ?SignalMediaDescriptor $media = null, public ?SignalHistoryDescriptor $history = null)
    {
    }
    public static function fromJson(#[\SensitiveParameter] string $raw): self
    {
        $data = SignalCodec::object($raw);
        $id = SignalCodec::string($data, 'id');
        $type = SignalCodec::string($data, 'type');
        $session = SignalCodec::string($data, 'session_id');
        if ($id === '' || $session === '' || !in_array($type, ['message','history.sync'], true)) {
            SignalCodec::invalid();
        }
        $media = $history = null;
        foreach (['media','history'] as $field) {
            if (array_key_exists($field, $data)) {
                if (!is_array($data[$field]) || array_is_list($data[$field])) {
                    SignalCodec::invalid();
                }if ($field === 'media') {
                    $media = SignalMediaDescriptor::fromWire($data[$field]);
                } else {
                    $history = SignalHistoryDescriptor::fromWire($data[$field]);
                }
            }
        }
        $proto = SignalCodec::binary($data, 'message_proto');
        if ($type === 'history.sync' && ($history === null || $proto !== '')) {
            SignalCodec::invalid();
        }
        return new self($id, $type, $session, SignalCodec::string($data, 'chat'), SignalCodec::string($data, 'sender'), SignalCodec::string($data, 'message_id'), SignalCodec::integer($data, 'timestamp'), SignalCodec::boolean($data, 'is_from_me'), SignalCodec::boolean($data, 'redelivered'), SignalCodec::boolean($data, 'identity_changed'), $proto, $raw, SignalCodec::optionalString($data, 'sender_alt'), SignalCodec::optionalString($data, 'text'), $media, $history);
    }
    /** @return array{redacted:true} */public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
    /** @return array{redacted:true} */public function jsonSerialize(): array
    {
        return ['redacted' => true];
    }
}
