<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,OnboardingModels};

/** @phpstan-import-type Signup from OnboardingModels */
final class CloudOnboarding extends Resource
{
    /** @param Signup $input
     * @return ApiResponse<array{success:true,data:array{stage:string}}> */
    public function advance(array $input, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:array{stage:string}}> */ return $this->request('POST', '/messaging/cloud-api/embedded-signup', $input, options:$options);
    }
}
