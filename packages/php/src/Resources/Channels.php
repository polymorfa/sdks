<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, ChannelModels, Models, RequestOptions};

/**
 * @phpstan-import-type Channel from ChannelModels
 * @phpstan-import-type CreateChannel from ChannelModels
 * @phpstan-import-type ChannelMessage from ChannelModels
 * @phpstan-import-type MessagesParams from ChannelModels
 * @phpstan-import-type UpdatesParams from ChannelModels
 * @phpstan-import-type Reaction from ChannelModels
 * @phpstan-import-type LiveUpdates from ChannelModels
 * @phpstan-import-type Accepted from ChannelModels
 * @phpstan-import-type Success from Models
 */
final class Channels extends Resource
{
    /** @return ApiResponse<array{success:bool,data:list<Channel>}> */
    public function list(string $session, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:list<Channel>}> */
        return $this->request('GET', self::path($session), options:$options);
    }
    /** @param CreateChannel $body
     * @return ApiResponse<array{success:bool,data:Channel|Accepted}> */
    public function create(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Channel|Accepted}> */
        return $this->request('POST', self::path($session), $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:Channel}> */
    public function retrieve(string $session, string $channelId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Channel}> */
        return $this->request('GET', self::path($session, $channelId), options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:array{status:'DELETED'}|Accepted}> */
    public function delete(string $session, string $channelId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:array{status:'DELETED'}|Accepted}> */
        return $this->request('DELETE', self::path($session, $channelId), options:$options);
    }
    /** @param MessagesParams $params
     * @return ApiResponse<array{success:bool,data:list<ChannelMessage>}> */
    public function listMessages(string $session, string $channelId, array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:list<ChannelMessage>}> */
        return $this->request('GET', self::path($session, $channelId).'/messages', query:$params, options:$options);
    }
    /** @param UpdatesParams $params
     * @return ApiResponse<array{success:bool,data:list<ChannelMessage>}> */
    public function listMessageUpdates(string $session, string $channelId, array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:list<ChannelMessage>}> */
        return $this->request('GET', self::path($session, $channelId).'/message-updates', query:$params, options:$options);
    }
    /** @return ApiResponse<Success|array{success:bool,data:array{status:'VIEWED'}|Accepted}> */
    public function markMessageViewed(string $session, string $channelId, string $messageId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success|array{success:bool,data:array{status:'VIEWED'}|Accepted}> */
        return $this->request('POST', self::path($session, $channelId).'/messages/'.self::segment($messageId).'/viewed', options:$options);
    }
    /** @param Reaction $body
     * @return ApiResponse<Success|array{success:bool,data:array{status:'UPDATED'}|Accepted}> */
    public function reactToMessage(string $session, string $channelId, string $messageId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success|array{success:bool,data:array{status:'UPDATED'}|Accepted}> */
        return $this->request('POST', self::path($session, $channelId).'/messages/'.self::segment($messageId).'/reaction', $body, options:($options ?? new RequestOptions())->withIdempotencyKey());
    }
    /** @return ApiResponse<array{success:bool,data:LiveUpdates|Accepted}> */
    public function subscribeToLiveUpdates(string $session, string $channelId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:LiveUpdates|Accepted}> */
        return $this->request('POST', self::path($session, $channelId).'/live-updates', options:$options);
    }
    /** @return ApiResponse<Success|array{success:bool,data:array{status:'FOLLOWED'}|Accepted}> */
    public function follow(string $session, string $channelId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success|array{success:bool,data:array{status:'FOLLOWED'}|Accepted}> */
        return $this->request('POST', self::path($session, $channelId).'/follow', options:$options);
    }
    /** @return ApiResponse<Success|array{success:bool,data:array{status:'UNFOLLOWED'}|Accepted}> */
    public function unfollow(string $session, string $channelId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success|array{success:bool,data:array{status:'UNFOLLOWED'}|Accepted}> */
        return $this->request('POST', self::path($session, $channelId).'/unfollow', options:$options);
    }
    /** @return ApiResponse<Success|array{success:bool,data:array{status:'MUTED'}|Accepted}> */
    public function mute(string $session, string $channelId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success|array{success:bool,data:array{status:'MUTED'}|Accepted}> */
        return $this->request('POST', self::path($session, $channelId).'/mute', options:$options);
    }
    /** @return ApiResponse<Success|array{success:bool,data:array{status:'UNMUTED'}|Accepted}> */
    public function unmute(string $session, string $channelId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success|array{success:bool,data:array{status:'UNMUTED'}|Accepted}> */
        return $this->request('POST', self::path($session, $channelId).'/unmute', options:$options);
    }
    private static function path(string $session, ?string $channelId = null): string
    {
        return '/messaging/'.self::segment($session).'/channels'.($channelId === null ? '' : '/'.self::segment($channelId));
    }
}
