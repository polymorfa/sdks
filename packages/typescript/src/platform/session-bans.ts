import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { DataEnvelope, SessionBan } from "./types.js";

type SessionBansResponse = Promise<
  ApiResponse<DataEnvelope<readonly SessionBan[]>>
>;

export class SessionBansResource {
  constructor(private readonly transport: HttpTransport) {}

  list(options: RequestOptions = {}): SessionBansResponse {
    return this.get("", options);
  }

  listActive(options: RequestOptions = {}): SessionBansResponse {
    return this.get("/active", options);
  }

  private get(
    suffix: "" | "/active",
    options: RequestOptions,
  ): SessionBansResponse {
    return this.transport.request({
      method: "GET",
      path: `/platform/bans${suffix}`,
      ...options,
    });
  }
}
