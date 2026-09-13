import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  CreateProjectTemplateRequest,
  ListProjectTemplatesResponse,
  PreviewProjectTemplateRequest,
  ProjectTemplateOperationResponse,
  ProjectTemplateResponse,
  SubmitProjectTemplateRequest,
  SuccessResponse,
  UpdateProjectTemplateRequest,
} from "./types.js";

export class TemplatesResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    projectSlug: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListProjectTemplatesResponse>> {
    return this.transport.request({
      method: "GET",
      path: templatesPath(projectSlug),
      ...options,
    });
  }

  create(
    projectSlug: string,
    body: CreateProjectTemplateRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ProjectTemplateResponse>> {
    return this.transport.request({
      method: "POST",
      path: templatesPath(projectSlug),
      body,
      ...options,
    });
  }

  retrieve(
    projectSlug: string,
    templateId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ProjectTemplateResponse>> {
    return this.transport.request({
      method: "GET",
      path: templatePath(projectSlug, templateId),
      ...options,
    });
  }

  update(
    projectSlug: string,
    templateId: string,
    body: UpdateProjectTemplateRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ProjectTemplateResponse>> {
    return this.transport.request({
      method: "PATCH",
      path: templatePath(projectSlug, templateId),
      body,
      ...options,
    });
  }

  delete(
    projectSlug: string,
    templateId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "DELETE",
      path: templatePath(projectSlug, templateId),
      ...options,
    });
  }

  preview(
    projectSlug: string,
    templateId: string,
    body: PreviewProjectTemplateRequest = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<ProjectTemplateOperationResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${templatePath(projectSlug, templateId)}/preview`,
      body,
      ...options,
    });
  }

  submit(
    projectSlug: string,
    templateId: string,
    body: SubmitProjectTemplateRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ProjectTemplateOperationResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${templatePath(projectSlug, templateId)}/submit`,
      body,
      ...options,
    });
  }
}

function templatesPath(projectSlug: string): string {
  return `/messaging/projects/${encodeURIComponent(projectSlug)}/templates`;
}

function templatePath(projectSlug: string, templateId: string): string {
  return `${templatesPath(projectSlug)}/${encodeURIComponent(templateId)}`;
}
