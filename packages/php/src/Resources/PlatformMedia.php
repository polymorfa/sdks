<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions};

/** These payloads are open records in the merged TS contract. */
final class PlatformMedia extends Resource
{
    /** @return ApiResponse<array{data:array<string,mixed>}> */
    public function retrieve(string $id, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:array<string,mixed>}> */return $this->request('GET', '/platform/media/'.self::segment($id), options:$options);
    }
    /** @return ApiResponse<array{data:array<string,mixed>}> */
    public function delete(string $id, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:array<string,mixed>}> */return $this->request('DELETE', '/platform/media/'.self::segment($id), options:$options);
    }
    /** @param array<string,mixed>|null $body
     * @return ApiResponse<array{data:array<string,mixed>}> */
    public function createUpload(?array $body = null, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:array<string,mixed>}> */return $this->request('POST', '/platform/media/uploads', $body === null ? null : (object)$body, options:$options);
    }
}
