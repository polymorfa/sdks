import type { MessagingCredential } from "../credentials.js";
import { PolymorfaConfigurationError } from "../errors.js";
import type {
  ProjectHealthPolicy,
  ProjectInsuranceEvidence,
  ProjectSafeMode,
  ProjectWarmupPlan,
  SessionSafeMode,
  UpdateProjectHealthPolicyRequest,
  UpdateProjectInsuranceEvidenceRequest,
  UpdateProjectSafeModeRequest,
  UpdateProjectWarmupPlanRequest,
  UpdateSessionSafeModeRequest,
} from "../platform/types.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { SuccessEnvelope } from "./types.js";

type ProjectSetting =
  "safe-mode" | "warmup-plan" | "insurance-evidence" | "health-policy";

/**
 * BanSafe project settings and per-number Safe Mode on the Messaging API.
 * Organization API keys and project tokens are accepted; browser client
 * tokens fail before transport.
 */
export class MessagingBanSafeResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly credentialType: MessagingCredential["type"],
  ) {}

  getProjectSafeMode(
    projectId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<ProjectSafeMode>>> {
    return this.getSetting(projectId, "safe-mode", options);
  }

  updateProjectSafeMode(
    projectId: string,
    body: UpdateProjectSafeModeRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<ProjectSafeMode>>> {
    return this.updateSetting(projectId, "safe-mode", body, options);
  }

  getProjectWarmupPlan(
    projectId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<ProjectWarmupPlan>>> {
    return this.getSetting(projectId, "warmup-plan", options);
  }

  updateProjectWarmupPlan(
    projectId: string,
    body: UpdateProjectWarmupPlanRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<ProjectWarmupPlan>>> {
    return this.updateSetting(projectId, "warmup-plan", body, options);
  }

  getProjectInsuranceEvidence(
    projectId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<ProjectInsuranceEvidence>>> {
    return this.getSetting(projectId, "insurance-evidence", options);
  }

  updateProjectInsuranceEvidence(
    projectId: string,
    body: UpdateProjectInsuranceEvidenceRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<ProjectInsuranceEvidence>>> {
    return this.updateSetting(projectId, "insurance-evidence", body, options);
  }

  getProjectHealthPolicy(
    projectId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<ProjectHealthPolicy>>> {
    return this.getSetting(projectId, "health-policy", options);
  }

  /** Send the `version` from the latest read; a stale version returns 409. */
  updateProjectHealthPolicy(
    projectId: string,
    body: UpdateProjectHealthPolicyRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<ProjectHealthPolicy>>> {
    return this.updateSetting(projectId, "health-policy", body, options);
  }

  getSessionSafeMode(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<SessionSafeMode>>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "GET",
      path: sessionSafeModePath(session),
      ...options,
    });
  }

  updateSessionSafeMode(
    session: string,
    body: UpdateSessionSafeModeRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessEnvelope<SessionSafeMode>>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "PUT",
      path: sessionSafeModePath(session),
      body,
      ...options,
    });
  }

  private getSetting<T>(
    projectId: string,
    setting: ProjectSetting,
    options: RequestOptions,
  ): Promise<ApiResponse<SuccessEnvelope<T>>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "GET",
      path: projectSettingPath(projectId, setting),
      ...options,
    });
  }

  private updateSetting<T>(
    projectId: string,
    setting: ProjectSetting,
    body: unknown,
    options: RequestOptions,
  ): Promise<ApiResponse<SuccessEnvelope<T>>> {
    this.assertServerCredential();
    return this.transport.request({
      method: "PUT",
      path: projectSettingPath(projectId, setting),
      body,
      ...options,
    });
  }

  private assertServerCredential(): void {
    if (this.credentialType === "clientToken") {
      throw new PolymorfaConfigurationError(
        "BanSafe settings require an organization API key or project token.",
        "credential",
      );
    }
  }
}

function projectSettingPath(
  projectId: string,
  setting: ProjectSetting,
): string {
  return `/messaging/projects/${encodeURIComponent(projectId)}/${setting}`;
}

function sessionSafeModePath(session: string): string {
  return `/messaging/${encodeURIComponent(session)}/safe-mode`;
}
