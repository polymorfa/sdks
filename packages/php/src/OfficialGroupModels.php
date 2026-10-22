<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Identity array{id:string,phoneNumber?:string,bsuid?:string,username?:string}
 * @phpstan-type Cursors array{before?:string,after?:string}
 * @phpstan-type GroupList array{groups:list<array{id:string,subject?:string,createdAt?:string}>,cursors:Cursors,hasMore:bool}
 * @phpstan-type Group array{id:string,subject?:string,description?:string,suspended?:bool,createdAt?:string,participantCount?:int,joinApprovalRequired?:bool,participants:list<Identity>}
 * @phpstan-type CreateInput array{subject:string,description?:string,joinApprovalRequired?:bool}
 * @phpstan-type UpdateInput array{subject?:string,description?:string}
 * @phpstan-type JoinRequests array{items:list<array{joinRequestId:string,user:Identity,createdAt?:string}>,cursors:Cursors,hasMore:bool}
 * @phpstan-type Decision array{succeeded:list<string>,failed:list<array{joinRequestId:string,errors:list<array{code:int,title?:string}>}>}
 * @phpstan-type PinInput array{operation:'pin',messageId:string,expirationDays:int}|array{operation:'unpin',messageId:string}
 */
final class OfficialGroupModels
{
    private function __construct()
    {
    }
}
