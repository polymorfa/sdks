<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

/**
 * @phpstan-import-type ReplyFlow from \Polymorfa\CampaignContractModels
 * @phpstan-import-type ReplyCreate from \Polymorfa\CampaignContractModels
 * @phpstan-import-type TestSendInput from \Polymorfa\CampaignContractModels
 * @phpstan-import-type TestSend from \Polymorfa\CampaignContractModels
 * @phpstan-import-type AssignmentInput from \Polymorfa\CampaignContractModels
 * @phpstan-import-type Assignment from \Polymorfa\CampaignContractModels
 * @phpstan-import-type LinkReport from \Polymorfa\CampaignContractModels
 * @phpstan-import-type Approval from \Polymorfa\CampaignContractModels
 * @phpstan-import-type ExportParams from \Polymorfa\CampaignContractModels
 */
final readonly class ProjectCampaigns
{
    private Campaigns $campaigns;

    public function __construct(\Polymorfa\HttpTransport $transport, private string $projectId)
    {
        $this->campaigns = new Campaigns($transport);
    }

    /** @param TestSendInput $body
     * @return \Polymorfa\ApiResponse<array{data:TestSend}> */
    public function testSend(string $id, array $body, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::testSend($body);
        return $this->campaigns->testSend($id, [...$body, 'projectId' => $this->projectId], $options);
    }

    /** @param ReplyCreate $body
     * @return \Polymorfa\ApiResponse<array{data:ReplyFlow}> */
    public function createReplyFlow(array $body, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::replyCreate($body);
        return $this->campaigns->createReplyFlow([...$body, 'projectId' => $this->projectId], $options);
    }

    /**
     * @return \Polymorfa\ApiResponse<array{data:ReplyFlow}> */
    public function getReplyFlow(string $id, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        return $this->campaigns->getReplyFlow($id, ['projectId' => $this->projectId], $options);
    }

    /** @param AssignmentInput $body
     * @return \Polymorfa\ApiResponse<array{data:Assignment}> */
    public function setReplyFlow(string $id, array $body, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::assignment($body);
        return $this->campaigns->setReplyFlow($id, [...$body, 'projectId' => $this->projectId], $options);
    }

    /**
     * @return \Polymorfa\ApiResponse<array{data:list<LinkReport>}> */
    public function links(string $id, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        return $this->campaigns->links($id, ['projectId' => $this->projectId], $options);
    }

    /**
     * @return \Polymorfa\ApiResponse<array{data:list<Approval>}> */
    public function listLaunchApprovals(string $id, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        return $this->campaigns->listLaunchApprovals($id, ['projectId' => $this->projectId], $options);
    }

    /** @param ExportParams $params
     * @return \Polymorfa\ApiResponse<\Polymorfa\CampaignRecipientExportPage> */
    public function exportRecipients(string $id, array $params = [], ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::export($params);
        return $this->campaigns->exportRecipients($id, [...$params, 'projectId' => $this->projectId], $options);
    }

}
