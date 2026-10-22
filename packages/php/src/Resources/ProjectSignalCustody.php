<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

/**
 * @phpstan-import-type DefaultSettings from \Polymorfa\SignalCustodyModels as CustodyDefault
 * @phpstan-import-type ProjectUpdate from \Polymorfa\SignalCustodyModels as CustodyProjectUpdate
 * @phpstan-import-type CustomerUpdate from \Polymorfa\SignalCustodyModels as CustodyCustomerUpdate
 */
final readonly class ProjectSignalCustody
{
    private Projects $projects;
    private Customers $customers;

    public function __construct(\Polymorfa\HttpTransport $transport, private string $projectId)
    {
        $this->projects = new Projects($transport);
        $this->customers = new Customers($transport);
    }

    /**
     * @return \Polymorfa\ApiResponse<array{data:CustodyDefault}> */
    public function retrieve(?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        return $this->projects->getSignalCustody($this->projectId, $options);
    }

    /** @param CustodyProjectUpdate $body
     * @return \Polymorfa\ApiResponse<array{data:CustodyDefault}> */
    public function update(array $body, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        return $this->projects->updateSignalCustody($this->projectId, $body, $options);
    }

    /**
     * @return \Polymorfa\ApiResponse<array{data:CustodyDefault}> */
    public function retrieveCustomer(string $customerId, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        return $this->customers->getSignalCustody($this->projectId, $customerId, $options);
    }

    /** @param CustodyCustomerUpdate $body
     * @return \Polymorfa\ApiResponse<array{data:CustodyDefault}> */
    public function updateCustomer(string $customerId, array $body, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        return $this->customers->updateSignalCustody($this->projectId, $customerId, $body, $options);
    }

}
