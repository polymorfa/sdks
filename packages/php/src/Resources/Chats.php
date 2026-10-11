<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\ApiResponse;
use Polymorfa\RequestOptions;

final class Chats extends Resource
{
    private function path(string $session, string $conversation): string
    {
        return '/messaging/' . self::segment($session) . '/chats/' . self::segment($conversation);
    }
    /**
 * @param array{limit?:int,cursor?:string,kind?:string,activeSince?:string,activeBefore?:string} $params
 *
 * @return ApiResponse<array<string,mixed>> */
    public function list(string $session, array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->request('GET', '/messaging/' . self::segment($session) . '/chats', query: $params, options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function retrieve(string $session, string $conversation, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->request('GET', $this->path($session, $conversation), options: $options);
    }
    /**
 * @param array{limit?:int,cursor?:string,order?:'asc'|'desc',since?:string,until?:string,direction?:string,types?:string} $params
 *
 * @return ApiResponse<array<string,mixed>> */
    public function listMessages(string $session, string $conversation, array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->request('GET', $this->path($session, $conversation) . '/messages', query: $params, options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function retrieveMessage(string $session, string $conversation, string $id, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->request('GET', $this->path($session, $conversation) . '/messages/' . self::segment($id), options: $options);
    }
    /**
 *
 * @return ApiResponse<string> */
    public function downloadMessageMedia(string $session, string $conversation, string $id, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->transport->binary($this->path($session, $conversation) . '/messages/' . self::segment($id) . '/media', $options);
    }
    /**
 * @param array<string,mixed> $body
 *
 * @return ApiResponse<array<string,mixed>> */
    public function editMessage(string $session, string $conversation, string $id, array $body, ?RequestOptions $options = null): ApiResponse
    {
        return $this->request('PUT', $this->path($session, $conversation) . '/messages/' . self::segment($id), $body, options: ($options ?? new RequestOptions())->withIdempotencyKey());
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function deleteMessage(string $session, string $conversation, string $id, ?string $transport = null, ?RequestOptions $options = null): ApiResponse
    {
        return $this->request('DELETE', $this->path($session, $conversation) . '/messages/' . self::segment($id), query: ['transport' => $transport], options: ($options ?? new RequestOptions())->withIdempotencyKey());
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function archive(string $session, string $conversation, ?RequestOptions $options = null): ApiResponse
    {
        return $this->request('POST', $this->path($session, $conversation) . '/archive', options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function unarchive(string $session, string $conversation, ?RequestOptions $options = null): ApiResponse
    {
        return $this->request('POST', $this->path($session, $conversation) . '/unarchive', options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function setDisappearingTimer(string $session, string $conversation, int $durationSeconds, ?RequestOptions $options = null): ApiResponse
    {
        return $this->request('PUT', $this->path($session, $conversation) . '/disappearing', ['durationSeconds' => $durationSeconds], options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function getServiceWindow(string $session, string $conversation, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->request('GET', $this->path($session, $conversation) . '/service-window', options: $options);
    }
}
