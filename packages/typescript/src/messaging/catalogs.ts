import type { MessagingCredential } from "../credentials.js";
import {
  PolymorfaConfigurationError,
  PolymorfaValidationError,
} from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { SuccessEnvelope } from "./types.js";

export interface CatalogSync {
  readonly catalogId: string;
  readonly syncedAt: string | null;
  readonly stale: boolean;
  readonly productCount: number;
  readonly lastAttempt: {
    readonly startedAt: string;
    readonly finishedAt: string | null;
    readonly outcome:
      | "in_progress"
      | "complete"
      | "provider_error"
      | "unavailable"
      | "too_large"
      | "not_linked";
    readonly metaErrorCode?: number;
  };
}
export interface CatalogProduct {
  readonly id: string;
  readonly retailerId?: string;
  readonly name?: string;
  readonly description?: string;
  /** Preserved exactly as Meta returned it. */
  readonly price?: string;
  readonly currency?: string;
  readonly availability?: string;
  readonly reviewStatus?: string;
  readonly visibility?: string;
  readonly imageUrl?: string;
  readonly url?: string;
}
export interface CatalogProductPage {
  readonly catalog: CatalogSync;
  readonly products: readonly CatalogProduct[];
  readonly nextCursor?: string;
}
export interface ListCatalogProductsParams {
  /** 1-100, default 50. */
  readonly limit?: number;
  readonly cursor?: string;
}

/** Beta, business:read. Reads use the saved snapshot; only sync contacts Meta.
 * Requires enrollment and an active Official connection, including on Hybrid.
 * Unavailable betas return feature_unavailable; no client-side access grant.
 */
export class CatalogsResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"],
  ) {}

  list(
    session: string,
    options: RequestOptions = {},
  ): Promise<
    ApiResponse<SuccessEnvelope<{ readonly catalogs: readonly CatalogSync[] }>>
  > {
    return this.transport.request({
      method: "GET",
      path: this.path(session),
      ...options,
    });
  }
  retrieve(
    session: string,
    catalogId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<CatalogSync>>> {
    return this.transport.request({
      method: "GET",
      path: this.path(session, catalogId),
      ...options,
    });
  }
  /** Explicit refresh, at most once per 120 seconds. A failed attempt preserves
   * the snapshot except not_linked. Not automatically retried, even on 429/503.
   * A full sync can take 50 seconds; this method allows 60 seconds by default.
   */
  sync(
    session: string,
    catalogId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<CatalogSync>>> {
    return this.transport.request({
      method: "POST",
      path: `${this.path(session, catalogId)}/sync`,
      timeoutMs: 60_000,
      ...options,
      maxNetworkRetries: 0,
    });
  }
  listProducts(
    session: string,
    catalogId: string,
    params: ListCatalogProductsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<CatalogProductPage>>> {
    if (
      params.limit !== undefined &&
      (!Number.isInteger(params.limit) ||
        params.limit < 1 ||
        params.limit > 100)
    )
      throw new PolymorfaValidationError(
        "limit must be an integer from 1 to 100.",
      );
    if (
      params.cursor !== undefined &&
      !/^[A-Za-z0-9_-]{1,256}$/.test(params.cursor)
    )
      throw new PolymorfaValidationError(
        "cursor must be the nextCursor returned by the API.",
      );
    return this.transport.request({
      method: "GET",
      path: `${this.path(session, catalogId)}/products`,
      query: { ...params },
      ...options,
    });
  }
  private path(session: string, catalogId?: string): string {
    if (this.credentialType === "clientToken")
      throw new PolymorfaConfigurationError(
        "Catalog sync requires an organization API key or project token.",
        "credential",
      );
    if (!session.trim())
      throw new PolymorfaValidationError("Provide a Number ID.");
    if (catalogId !== undefined && !/^[0-9]{1,32}$/.test(catalogId))
      throw new PolymorfaValidationError(
        "catalogId must contain 1 to 32 digits.",
      );
    return `/messaging/${encodeURIComponent(session)}/catalogs${catalogId === undefined ? "" : `/${encodeURIComponent(catalogId)}`}`;
  }
}
