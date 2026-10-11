<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{AnalyticsModels,ApiResponse,HttpTransport,RequestOptions,ServerException,ValidationException};

/**
 * @phpstan-import-type Analytics from AnalyticsModels
 * @phpstan-import-type Params from AnalyticsModels
 * @phpstan-import-type MetricsParams from AnalyticsModels
 */
final class AnalyticsResource extends PlatformResource
{
    private readonly string $path;
    public function __construct(HttpTransport $transport, private readonly ?string $projectId = null)
    {
        parent::__construct($transport, '/platform');
        $this->server();
        $this->path = $projectId === null ? '/platform/analytics' : '/platform/projects/'.self::segment($projectId).'/analytics';
    }
    /** @param Params $params
     * @return ApiResponse<Analytics> */
    public function get(array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        $this->validate($params);
        $start = $params['start'] ?? null;
        $end = $params['end'] ?? null;
        if ($start !== null && ($start < 0 || $start > 9007199254740991) || $end !== null && ($end < 0 || $end > 9007199254740991) || $start !== null && $end !== null && ($end < $start || $end - $start > 366 * 86400000)) {
            throw new ValidationException('Choose an ordered analytics range of up to 366 days.', 'invalid_analytics_range');
        }
        if ($this->projectId !== null) {
            unset($params['projectId']);
        }
        /** @var ApiResponse<Analytics> */ return $this->unwrapped('GET', $this->path, query:$params, options:$options);
    }
    /** @param MetricsParams $params
     * @return ApiResponse<string> */
    public function metrics(array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        $this->validate($params);
        if (isset($params['windowHours']) && ($params['windowHours'] < 1 || $params['windowHours'] > 168)) {
            throw new ValidationException('windowHours must be from 1 to 168.', 'invalid_analytics_range');
        }
        $format = $params['format'] ?? 'prometheus';
        $accept = $format === 'openmetrics' ? 'application/openmetrics-text' : 'text/plain';
        if ($this->projectId !== null) {
            unset($params['projectId']);
        } $params['format'] = $format;
        [$r,$metadata] = $this->transport->openStream('GET', $this->path.'/metrics', $params, options:$options, accept:$accept);
        try {
            $body = (string)$r->getBody();
        } finally {
            $r->getBody()->close();
        }
        if (strtolower(trim(explode(';', $r->getHeaderLine('content-type'))[0])) !== $accept || !preg_match('/^# TYPE polymorfa_analytics_enabled gauge$/m', $body) || $format === 'openmetrics' && !str_ends_with($body, "# EOF\n")) {
            throw new ServerException('Invalid analytics metrics response.', 'invalid_response', metadata:$metadata);
        }
        return new ApiResponse($body, $metadata);
    }
    /** @param array<string,mixed> $params */
    private function validate(array $params): void
    {
        foreach (['start','end'] as $key) {
            if (isset($params[$key]) && !is_int($params[$key])) {
                throw new ValidationException('Analytics range requires safe integer milliseconds.', 'invalid_analytics_range');
            }
        }
        if (isset($params['windowHours']) && !is_int($params['windowHours'])) {
            throw new ValidationException('windowHours must be an integer.', 'invalid_analytics_range');
        }
        if (isset($params['segments']) && !is_bool($params['segments'])) {
            throw new ValidationException('segments must be a boolean.', 'invalid_analytics_filter');
        }
        foreach (['projectId','sessionId'] as $key) {
            if (isset($params[$key]) && (!is_string($params[$key]) || !preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iD', $params[$key]))) {
                throw new ValidationException('Analytics filters require UUIDs.', 'invalid_analytics_filter');
            }
        }
        if ($this->projectId !== null && isset($params['projectId']) && is_string($params['projectId']) && strtolower($params['projectId']) !== strtolower($this->projectId)) {
            throw new ValidationException('Analytics cannot read outside this project.', 'invalid_analytics_filter');
        }
        if (isset($params['format']) && !in_array($params['format'], ['prometheus','openmetrics'], true)) {
            throw new ValidationException('Invalid metrics format.','invalid_analytics_filter');
        }
    }
}
