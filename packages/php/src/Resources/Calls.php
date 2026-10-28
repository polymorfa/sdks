<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions};

/**
 * @phpstan-type SessionCallPeer array{id?:string,phoneNumber?:string,username?:string}
 * @phpstan-type SessionCallRecord array{callId:string,projectId:string,sessionId:string,direction:'inbound'|'outbound',upstream:'linked_device'|'cloud_api',outcome:'answered'|'missed'|'declined'|'failed'|'in_progress',state:'offered'|'accepted'|'rejected'|'missed'|'ended',hasVideo:bool,peer:SessionCallPeer|null,startedAt:string,connectedAt:string|null,endedAt:string|null,durationSeconds:int|null,endReason:string|null}
 * @phpstan-type SessionCallsParams array{limit?:int,cursor?:string,direction?:'inbound'|'outbound',outcome?:'answered'|'missed'|'declined'|'failed'|'in_progress',since?:string,until?:string}
 */
final class Calls extends Resource
{
    /**
     * One page of the number's calls, newest first, with the other party's
     * identity. Records are served from the number's data region; client
     * tokens need the read_calls action.
     *
     * @param SessionCallsParams $params
     * @return ApiResponse<array{success:true,data:list<SessionCallRecord>,nextCursor:string|null}>
     */
    public function list(string $session, array $params = [], ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:list<SessionCallRecord>,nextCursor:string|null}> */ return $this->request('GET', '/messaging/'.self::segment($session).'/calls', query: $params, options: $options);
    }
    /** @param array{from:string} $body
     * @return ApiResponse<array{success:bool,message?:string}|array{success:true,data:array{status:'REJECTED'}|array{requestId:string}}>
     */
    public function reject(string $session, string $callId, array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:bool,message?:string}|array{success:true,data:array{status:'REJECTED'}|array{requestId:string}}> */ return $this->request('POST', '/messaging/'.self::segment($session).'/calls/'.self::segment($callId).'/reject', $body, options:$options);
    }
}
