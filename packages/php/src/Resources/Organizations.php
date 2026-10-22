<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,AccountModels,RequestOptions};

/** @phpstan-import-type Organization from AccountModels */
final class Organizations extends Resource
{
    /** @return ApiResponse<array{data:Organization}> */
    public function retrieve(?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:Organization}> */
        return $this->request('GET', '/platform/team', options:$options);
    }
}
