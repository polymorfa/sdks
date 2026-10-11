<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,CursorPage,RequestOptions,ValidationException,DeveloperModels};

/**
 * @phpstan-import-type Webhook from DeveloperModels
 * @phpstan-import-type WebhookCreate from DeveloperModels
 * @phpstan-import-type WebhookUpdate from DeveloperModels
 * @phpstan-import-type WebhookTest from DeveloperModels
 * @phpstan-import-type WebhookCreation from DeveloperModels
 * @phpstan-import-type WebhookMutation from DeveloperModels
 * @phpstan-import-type WebhookDeletion from DeveloperModels
 * @phpstan-import-type WebhookRotation from DeveloperModels
 * @phpstan-import-type ReplayReceipt from DeveloperModels
 */
final class PlatformWebhooks extends PlatformResource
{
    /** @param array{eventType?:string,enabled?:bool,limit?:int,cursor?:string} $params
 * @return CursorPage<Webhook> */
    public function list(array $params = [], ?RequestOptions $options = null): CursorPage
    {
        /** @var CursorPage<Webhook> $page */ $page = $this->page($this->prefix.'/webhooks', $params, $options);
        return $page;
    }
    /** @param WebhookCreate $body
 * @return ApiResponse<WebhookCreation> */
    public function create(array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<WebhookCreation> $response */ $response = $this->unwrapped('POST', $this->prefix.'/webhooks', $body, options:$options);
        return $response;
    }
    /**
 * @return ApiResponse<Webhook> */
    public function retrieve(string $id, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Webhook> $response */ $response = $this->unwrapped('GET', $this->prefix.'/webhooks/'.self::segment($id), options:$options);
        return $response;
    }
    /** @param WebhookUpdate $body
 * @return ApiResponse<WebhookMutation> */
    public function update(string $id, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<WebhookMutation> $response */ $response = $this->unwrapped('PATCH', $this->prefix.'/webhooks/'.self::segment($id), $body, options:$options);
        return $response;
    }
    /**
 * @return ApiResponse<WebhookDeletion> */
    public function delete(string $id, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<WebhookDeletion> $response */ $response = $this->unwrapped('DELETE', $this->prefix.'/webhooks/'.self::segment($id), options:$options);
        return $response;
    }
    /** @param WebhookTest $body
 * @return ApiResponse<ReplayReceipt> */
    public function test(string $id, array $body = [], ?RequestOptions $options = null): ApiResponse
    {
        if ($this->prefix === '/platform' && (array_key_exists('body', $body) || array_key_exists('sessionId', $body))) {
            throw new ValidationException('Organization tests do not accept body or sessionId.');
        }
        /** @var ApiResponse<ReplayReceipt> $response */ $response = $this->unwrapped('POST', $this->prefix.'/webhooks/'.self::segment($id).'/tests', $body === [] ? new \stdClass() : $body, options:$options);
        return $response;
    }
    /** @param array{overlapSeconds?:int} $body
 * @return ApiResponse<WebhookRotation> */
    public function rotateSecret(string $id, array $body = [], ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<WebhookRotation> $response */ $response = $this->unwrapped('POST', $this->prefix.'/webhooks/'.self::segment($id).'/secret-rotations', $body === [] ? new \stdClass() : $body, options:$options);
        return $response;
    }
}
