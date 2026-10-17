import { campaignContractBody } from "../campaign-contract-validation.js";
import { configurationIntent } from "../session-delivery-validation.js";
import { existingOptions } from "../campaign-existing-validation.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  SessionConfigurationPatch,
  SessionConfigurationView,
} from "../messaging/session-configuration.js";
import { type DataEnvelope, unwrapResponse } from "./response.js";

/** Saved team or project defaults. Session overrides use sessions.update. */
export class SessionConfigurationResource {
  readonly #transport: HttpTransport;
  readonly #projectId: string | null;
  constructor(transport: HttpTransport, projectId: string | null) {
    this.#transport = transport;
    this.#projectId = projectId;
    Object.freeze(this);
  }
  retrieve(
    options: RequestOptions = {},
  ): Promise<ApiResponse<SessionConfigurationView>> {
    return this.#transport
      .request<DataEnvelope<SessionConfigurationView>>({
        method: "GET",
        path: "/platform/session-configuration",
        ...(this.#projectId === null
          ? {}
          : { query: { projectId: this.#projectId } }),
        ...existingOptions(options),
      })
      .then(unwrapResponse);
  }
  update(
    input: { configuration: SessionConfigurationPatch; revision: number },
    options: RequestOptions = {},
  ): Promise<ApiResponse<SessionConfigurationView>> {
    options = existingOptions(options, configurationIntent(input));
    return this.#transport
      .request<DataEnvelope<SessionConfigurationView>>({
        method: "PUT",
        path: "/platform/session-configuration",
        body:
          this.#projectId === null
            ? campaignContractBody(input)
            : campaignContractBody({ ...input, projectId: this.#projectId }),
        ...existingOptions(options),
      })
      .then(unwrapResponse);
  }
}
