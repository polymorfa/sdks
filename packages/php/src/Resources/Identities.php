<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, Models, RequestOptions, ValidationException};

/** @phpstan-import-type Identity from Models */
final class Identities extends Resource
{
    /**
     * @param array{phoneNumber:string}|array{id:string}|array{username:string,usernameKey?:string} $params
     *
 * @return ApiResponse<array{success:bool,data:Identity&array{keyRequired?:bool}}>
     */
    public function resolve(string $session, array $params, ?RequestOptions $options = null): ApiResponse
    {
        if (count(array_intersect(array_keys($params), ['phoneNumber','id','username'])) !== 1) {
            throw new ValidationException('Choose one identity selector.', 'invalid_request');
        }
        /** @var ApiResponse<array{success:bool,data:Identity&array{keyRequired?:bool}}> */
        return $this->request('GET', '/messaging/'.self::segment($session).'/identities/resolve', query:$params, options:$options);
    }
}
