<?php

declare(strict_types=1);

namespace Polymorfa;

/** @internal Shared execution boundary for additive campaign/custody methods. */
final class CampaignContract
{
    public static function options(?RequestOptions $options, bool $write = false, bool $replay = false): RequestOptions
    {
        $options ??= new RequestOptions();
        $headers = [];
        foreach ($options->headers as $name => $value) {
            $headers[(string) $name] = (string) $value;
        }
        $key = $options->idempotencyKey;
        if ($key !== null && (CampaignContractValidation::trim($key) === '' || strlen($key) > 255 || preg_match('//u', $key) !== 1 || preg_match('/[\x00-\x08\x0a-\x1f\x7f]/', $key) === 1)) {
            CampaignContractValidation::invalid('idempotencyKey');
        }
        $result = new RequestOptions($options->timeout, $options->maxNetworkRetries ?? ($write && !$replay ? 0 : null), $options->apiVersion ?? '2026-10-14', $key, $headers, $options->cancellation);
        return $replay ? $result->withIdempotencyKey() : $result;
    }

    /** @param array<string,mixed> $query
     * @return ApiResponse<array<string,mixed>> */
    public static function request(HttpTransport $transport, string $method, string $path, array $query, mixed $body, ?RequestOptions $options, string $model, bool $messaging = false, bool $replay = false, bool $organizationOnly = false): ApiResponse
    {
        self::authority($transport, $organizationOnly);
        $selected = self::options($options, $method !== 'GET', $replay);
        $selected->cancellation?->throwIfCancelled();
        $captured = [];
        foreach ($query as $key => $value) {
            $captured[$key] = is_string($value) ? (string) $value : $value;
        }
        $encoded = $body === null ? null : ($body instanceof ContractJsonBody ? $body : new ContractJsonBody(json_encode($body, JSON_THROW_ON_ERROR)));
        $response = $transport->requestJsonTree($method, $path, $captured, $encoded, $selected);
        $value = $response->data;
        if ($response->metadata->status !== 200 || !$value instanceof \stdClass || !property_exists($value, 'data')
            || ($messaging && ($value->success ?? null) !== true)
            || !self::validContentType($response->metadata)
            || !CampaignContractCodec::matches($value->data, CampaignContractCodec::model($model))
            || (in_array($model, ['profiles', 'consents'], true) && (!property_exists($value, 'page') || !CampaignContractCodec::matches($value->page, CampaignContractCodec::model('page'))))) {
            throw new ServerException('Invalid API response structure.', 'invalid_response', status: $response->metadata->status, metadata: $response->metadata);
        }
        /** @var array<string,mixed> $data */
        $data = CampaignContractCodec::convert($value);
        return new ApiResponse($data, $response->metadata);
    }

    private static function validContentType(ResponseMetadata $metadata): bool
    {
        return strtolower(trim(explode(';', $metadata->headers['content-type'] ?? '')[0])) === 'application/json';
    }

    public static function authority(HttpTransport $transport, bool $organizationOnly = false): void
    {
        $kind = $transport->credentialKind();
        if (!in_array($kind, ['organization_api_key', 'project_token'], true) || ($organizationOnly && $kind !== 'organization_api_key')) {
            CampaignContractValidation::invalid('credential');
        }
    }

    /** @param array<string,mixed> $body */
    public static function body(array $body): ContractJsonBody
    {
        foreach (['variables', 'attributes'] as $field) {
            if (array_key_exists($field, $body)) {
                $body[$field] = (object) $body[$field];
            }
        }
        return new ContractJsonBody(CampaignContractValidation::semanticJson((object) $body));
    }

    /** @param array<string,mixed> $query
     * @return ApiResponse<CampaignRecipientExportPage> */
    public static function export(HttpTransport $transport, string $path, array $query, ?RequestOptions $options): ApiResponse
    {
        self::authority($transport);
        $selected = self::options($options);
        $captured = [];
        foreach ($query as $key => $value) {
            $captured[$key] = is_string($value) ? (string) $value : $value;
        }
        [$response, $metadata] = $transport->openStream('GET', $path, $captured, options: $selected, accept: 'text/csv');
        try {
            if ($metadata->status !== 200 || strtolower(trim(explode(';', $response->getHeaderLine('Content-Type'))[0])) !== 'text/csv') {
                throw new ServerException('The API did not return a CSV export.', 'invalid_response', status: $metadata->status, metadata: $metadata);
            }
            $selected->cancellation?->throwIfCancelled();
            $csv = (new MediaBodyStream($response->getBody(), $metadata, $selected->cancellation))->getContents();
            $selected->cancellation?->throwIfCancelled();
            return new ApiResponse(new CampaignRecipientExportPage($csv, $metadata->headers['polymorfa-next-cursor'] ?? null, MediaFiles::filename($metadata->headers['content-disposition'] ?? null)), $metadata);
        } finally {
            $response->getBody()->close();
        }
    }
}
