import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { DataEnvelope, PlatformPayload } from "./types.js";

type MediaResponse = Promise<ApiResponse<DataEnvelope<PlatformPayload>>>;

export class MediaResource {
  constructor(private readonly transport: HttpTransport) {}

  retrieve(mediaId: string, options: RequestOptions = {}): MediaResponse {
    return this.transport.request({
      method: "GET",
      path: mediaPath(mediaId),
      ...options,
    });
  }

  delete(mediaId: string, options: RequestOptions = {}): MediaResponse {
    return this.transport.request({
      method: "DELETE",
      path: mediaPath(mediaId),
      ...options,
    });
  }

  createUpload(
    body?: PlatformPayload,
    options: RequestOptions = {},
  ): MediaResponse {
    return this.transport.request({
      method: "POST",
      path: "/platform/media/uploads",
      ...(body === undefined ? {} : { body }),
      ...options,
    });
  }
}

function mediaPath(mediaId: string): string {
  return `/platform/media/${encodeURIComponent(mediaId)}`;
}
