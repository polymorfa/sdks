import { HttpTransport } from "../transport/http.js";
import type { HttpMethod } from "../transport/types.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  AppealBusinessCollectionResponse,
  AppealBusinessProductResponse,
  BusinessCatalogAppealRequest,
  BusinessCatalogParams,
  BusinessCartSettingRequest,
  BusinessCollectionCreateRequest,
  BusinessCollectionParams,
  BusinessCollectionReorderRequest,
  BusinessCollectionsParams,
  BusinessCollectionUpdateRequest,
  BusinessCoverPhotoRequest,
  BusinessMerchantCompliance,
  BusinessOrderLookupRequest,
  BusinessProductMutationRequest,
  BusinessProductParams,
  BusinessProductVisibilityRequest,
  BusinessProfileUpdateRequest,
  CreateBusinessCatalogResponse,
  CreateBusinessCollectionResponse,
  CreateBusinessProductResponse,
  DeleteBusinessCollectionResponse,
  DeleteBusinessCoverPhotoResponse,
  DeleteBusinessProductResponse,
  GetBusinessCatalogResponse,
  GetBusinessCollectionResponse,
  GetBusinessCollectionsResponse,
  GetBusinessEligibilityResponse,
  GetBusinessLinkedAccountsResponse,
  GetBusinessMerchantComplianceResponse,
  GetBusinessOrderResponse,
  GetBusinessProductResponse,
  GetOwnBusinessProfileResponse,
  ReorderBusinessCollectionsResponse,
  SetBusinessCartEnabledResponse,
  SetBusinessCoverPhotoResponse,
  SetBusinessMerchantComplianceResponse,
  SetBusinessProductVisibilityResponse,
  UpdateBusinessCollectionResponse,
  UpdateBusinessProductResponse,
  UpdateBusinessProfileResponse,
} from "./types.js";

export class BusinessResource {
  constructor(private readonly transport: HttpTransport) {}

