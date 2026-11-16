import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { DataEnvelope, Team } from "./types.js";

export class TeamsResource {
  constructor(private readonly transport: HttpTransport) {}

  retrieve(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<Team>>> {
    return this.transport.request({
      method: "GET",
      path: "/platform/team",
      ...options,
    });
  }
}
