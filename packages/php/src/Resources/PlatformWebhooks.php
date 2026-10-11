<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\ApiResponse;
use Polymorfa\CursorPage;
use Polymorfa\RequestOptions;
use Polymorfa\ValidationException;

final class PlatformWebhooks extends PlatformResource
{
    /**
 * @param array<string,mixed> $params
 *
 * @return CursorPage<array<string,mixed>> */
    public function list(array $params = [], ?RequestOptions $options = null): CursorPage
    {
        return $this->page($this->prefix . '/webhooks', $params, $options);
    }
    /**
 * @param array<string,mixed> $body
 *
 * @return ApiResponse<array<string,mixed>> */
    public function create(array $body, ?RequestOptions $options = null): ApiResponse
    {
        return $this->unwrapped('POST', $this->prefix . '/webhooks', $body, options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function retrieve(string $id, ?RequestOptions $options = null): ApiResponse
    {
        return $this->unwrapped('GET', $this->prefix . '/webhooks/' . self::segment($id), options: $options);
    }
    /**
 * @param array<string,mixed> $body
 *
 * @return ApiResponse<array<string,mixed>> */
    public function update(string $id, array $body, ?RequestOptions $options = null): ApiResponse
    {
        return $this->unwrapped('PATCH', $this->prefix . '/webhooks/' . self::segment($id), $body, options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function delete(string $id, ?RequestOptions $options = null): ApiResponse
    {
        return $this->unwrapped('DELETE', $this->prefix . '/webhooks/' . self::segment($id), options: $options);
    }
    /**
 * @param array<string,mixed> $body
 *
 * @return ApiResponse<array<string,mixed>> */
    public function test(string $id, array $body = [], ?RequestOptions $options = null): ApiResponse
    {
        if ($this->prefix === '/platform' && (array_key_exists('body', $body) || array_key_exists('sessionId', $body))) {
            throw new ValidationException('Organization tests do not accept body or sessionId.');
        }
        return $this->unwrapped('POST', $this->prefix . '/webhooks/' . self::segment($id) . '/tests', $body === [] ? new \stdClass() : $body, options: $options);
    }
    /**
 * @param array<string,mixed> $body
 *
 * @return ApiResponse<array<string,mixed>> */
    public function rotateSecret(string $id, array $body = [], ?RequestOptions $options = null): ApiResponse
    {
        return $this->unwrapped('POST', $this->prefix . '/webhooks/' . self::segment($id) . '/secret-rotations', $body === [] ? new \stdClass() : $body, options: $options);
    }
}
