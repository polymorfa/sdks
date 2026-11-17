<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions};

/**
 * @phpstan-type ConnectionCallPeer array{id?:string,phoneNumber?:string,username?:string}
 * @phpstan-type ConnectionCallRecord array{callId:string,projectId:string,connectionId:string,direction:'inbound'|'outbound',upstream:'linked_device'|'cloud_api',outcome:'answered'|'missed'|'declined'|'failed'|'in_progress',state:'offered'|'accepted'|'rejected'|'missed'|'ended',hasVideo:bool,peer:ConnectionCallPeer|null,startedAt:string,connectedAt:string|null,endedAt:string|null,durationSeconds:int|null,endReason:string|null}
 * @phpstan-type ConnectionCallsParams array{limit?:int,cursor?:string,direction?:'inbound'|'outbound',outcome?:'answered'|'missed'|'declined'|'failed'|'in_progress',since?:string,until?:string}
 */
final class Calls extends Resource
{
    /**
     * One page of the Connection's calls, newest first, with the other party's
     * identity. Records are served from the Connection's data region; client
     * tokens need the read_calls action.
     *
     * @param ConnectionCallsParams $params
     * @return ApiResponse<array{success:true,data:list<ConnectionCallRecord>,nextCursor:string|null}>
     */
    public function list(string $connection, array $params = [], ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:list<ConnectionCallRecord>,nextCursor:string|null}> */ return $this->request('GET', '/messaging/'.self::segment($connection).'/calls', query: $params, options: $options);
    }
    /** @param array{from:string} $body
     * @return ApiResponse<array{success:bool,message?:string}|array{success:true,data:array{status:'REJECTED'}|array{requestId:string}}>
     */
    public function reject(string $connection, string $callId, array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:bool,message?:string}|array{success:true,data:array{status:'REJECTED'}|array{requestId:string}}> */ return $this->request('POST', '/messaging/'.self::segment($connection).'/calls/'.self::segment($callId).'/reject', $body, options:$options);
    }
}
