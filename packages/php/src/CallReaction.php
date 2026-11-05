<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class CallReaction
{
    public function __construct(public string $emoji, public bool $self = false, public ?string $participantId = null)
    {
        if (!in_array($emoji, ['','👍','❤️','😂','😮','😢','🙏'], true) || ($self && $participantId !== null) || (!$self && ($participantId === null || !preg_match('/^[1-9][0-9]{0,18}$/D', $participantId)))) {
            throw new ValidationException('Invalid call reaction.');
        }
    }
}
