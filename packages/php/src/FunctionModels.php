<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Definition array{id:string,projectId:string,name:string,enabled:bool,revision:int,activeDeploymentId:?string,createdAt:string,updatedAt:string}
 * @phpstan-type ListParams array{limit?:int,before?:string}
 * @phpstan-type CreateInput array{functionId?:string,name:string}
 * @phpstan-type UpdateInput array{expectedRevision:int,name?:string,enabled?:bool}
 * @phpstan-type CreateDeployment array{deploymentId:string,source:string,language:'javascript'|'typescript'|'visual',region:string,compatibilityDate:string,secretVersionIds?:list<string>,egressOrigins?:list<string>}
 * @phpstan-type Deployment array{id:string,functionId:string,source:string,language:'javascript'|'typescript'|'visual',region:string,compatibilityDate:string,secretVersionIds:list<string>,egressOrigins:list<string>,sha256:string,createdAt:string}
 * @phpstan-type DeploymentSummary array{id:string,functionId:string,language:'javascript'|'typescript'|'visual',region:string,compatibilityDate:string,secretVersionIds:list<string>,egressOrigins:list<string>,sha256:string,createdAt:string}
 * @phpstan-type SecretVersion array{id:string,name:string,createdAt:string,revokedAt:?string}
 * @phpstan-type FunctionRequest array{method:'GET'|'HEAD'|'POST'|'PUT'|'PATCH'|'DELETE'|'OPTIONS',url:string,headers:array<string,string>,bodyBase64:string}
 * @phpstan-type FunctionResponse array{status:int,headers:array<string,string>,bodyBase64:string}
 * @phpstan-type Invocation array{id:string,functionId:string,deploymentId:string,outcome:'running'|'succeeded'|'failed'|'unknown'|'unavailable',trigger:'http'|'flow'|'test',errorCode:?string,durationMs:int|float|null,responseBytes:?int,attempt:int,createdAt:string,completedAt:?string}
 * @phpstan-type CreateInvocation array{deploymentId?:string,request:FunctionRequest,trigger?:'http'|'test'}
 * @phpstan-type InvocationResult array{receipt:Invocation,replayed:bool,response?:FunctionResponse,responseRetained:false,retryable:bool}
 */
final class FunctionModels
{
    private function __construct()
    {
    }
}
