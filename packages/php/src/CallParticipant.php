<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class CallParticipant
{
    public function __construct(
        public string $id,
        public bool $audioMuted,
        public bool $video,
        public string $state,
        public ?string $phoneNumber = null,
        public ?string $bsuid = null,
        public ?string $username = null,
        public bool $handRaised = false
    ) {
    }
    /** @param array<string,mixed> $data */
    public static function fromArray(array $data): ?self
    {
        if (!is_string($data['id'] ?? null) || !preg_match('/^[1-9][0-9]{0,18}$/D', $data['id']) || !is_bool($data['audioMuted'] ?? null) || !is_bool($data['video'] ?? null)
            || !in_array($data['state'] ?? null, ['invited','ringing','connected','left'], true)) {
            return null;
        }
        foreach (['phoneNumber','bsuid','username'] as $key) {
            if (isset($data[$key]) && !is_string($data[$key])) {
                return null;
            }
        }
        if (isset($data['handRaised']) && !is_bool($data['handRaised'])) {
            return null;
        }
        /** @var array{id:string,audioMuted:bool,video:bool,state:string,phoneNumber?:string,bsuid?:string,username?:string,handRaised?:bool} $data */
        return new self($data['id'], $data['audioMuted'], $data['video'], $data['state'], $data['phoneNumber'] ?? null, $data['bsuid'] ?? null, $data['username'] ?? null, $data['handRaised'] ?? false);
    }
    public function label(): string
    {
        return $this->phoneNumber ?? $this->username ?? $this->id;
    }
}
