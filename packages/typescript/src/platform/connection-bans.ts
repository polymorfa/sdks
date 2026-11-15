import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { DataEnvelope, ConnectionBan } from "./types.js";

type ConnectionBansResponse = Promise<
  ApiResponse<DataEnvelope<readonly ConnectionBan[]>>
>;

export class ConnectionBansResource {
  constructor(private readonly transport: HttpTransport) {}

  list(options: RequestOptions = {}): ConnectionBansResponse {
    return this.get("", options);
  }

  listActive(options: RequestOptions = {}): ConnectionBansResponse {
    return this.get("/active", options);
  }

  private get(
    suffix: "" | "/active",
    options: RequestOptions,
  ): ConnectionBansResponse {
    return this.transport.request({
      method: "GET",
      path: `/platform/bans${suffix}`,
      ...options,
    });
  }
}
