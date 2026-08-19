import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  CreateWebhookRequest,
  CreateWebhookResponse,
  GetWebhookResponse,
  ListWebhooksResponse,
  SuccessResponse,
  UpdateWebhookRequest,
  UpdateWebhookResponse,
} from "./types.js";

export class WebhooksResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListWebhooksResponse>> {
    return this.transport.request({
      method: "GET",
      path: "/api/webhooks",
      ...options,
    });
  }

  create(
    body: CreateWebhookRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CreateWebhookResponse>> {
    return this.transport.request({
      method: "POST",
      path: "/api/webhooks",
      body,
      ...options,
    });
  }

  retrieve(
    id: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetWebhookResponse>> {
    return this.transport.request({
      method: "GET",
      path: webhookPath(id),
      ...options,
    });
  }

  update(
    id: string,
    body: UpdateWebhookRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<UpdateWebhookResponse>> {
    return this.transport.request({
      method: "PUT",
      path: webhookPath(id),
      body,
      ...options,
    });
  }

  delete(
    id: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "DELETE",
      path: webhookPath(id),
      ...options,
    });
  }
}

function webhookPath(id: string): string {
  return `/api/webhooks/${encodeURIComponent(id)}`;
}
