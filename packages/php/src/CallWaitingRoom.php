<?php

declare(strict_types=1);
namespace Polymorfa;

final readonly class CallWaitingRoom
{
    /** @param list<CallParticipant> $users */
    public function __construct(public bool $enabled, public bool $isAdmin, public bool $inWaitingRoom, public array $users) {}
    /** @param array<string,mixed> $data */
    public static function fromArray(array $data): ?self {
        if(!is_bool($data['enabled']??null)||!is_bool($data['isAdmin']??null)||!is_bool($data['inWaitingRoom']??null)||!is_array($data['users']??null)||!array_is_list($data['users'])){return null;}
        $people=[];
        foreach($data['users'] as $user){
            if(!is_array($user)||($person=CallParticipant::fromArray($user))===null){return null;}
            $people[]=$person;
        }
        return new self($data['enabled'],$data['isAdmin'],$data['inWaitingRoom'],$people);
    }
}
