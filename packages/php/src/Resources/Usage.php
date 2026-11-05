<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,HttpTransport,RequestOptions,ServerException,UsageModels};

/**
 * @phpstan-import-type Summary from UsageModels
 * @phpstan-import-type Record from UsageModels
 * @phpstan-import-type RecordPage from UsageModels
 * @phpstan-import-type GateList from UsageModels
 * @phpstan-import-type SummaryParams from UsageModels
 * @phpstan-import-type RecordParams from UsageModels
 * @phpstan-import-type IterateParams from UsageModels
 * @phpstan-import-type GateParams from UsageModels
 */
final class Usage extends PlatformResource
{
    public function __construct(HttpTransport $transport, private readonly ?string $projectId = null)
    {
        parent::__construct($transport, '/platform');
    }
    /** @param SummaryParams $params
     * @return ApiResponse<Summary> */
    public function summary(array $params = [], ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<Summary> */return $this->unwrapped('GET', '/platform/usage', query:$this->query($params), options:$options);
    }
    /** @param RecordParams $params
     * @return ApiResponse<RecordPage> */
    public function listRecords(array $params = [], ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<RecordPage> */return $this->unwrapped('GET', '/platform/usage/records', query:$this->query($params), options:$options);
    }
    /** @param GateParams $params
     * @return ApiResponse<GateList> */
    public function listGates(array $params = [], ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<GateList> */return $this->unwrapped('GET', '/platform/gates', query:$this->query($params), options:$options);
    }
    /** @param IterateParams $params
     * @return \Generator<int,Record> */
    public function iterateRecords(array $params = [], ?RequestOptions $options = null): \Generator
    {
        $cursor = null;
        $seen = [];
        while (true) {
            $query = $params;
            if ($cursor !== null) {
                $query['cursor'] = $cursor;
            }$page = $this->listRecords($query, $options);
            $next = $page->data['nextCursor'];
            if ($next !== null && isset($seen[$next])) {
                throw new ServerException('The API repeated a usage record cursor.', 'invalid_response', metadata:$page->metadata);
            }foreach ($page->data['records'] as $record) {
                yield $record;
            }if ($next === null) {
                return;
            }$seen[$next] = true;
            $cursor = $next;
        }
    }
    /** @param array<string,mixed> $params
     * @return array<string,mixed> */
    private function query(array $params): array
    {
        if ($this->projectId !== null) {
            $params['projectId'] = $this->projectId;
        }return $params;
    }
}
