<?php

declare(strict_types=1);
namespace Polymorfa\Resources;
use Polymorfa\{ApiResponse,RequestOptions,ValidationException,OfficialRound2Models};
/** @phpstan-import-type CatalogSync from OfficialRound2Models
 * @phpstan-import-type ProductPage from OfficialRound2Models */
final class Catalogs extends Resource
{
    /** @return ApiResponse<array{success:true,data:array{catalogs:list<CatalogSync>}}> */
    public function list(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:true,data:array{catalogs:list<CatalogSync>}}> */
        return $this->request('GET', $this->path($connection), options:$options);
    }
    /** @return ApiResponse<array{success:true,data:CatalogSync}> */
    public function retrieve(string $connection, string $catalogId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:true,data:CatalogSync}> */
        return $this->request('GET', $this->path($connection, $catalogId), options:$options);
    }
    /** @param array{limit?:int,cursor?:string} $params
     * @return ApiResponse<array{success:true,data:ProductPage}> */
    public function listProducts(string $connection, string $catalogId, array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        if (isset($params['limit']) && ($params['limit'] < 1 || $params['limit'] > 100) || isset($params['cursor']) && !preg_match('/^[A-Za-z0-9_-]{1,256}$/D', $params['cursor'])) {
            throw new ValidationException('Invalid catalog pagination.');
        }
        /** @var ApiResponse<array{success:true,data:ProductPage}> */
        return $this->request('GET', $this->path($connection, $catalogId).'/products', query:$params, options:$options);
    }
    /** Submit once; no automatic polling or replay of uncertain provider work.
     * @return ApiResponse<array{success:true,data:CatalogSync}> */
    public function sync(string $connection, string $catalogId, ?RequestOptions $options = null): ApiResponse
    {
        $o = $options ?? new RequestOptions();
        $o = new RequestOptions($o->timeout ?? 60, 0, $o->apiVersion, $o->idempotencyKey, $o->headers, $o->cancellation);
        /** @var ApiResponse<array{success:true,data:CatalogSync}> */
        return $this->request('POST', $this->path($connection, $catalogId).'/sync', options:$o);
    }
    private function path(string $connection, ?string $catalogId = null): string
    {
        $this->server();
        if (trim($connection) === '' || $catalogId !== null && !preg_match('/^[0-9]{1,32}$/D', $catalogId)) { throw new ValidationException('Provide a Number ID and catalog ID of 1 to 32 digits.'); }
        return '/messaging/'.self::segment($connection).'/catalogs'.($catalogId === null ? '' : '/'.self::segment($catalogId));
    }
}