  getProfile(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetOwnBusinessProfileResponse>> {
    return this.get(profilePath(connection), options);
  }

  updateProfile(
    connection: string,
    body: BusinessProfileUpdateRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UpdateBusinessProfileResponse>> {
    return this.mutate("PATCH", profilePath(connection), body, options);
  }

  setCoverPhoto(
    connection: string,
    body: BusinessCoverPhotoRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetBusinessCoverPhotoResponse>> {
    return this.mutate(
      "PUT",
      `${profilePath(connection)}/cover-photo`,
      body,
      options,
    );
  }

  deleteCoverPhoto(
    connection: string,
    coverPhotoId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DeleteBusinessCoverPhotoResponse>> {
    return this.mutate(
      "DELETE",
      `${profilePath(connection)}/cover-photo/${encodeURIComponent(coverPhotoId)}`,
      undefined,
      options,
    );
  }

  getCatalog(
    connection: string,
    params: BusinessCatalogParams,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBusinessCatalogResponse>> {
    return this.transport.request({
      method: "GET",
      path: `${businessPath(connection)}/catalog`,
      query: {
        id: params.id,
        after: params.after,
        limit: params.limit,
        width: params.width,
        height: params.height,
      },
      ...options,
    });
  }

  createCatalog(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CreateBusinessCatalogResponse>> {
    return this.mutate(
      "POST",
      `${businessPath(connection)}/catalog`,
      undefined,
      options,
    );
  }

  setCartEnabled(
    connection: string,
    body: BusinessCartSettingRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetBusinessCartEnabledResponse>> {
    return this.mutate(
      "PATCH",
      `${businessPath(connection)}/catalog/cart`,
      body,
      options,
    );
  }

  getProduct(
    connection: string,
    productId: string,
    params: BusinessProductParams,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBusinessProductResponse>> {
    return this.transport.request({
      method: "GET",
      path: productPath(connection, productId),
      query: { id: params.id },
      ...options,
    });
  }

  createProduct(
    connection: string,
    body: BusinessProductMutationRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CreateBusinessProductResponse>> {
    return this.mutate(
      "POST",
      `${businessPath(connection)}/products`,
      body,
      options,
    );
  }

  updateProduct(
    connection: string,
    productId: string,
    body: BusinessProductMutationRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UpdateBusinessProductResponse>> {
    return this.mutate("PUT", productPath(connection, productId), body, options);
  }

  deleteProduct(
    connection: string,
    productId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DeleteBusinessProductResponse>> {
    return this.mutate(
      "DELETE",
      productPath(connection, productId),
      undefined,
      options,
    );
  }

  setProductVisibility(
    connection: string,
    productId: string,
    body: BusinessProductVisibilityRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetBusinessProductVisibilityResponse>> {
    return this.mutate(
      "PATCH",
      `${productPath(connection, productId)}/visibility`,
      body,
      options,
    );
  }

  appealProduct(
    connection: string,
    productId: string,
    body: BusinessCatalogAppealRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<AppealBusinessProductResponse>> {
    return this.mutate(
      "POST",
      `${productPath(connection, productId)}/appeal`,
      body,
      options,
    );
  }

  listCollections(
    connection: string,
    params: BusinessCollectionsParams,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBusinessCollectionsResponse>> {
    return this.transport.request({
      method: "GET",
      path: `${businessPath(connection)}/collections`,
      query: {
        id: params.id,
        after: params.after,
        collectionLimit: params.collectionLimit,
        itemLimit: params.itemLimit,
        width: params.width,
        height: params.height,
      },
      ...options,
    });
  }

  getCollection(
    connection: string,
    collectionId: string,
    params: BusinessCollectionParams,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBusinessCollectionResponse>> {
    return this.transport.request({
      method: "GET",
      path: collectionPath(connection, collectionId),
      query: {
        id: params.id,
        after: params.after,
        limit: params.limit,
        width: params.width,
        height: params.height,
      },
      ...options,
    });
  }

  createCollection(
    connection: string,
    body: BusinessCollectionCreateRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CreateBusinessCollectionResponse>> {
    return this.mutate(
      "POST",
      `${businessPath(connection)}/collections`,
      body,
      options,
    );
  }

  updateCollection(
    connection: string,
    collectionId: string,
    body: BusinessCollectionUpdateRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UpdateBusinessCollectionResponse>> {
    return this.mutate(
      "PATCH",
      collectionPath(connection, collectionId),
      body,
      options,
    );
  }

  deleteCollection(
    connection: string,
    collectionId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DeleteBusinessCollectionResponse>> {
    return this.mutate(
      "DELETE",
      collectionPath(connection, collectionId),
      undefined,
      options,
    );
  }

  reorderCollections(
    connection: string,
    body: BusinessCollectionReorderRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ReorderBusinessCollectionsResponse>> {
    return this.mutate(
      "POST",
      `${businessPath(connection)}/collections/reorder`,
      body,
      options,
    );
  }

  appealCollection(
    connection: string,
    collectionId: string,
    body: BusinessCatalogAppealRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<AppealBusinessCollectionResponse>> {
    return this.mutate(
      "POST",
      `${collectionPath(connection, collectionId)}/appeal`,
      body,
      options,
    );
  }

  getOrder(
    connection: string,
    orderId: string,
    body: BusinessOrderLookupRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBusinessOrderResponse>> {
    return this.mutate(
      "POST",
      `${businessPath(connection)}/orders/${encodeURIComponent(orderId)}/lookup`,
      body,
      options,
    );
  }

  getMerchantCompliance(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBusinessMerchantComplianceResponse>> {
    return this.get(`${businessPath(connection)}/compliance`, options);
  }

  setMerchantCompliance(
    connection: string,
    body: BusinessMerchantCompliance,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetBusinessMerchantComplianceResponse>> {
    return this.mutate(
      "PUT",
      `${businessPath(connection)}/compliance`,
      body,
      options,
    );
  }

  getLinkedAccounts(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBusinessLinkedAccountsResponse>> {
    return this.get(`${businessPath(connection)}/linked-accounts`, options);
  }

  getEligibility(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBusinessEligibilityResponse>> {
    return this.get(`${businessPath(connection)}/eligibility`, options);
  }

  private get<T>(
    path: string,
    options: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.transport.request({ method: "GET", path, ...options });
  }

  private mutate<T>(
    method: Extract<HttpMethod, "POST" | "PUT" | "PATCH" | "DELETE">,
    path: string,
    body: unknown,
    options: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.transport.request({
      method,
      path,
      ...(body === undefined ? {} : { body }),
      ...options,
    });
  }
}

function businessPath(connection: string): string {
  return `/messaging/${encodeURIComponent(connection)}/business`;
}

function profilePath(connection: string): string {
  return `${businessPath(connection)}/profile`;
}

function productPath(connection: string, productId: string): string {
  return `${businessPath(connection)}/products/${encodeURIComponent(productId)}`;
}

function collectionPath(connection: string, collectionId: string): string {
  return `${businessPath(connection)}/collections/${encodeURIComponent(collectionId)}`;
}
