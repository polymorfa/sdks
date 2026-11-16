<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,AccountModels,RequestOptions};

/** @phpstan-import-type Team from AccountModels */
final class Teams extends Resource
{
    /** @return ApiResponse<array{data:Team}> */
    public function retrieve(?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:Team}> */
        return $this->request('GET', '/platform/team', options:$options);
    }
}
