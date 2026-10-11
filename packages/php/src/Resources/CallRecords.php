<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,CallRecordModels,ConfigurationException,CursorPage,HttpTransport,RequestOptions,ServerException};

/**
 * @phpstan-import-type Record from CallRecordModels
 * @phpstan-import-type Detail from CallRecordModels
 * @phpstan-import-type Stats from CallRecordModels
 * @phpstan-import-type StatsParams from CallRecordModels
 * @phpstan-import-type ListParams from CallRecordModels
 * @phpstan-import-type ExportParams from CallRecordModels
 * @phpstan-import-type ExportPage from CallRecordModels
 */
final class CallRecords extends PlatformResource
{
    public function __construct(HttpTransport $transport, private readonly ?string $projectId = null)
    {
        parent::__construct($transport, '/platform/calls');
        $this->server();
    }
    /** @param array{projectId?:string} $params
     * @return ApiResponse<Detail> */
    public function retrieve(string $id, array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        if (preg_match('/^[\x21-\x7e]{1,128}$/D', $id) !== 1) {
            throw new ConfigurationException('callId');
        }
        /** @var ApiResponse<Detail> */ return $this->unwrapped('GET', $this->prefix.'/'.rawurlencode($id), query:$this->filters($params), options:$options);
    }
    /** @param StatsParams $params
     * @return ApiResponse<Stats> */
    public function stats(array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        $query = $this->filters($params);
        if (isset($params['groupBy'])) {
            $query['groupBy'] = $this->choice($params['groupBy'], ['day','hour','session','outcome']);
        } if (isset($params['timezone'])) {
            $query['timezone'] = $this->text($params['timezone'], 64);
        }
        /** @var ApiResponse<Stats> */ return $this->unwrapped('GET', $this->prefix.'/stats', query:$query, options:$options);
    }
    /** @param ListParams $params
     * @return CursorPage<Record> */
    public function list(array $params = [], ?RequestOptions $options = null): CursorPage
    {
        $query = $this->limits($this->filters($params), $params, 100);
        /** @var CursorPage<Record> */ return $this->page($this->prefix, $query, $options);
    }
    /** @param ExportParams $params
     * @return ApiResponse<ExportPage> */
    public function export(array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        $format = $params['format'] ?? 'csv';
        $accept = $format === 'csv' ? 'text/csv' : 'application/x-ndjson';
        $query = $this->limits($this->filters($params), $params, 1000);
        $query['format'] = $this->choice($format, ['csv','ndjson']);
        [$response,$metadata] = $this->transport->openStream('GET', $this->prefix.'/export', $query, options:$options, accept:$accept);
        try {
            $body = (string)$response->getBody();
        } finally {
            $response->getBody()->close();
        }
        if (strtolower(trim(explode(';', $response->getHeaderLine('content-type'))[0])) !== $accept) {
            throw new ServerException('Unexpected call export content type.', 'invalid_response', metadata:$metadata);
        }
        $next = $response->getHeaderLine('polymorfa-next-cursor');
        return new ApiResponse(['format' => $format,'body' => $body,'nextCursor' => $next === '' ? null : $next], $metadata);
    }
    /** @param ExportParams $params
     * @return \Generator<int,string> */
    public function exportAll(array $params = [], ?RequestOptions $options = null): \Generator
    {
        $seen = [];
        if (isset($params['cursor'])) {
            $seen[$params['cursor']] = true;
        } $first = true;
        while (true) {
            $r = $this->export($params, $options);
            $next = $r->data['nextCursor'];
            if ($next !== null && isset($seen[$next])) {
                throw new ServerException('The API repeated a call export cursor.', 'invalid_response', metadata:$r->metadata);
            }
            $body = $r->data['body'];
            if (!$first && $r->data['format'] === 'csv') {
                $end = strpos($body, "\n");
                $body = $end === false ? '' : substr($body, $end + 1);
            } $first = false;
            if ($body !== '') {
                yield $body;
            } if ($next === null) {
                return;
            } $seen[$next] = true;
            $params['cursor'] = $next;
        }
    }
    /** @param array<string,mixed> $params
     * @return array<string,mixed> */
    private function filters(array $params): array
    {
        $query = [];
        if ($this->projectId !== null && isset($params['projectId']) && $params['projectId'] !== $this->projectId) {
            throw new ConfigurationException('A project client reads only its own calls.');
        }
        $project = $this->projectId ?? ($params['projectId'] ?? null);
        if ($project !== null) {
            $query['projectId'] = $this->text($project, 64);
        }
        if (isset($params['sessionId'])) {
            $query['sessionId'] = $this->text($params['sessionId'], 128);
        }
        foreach (['direction' => ['inbound','outbound'],'upstream' => ['linked_device','cloud_api'],'outcome' => ['answered','missed','declined','failed','in_progress']] as $key => $values) {
            if (isset($params[$key])) {
                $query[$key] = $this->choice($params[$key], $values);
            }
        }
        foreach (['since','until'] as $key) {
            if (isset($params[$key])) {
                $value = $params[$key];
                if ($value instanceof \DateTimeInterface) {
                    $value = $value->format('Y-m-d\TH:i:s.vP');
                }
                if (!is_string($value) || preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/D', $value) !== 1) {
                    throw new ConfigurationException('Call timestamps require an ISO date-time with a time zone.');
                }
                try {
                    new \DateTimeImmutable($value);
                } catch (\Exception) {
                    throw new ConfigurationException('Invalid call timestamp.');
                }
                $warnings = \DateTimeImmutable::getLastErrors();
                if ($warnings !== false && ($warnings['warning_count'] > 0 || $warnings['error_count'] > 0)) {
                    throw new ConfigurationException('Invalid call timestamp.');
                } $query[$key] = $value;
            }
        } return $query;
    }
    private function text(mixed $value, int $max): string
    {
        if (!is_string($value) || trim($value) === '' || strlen($value) > $max) {
            throw new ConfigurationException('Invalid call filter.');
        } return $value;
    }
    /** @param list<string> $values */
    private function choice(mixed $value, array $values): string
    {
        if (!is_string($value) || !in_array($value, $values, true)) {
            throw new ConfigurationException('Invalid call filter.');
        } return $value;
    }
    /** @param array<string,mixed> $query
     * @param array<string,mixed> $params
     * @return array<string,mixed> */
    private function limits(array $query, array $params, int $max): array
    {
        if (isset($params['limit'])) {
            if (!is_int($params['limit']) || $params['limit'] < 1 || $params['limit'] > $max) {
                throw new ConfigurationException('Invalid call page limit.');
            } $query['limit'] = $params['limit'];
        } if (isset($params['cursor'])) {
            $query['cursor'] = $this->text($params['cursor'],256);
        } return $query;
    }
}
