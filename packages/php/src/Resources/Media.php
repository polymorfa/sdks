<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\ApiResponse;
use Polymorfa\RequestOptions;

final class Media extends Resource
{
    /**
 *
 * @return ApiResponse<string> */
    public function download(string $id, ?RequestOptions $options = null): ApiResponse
    {
        return $this->transport->binary('/messaging/media/' . self::segment($id), $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function retrieve(string $id, ?RequestOptions $options = null): ApiResponse
    {
        return $this->request('GET', '/messaging/media/' . self::segment($id) . '/info', options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function persist(string $id, ?RequestOptions $options = null): ApiResponse
    {
        return $this->request('POST', '/messaging/media/' . self::segment($id) . '/download-and-save', options: $options);
    }
}
