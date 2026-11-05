<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions};

final class BridgeRoutes extends Resource
{
    /** @return ApiResponse<array{wsUrl:string,region:'BR'|'US'|'IN'|'Auto',kind:'sandbox'|'production',signal:'customer'|'bartender',tokenKind:'project',expiresAt:int}> */
    public function resolve(?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{wsUrl:string,region:'BR'|'US'|'IN'|'Auto',kind:'sandbox'|'production',signal:'customer'|'bartender',tokenKind:'project',expiresAt:int}> */ return $this->request('GET', '/messaging/bridge/route', options:$options);
    }
}
