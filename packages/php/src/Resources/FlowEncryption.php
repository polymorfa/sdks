<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,ConfigurationException,RequestOptions};

final class FlowEncryption extends Resource
{
    /** @param array{version:string} $params
     * @return ApiResponse<array{data:list<array{business_public_key:string,business_public_key_signature_status:string}>}> */
    public function retrieve(string $phoneNumberId, array $params, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:list<array{business_public_key:string,business_public_key_signature_status:string}>}> */ return $this->request('GET', $this->path($phoneNumberId, $params['version']), options:$options);
    }
    /** Registration affects every dynamic Flow on the phone number. Read after uncertainty before writing again.
     * @param array{businessPublicKey:string} $body
     * @param array{version:string} $params
     * @return ApiResponse<array{success:true}> */
    public function register(string $phoneNumberId, array $body, array $params, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true}> */ return $this->request('POST', $this->path($phoneNumberId, $params['version']), ['business_public_key' => $body['businessPublicKey']], options:($options ?? new RequestOptions())->withoutRetries());
    }
    private function path(string $id, string $version): string
    {
        $this->server();
        if (trim($id) === '' || trim($version) === '') {
            throw new ConfigurationException('phoneNumberId');
        } return '/graph/whatsapp/'.self::segment($version).'/'.self::segment($id).'/whatsapp_business_encryption';
    }
}
