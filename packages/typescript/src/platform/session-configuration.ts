import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  SessionConfigurationPatch,
  SessionConfigurationView,
} from "../messaging/session-configuration.js";
import { type DataEnvelope, unwrapResponse } from "./response.js";

/** Saved team or project defaults. Session overrides use Messaging sessions.update. */
export class SessionConfigurationResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly projectId: string | null,
  ) {}
  retrieve(
    options: RequestOptions = {},
  ): Promise<ApiResponse<SessionConfigurationView>> {
    return this.transport
      .request<DataEnvelope<SessionConfigurationView>>({
        method: "GET",
        path: "/platform/session-configuration",
        ...(this.projectId === null
          ? {}
          : { query: { projectId: this.projectId } }),
        ...options,
      })
      .then(unwrapResponse);
  }
  update(
    input: { configuration: SessionConfigurationPatch; revision: number },
    options: RequestOptions = {},
  ): Promise<ApiResponse<SessionConfigurationView>> {
    return this.transport
      .request<DataEnvelope<SessionConfigurationView>>({
        method: "PUT",
        path: "/platform/session-configuration",
        body:
          this.projectId === null
            ? input
            : { ...input, projectId: this.projectId },
        ...options,
      })
      .then(unwrapResponse);
  }
}
