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
  ProjectHealthPolicy,
  ProjectInsuranceEvidence,
  ProjectSafeMode,
  ProjectWarmupPlan,
  UpdateProjectHealthPolicyRequest,
  UpdateProjectInsuranceEvidenceRequest,
  UpdateProjectSafeModeRequest,
  UpdateProjectWarmupPlanRequest,
} from "./types.js";

export class ProjectsResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly ProjectWithStats[]>>> {
    return this.transport.request({
      method: "GET",
      path: "/v1/projects",
      ...options,
    });
  }

  create(
    body: CreateProjectRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<Project>>> {
    return this.transport.request({
      method: "POST",
      path: "/v1/projects",
      body,
      ...options,
    });
  }

  getSafeMode(
    projectId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ProjectSafeMode>>> {
    return this.getSetting<ProjectSafeMode>(projectId, "safe-mode", options);
  }

  updateSafeMode(
    projectId: string,
    body: UpdateProjectSafeModeRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ProjectSafeMode>>> {
    return this.updateSetting<ProjectSafeMode>(
      projectId,
      "safe-mode",
      body,
      options,
    );
  }

  getWarmupPlan(
    projectId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ProjectWarmupPlan>>> {
    return this.getSetting<ProjectWarmupPlan>(
      projectId,
      "warmup-plan",
      options,
    );
  }

  updateWarmupPlan(
    projectId: string,
    body: UpdateProjectWarmupPlanRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ProjectWarmupPlan>>> {
    return this.updateSetting<ProjectWarmupPlan>(
      projectId,
      "warmup-plan",
      body,
      options,
    );
  }

  getInsuranceEvidence(
    projectId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ProjectInsuranceEvidence>>> {
    return this.getSetting<ProjectInsuranceEvidence>(
      projectId,
      "insurance-evidence",
      options,
    );
  }

  updateInsuranceEvidence(
    projectId: string,
    body: UpdateProjectInsuranceEvidenceRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ProjectInsuranceEvidence>>> {
    return this.updateSetting<ProjectInsuranceEvidence>(
      projectId,
      "insurance-evidence",
      body,
      options,
    );
  }

  getHealthPolicy(
    projectId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ProjectHealthPolicy>>> {
    return this.getSetting<ProjectHealthPolicy>(
      projectId,
      "health-policy",
      options,
    );
  }

  updateHealthPolicy(
    projectId: string,
    body: UpdateProjectHealthPolicyRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ProjectHealthPolicy>>> {
    return this.updateSetting<ProjectHealthPolicy>(
      projectId,
      "health-policy",
      body,
      options,
    );
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

  private getSetting<T>(
    projectId: string,
    setting:
      "safe-mode" | "warmup-plan" | "insurance-evidence" | "health-policy",
    options: RequestOptions,
  ): Promise<ApiResponse<DataEnvelope<T>>> {
    return this.transport.request({
      method: "GET",
      path: `/v1/projects/${encodeURIComponent(projectId)}/${setting}`,
      ...options,
    });
  }

  private updateSetting<T>(
    projectId: string,
    setting:
      "safe-mode" | "warmup-plan" | "insurance-evidence" | "health-policy",
    body: unknown,
    options: RequestOptions,
  ): Promise<ApiResponse<DataEnvelope<T>>> {
    return this.transport.request({
      method: "PUT",
      path: `/v1/projects/${encodeURIComponent(projectId)}/${setting}`,
      body,
      ...options,
    });
  }
}
