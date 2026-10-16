<?php

declare(strict_types=1);

namespace Polymorfa;

/** @internal Endpoint-local JSON capture for changed contracts. No global transport policy. */
final class ExistingContract
{
    public static function options(?RequestOptions $options, bool $intent = false): RequestOptions
    {
        $options ??= new RequestOptions();
        $key = $options->idempotencyKey;
        if ($key !== null && (CampaignContractValidation::trim($key) === '' || strlen($key) > 255 || preg_match('//u', $key) !== 1 || preg_match('/[\x00-\x08\x0a-\x1f\x7f]/', $key))) {
            CampaignContractValidation::invalid('idempotencyKey');
        }
        return new RequestOptions($options->timeout, $options->maxNetworkRetries, $options->apiVersion ?? ($intent ? '2026-10-14' : null), $key, $options->headers, $options->cancellation);
    }
    /** @param array<string,mixed> $body */
    public static function body(array $body): ContractJsonBody
    {
        return new ContractJsonBody(CampaignContractValidation::semanticJson(self::tree($body, true)));
    }
    private static function tree(mixed $value, bool $object = false): mixed
    {
        if (!is_array($value)) {
            return $value;
        }
        $out = [];
        foreach ($value as $key => $child) {
            $dictionary = in_array($key, ['variableMapping','variables','attributes','configuration','set','observation','historySync','hms','testing','billingControls','media','blueprint'], true);
            if ($key === 'variableMapping' && is_array($child)) {
                $map = new \stdClass();
                foreach ($child as $name => $binding) {
                    $map->{(string) $name} = self::tree($binding, true);
                }
                $out[$key] = $map;
            } elseif (in_array($key, ['messagesArray','buttons','trackedLinks','recipients','members','variants','messageVariations'], true) && is_array($child)) {
                $out[$key] = array_map(static fn (mixed $v): mixed => self::tree($v, true), $child);
            } else {
                $out[$key] = self::tree($child, $dictionary);
            }
        }
        return $object ? (object) $out : $out;
    }
    private static function json(ResponseMetadata $metadata): bool
    {
        return strtolower(trim(explode(';', $metadata->headers['content-type'] ?? '')[0])) === 'application/json';
    }

    /** @return ApiResponse<array<string,mixed>> */
    public static function bare(HttpTransport $transport, string $method, string $path, mixed $body, ?RequestOptions $options, string $model, int $status = 200): ApiResponse
    {
        $response = $transport->requestJsonTree($method, $path, [], is_array($body) ? self::body($body) : $body, self::options($options));
        if ($response->metadata->status !== $status || !self::json($response->metadata) || !ExistingContractCodec::matches($response->data, $model)) {
            throw new ServerException('Invalid API response structure.', 'invalid_response', status:$response->metadata->status, metadata:$response->metadata);
        }
        /** @var array<string,mixed> $data */ $data = CampaignContractCodec::convert($response->data);
        return new ApiResponse($data, $response->metadata);
    }
    /** @param array<string,mixed> $query
     * @return ApiResponse<array<string,mixed>> */
    public static function request(HttpTransport $transport, string $method, string $path, mixed $body = null, array $query = [], ?RequestOptions $options = null, string $model = 'object', bool $messaging = false, int $status = 200): ApiResponse
    {
        $options = self::options($options);
        $options->cancellation?->throwIfCancelled();
        $captured = is_array($body) ? self::body($body) : $body;
        $response = $transport->requestJsonTree($method, $path, $query, $captured, $options);
        $value = $response->data;
        if ($response->metadata->status !== $status || !self::json($response->metadata) || !$value instanceof \stdClass || !property_exists($value, 'data') || ($messaging && ($value->success ?? null) !== true) || !ExistingContractCodec::matches($value->data, $model)
            || (in_array($model, ['recipients','platformRecipients'], true) && (!property_exists($value, 'page') || !CampaignContractCodec::matches($value->page, CampaignContractCodec::model('page'))))) {
            throw new ServerException('Invalid API response structure.', 'invalid_response', status: $response->metadata->status, metadata: $response->metadata);
        }
        /** @var array<string,mixed> $data */
        $data = CampaignContractCodec::convert($value);
        return new ApiResponse($data, $response->metadata);
    }
}
