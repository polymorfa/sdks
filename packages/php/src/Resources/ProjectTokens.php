<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,AccountModels,RequestOptions};

/** @phpstan-import-type ProjectToken from AccountModels */
final class ProjectTokens extends Resource
{
    /** @return ApiResponse<array{data:list<ProjectToken>}> */
    public function list(string $projectId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:list<ProjectToken>}> */
        return $this->request('GET', '/platform/tokens', query:['projectId' => $projectId], options:$options);
    }
}
