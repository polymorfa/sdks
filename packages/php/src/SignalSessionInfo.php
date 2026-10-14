<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class SignalSessionInfo implements \JsonSerializable
{
    public function __construct(public string $id, public int $leaseGeneration, public bool $claimed, public bool $hasDeviceKeys, public string $state, #[\SensitiveParameter] public ?string $pn, #[\SensitiveParameter] public ?string $lid)
    {
    }
    /** @param array<string,mixed> $data */public static function fromWire(array $data): self
    {
        foreach (['pn','lid'] as $key) {
            if (!array_key_exists($key, $data)) {
                SignalCodec::invalid();
            }
        }return new self(SignalCodec::string($data, 'id'), SignalCodec::integer($data, 'lease_generation'), SignalCodec::boolean($data, 'claimed'), SignalCodec::boolean($data, 'has_device_keys'), SignalCodec::string($data, 'state'), SignalCodec::optionalString($data, 'pn', true), SignalCodec::optionalString($data, 'lid', true));
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
