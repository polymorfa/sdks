<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,AccountModels,RequestOptions};

/** @phpstan-import-type Member from AccountModels */
final class Members extends Resource
{
    /** @return ApiResponse<array{data:list<Member>}> */
    public function list(?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:list<Member>}> */
        return $this->request('GET', '/platform/members', options:$options);
    }
}
