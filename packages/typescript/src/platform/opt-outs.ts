import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { DataEnvelope, PlatformPayload } from "./types.js";

type OptOutResponse = Promise<ApiResponse<DataEnvelope<PlatformPayload>>>;

export class OptOutsResource {
  constructor(private readonly transport: HttpTransport) {}

  list(options: RequestOptions = {}): OptOutResponse {
    return this.transport.request({
      method: "GET",
      path: "/platform/optouts",
      ...options,
    });
  }

  create(body?: PlatformPayload, options: RequestOptions = {}): OptOutResponse {
    return this.write("/platform/optouts", body, options);
  }

  createBatch(
    body?: PlatformPayload,
    options: RequestOptions = {},
  ): OptOutResponse {
    return this.write("/platform/optouts/batch", body, options);
  }

  delete(phone: string, options: RequestOptions = {}): OptOutResponse {
    return this.transport.request({
      method: "DELETE",
      path: `/platform/optouts/${encodeURIComponent(phone)}`,
      ...options,
    });
  }

  private write(
    path: string,
    body: PlatformPayload | undefined,
    options: RequestOptions,
  ): OptOutResponse {
    return this.transport.request({
      method: "POST",
      path,
      ...(body === undefined ? {} : { body }),
      ...options,
    });
  }
}
