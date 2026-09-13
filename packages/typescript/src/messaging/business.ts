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
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetOwnBusinessProfileResponse>> {
    return this.get(profilePath(session), options);
  }

  updateProfile(
    session: string,
    body: BusinessProfileUpdateRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UpdateBusinessProfileResponse>> {
    return this.mutate("PATCH", profilePath(session), body, options);
  }

  setCoverPhoto(
    session: string,
    body: BusinessCoverPhotoRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetBusinessCoverPhotoResponse>> {
    return this.mutate(
      "PUT",
      `${profilePath(session)}/cover-photo`,
      body,
      options,
    );
  }

  deleteCoverPhoto(
    session: string,
    coverPhotoId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DeleteBusinessCoverPhotoResponse>> {
    return this.mutate(
      "DELETE",
      `${profilePath(session)}/cover-photo/${encodeURIComponent(coverPhotoId)}`,
      undefined,
      options,
    );
  }

  getCatalog(
    session: string,
    params: BusinessCatalogParams,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBusinessCatalogResponse>> {
    return this.transport.request({
      method: "GET",
      path: `${businessPath(session)}/catalog`,
      query: {
        jid: params.jid,
        after: params.after,
        limit: params.limit,
        width: params.width,
        height: params.height,
      },
      ...options,
    });
  }

  createCatalog(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CreateBusinessCatalogResponse>> {
    return this.mutate(
      "POST",
      `${businessPath(session)}/catalog`,
      undefined,
      options,
    );
  }

  setCartEnabled(
    session: string,
    body: BusinessCartSettingRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetBusinessCartEnabledResponse>> {
    return this.mutate(
      "PATCH",
      `${businessPath(session)}/catalog/cart`,
      body,
      options,
    );
  }

  getProduct(
    session: string,
    productId: string,
    params: BusinessProductParams,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBusinessProductResponse>> {
    return this.transport.request({
      method: "GET",
      path: productPath(session, productId),
      query: { jid: params.jid },
      ...options,
    });
  }

  createProduct(
    session: string,
    body: BusinessProductMutationRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CreateBusinessProductResponse>> {
    return this.mutate(
      "POST",
      `${businessPath(session)}/products`,
      body,
      options,
    );
  }

  updateProduct(
    session: string,
    productId: string,
    body: BusinessProductMutationRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UpdateBusinessProductResponse>> {
    return this.mutate("PUT", productPath(session, productId), body, options);
  }

  deleteProduct(
    session: string,
    productId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DeleteBusinessProductResponse>> {
    return this.mutate(
      "DELETE",
      productPath(session, productId),
      undefined,
      options,
    );
  }

  setProductVisibility(
    session: string,
    productId: string,
    body: BusinessProductVisibilityRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetBusinessProductVisibilityResponse>> {
    return this.mutate(
      "PATCH",
      `${productPath(session, productId)}/visibility`,
      body,
      options,
    );
  }

  appealProduct(
    session: string,
    productId: string,
    body: BusinessCatalogAppealRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<AppealBusinessProductResponse>> {
    return this.mutate(
      "POST",
      `${productPath(session, productId)}/appeal`,
      body,
      options,
    );
  }

  listCollections(
    session: string,
    params: BusinessCollectionsParams,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBusinessCollectionsResponse>> {
    return this.transport.request({
      method: "GET",
      path: `${businessPath(session)}/collections`,
      query: {
        jid: params.jid,
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
    session: string,
    collectionId: string,
    params: BusinessCollectionParams,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBusinessCollectionResponse>> {
    return this.transport.request({
      method: "GET",
      path: collectionPath(session, collectionId),
      query: {
        jid: params.jid,
        after: params.after,
        limit: params.limit,
        width: params.width,
        height: params.height,
      },
      ...options,
    });
  }

  createCollection(
    session: string,
    body: BusinessCollectionCreateRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CreateBusinessCollectionResponse>> {
    return this.mutate(
      "POST",
      `${businessPath(session)}/collections`,
      body,
      options,
    );
  }

  updateCollection(
    session: string,
    collectionId: string,
    body: BusinessCollectionUpdateRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UpdateBusinessCollectionResponse>> {
    return this.mutate(
      "PATCH",
      collectionPath(session, collectionId),
      body,
      options,
    );
  }

  deleteCollection(
    session: string,
    collectionId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DeleteBusinessCollectionResponse>> {
    return this.mutate(
      "DELETE",
      collectionPath(session, collectionId),
      undefined,
      options,
    );
  }

  reorderCollections(
    session: string,
    body: BusinessCollectionReorderRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ReorderBusinessCollectionsResponse>> {
    return this.mutate(
      "POST",
      `${businessPath(session)}/collections/reorder`,
      body,
      options,
    );
  }

  appealCollection(
    session: string,
    collectionId: string,
    body: BusinessCatalogAppealRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<AppealBusinessCollectionResponse>> {
    return this.mutate(
      "POST",
      `${collectionPath(session, collectionId)}/appeal`,
      body,
      options,
    );
  }

  getOrder(
    session: string,
    orderId: string,
    body: BusinessOrderLookupRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBusinessOrderResponse>> {
    return this.mutate(
      "POST",
      `${businessPath(session)}/orders/${encodeURIComponent(orderId)}/lookup`,
      body,
      options,
    );
  }

  getMerchantCompliance(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBusinessMerchantComplianceResponse>> {
    return this.get(`${businessPath(session)}/compliance`, options);
  }

  setMerchantCompliance(
    session: string,
    body: BusinessMerchantCompliance,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetBusinessMerchantComplianceResponse>> {
    return this.mutate(
      "PUT",
      `${businessPath(session)}/compliance`,
      body,
      options,
    );
  }

  getLinkedAccounts(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBusinessLinkedAccountsResponse>> {
    return this.get(`${businessPath(session)}/linked-accounts`, options);
  }

  getEligibility(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBusinessEligibilityResponse>> {
    return this.get(`${businessPath(session)}/eligibility`, options);
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

function businessPath(session: string): string {
  return `/messaging/${encodeURIComponent(session)}/business`;
}

function profilePath(session: string): string {
  return `${businessPath(session)}/profile`;
}

function productPath(session: string, productId: string): string {
  return `${businessPath(session)}/products/${encodeURIComponent(productId)}`;
}

function collectionPath(session: string, collectionId: string): string {
  return `${businessPath(session)}/collections/${encodeURIComponent(collectionId)}`;
}
