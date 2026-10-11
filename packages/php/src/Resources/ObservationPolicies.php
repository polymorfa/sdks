<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,OnboardingModels};

/**
 * @phpstan-import-type ProjectPolicy from OnboardingModels
 * @phpstan-import-type SessionPolicy from OnboardingModels
 */
final class ObservationPolicies extends Resource
{
    /** @return ApiResponse<array{success:true,data:ProjectPolicy}> */
    public function retrieveForProject(string $projectId, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:ProjectPolicy}> */ return $this->request('GET', '/messaging/projects/'.self::segment($projectId).'/observation-policy', options:$options);
    }
    /** @return ApiResponse<array{success:true,data:SessionPolicy}> */
    public function retrieveForSession(string $session, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:SessionPolicy}> */ return $this->request('GET', '/messaging/'.self::segment($session).'/observation-policy', options:$options);
    }
}
