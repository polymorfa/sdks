<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, AccountModels, BanSafeModels, RequestOptions};

/**
 * @phpstan-import-type ProjectStats from AccountModels
 * @phpstan-import-type CreateProject from AccountModels
 * @phpstan-import-type CreatedProject from AccountModels
 * @phpstan-import-type Business from AccountModels as ProductionBusiness
 * @phpstan-import-type Enrollment from AccountModels
 * @phpstan-import-type EnrollmentCommand from AccountModels
 * @phpstan-import-type MergeCandidate from AccountModels
 * @phpstan-import-type ProjectSafeMode from BanSafeModels
 * @phpstan-import-type UpdateProjectSafeMode from BanSafeModels
 * @phpstan-import-type ProjectWarmupPlan from BanSafeModels
 * @phpstan-import-type UpdateProjectWarmupPlan from BanSafeModels
 * @phpstan-import-type ProjectInsuranceEvidence from BanSafeModels
 * @phpstan-import-type UpdateProjectInsuranceEvidence from BanSafeModels
 * @phpstan-import-type ProjectHealthPolicy from BanSafeModels
 * @phpstan-import-type UpdateProjectHealthPolicy from BanSafeModels
 */
final class Projects extends Resource
{
    /** @return ApiResponse<array{data:ProjectSafeMode}> */
    public function getSafeMode(string $projectId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:ProjectSafeMode}> */
        return $this->request('GET', self::path($projectId).'/safe-mode', options:$options);
    }
    /** @param UpdateProjectSafeMode $body
     * @return ApiResponse<array{data:ProjectSafeMode}> */
    public function updateSafeMode(string $projectId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:ProjectSafeMode}> */
        return $this->request('PUT', self::path($projectId).'/safe-mode', $body, options:$options);
    }
    /** @return ApiResponse<array{data:ProjectWarmupPlan}> */
    public function getWarmupPlan(string $projectId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:ProjectWarmupPlan}> */
        return $this->request('GET', self::path($projectId).'/warmup-plan', options:$options);
    }
    /** @param UpdateProjectWarmupPlan $body
     * @return ApiResponse<array{data:ProjectWarmupPlan}> */
    public function updateWarmupPlan(string $projectId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:ProjectWarmupPlan}> */
        return $this->request('PUT', self::path($projectId).'/warmup-plan', $body, options:$options);
    }
    /** @return ApiResponse<array{data:ProjectInsuranceEvidence}> */
    public function getInsuranceEvidence(string $projectId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:ProjectInsuranceEvidence}> */
        return $this->request('GET', self::path($projectId).'/insurance-evidence', options:$options);
    }
    /** @param UpdateProjectInsuranceEvidence $body
     * @return ApiResponse<array{data:ProjectInsuranceEvidence}> */
    public function updateInsuranceEvidence(string $projectId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:ProjectInsuranceEvidence}> */
        return $this->request('PUT', self::path($projectId).'/insurance-evidence', $body, options:$options);
    }
    /** @return ApiResponse<array{data:ProjectHealthPolicy}> */
    public function getHealthPolicy(string $projectId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:ProjectHealthPolicy}> */
        return $this->request('GET', self::path($projectId).'/health-policy', options:$options);
    }
    /** @param UpdateProjectHealthPolicy $body
     * @return ApiResponse<array{data:ProjectHealthPolicy}> */
    public function updateHealthPolicy(string $projectId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:ProjectHealthPolicy}> */
        return $this->request('PUT', self::path($projectId).'/health-policy', $body, options:$options);
    }

    /** @return ApiResponse<array{data:list<ProjectStats>}> */
    public function list(?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:list<ProjectStats>}> */
        return $this->request('GET', '/platform/projects', options:$options);
    }
    /** @param CreateProject $body
     * @return ApiResponse<array{data:CreatedProject}> */
    public function create(array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:CreatedProject}> */
        return $this->request('POST', '/platform/projects', $body, options:$options);
    }
    /** @return ApiResponse<array{data:list<MergeCandidate>}> */
    public function listHybridMergeCandidates(string $projectId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:list<MergeCandidate>}> */
        return $this->request('GET', self::path($projectId).'/hybrid-merge-candidates', options:$options);
    }
    /** @param array{business:ProductionBusiness} $body
     * @return ApiResponse<array{data:Enrollment}> */
    public function requestProductionEnrollment(string $projectId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:Enrollment}> */
        return $this->request('POST', self::path($projectId).'/promote', $body, options:$options);
    }
    /** @return ApiResponse<array{data:EnrollmentCommand}> */
    public function approveProductionEnrollment(string $projectId, string $operationId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:EnrollmentCommand}> */
        return $this->request('POST', self::path($projectId).'/production-enrollments/'.self::segment($operationId).'/approve', options:$options);
    }
    /** @return ApiResponse<array{data:EnrollmentCommand}> */
    public function cancelProductionEnrollment(string $projectId, string $operationId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:EnrollmentCommand}> */
        return $this->request('POST', self::path($projectId).'/production-enrollments/'.self::segment($operationId).'/cancel', options:$options);
    }
    private static function path(string $projectId): string
    {
        return '/platform/projects/'.self::segment($projectId);
    }
}
