import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { ApiKey, ApiKeyDeactivation, DataEnvelope } from "./types.js";

export class ApiKeysResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly ApiKey[]>>> {
    return this.transport.request({
      method: "GET",
      path: "/platform/keys",
      ...options,
    });
  }

  deactivate(
    keyId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ApiKeyDeactivation>>> {
    return this.transport.request({
      method: "DELETE",
      path: `/platform/keys/${encodeURIComponent(keyId)}`,
      ...options,
    });
  }
}
