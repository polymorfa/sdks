import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  CreateProjectRequest,
  DataEnvelope,
  ProductionEnrollmentCommandResult,
  ProductionEnrollmentRequest,
  ProductionEnrollmentResult,
  Project,
  ProjectWithStats,
} from "./types.js";

export class ProjectsResource {
  constructor(private readonly transport: HttpTransport) {}

  list(options: RequestOptions = {}): Promise<ApiResponse<DataEnvelope<readonly ProjectWithStats[]>>> {
    return this.transport.request({ method: "GET", path: "/v1/projects", ...options });
  }

  create(body: CreateProjectRequest, options: RequestOptions = {}): Promise<ApiResponse<DataEnvelope<Project>>> {
    return this.transport.request({ method: "POST", path: "/v1/projects", body, ...options });
  }

  requestProductionEnrollment(
    projectId: string,
    body: ProductionEnrollmentRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ProductionEnrollmentResult>>> {
    return this.transport.request({
      method: "POST",
      path: `/v1/projects/${encodeURIComponent(projectId)}/promote`,
      body,
      ...options,
    });
  }

  approveProductionEnrollment(
    projectId: string,
    operationId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ProductionEnrollmentCommandResult>>> {
    return this.enrollmentCommand(projectId, operationId, "approve", options);
  }

  cancelProductionEnrollment(
    projectId: string,
    operationId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ProductionEnrollmentCommandResult>>> {
    return this.enrollmentCommand(projectId, operationId, "cancel", options);
  }

  private enrollmentCommand(
    projectId: string,
    operationId: string,
    action: "approve" | "cancel",
    options: RequestOptions,
  ): Promise<ApiResponse<DataEnvelope<ProductionEnrollmentCommandResult>>> {
    return this.transport.request({
      method: "POST",
      path: `/v1/projects/${encodeURIComponent(projectId)}/production-enrollments/${encodeURIComponent(operationId)}/${action}`,
      ...options,
    });
  }
}
