<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,SecurityModels};

/**
 * @phpstan-import-type AuditLog from SecurityModels
 * @phpstan-import-type AuditParams from SecurityModels
 */
final class AuditLogs extends Resource
{
    /** @param AuditParams $params
     * @return ApiResponse<array{data:list<AuditLog>}> */
    public function list(array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:list<AuditLog>}> */
        return $this->request('GET', '/platform/audit', query:$params, options:$options);
    }
}
