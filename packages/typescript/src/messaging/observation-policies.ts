import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  GetProjectObservationPolicyResponse,
  GetSessionObservationPolicyResponse,
  UpdateProjectObservationPolicyRequest,
  UpdateProjectObservationPolicyResponse,
  UpdateSessionObservationPolicyRequest,
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

  updateForProject(
    projectId: string,
    body: UpdateProjectObservationPolicyRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetProjectObservationPolicyResponse>> {
    return this.transport.request({
      method: "PUT",
      path: projectPolicyPath(projectId),
      body,
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

  updateForSession(
    session: string,
    body: UpdateSessionObservationPolicyRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetSessionObservationPolicyResponse>> {
    return this.transport.request({
      method: "PUT",
      path: sessionPolicyPath(session),
      body,
      ...options,
    });
  }
}

function projectPolicyPath(projectId: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/observation-policy`;
}

function sessionPolicyPath(session: string): string {
  return `/api/${encodeURIComponent(session)}/observation-policy`;
}
