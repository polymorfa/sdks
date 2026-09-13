import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { DataEnvelope, Organization } from "./types.js";

export class OrganizationsResource {
  constructor(private readonly transport: HttpTransport) {}

  retrieve(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<Organization>>> {
    return this.transport.request({
      method: "GET",
      path: "/platform/team",
      ...options,
    });
  }
}
