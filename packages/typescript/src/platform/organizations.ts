import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  DataEnvelope,
  Organization,
  UpdateOrganizationRequest,
} from "./types.js";

export class OrganizationsResource {
  constructor(private readonly transport: HttpTransport) {}

  retrieve(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<Organization>>> {
    return this.transport.request({
      method: "GET",
      path: "/v1/organization",
      ...options,
    });
  }

  update(
    body: UpdateOrganizationRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<Organization>>> {
    return this.transport.request({
      method: "PATCH",
      path: "/v1/organization",
      body,
      ...options,
    });
  }
}
