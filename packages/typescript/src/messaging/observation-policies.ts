import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  UpdateProjectObservationPolicyResponse,
  UpdateConnectionObservationPolicyResponse,
} from "./types.js";

export class ObservationPoliciesResource {
  constructor(private readonly transport: HttpTransport) {}

  retrieveForProject(
    projectId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UpdateProjectObservationPolicyResponse>> {
    return this.transport.request({
      method: "GET",
      path: projectPolicyPath(projectId),
      ...options,
    });
  }

  retrieveForConnection(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UpdateConnectionObservationPolicyResponse>> {
    return this.transport.request({
      method: "GET",
      path: connectionPolicyPath(connection),
      ...options,
    });
  }
}

function projectPolicyPath(projectId: string): string {
  return `/messaging/projects/${encodeURIComponent(projectId)}/observation-policy`;
}

function connectionPolicyPath(connection: string): string {
  return `/messaging/${encodeURIComponent(connection)}/observation-policy`;
}
