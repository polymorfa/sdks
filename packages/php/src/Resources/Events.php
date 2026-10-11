<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\ApiResponse;
use Polymorfa\CursorPage;
use Polymorfa\RequestOptions;
use Polymorfa\ConfigurationException;
use Polymorfa\EventStream;

final class Events extends PlatformResource
{
    /**
 * @param array<string,mixed> $params
 *
 * @return CursorPage<array<string,mixed>> */
    public function list(array $params = [], ?RequestOptions $options = null): CursorPage
    {
        return $this->page($this->prefix . '/events', $params, $options);
    }
    /**
 * @param array<string,mixed> $params
 *
 * @return ApiResponse<array<string,mixed>> */
    public function retrieve(string $id, array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        return $this->unwrapped('GET', $this->prefix . '/events/' . self::segment($id), query: $params, options: $options);
    }
    /**
 * @param array<string,mixed> $body
 *
 * @return ApiResponse<array<string,mixed>> */
    public function replay(string $id, array $body, ?RequestOptions $options = null): ApiResponse
    {
        return $this->unwrapped('POST', $this->prefix . '/events/' . self::segment($id) . '/replays', $body, options: $options);
    }
    /**
 * @param list<string> $types */
    public function stream(?string $projectId = null, ?string $since = null, array $types = [], bool $manualAck = false, ?RequestOptions $options = null): EventStream
    {
        $prefix = $this->prefix;
        if ($prefix === '/platform') {
            if ($projectId === null || trim($projectId) === '') {
                throw new ConfigurationException('projectId');
            }
            $prefix = '/platform/projects/' . self::segment($projectId);
        } elseif ($projectId !== null && $prefix !== '/platform/projects/' . self::segment($projectId)) {
            throw new ConfigurationException('projectId');
        }
        return new EventStream($this->transport, $prefix . '/events/stream', $since, $types, $manualAck, $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function acknowledgeStream(string $id, string $cursor, int $sequence, ?string $projectId = null, ?RequestOptions $options = null): ApiResponse
    {
        return $this->unwrapped('POST', $this->stream($projectId)->path . '/' . self::segment($id) . '/ack', ['cursor' => $cursor, 'sequence' => $sequence], options: $options);
    }
}
