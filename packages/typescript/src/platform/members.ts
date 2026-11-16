import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { DataEnvelope, TeamMember } from "./types.js";

export class MembersResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly TeamMember[]>>> {
    return this.transport.request({
      method: "GET",
      path: "/platform/members",
      ...options,
    });
  }
}
