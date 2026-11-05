<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, BusinessModels, RequestOptions};

/**
 * @phpstan-import-type Profile from BusinessModels as ProfileData
 * @phpstan-import-type ProfileUpdate from BusinessModels
 * @phpstan-import-type CoverPhoto from BusinessModels
 * @phpstan-import-type ProfileStatus from BusinessModels
 * @phpstan-import-type CoverPhotoResult from BusinessModels
 * @phpstan-import-type Accepted from BusinessModels
 * @phpstan-import-type MerchantCompliance from BusinessModels
 * @phpstan-import-type LinkedAccounts from BusinessModels
 * @phpstan-import-type Eligibility from BusinessModels
 * @phpstan-import-type CatalogParams from BusinessModels
 * @phpstan-import-type CatalogPage from BusinessModels
 * @phpstan-import-type ActionSuccess from BusinessModels
 * @phpstan-import-type CartSetting from BusinessModels
 * @phpstan-import-type ProductParams from BusinessModels
 * @phpstan-import-type Product from BusinessModels
 * @phpstan-import-type ProductMutation from BusinessModels
 * @phpstan-import-type DeleteProductResult from BusinessModels
 * @phpstan-import-type ProductVisibility from BusinessModels
 * @phpstan-import-type Appeal from BusinessModels
 * @phpstan-import-type CollectionsParams from BusinessModels
 * @phpstan-import-type CollectionPage from BusinessModels
 * @phpstan-import-type Collection from BusinessModels
 * @phpstan-import-type CollectionCreate from BusinessModels
 * @phpstan-import-type CollectionUpdate from BusinessModels
 * @phpstan-import-type CollectionResult from BusinessModels
 * @phpstan-import-type CollectionReorder from BusinessModels
 * @phpstan-import-type OrderLookup from BusinessModels
 * @phpstan-import-type Order from BusinessModels
 */
