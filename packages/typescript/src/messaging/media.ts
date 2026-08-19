import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  GetMessagingMediaInfoResponse,
  SuccessResponse,
} from "./types.js";

export class MessagingMediaResource {
  constructor(private readonly transport: HttpTransport) {}

  download(
    mediaId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ArrayBuffer>> {
    return this.transport.requestBinary({
      method: "GET",
      path: mediaPath(mediaId),
      ...options,
    });
  }

  retrieve(
    mediaId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetMessagingMediaInfoResponse>> {
    return this.transport.request({
      method: "GET",
      path: `${mediaPath(mediaId)}/info`,
      ...options,
    });
  }

  persist(
    mediaId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${mediaPath(mediaId)}/download-and-save`,
      ...options,
    });
  }
}

function mediaPath(mediaId: string): string {
  return `/api/media/${encodeURIComponent(mediaId)}`;
}
