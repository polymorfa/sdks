import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  DataEnvelope,
  RetrieveWidgetSettingsParams,
  UpdateWidgetSettingsRequest,
  WidgetSettings,
} from "./types.js";

/** Organization-key management of saved Connect widget configuration. */
export class WidgetSettingsResource {
  constructor(private readonly transport: HttpTransport) {}

  retrieve(
    params: RetrieveWidgetSettingsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<WidgetSettings | null>>> {
    return this.transport.request({
      method: "GET",
      path: "/v1/widget",
      ...(params.projectId === undefined
        ? {}
        : { query: { projectId: params.projectId } }),
      ...options,
    });
  }

  update(
    body: UpdateWidgetSettingsRequest = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<WidgetSettings>>> {
    return this.transport.request({
      method: "PUT",
      path: "/v1/widget",
      body,
      ...options,
    });
  }
}
