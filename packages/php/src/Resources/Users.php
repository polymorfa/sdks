<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, QuickReplyModels, RequestOptions};

/** @phpstan-import-type SecurityCode from QuickReplyModels */
final class Users extends Resource
{
    /** @return ApiResponse<array{success:bool,data:SecurityCode}> */
    public function getSecurityCode(string $session, string $userId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:SecurityCode}> */
        return $this->request('GET', '/messaging/'.self::segment($session).'/users/'.self::segment($userId).'/security-code', options:$options);
    }
}
