<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\ApiResponse;
use Polymorfa\RequestOptions;
use Polymorfa\HistoryModels;
use Polymorfa\Models;

/**
 * @phpstan-import-type HistoryChat from HistoryModels
 * @phpstan-import-type HistoryMessage from HistoryModels
 * @phpstan-import-type ChatParams from HistoryModels
 * @phpstan-import-type MessageParams from HistoryModels
 * @phpstan-import-type EditMessage from HistoryModels
 * @phpstan-import-type ServiceWindow from HistoryModels
 * @phpstan-import-type Success from Models
 */
final class Chats extends Resource
{
    private function path(string $session, string $conversation): string
    {
        return '/messaging/' . self::segment($session) . '/chats/' . self::segment($conversation);
    }
    /**
 * @param ChatParams $params
 *
 * @return ApiResponse<array{success:bool,data:list<HistoryChat>,hasMore:bool,nextCursor:string|null,previousCursor:string|null}> */
    public function list(string $session, array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:list<HistoryChat>,hasMore:bool,nextCursor:string|null,previousCursor:string|null}> */
        return $this->request('GET', '/messaging/' . self::segment($session) . '/chats', query: $params, options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:bool,data:HistoryChat}> */
    public function retrieve(string $session, string $conversation, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:HistoryChat}> */
        return $this->request('GET', $this->path($session, $conversation), options: $options);
    }
    /**
 * @param MessageParams $params
 *
 * @return ApiResponse<array{success:bool,data:list<HistoryMessage>,hasMore:bool,nextCursor:string|null,previousCursor:string|null}> */
    public function listMessages(string $session, string $conversation, array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:list<HistoryMessage>,hasMore:bool,nextCursor:string|null,previousCursor:string|null}> */
        return $this->request('GET', $this->path($session, $conversation) . '/messages', query: $params, options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:bool,data:HistoryMessage}> */
    public function retrieveMessage(string $session, string $conversation, string $id, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:HistoryMessage}> */
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
 * @param EditMessage $body
 *
 * @return ApiResponse<Success> */
    public function editMessage(string $session, string $conversation, string $id, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($session, $conversation) . '/messages/' . self::segment($id), $body, options: ($options ?? new RequestOptions())->withIdempotencyKey());
    }
    /** @param 'auto'|'linked_devices'|'official_api'|null $transport
     * @return ApiResponse<Success> */
    public function deleteMessage(string $session, string $conversation, string $id, ?string $transport = null, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('DELETE', $this->path($session, $conversation) . '/messages/' . self::segment($id), query: ['transport' => $transport], options: ($options ?? new RequestOptions())->withIdempotencyKey());
    }
    /**
 *
 * @return ApiResponse<Success> */
    public function archive(string $session, string $conversation, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('POST', $this->path($session, $conversation) . '/archive', options: $options);
    }
    /**
 *
 * @return ApiResponse<Success> */
    public function unarchive(string $session, string $conversation, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('POST', $this->path($session, $conversation) . '/unarchive', options: $options);
    }
    /** @param 0|86400|604800|7776000 $durationSeconds
     * @return ApiResponse<Success> */
    public function setDisappearingTimer(string $session, string $conversation, int $durationSeconds, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($session, $conversation) . '/disappearing', ['durationSeconds' => $durationSeconds], options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:bool,data:ServiceWindow}> */
    public function getServiceWindow(string $session, string $conversation, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:ServiceWindow}> */
        return $this->request('GET', $this->path($session, $conversation) . '/service-window', options: $options);
    }
}
