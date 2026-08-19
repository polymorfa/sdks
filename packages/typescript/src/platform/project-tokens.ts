import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { DataEnvelope, ProjectToken } from "./types.js";

export class ProjectTokensResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    projectId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly ProjectToken[]>>> {
    return this.transport.request({
      method: "GET",
      path: "/v1/tokens",
      query: { projectId },
      ...options,
    });
  }
}
