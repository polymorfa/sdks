<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, BanSafeModels, RequestOptions};

/**
 * @phpstan-import-type ProjectSafeMode from BanSafeModels
 * @phpstan-import-type UpdateProjectSafeMode from BanSafeModels
 * @phpstan-import-type ProjectWarmupPlan from BanSafeModels
 * @phpstan-import-type UpdateProjectWarmupPlan from BanSafeModels
 * @phpstan-import-type ProjectInsuranceEvidence from BanSafeModels
 * @phpstan-import-type UpdateProjectInsuranceEvidence from BanSafeModels
 * @phpstan-import-type ProjectHealthPolicy from BanSafeModels
 * @phpstan-import-type UpdateProjectHealthPolicy from BanSafeModels
 * @phpstan-import-type SessionSafeMode from BanSafeModels
 * @phpstan-import-type UpdateSessionSafeMode from BanSafeModels
 */
final class BanSafe extends Resource
{
    /** @return ApiResponse<array{success:bool,data:ProjectSafeMode}> */
    public function getProjectSafeMode(string $projectId, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:ProjectSafeMode}> */
        return $this->request('GET', self::path($projectId).'/safe-mode', options:$options);
    }
    /** @param UpdateProjectSafeMode $body
     * @return ApiResponse<array{success:bool,data:ProjectSafeMode}> */
    public function updateProjectSafeMode(string $projectId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:ProjectSafeMode}> */
        return $this->request('PUT', self::path($projectId).'/safe-mode', $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:ProjectWarmupPlan}> */
    public function getProjectWarmupPlan(string $projectId, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:ProjectWarmupPlan}> */
        return $this->request('GET', self::path($projectId).'/warmup-plan', options:$options);
    }
    /** @param UpdateProjectWarmupPlan $body
     * @return ApiResponse<array{success:bool,data:ProjectWarmupPlan}> */
    public function updateProjectWarmupPlan(string $projectId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:ProjectWarmupPlan}> */
        return $this->request('PUT', self::path($projectId).'/warmup-plan', $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:ProjectInsuranceEvidence}> */
    public function getProjectInsuranceEvidence(string $projectId, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:ProjectInsuranceEvidence}> */
        return $this->request('GET', self::path($projectId).'/insurance-evidence', options:$options);
    }
    /** @param UpdateProjectInsuranceEvidence $body
     * @return ApiResponse<array{success:bool,data:ProjectInsuranceEvidence}> */
    public function updateProjectInsuranceEvidence(string $projectId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:ProjectInsuranceEvidence}> */
        return $this->request('PUT', self::path($projectId).'/insurance-evidence', $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:ProjectHealthPolicy}> */
    public function getProjectHealthPolicy(string $projectId, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:ProjectHealthPolicy}> */
        return $this->request('GET', self::path($projectId).'/health-policy', options:$options);
    }
    /** @param UpdateProjectHealthPolicy $body
     * @return ApiResponse<array{success:bool,data:ProjectHealthPolicy}> */
    public function updateProjectHealthPolicy(string $projectId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:ProjectHealthPolicy}> */
        return $this->request('PUT', self::path($projectId).'/health-policy', $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:SessionSafeMode}> */
    public function getSessionSafeMode(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:SessionSafeMode}> */
        return $this->request('GET', '/messaging/'.self::segment($session).'/safe-mode', options:$options);
    }
    /** @param UpdateSessionSafeMode $body
     * @return ApiResponse<array{success:bool,data:SessionSafeMode}> */
    public function updateSessionSafeMode(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:SessionSafeMode}> */
        return $this->request('PUT', '/messaging/'.self::segment($session).'/safe-mode', $body, options:$options);
    }
    private static function path(string $projectId): string
    {
        return '/messaging/projects/'.self::segment($projectId);
    }
}
