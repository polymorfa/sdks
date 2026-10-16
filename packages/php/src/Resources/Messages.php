<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\ApiResponse;
use Polymorfa\RequestOptions;
use Polymorfa\Models;
use Polymorfa\MessageModels;

/**
 * @phpstan-import-type Success from Models
 * @phpstan-import-type Conversation from MessageModels
 * @phpstan-import-type SendRequest from MessageModels as MessageRequest
 * @phpstan-import-type Receipt from MessageModels as MessageReceipt
 * @phpstan-import-type MessageResponse from MessageModels
 * @phpstan-import-type Operation from MessageModels
 */
final class Messages extends Resource
{
    /**
 * @param MessageRequest $body
 *
 * @return ApiResponse<array{success:true,data:MessageResponse}> */
    public function send(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        [$body, $settings] = self::prepareDescriptors($body, $options ?? new RequestOptions());
        if (array_key_exists('requestPhoneNumber', $body['content'])) {
            $body['content']['requestPhoneNumber'] = new \stdClass();
        }
        $response = $this->request(
            'POST',
            '/messaging/' . self::segment($session) . '/messages/send',
            self::hasDescriptor($body) ? \Polymorfa\ExistingContract::body($body) : $body,
            options: $settings->withIdempotencyKey()
        );
        $data = self::decodeDescriptors($response->data);
        /** @var array{success:true,data:MessageResponse} $data */
        return new ApiResponse($data, $response->metadata);
    }

    /** @param array<string,mixed> $body */
    private static function hasDescriptor(array $body): bool
    {
        foreach ($body['content'] as $media) {
            if (is_array($media) && array_key_exists('descriptor', $media)) {
                return true;
            }
        }
        return false;
    }

    /** @param array<string,mixed> $response
     * @return array<string,mixed> */
    private static function decodeDescriptors(array $response): array
    {
        if (!isset($response['data']) || !is_array($response['data']) || !isset($response['data']['content']) || !is_array($response['data']['content'])) {
            return $response;
        }
        foreach (['image' => 'image','video' => 'video','file' => 'document','voice' => 'audio','sticker' => 'sticker'] as $field => $kind) {
            $media = $response['data']['content'][$field] ?? null;
            if (!is_array($media) || !array_key_exists('descriptor', $media)) {
                continue;
            }
            if (!is_array($media['descriptor']) || array_is_list($media['descriptor'])) {
                throw new \Polymorfa\ServerException('The API returned an invalid media descriptor.', 'invalid_response');
            }
            if ($field === 'voice' && ($media['ptt'] ?? false) === true) {
                $kind = 'ptt';
            }
            /** @var array<string,mixed> $wire */
            $wire = $media['descriptor'];
            $response['data']['content'][$field]['descriptor'] = \Polymorfa\WhatsAppMediaSendDescriptor::fromWire($kind, $wire);
        }
        return $response;
    }

    /**
     * @param array<string,mixed> $body
     * @return array{array<string,mixed>,RequestOptions}
     */
    private static function prepareDescriptors(array $body, RequestOptions $settings): array
    {
        if (!isset($body['content']) || !is_array($body['content']) || count($body['content']) !== 1) {
            throw new \Polymorfa\ConfigurationException('content');
        }
        $copy = [];
        foreach ($body as $key => $value) {
            $copy[$key] = self::copyValue($value);
        }
        $body = $copy;
        foreach ($body['content'] as $kind => $media) {
            if ($kind === 'sticker' && (!is_array($media) || !array_key_exists('descriptor', $media))) {
                throw new \Polymorfa\ConfigurationException('descriptor');
            }
            if (!is_array($media) || !array_key_exists('descriptor', $media)) {
                continue;
            }
            $descriptor = $media['descriptor'];
            if (!in_array($kind, ['image','video','file','voice','sticker'], true) || !$descriptor instanceof \Polymorfa\WhatsAppMediaSendDescriptor || array_key_exists('url', $media) || array_key_exists('base64', $media) || array_key_exists('mimeType', $media) || ($kind !== 'file' && array_key_exists('filename', $media)) || ($kind !== 'voice' && array_key_exists('ptt', $media)) || ($kind === 'sticker' && array_key_exists('caption', $media))) {
                throw new \Polymorfa\ConfigurationException('descriptor');
            }
            $expected = match ($descriptor->mediaType) {
                'document' => 'file', 'audio','ptt' => 'voice', default => $descriptor->mediaType
            };
            if ($kind !== $expected) {
                throw new \Polymorfa\ConfigurationException('mediaType');
            }
            $body['content'][$kind]['descriptor'] = $descriptor->toWire();
            if ($settings->apiVersion === null) {
                $settings = new RequestOptions($settings->timeout, $settings->maxNetworkRetries, \Polymorfa\Resources\WhatsAppMedia::API_VERSION, $settings->idempotencyKey, $settings->headers, $settings->cancellation);
            }
        }
        return [$body, $settings];
    }

    private static function copyValue(mixed $value): mixed
    {
        if (!is_array($value)) {
            return $value;
        }
        $copy = [];
        foreach ($value as $key => $child) {
            $copy[$key] = self::copyValue($child);
        }
        return $copy;
    }

    /**
 * @param array{conversation:Conversation,id:string,reaction:string,transport?:'auto'|'linked_devices'|'official_api'} $body
 *
 * @return ApiResponse<array{success:true,data:MessageReceipt}> */
    public function react(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:true,data:MessageReceipt}> */
        return $this->request(
            'POST',
            '/messaging/' . self::segment($session) . '/messages/react',
            $body,
            options: ($options ?? new RequestOptions())->withIdempotencyKey()
        );
    }

    /**
 * @param array{conversation:Conversation,id:string} $body
 *
 * @return ApiResponse<array{success:bool,data:array{status:string}}> */
    public function markSeen(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:array{status:string}}> */
        return $this->request('POST', '/messaging/' . self::segment($session) . '/messages/seen', $body, options: $options);
    }

    /**
 * @param array{conversation:Conversation,id?:string,state:'typing'|'recording'|'paused'} $body
 *
 * @return ApiResponse<array{success:bool,data:array{status:string}}> */
    public function setTyping(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:array{status:string}}> */
        return $this->request('POST', '/messaging/' . self::segment($session) . '/messages/typing', $body, options: $options);
    }

    /**
 * @param array{conversation:Conversation,id:string,star:bool} $body
 *
 * @return ApiResponse<array{success:bool,data:array{status:'OK'}}> */
    public function star(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:array{status:'OK'}}> */
        return $this->request('POST', '/messaging/' . self::segment($session) . '/messages/star', $body, options: $options);
    }

    /** @return ApiResponse<array{success:true,data:Operation}> */
    public function operationStatus(string $session, string $operationId, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:Operation}> */
        return $this->request('GET', '/messaging/' . self::segment($session) . '/operations/' . self::segment($operationId), options: $options);
    }
}
