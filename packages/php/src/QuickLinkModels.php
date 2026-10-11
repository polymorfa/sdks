<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-import-type ObservationPatch from SessionModels
 * @phpstan-import-type Hms from SessionModels
 * @phpstan-type Connection 'linked_devices'|'official_api'
 * @phpstan-type Method 'qr'|'pairing'
 * @phpstan-type TestingConfiguration array{profile?:array{name?:string,status?:string},accountType?:'personal'|'business',replyBehavior?:'off'|'echo',failureScenario?:'none'|'reject-send',historyFixtureId?:string}
 * @phpstan-type Configuration array{observation?:ObservationPatch,hms?:Hms,testing?:array{country?:string,configuration?:TestingConfiguration,editable?:list<'profile.name'|'profile.status'|'accountType'|'replyBehavior'|'failureScenario'|'historyFixtureId'>},connectionPreference?:'cloud'|'linked'|'both',connectionEnforcement?:'prefer'|'force',methods?:list<Method>,defaultMethod?:Method|null,prefillPhone?:string,allowPhoneChange?:bool,historySync?:array{consent?:'ask'|'force_on'|'force_off',mode?:'metadata_only'|'deliver',requestFull?:bool}}
 * @phpstan-type CreateInput array{purpose?:'initial',session?:string,billingControls?:array{limitCredits:int|float|null,priority:int},connectionGoal?:'single'|'hybrid',addConnection?:Connection,projectId?:string,customerId?:string,externalId?:string,configuration?:Configuration}|array{purpose:'add_connection',session:string,billingControls?:array{limitCredits:int|float|null,priority:int},connectionGoal?:'single'|'hybrid',addConnection?:Connection,projectId?:string,customerId?:string,externalId?:string,configuration?:Configuration}
 * @phpstan-type Link array{purpose:'initial'|'add_connection'|'reauthorization',connectionGoal:'single'|'hybrid',addConnection?:Connection,id:string,url:string,session:string,expiresAt:?string}
 * @phpstan-type SyncRequest 'not_applicable'|'not_requested'|'pending'|'requesting'|'accepted'|'declined'|'unknown'
 * @phpstan-type Status array{purpose:'initial'|'add_connection'|'reauthorization',connectionGoal:'single'|'hybrid',addConnection?:Connection,hybridPhase:'cloud_setup'|'linked_pairing'|'repair_linked'|'ready'|null,onboarding?:array{stage:string,connection:?string,coexistence:?bool,contactsSync:string,historySync:string,historyProgress:int|float,sync:array{contacts:array{request:SyncRequest,receiptRecorded:bool},history:array{request:SyncRequest,receiptRecorded:bool,delivery:'not_applicable'|'not_requested'|'unconfirmed'|'partial'|'complete'|'declined'}},errorCode:?string}|null,id:string,status:'pending'|'opened'|'linked'|'connected'|'failed'|'cancelled',session:string,expiresAt:?string,openedAt:?string,connectedAt:?string,phone:?string,errorCode:?string}
 * @phpstan-type Availability array{allowed:bool,addConnection:Connection|null,connections:list<array{kind:Connection,status:string,enabled:bool}>,resumeQuickLinkId:?string}
 */
final class QuickLinkModels
{
    private function __construct()
    {
    }
}
