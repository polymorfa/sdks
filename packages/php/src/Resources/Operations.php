<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, CursorPage, DeveloperModels, RequestOptions, ConfigurationException, TimeoutException};

/**
 * @phpstan-import-type Operation from DeveloperModels
 * @phpstan-import-type OperationParams from DeveloperModels
 * @phpstan-import-type Transition from DeveloperModels
 * @phpstan-import-type Cancellation from DeveloperModels
 */
final class Operations extends PlatformResource
{
    /** @param OperationParams $params
 * @return CursorPage<Operation> */
    public function list(array $params = [], ?RequestOptions $options = null): CursorPage
    {
        /** @var CursorPage<Operation> $page */
        $page = $this->page($this->prefix.'/operations', $params, $options);
        return $page;
    }
    /** @param array{wait?:int,afterSequence?:int,projectId?:string} $params
 * @return ApiResponse<Operation> */
    public function retrieve(string $id, array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        $options ??= new RequestOptions();
        $wait = $params['wait'] ?? 0;
        if ($wait < 0 || $wait > 30) {
            throw new ConfigurationException('wait');
        }
        if ($wait > 0 && $options->timeout === null) {
            $options = new RequestOptions($wait + 15, $options->maxNetworkRetries, $options->apiVersion, $options->idempotencyKey, $options->headers, $options->cancellation);
        }
        /** @var ApiResponse<Operation> $response */
        $response = $this->unwrapped('GET', $this->prefix.'/operations/'.self::segment($id), query:$params, options:$options);
        return $response;
    }
    /** @param array{afterSequence?:int,cursor?:never,limit?:int}|array{cursor:string,afterSequence?:never,limit?:int} $params
 * @return CursorPage<Transition> */
    public function listTransitions(string $id, array $params = [], ?RequestOptions $options = null): CursorPage
    {
        /** @var CursorPage<Transition> $page */
        $page = $this->page($this->prefix.'/operations/'.self::segment($id).'/transitions', $params, $options);
        return $page;
    }
    /**
 * @return ApiResponse<Cancellation> */
    public function cancel(string $id, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Cancellation> $response */
        $response = $this->unwrapped('POST', $this->prefix.'/operations/'.self::segment($id).'/cancel', options:($options ?? new RequestOptions())->withIdempotencyKey());
        return $response;
    }
    /**
 * @return ApiResponse<Operation> */
    public function wait(string $id, float $maxWaitSeconds = 300, ?int $afterSequence = null, ?RequestOptions $options = null): ApiResponse
    {
        if ($maxWaitSeconds < 0 || !is_finite($maxWaitSeconds)) {
            throw new ConfigurationException('maxWaitSeconds');
        }
        $options ??= new RequestOptions();
        $deadline = microtime(true) + $maxWaitSeconds;
        $latest = null;
        do {
            $options->cancellation?->throwIfCancelled();
            $remaining = max(0.0, $deadline - microtime(true));
            $wait = min(30, (int) floor($remaining));
            $params = ['wait' => $wait];
            if ($afterSequence !== null) {
                $params['afterSequence'] = $afterSequence;
            }
            $bounded = new RequestOptions(min($options->timeout ?? max(1, $remaining), max(1, $remaining)), $options->maxNetworkRetries, $options->apiVersion, $options->idempotencyKey, $options->headers, $options->cancellation);
            try {
                $latest = $this->retrieve($id, $params, $bounded);
            } catch (TimeoutException $error) {
                if ($latest !== null && microtime(true) >= $deadline) {
                    return $latest;
                } throw $error;
            }
            if (in_array($latest->data['status'], ['succeeded','failed','cancelled'], true) || ($afterSequence !== null && $latest->data['sequence'] > $afterSequence) || $wait === 0) {
                return $latest;
            }
        } while (microtime(true) < $deadline);
        return $latest;
    }
}
