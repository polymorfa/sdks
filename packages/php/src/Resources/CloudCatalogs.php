<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,ConfigurationException,RequestOptions};

/** Reads linked catalogs after the API verifies WABA ownership. */
final class CloudCatalogs extends Resource
{
    /** @param array{version:string,limit?:int,after?:string} $params
     * @return ApiResponse<array{data:list<array{id:string,name?:string}>,paging?:array{cursors:array{before?:string,after?:string}}}> */
    public function list(string $wabaId, array $params, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:list<array{id:string,name?:string}>,paging?:array{cursors:array{before?:string,after?:string}}}> */
        return $this->request('GET', $this->path($wabaId, $params['version']), query:array_diff_key($params, ['version' => true]), options:$options);
    }
    /** @param array{version:string,limit?:int,after?:string} $params
     * @return ApiResponse<array{data:list<array{id:string,retailer_id?:string,name?:string,availability?:string}>,paging?:array{cursors:array{before?:string,after?:string}}}> */
    public function listProducts(string $wabaId, string $catalogId, array $params, ?RequestOptions $options = null): ApiResponse
    {
        if (!preg_match('/^[0-9]+$/D', $catalogId)) {
            throw new ConfigurationException('catalogId');
        }
        /** @var ApiResponse<array{data:list<array{id:string,retailer_id?:string,name?:string,availability?:string}>,paging?:array{cursors:array{before?:string,after?:string}}}> */
        return $this->request('GET', $this->path($wabaId, $params['version']).'/'.self::segment($catalogId).'/products', query:array_diff_key($params, ['version' => true]), options:$options);
    }
    private function path(string $id, string $version): string
    {
        $this->server();
        if (trim($id) === '' || trim($version) === '') {
            throw new ConfigurationException('wabaId');
        } return '/graph/whatsapp/'.self::segment($version).'/'.self::segment($id).'/product_catalogs';
    }
}
