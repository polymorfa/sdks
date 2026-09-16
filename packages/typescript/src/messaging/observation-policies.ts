import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  UpdateProjectObservationPolicyResponse,
  UpdateSessionObservationPolicyResponse,
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

  retrieveForSession(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UpdateSessionObservationPolicyResponse>> {
    return this.transport.request({
      method: "GET",
      path: sessionPolicyPath(session),
      ...options,
    });
  }
}

function projectPolicyPath(projectId: string): string {
  return `/messaging/projects/${encodeURIComponent(projectId)}/observation-policy`;
}

function sessionPolicyPath(session: string): string {
  return `/messaging/${encodeURIComponent(session)}/observation-policy`;
}
