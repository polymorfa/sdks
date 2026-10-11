<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\ApiResponse;
use Polymorfa\RequestOptions;
use Polymorfa\ValidationException;
use Polymorfa\ConfigurationException;
use Polymorfa\QuickLinkModels;

/**
 * @phpstan-import-type Link from QuickLinkModels
 * @phpstan-import-type Status from QuickLinkModels
 * @phpstan-import-type Availability from QuickLinkModels
 * @phpstan-import-type CreateInput from QuickLinkModels
 */
final class QuickLinks extends Resource
{
    /**
 * @param CreateInput $body
     *
 *
 * @return ApiResponse<array{success:bool,data:Link}> */
    public function create(array $body = [], ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        if (($body['purpose'] ?? 'initial') === 'add_connection' && empty($body['session'])) {
            throw new ValidationException('An add_connection QuickLink requires session.');
        }
        $this->validateBilling($body);
        /** @var ApiResponse<array{success:bool,data:Link}> */
        return $this->request('POST', '/messaging/quicklinks', $body === [] ? new \stdClass() : $body, options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:true,data:Availability}> */
    public function availability(string $projectId, string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:Availability}> */
        return $this->request('GET', '/messaging/quicklinks/availability', query: ['projectId' => $projectId, 'session' => $session], options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:true,data:Status}> */
    public function retrieve(string $id, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:Status}> */
        return $this->request('GET', '/messaging/quicklinks/' . self::segment($id), options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:bool,message:string}> */
    public function cancel(string $id, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,message:string}> */
        return $this->request('DELETE', '/messaging/quicklinks/' . self::segment($id), options: $options);
    }
    /** @param array<string,mixed> $body */
    private function validateBilling(array $body): void
    {
        $controls = $body['billingControls'] ?? null;
        if ($controls === null) {
            return;
        }
        if (!is_array($controls) || !array_key_exists('limitCredits', $controls) || !isset($controls['priority'])) {
            throw new ValidationException('Invalid initial billing controls.', 'invalid_billing_control');
        }
        $limit = $controls['limitCredits'];
        $priority = $controls['priority'];
        if (($limit !== null && (!is_int($limit) && !is_float($limit) || !is_finite($limit) || $limit < 0 || $limit > 1000000 || (float)number_format($limit, 6, '.', '') !== (float)$limit)) || !is_int($priority) || $priority < 0 || $priority > 1000000) {
            throw new ValidationException('Invalid initial billing controls.', 'invalid_billing_control');
        }
        if (($body['purpose'] ?? '') === 'add_connection' || is_array($body['configuration'] ?? null) && isset($body['configuration']['testing'])) {
            throw new ConfigurationException('billingControls');
        }
    }
}
