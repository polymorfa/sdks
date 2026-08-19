import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { DataEnvelope, OrganizationMember } from "./types.js";

export class MembersResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly OrganizationMember[]>>> {
    return this.transport.request({
      method: "GET",
      path: "/v1/members",
      ...options,
    });
  }
}
