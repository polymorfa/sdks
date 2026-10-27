<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,SecurityModels};

/** @phpstan-import-type Incident from SecurityModels */
final class SecurityIncidents extends Resource
{
    /** @return ApiResponse<array{data:list<Incident>}> */
    public function list(?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:list<Incident>}> */
        return $this->request('GET', '/platform/incidents', options:$options);
    }
    /** @return ApiResponse<array{data:array{acknowledged:true}}> */
    public function acknowledge(string $id, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array{acknowledged:true}}> */
        return $this->request('POST', '/platform/incidents/'.self::segment($id).'/acknowledge', options:$options);
    }
}
