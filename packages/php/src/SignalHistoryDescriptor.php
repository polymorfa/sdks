<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class SignalHistoryDescriptor implements \JsonSerializable
{
    public function __construct(#[\SensitiveParameter] public string $notificationProto, #[\SensitiveParameter] public ?string $directPath = null, #[\SensitiveParameter] public ?string $mediaKey = null, public ?string $fileSha256 = null, public ?string $fileEncSha256 = null, public ?string $originalMessageId = null, public ?string $peerDataRequestSessionId = null, #[\SensitiveParameter] public ?string $inlinePayload = null, public ?int $syncType = null, public ?int $chunkOrder = null, public ?int $progress = null, public ?int $fileLength = null)
    {
    }
    /** @param array<string,mixed> $data */public static function fromWire(array $data): self
    {
        return new self(SignalCodec::binary($data, 'notification_proto'), SignalCodec::optionalString($data, 'direct_path', true), SignalCodec::optionalBinary($data, 'media_key'), SignalCodec::optionalBinary($data, 'file_sha256'), SignalCodec::optionalBinary($data, 'file_enc_sha256'), SignalCodec::optionalString($data, 'original_message_id', true), SignalCodec::optionalString($data, 'peer_data_request_session_id', true), SignalCodec::optionalBinary($data, 'inline_payload'), SignalCodec::optionalInteger($data, 'sync_type', true), SignalCodec::optionalInteger($data, 'chunk_order', true), SignalCodec::optionalInteger($data, 'progress', true), SignalCodec::optionalInteger($data, 'file_length', true));
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
