<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,BillingModels,RequestOptions,ValidationException};

/**
 * @phpstan-import-type Scope from BillingModels
 * @phpstan-import-type Balance from BillingModels
 * @phpstan-import-type BillingUsage from BillingModels
 * @phpstan-import-type Transaction from BillingModels
 * @phpstan-import-type Pricing from BillingModels
 * @phpstan-import-type Controls from BillingModels
 * @phpstan-import-type ControlsInput from BillingModels
 * @phpstan-import-type Priorities from BillingModels
 * @phpstan-import-type Limits from BillingModels
 * @phpstan-import-type ReadParams from BillingModels
 * @phpstan-import-type Reorder from BillingModels
 */
final class Billing extends Resource
{
    /** @return ApiResponse<array{data:Balance}> */
    public function retrieve(?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:Balance}> */return $this->request('GET', '/platform/billing', options:$options);
    }
    /** @return ApiResponse<array{data:BillingUsage}> */
    public function usage(?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:BillingUsage}> */return $this->request('GET', '/platform/billing/usage', options:$options);
    }
    /** @return ApiResponse<array{data:list<Transaction>}> */
    public function listTransactions(?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:list<Transaction>}> */return $this->request('GET', '/platform/billing/transactions', options:$options);
    }
    /** @return ApiResponse<array{data:list<Pricing>}> */
    public function listPricing(?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:list<Pricing>}> */return $this->request('GET', '/platform/billing/pricing', options:$options);
    }
    /** @param Scope $scope
     * @return ApiResponse<array{data:Controls}> */
    public function getResourceControls(string $scope, string $id, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:Controls}> */return $this->request('GET', self::resource('controls', $scope, $id), options:$options);
    }
    /** @param Scope $scope
     * @param ControlsInput $input
     * @return ApiResponse<array{data:Controls}> */
    public function setResourceControls(string $scope, string $id, array $input, ?RequestOptions $options = null): ApiResponse
    {
        self::limit($input['limitCredits']);
        self::priority($input['priority']);
        self::revision($input['expectedBudgetRevision']);
        self::revision($input['expectedPriorityRevision']);
        $body = ['limitCredits' => $input['limitCredits'],'priority' => $input['priority'],'expectedBudgetRevision' => $input['expectedBudgetRevision'],'expectedPriorityRevision' => $input['expectedPriorityRevision']];
        /** @var ApiResponse<array{data:Controls}> */return $this->request('PUT', self::resource('controls', $scope, $id), $body, options:$options);
    }
    /** @param ReadParams $params
     * @return ApiResponse<array{data:Limits}> */
    public function getLimits(array $params = [], ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:Limits}> */return $this->request('GET', '/platform/billing/limits', query:self::readParams($params), options:$options);
    }
    /** @param Scope $scope
     * @param array{limitCredits:int|float|null,expectedRevision:int} $input
     * @return ApiResponse<array{data:array{saved:bool}}> */
    public function setLimit(string $scope, string $id, array $input, ?RequestOptions $options = null): ApiResponse
    {
        self::limit($input['limitCredits']);
        self::revision($input['expectedRevision']);
        /** @var ApiResponse<array{data:array{saved:bool}}> */return $this->request('PUT', self::resource('limits', $scope, $id), ['limitCredits' => $input['limitCredits'],'expectedRevision' => $input['expectedRevision']], options:$options);
    }
    /** @param ReadParams $params
     * @return ApiResponse<array{data:Priorities}> */
    public function getPriorities(array $params = [], ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:Priorities}> */return $this->request('GET', '/platform/billing/priorities', query:self::readParams($params), options:$options);
    }
    /** @param Scope $scope
     * @param array{priority:int,expectedRevision:int} $input
     * @return ApiResponse<array{data:Priorities}> */
    public function setPriority(string $scope, string $id, array $input, ?RequestOptions $options = null): ApiResponse
    {
        self::priority($input['priority']);
        self::revision($input['expectedRevision']);
        /** @var ApiResponse<array{data:Priorities}> */return $this->request('PUT', self::resource('priorities', $scope, $id), ['priority' => $input['priority'],'expectedRevision' => $input['expectedRevision']], options:$options);
    }
    /** @param Reorder $input
     * @return ApiResponse<array{data:Priorities}> */
    public function reorderPriorities(array $input, ?RequestOptions $options = null): ApiResponse
    {
        self::revision($input['expectedRevision']);
        $scope = $input['scope'];
        if ($input['scope'] === 'resource') {
            $resources = [];
            $seen = [];
            foreach ($input['resources'] as $row) {
                self::resourceScope($row['scope']);
                $id = self::id($row['resourceId']);
                $key = $row['scope'].':'.$id;
                if (isset($seen[$key])) {
                    self::invalid('resources must be a unique complete list.');
                }$seen[$key] = true;
                $resources[] = ['scope' => $row['scope'],'resourceId' => $id];
            }
            if (count($resources) > 1000000) {
                self::invalid('resources must be a unique complete list.');
            }
            $body = ['scope' => $scope,'projectId' => self::id($input['projectId']),'resources' => $resources,'expectedRevision' => $input['expectedRevision']];
        } else {
            self::scope($scope);
            $ids = array_map(self::id(...), $input['resourceIds']);
            if (count(array_unique($ids)) !== count($ids)) {
                self::invalid('resourceIds must not contain duplicates.');
            }
            $body = ['scope' => $scope,'resourceIds' => $ids,'expectedRevision' => $input['expectedRevision']];
            if ($input['scope'] !== 'project') {
                $body['projectId'] = self::id($input['projectId']);
            }
        }
        /** @var ApiResponse<array{data:Priorities}> */return $this->request('PUT', '/platform/billing/priorities', $body, options:$options);
    }
    private static function invalid(string $message): never
    {
        throw new ValidationException($message, 'invalid_billing_control');
    }
    private static function id(string $id): string
    {
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iD', $id)) {
            self::invalid('Resource must be a UUID.');
        }return strtolower($id);
    }
    private static function resourceScope(string $scope): void
    {
        if (!in_array($scope, ['customer','number'], true)) {
            self::invalid('Resource scope must be customer or number.');
        }
    }
    private static function scope(string $scope): void
    {
        if (!in_array($scope, ['project','customer','number'], true)) {
            self::invalid('Scope must be project, customer or number.');
        }
    }
    private static function resource(string $name, string $scope, string $id): string
    {
        self::scope($scope);
        return '/platform/billing/'.$name.'/'.$scope.'/'.self::id($id);
    }
    private static function revision(mixed $v): void
    {
        if (!is_int($v) || $v < 0 || $v > 2147483646) {
            self::invalid('Expected revision must be a nonnegative integer.');
        }
    }
    private static function priority(mixed $v): void
    {
        if (!is_int($v) || $v < 0 || $v > 1000000) {
            self::invalid('Priority must be an integer from 0 to 1000000.');
        }
    }
    private static function limit(mixed $v): void
    {
        if ($v !== null && ((!is_int($v) && !is_float($v)) || !is_finite((float)$v) || $v < 0 || $v > 1000000 || (float)number_format((float)$v, 6, '.', '') !== (float)$v)) {
            self::invalid('Limit must be null or 0 to 1000000 credits with at most six decimal places.');
        }
    }
    /** @param array<string,mixed> $params
     * @return array<string,string> */
    private static function readParams(array $params): array
    {
        if (isset($params['scope']) && $params['scope'] !== 'project') {
            self::invalid('Read scope must be project.');
        }$query = [];
        if (isset($params['projectId'])) {
            if (!is_string($params['projectId'])) {
                self::invalid('Resource must be a UUID.');
            }$query['projectId'] = self::id($params['projectId']);
        }if (isset($params['scope'])) {
            $query['scope'] = 'project';
        }return $query;
    }
}