final class Business extends Resource
{
    /** @return ApiResponse<array{success:bool,data:ProfileData}> */
    public function getProfile(string $session, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:ProfileData}> */
        return $this->request('GET', self::path($session).'/profile', options:$options);
    }
    /** @param ProfileUpdate $body
     * @return ApiResponse<array{success:bool,data:ProfileStatus|Accepted}> */
    public function updateProfile(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:ProfileStatus|Accepted}> */
        return $this->request('PATCH', self::path($session).'/profile', $body, options:$options);
    }
    /** @param CoverPhoto $body
     * @return ApiResponse<array{success:bool,data:CoverPhotoResult|Accepted}> */
    public function setCoverPhoto(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:CoverPhotoResult|Accepted}> */
        return $this->request('PUT', self::path($session).'/profile/cover-photo', $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:ProfileStatus|Accepted}> */
    public function deleteCoverPhoto(string $session, string $coverPhotoId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:ProfileStatus|Accepted}> */
        return $this->request('DELETE', self::path($session).'/profile/cover-photo/'.self::segment($coverPhotoId), options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:MerchantCompliance}> */
    public function getMerchantCompliance(string $session, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:MerchantCompliance}> */
        return $this->request('GET', self::path($session).'/compliance', options:$options);
    }
    /** @param MerchantCompliance $body
     * @return ApiResponse<array{success:bool,data:MerchantCompliance|Accepted}> */
    public function setMerchantCompliance(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:MerchantCompliance|Accepted}> */
        return $this->request('PUT', self::path($session).'/compliance', $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:LinkedAccounts}> */
    public function getLinkedAccounts(string $session, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:LinkedAccounts}> */
        return $this->request('GET', self::path($session).'/linked-accounts', options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:Eligibility}> */
    public function getEligibility(string $session, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Eligibility}> */
        return $this->request('GET', self::path($session).'/eligibility', options:$options);
    }
    /** @param CatalogParams $params
     * @return ApiResponse<array{success:bool,data:CatalogPage}> */
    public function getCatalog(string $session, array $params, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:CatalogPage}> */
        return $this->request('GET', self::path($session).'/catalog', query:$params, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:ActionSuccess|Accepted}> */
    public function createCatalog(string $session, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:ActionSuccess|Accepted}> */
        return $this->request('POST', self::path($session).'/catalog', options:$options);
    }
    /** @param CartSetting $body
     * @return ApiResponse<array{success:bool,data:ActionSuccess|Accepted}> */
    public function setCartEnabled(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:ActionSuccess|Accepted}> */
        return $this->request('PATCH', self::path($session).'/catalog/cart', $body, options:$options);
    }
    /** @param ProductParams $params
     * @return ApiResponse<array{success:bool,data:Product}> */
    public function getProduct(string $session, string $productId, array $params, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Product}> */
        return $this->request('GET', self::path($session).'/products/'.self::segment($productId), query:$params, options:$options);
    }
    /** @param ProductMutation $body
     * @return ApiResponse<array{success:bool,data:Product|Accepted}> */
    public function createProduct(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Product|Accepted}> */
        return $this->request('POST', self::path($session).'/products', $body, options:$options);
    }
    /** @param ProductMutation $body
     * @return ApiResponse<array{success:bool,data:Product|Accepted}> */
    public function updateProduct(string $session, string $productId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Product|Accepted}> */
        return $this->request('PUT', self::path($session).'/products/'.self::segment($productId), $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:DeleteProductResult|Accepted}> */
    public function deleteProduct(string $session, string $productId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:DeleteProductResult|Accepted}> */
        return $this->request('DELETE', self::path($session).'/products/'.self::segment($productId), options:$options);
    }
    /** @param ProductVisibility $body
     * @return ApiResponse<array{success:bool,data:ActionSuccess|Accepted}> */
    public function setProductVisibility(string $session, string $productId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:ActionSuccess|Accepted}> */
        return $this->request('PATCH', self::path($session).'/products/'.self::segment($productId).'/visibility', $body, options:$options);
    }
    /** @param Appeal $body
     * @return ApiResponse<array{success:bool,data:ActionSuccess|Accepted}> */
    public function appealProduct(string $session, string $productId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:ActionSuccess|Accepted}> */
        return $this->request('POST', self::path($session).'/products/'.self::segment($productId).'/appeal', $body, options:$options);
    }
    /** @param CollectionsParams $params
     * @return ApiResponse<array{success:bool,data:CollectionPage}> */
    public function listCollections(string $session, array $params, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:CollectionPage}> */
        return $this->request('GET', self::path($session).'/collections', query:$params, options:$options);
    }
    /** @param CatalogParams $params
     * @return ApiResponse<array{success:bool,data:Collection}> */
    public function getCollection(string $session, string $collectionId, array $params, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Collection}> */
        return $this->request('GET', self::path($session).'/collections/'.self::segment($collectionId), query:$params, options:$options);
    }
    /** @param CollectionCreate $body
     * @return ApiResponse<array{success:bool,data:CollectionResult|Accepted}> */
    public function createCollection(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:CollectionResult|Accepted}> */
        return $this->request('POST', self::path($session).'/collections', $body, options:$options);
    }
    /** @param CollectionUpdate $body
     * @return ApiResponse<array{success:bool,data:CollectionResult|Accepted}> */
    public function updateCollection(string $session, string $collectionId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:CollectionResult|Accepted}> */
        return $this->request('PATCH', self::path($session).'/collections/'.self::segment($collectionId), $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:ActionSuccess|Accepted}> */
    public function deleteCollection(string $session, string $collectionId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:ActionSuccess|Accepted}> */
        return $this->request('DELETE', self::path($session).'/collections/'.self::segment($collectionId), options:$options);
    }
    /** @param CollectionReorder $body
     * @return ApiResponse<array{success:bool,data:ActionSuccess|Accepted}> */
    public function reorderCollections(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:ActionSuccess|Accepted}> */
        return $this->request('POST', self::path($session).'/collections/reorder', $body, options:$options);
    }
    /** @param Appeal $body
     * @return ApiResponse<array{success:bool,data:ActionSuccess|Accepted}> */
    public function appealCollection(string $session, string $collectionId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:ActionSuccess|Accepted}> */
        return $this->request('POST', self::path($session).'/collections/'.self::segment($collectionId).'/appeal', $body, options:$options);
    }
    /** @param OrderLookup $body
     * @return ApiResponse<array{success:bool,data:Order|Accepted}> */
    public function getOrder(string $session, string $orderId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Order|Accepted}> */
        return $this->request('POST', self::path($session).'/orders/'.self::segment($orderId).'/lookup', $body, options:$options);
    }
    private static function path(string $session): string
    {
        return '/messaging/'.self::segment($session).'/business';
    }
}
