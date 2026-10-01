import type { MessagingCredential } from "../credentials.js";
import { PolymorfaConfigurationError } from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";

export interface CloudProductCatalog {
  readonly id: string;
  readonly name?: string;
}
export interface ListCloudCatalogsParams {
  /** Meta Graph version, for example v26.0. */
  readonly version: string;
  /** Page size from 1 to 100. The API defaults to 25. */
  readonly limit?: number;
  readonly after?: string;
}
export interface ListCloudCatalogsResponse {
  readonly data: readonly CloudProductCatalog[];
  readonly paging?: {
    readonly cursors: { readonly before?: string; readonly after?: string };
  };
}

/** Reads catalog links visible to the authenticated WABA. Requires sessions:read. */
export class CloudCatalogsResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"],
  ) {}

  list(
    wabaId: string,
    params: ListCloudCatalogsParams,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListCloudCatalogsResponse>> {
    if (this.credentialType === "clientToken") {
      throw new PolymorfaConfigurationError(
        "Official API catalogs require an organization API key or project token.",
        "credential",
      );
    }
    if (!wabaId.trim() || !params.version.trim()) {
      throw new PolymorfaConfigurationError(
        "Provide a WABA ID and Graph version.",
      );
    }
    return this.transport.request({
      method: "GET",
      path: `/graph/whatsapp/${encodeURIComponent(params.version)}/${encodeURIComponent(wabaId)}/product_catalogs`,
      query: { limit: params.limit, after: params.after },
      ...options,
    });
  }
}
