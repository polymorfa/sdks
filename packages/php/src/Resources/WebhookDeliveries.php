<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, CursorPage, DeveloperModels, RequestOptions};

/**
 * @phpstan-import-type Delivery from DeveloperModels
 * @phpstan-import-type DeliveryParams from DeveloperModels
 * @phpstan-import-type Attempt from DeveloperModels
 * @phpstan-import-type DeliveryRetry from DeveloperModels
 */
final class WebhookDeliveries extends PlatformResource
{
    /** @param DeliveryParams $params
 * @return CursorPage<Delivery> */
    public function list(array $params = [], ?RequestOptions $options = null): CursorPage
    {
        /** @var CursorPage<Delivery> $page */
        $page = $this->page($this->prefix.'/webhook-deliveries', $params, $options);
        return $page;
    }
    /**
 * @return ApiResponse<Delivery> */
    public function retrieve(string $id, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Delivery> $response */
        $response = $this->unwrapped('GET', $this->prefix.'/webhook-deliveries/'.self::segment($id), options:$options);
        return $response;
    }
    /** @param array{limit?:int,cursor?:string} $params
 * @return CursorPage<Attempt> */
    public function listAttempts(string $id, array $params = [], ?RequestOptions $options = null): CursorPage
    {
        /** @var CursorPage<Attempt> $page */
        $page = $this->page($this->prefix.'/webhook-deliveries/'.self::segment($id).'/attempts', $params, $options);
        return $page;
    }
    /**
 * @return ApiResponse<Attempt> */
    public function retrieveAttempt(string $id, string $attemptId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Attempt> $response */
        $response = $this->unwrapped('GET', $this->prefix.'/webhook-deliveries/'.self::segment($id).'/attempts/'.self::segment($attemptId), options:$options);
        return $response;
    }
    /**
 * @return ApiResponse<DeliveryRetry> */
    public function retry(string $id, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<DeliveryRetry> $response */
        $response = $this->unwrapped('POST', $this->prefix.'/webhook-deliveries/'.self::segment($id).'/retry', new \stdClass(), options:$options);
        return $response;
    }
}
