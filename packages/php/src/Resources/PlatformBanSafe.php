<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,BanSafeTelemetryModels};

/**
 * @phpstan-import-type ConnectionHealth from BanSafeTelemetryModels
 * @phpstan-import-type ConnectionDetail from BanSafeTelemetryModels
 * @phpstan-import-type HealthPoint from BanSafeTelemetryModels
 * @phpstan-import-type SignalDefinition from BanSafeTelemetryModels
 * @phpstan-import-type TelemetryDetail from BanSafeTelemetryModels
 * @phpstan-import-type Snapshot from BanSafeTelemetryModels
 * @phpstan-import-type CollectionConnection from BanSafeTelemetryModels
 * @phpstan-import-type HealthAction from BanSafeTelemetryModels
 * @phpstan-import-type Finding from BanSafeTelemetryModels
 * @phpstan-import-type EnforcementSummary from BanSafeTelemetryModels
 * @phpstan-import-type Incident from BanSafeTelemetryModels
 * @phpstan-import-type Claim from BanSafeTelemetryModels
 * @phpstan-import-type ClaimStatus from BanSafeTelemetryModels
 * @phpstan-import-type ActionStatus from BanSafeTelemetryModels
 * @phpstan-import-type Rung from BanSafeTelemetryModels
 * @phpstan-import-type ListParams from BanSafeTelemetryModels
 */
final class PlatformBanSafe extends Resource
{
    /** @param ListParams $params
     * @return ApiResponse<array{data:list<ConnectionHealth>,page:array{nextCursor:?string,hasMore:bool}}> */
    public function listHealth(array $params = [], ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:list<ConnectionHealth>,page:array{nextCursor:?string,hasMore:bool}}> */ return $this->request('GET', '/platform/bansafe/health', query:$params, options:$options);
    }
    /** @return ApiResponse<array{data:ConnectionDetail}> */
    public function getHealth(string $connection, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:ConnectionDetail}> */ return $this->request('GET', '/platform/bansafe/health/'.self::segment($connection), options:$options);
    }
    /** @param array{since?:string,limit?:int} $params
     * @return ApiResponse<array{data:array{connectionId:string,connection:string,points:list<HealthPoint>}}> */
    public function listHealthHistory(string $connection, array $params = [], ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:array{connectionId:string,connection:string,points:list<HealthPoint>}}> */ return $this->request('GET', '/platform/bansafe/health/'.self::segment($connection).'/history', query:$params, options:$options);
    }
    /** @return ApiResponse<array{data:list<SignalDefinition>}> */
    public function listSignals(?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:list<SignalDefinition>}> */ return $this->request('GET', '/platform/bansafe/signals', options:$options);
    }
    /** @return ApiResponse<array{data:TelemetryDetail}> */
    public function getTelemetry(string $connection, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:TelemetryDetail}> */ return $this->request('GET', '/platform/bansafe/telemetry/'.self::segment($connection), options:$options);
    }
    /** @param array{since?:string,until?:string,cursor?:string,limit?:int} $params
     * @return ApiResponse<array{data:list<Snapshot>,page:array{nextCursor:?string,hasMore:bool}}> */
    public function listTelemetryHistory(string $connection, array $params = [], ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:list<Snapshot>,page:array{nextCursor:?string,hasMore:bool}}> */ return $this->request('GET', '/platform/bansafe/telemetry/'.self::segment($connection).'/history', query:$params, options:$options);
    }
    /** @param ListParams $params
     * @return ApiResponse<array{data:list<CollectionConnection>,page:array{nextCursor:?string,hasMore:bool}}> */
    public function listCollection(array $params = [], ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:list<CollectionConnection>,page:array{nextCursor:?string,hasMore:bool}}> */ return $this->request('GET', '/platform/bansafe/collection', query:$params, options:$options);
    }
    /** @param array{projectId?:string,cursor?:string,limit?:int,connection?:string,status?:ActionStatus} $params
     * @return ApiResponse<array{data:list<HealthAction>,page:array{nextCursor:?string,hasMore:bool}}> */
    public function listHealthActions(array $params = [], ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:list<HealthAction>,page:array{nextCursor:?string,hasMore:bool}}> */ return $this->request('GET', '/platform/bansafe/health-actions', query:$params, options:$options);
    }
    /** @param array{projectId?:string,cursor?:string,limit?:int,connection?:string,status?:'open'|'acknowledged'|'resolved',severity?:'info'|'warning'|'critical'} $params
     * @return ApiResponse<array{data:list<Finding>,page:array{nextCursor:?string,hasMore:bool}}> */
    public function listFindings(array $params = [], ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:list<Finding>,page:array{nextCursor:?string,hasMore:bool}}> */ return $this->request('GET', '/platform/bansafe/findings', query:$params, options:$options);
    }
    /** @param array{projectId?:string,cursor?:string,limit?:int,rung?:Rung} $params
     * @return ApiResponse<array{data:list<EnforcementSummary>,page:array{nextCursor:?string,hasMore:bool}}> */
    public function listEnforcement(array $params = [], ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:list<EnforcementSummary>,page:array{nextCursor:?string,hasMore:bool}}> */ return $this->request('GET', '/platform/bansafe/enforcement', query:$params, options:$options);
    }
    /** @param array{projectId?:string,cursor?:string,limit?:int,connection?:string} $params
     * @return ApiResponse<array{data:list<Incident>,page:array{nextCursor:?string,hasMore:bool}}> */
    public function listIncidents(array $params = [], ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:list<Incident>,page:array{nextCursor:?string,hasMore:bool}}> */ return $this->request('GET', '/platform/bansafe/incidents', query:$params, options:$options);
    }
    /** @param array{connection:string,occurredAt?:string,note?:string} $body
     * @return ApiResponse<array{data:array{incidentId:string,created:bool,connectionId:string,connection:string,occurredAt:string}}> */
    public function createIncident(array $body, RequestOptions $options): ApiResponse
    { /** @var ApiResponse<array{data:array{incidentId:string,created:bool,connectionId:string,connection:string,occurredAt:string}}> */ return $this->request('POST', '/platform/bansafe/incidents', $body, options:$options);
    }
    /** @return ApiResponse<array{data:Incident}> */
    public function retractIncident(string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:Incident}> */ return $this->request('POST', '/platform/bansafe/incidents/'.self::segment($id).'/retract', options:$options);
    }
    /** @param array{projectId?:string,cursor?:string,limit?:int,connection?:string,status?:ClaimStatus} $params
     * @return ApiResponse<array{data:list<Claim>,page:array{nextCursor:?string,hasMore:bool}}> */
    public function listClaims(array $params = [], ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:list<Claim>,page:array{nextCursor:?string,hasMore:bool}}> */ return $this->request('GET', '/platform/bansafe/claims', query:$params, options:$options);
    }
    /** @return ApiResponse<array{data:Claim}> */
    public function getClaim(string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:Claim}> */ return $this->request('GET', '/platform/bansafe/claims/'.self::segment($id), options:$options);
    }
}
