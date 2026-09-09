import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { DataEnvelope, PlatformPayload } from "./types.js";

type AudienceResponse = Promise<ApiResponse<DataEnvelope<PlatformPayload>>>;

export class AudiencesResource {
  constructor(private readonly transport: HttpTransport) {}

  list(options: RequestOptions = {}): AudienceResponse {
    return this.transport.request({
      method: "GET",
      path: "/platform/audiences",
      ...options,
    });
  }

  create(
    body?: PlatformPayload,
    options: RequestOptions = {},
  ): AudienceResponse {
    return this.write("/platform/audiences", body, options);
  }

  retrieve(listId: string, options: RequestOptions = {}): AudienceResponse {
    return this.transport.request({
      method: "GET",
      path: audiencePath(listId),
      ...options,
    });
  }

  delete(listId: string, options: RequestOptions = {}): AudienceResponse {
    return this.transport.request({
      method: "DELETE",
      path: audiencePath(listId),
      ...options,
    });
  }

  createUpload(
    body?: PlatformPayload,
    options: RequestOptions = {},
  ): AudienceResponse {
    return this.write("/platform/audiences/uploads", body, options);
  }

  private write(
    path: string,
    body: PlatformPayload | undefined,
    options: RequestOptions,
  ): AudienceResponse {
    return this.transport.request({
      method: "POST",
      path,
      ...(body === undefined ? {} : { body }),
      ...options,
    });
  }
}

function audiencePath(listId: string): string {
  return `/platform/audiences/${encodeURIComponent(listId)}`;
}
