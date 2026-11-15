<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, QuickReplyModels, RequestOptions};

/**
 * @phpstan-import-type Mutation from QuickReplyModels
 * @phpstan-import-type QuickReply from QuickReplyModels
 * @phpstan-import-type Collection from QuickReplyModels
 * @phpstan-import-type DeletedReply from QuickReplyModels
 */
final class QuickReplies extends Resource
{
    /** @return ApiResponse<array{success:bool,data:Collection}> */
    public function list(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Collection}> */
        return $this->request('GET', self::path($connection), options:$options);
    }
    /** @param Mutation $body
     * @return ApiResponse<array{success:bool,data:QuickReply}> */
    public function create(string $connection, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:QuickReply}> */
        return $this->request('POST', self::path($connection), $body, options:$options);
    }
    /** @param Mutation $body
     * @return ApiResponse<array{success:bool,data:QuickReply}> */
    public function replace(string $connection, string $quickReplyId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:QuickReply}> */
        return $this->request('PUT', self::path($connection).'/'.self::segment($quickReplyId), $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:DeletedReply}> */
    public function delete(string $connection, string $quickReplyId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:DeletedReply}> */
        return $this->request('DELETE', self::path($connection).'/'.self::segment($quickReplyId), options:$options);
    }
    private static function path(string $connection): string
    {
        return '/messaging/'.self::segment($connection).'/business/quick-replies';
    }
}
