<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Log array{id:string,projectId:string,createdAt:string,method:string,route:string,status:?int,durationMs:int|float|null,result:'success'|'failure',source:'api'|'mcp',requestId:?string,traceId:?string,errorCode:?string,mcpTool:?string,credential:array{type:'team_key'|'project_token'|'client_token',id:?string,last4:?string}|null}
 * @phpstan-type Filters array{status?:list<int|string>,method?:list<'GET'|'POST'|'PUT'|'PATCH'|'DELETE'>,route?:string,source?:'api'|'mcp',credentialId?:string,requestId?:string,traceId?:string,since?:string|\DateTimeInterface,until?:string|\DateTimeInterface}
 * @phpstan-type ListParams array{projectId?:string,limit?:int,cursor?:string,status?:list<int|string>,method?:list<'GET'|'POST'|'PUT'|'PATCH'|'DELETE'>,route?:string,source?:'api'|'mcp',credentialId?:string,requestId?:string,traceId?:string,since?:string|\DateTimeInterface,until?:string|\DateTimeInterface}
 * @phpstan-type TailParams array{projectId?:string,intervalMs?:int,backfill?:int,status?:list<int|string>,method?:list<'GET'|'POST'|'PUT'|'PATCH'|'DELETE'>,route?:string,source?:'api'|'mcp',credentialId?:string,requestId?:string,traceId?:string,since?:string|\DateTimeInterface,until?:string|\DateTimeInterface}
 */
final class RequestLogModels
{
    private function __construct()
    {
    }
}
