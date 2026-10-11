<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,CustomerModels,RequestOptions};

/**
 * @phpstan-import-type Customer from CustomerModels
 * @phpstan-import-type CustomersStatus from CustomerModels
 * @phpstan-import-type Enablement from CustomerModels
 * @phpstan-import-type ProjectRequest from CustomerModels
 * @phpstan-import-type CustomerWrite from CustomerModels
 * @phpstan-import-type ListParams from CustomerModels
 * @phpstan-import-type ListEnvelope from CustomerModels
 * @phpstan-import-type CustomerNumber from CustomerModels
 * @phpstan-import-type Event from CustomerModels as CustomerEvent
 * @phpstan-import-type PairingLink from CustomerModels
 * @phpstan-import-type CreatedPairingLink from CustomerModels
 * @phpstan-import-type CreatePairingLink from CustomerModels
 * @phpstan-import-type EventParams from CustomerModels
 * @phpstan-import-type Transfer from CustomerModels
 */
final class Customers extends Resource
{
    /** @return ApiResponse<array{data:CustomersStatus}> */
    public function status(string $projectId, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:CustomersStatus}> */return $this->request('GET', '/platform/projects/'.self::segment($projectId).'/customers/status', options:$options);
    }
    /** @return ApiResponse<array{data:Enablement}> */
    public function enable(string $projectId, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:Enablement}> */return $this->request('POST', '/platform/projects/'.self::segment($projectId).'/customers/enable', options:$options);
    }
    /** @param ListParams $params
     * @return ApiResponse<ListEnvelope> */
    public function list(array $params, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<ListEnvelope> */return $this->request('GET', '/platform/customers', query:$params, options:$options);
    }
    /** @param CustomerWrite $body
     * @return ApiResponse<array{data:Customer}> */
    public function create(array $body = [], ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:Customer}> */return $this->request('POST', '/platform/customers', (object)$body, options:$options);
    }
    /** @return ApiResponse<array{data:Customer}> */
    public function retrieve(string $id, string $projectId, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:Customer}> */return $this->request('GET', self::path($id), query:['projectId' => $projectId], options:$options);
    }
    /** @param CustomerWrite $body
     * @return ApiResponse<array{data:Customer}> */
    public function update(string $id, array $body, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:Customer}> */return $this->request('PATCH', self::path($id), (object)$body, options:$options);
    }
    /** @param ProjectRequest $body
     * @return ApiResponse<array{data:Customer}> */
    public function archive(string $id, array $body = [], ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:Customer}> */return $this->request('POST', self::path($id).'/archive', (object)$body, options:$options);
    }
    /** @param ProjectRequest $body
     * @return ApiResponse<array{data:Customer}> */
    public function restore(string $id, array $body = [], ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:Customer}> */return $this->request('POST', self::path($id).'/restore', (object)$body, options:$options);
    }
    /** @return ApiResponse<array{data:list<CustomerNumber>}> */
    public function listNumbers(string $id, string $projectId, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:list<CustomerNumber>}> */return $this->request('GET', self::path($id).'/numbers', query:['projectId' => $projectId], options:$options);
    }
    /** @param EventParams $params
     * @return ApiResponse<array{data:list<CustomerEvent>}> */
    public function listEvents(string $id, array $params, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:list<CustomerEvent>}> */return $this->request('GET', self::path($id).'/events', query:$params, options:$options);
    }
    /** @param CreatePairingLink $body
     * @return ApiResponse<array{data:CreatedPairingLink}> */
    public function createPairingLink(string $id, array $body = [], ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:CreatedPairingLink}> */return $this->request('POST', self::path($id).'/pairing-links', (object)$body, options:$options);
    }
    /** @return ApiResponse<array{data:list<PairingLink>}> */
    public function listPairingLinks(string $id, string $projectId, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:list<PairingLink>}> */return $this->request('GET', self::path($id).'/pairing-links', query:['projectId' => $projectId], options:$options);
    }
    /** @return ApiResponse<array{data:PairingLink}> */
    public function revokePairingLink(string $id, string $linkId, string $projectId, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:PairingLink}> */return $this->request('DELETE', self::path($id).'/pairing-links/'.self::segment($linkId), query:['projectId' => $projectId], options:$options);
    }
    /** @param Transfer $body
     * @return ApiResponse<array{data:CustomerNumber}> */
    public function transferNumber(string $id, string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{data:CustomerNumber}> */return $this->request('POST', self::path($id).'/numbers/'.self::segment($session).'/transfer', $body, options:$options);
    }
    private static function path(string $id): string
    {
        return '/platform/customers/'.self::segment($id);
    }
}
