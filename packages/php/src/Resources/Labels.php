<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, Models, RequestOptions};

/** @phpstan-import-type Label from Models
 * @phpstan-import-type LabelRead from Models
 * @phpstan-import-type Success from Models */
final class Labels extends Resource
{
    /**
 * @return ApiResponse<array{success:bool,data:LabelRead}> */
    public function list(string $session, ?bool $includeObservation = null, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:LabelRead}> */
        return $this->request('GET', $this->path($session), query:['includeObservation' => $includeObservation], options:$options);
    }
    /** @param array{name:string,color?:int} $body
 * @return ApiResponse<array{success:bool,data:Label}> */
    public function create(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Label}> */
        return $this->request('POST', $this->path($session), $body, options:$options);
    }
    /** @param array{name:string,color?:int}|array{name?:string,color:int} $body
 * @return ApiResponse<Success> */
    public function update(string $session, string $labelId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($session).'/'.self::segment($labelId), $body, options:$options);
    }
    /**
 * @return ApiResponse<Success> */
    public function delete(string $session, string $labelId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('DELETE', $this->path($session).'/'.self::segment($labelId), options:$options);
    }
    /**
 * @return ApiResponse<array{success:bool,data:LabelRead}> */
    public function listForChat(string $session, string $chatId, ?bool $includeObservation = null, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:LabelRead}> */
        return $this->request('GET', $this->path($session).'/chats/'.self::segment($chatId), query:['includeObservation' => $includeObservation], options:$options);
    }
    /** @param list<string> $labels
 * @return ApiResponse<Success> */
    public function replaceForChat(string $session, string $chatId, array $labels, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($session).'/chats/'.self::segment($chatId), ['labels' => $labels], options:$options);
    }
    private function path(string $session): string
    {
        return '/messaging/'.self::segment($session).'/labels';
    }
}
