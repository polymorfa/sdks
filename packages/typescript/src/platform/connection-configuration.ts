import { campaignContractBody } from "../campaign-contract-validation.js";
import { configurationIntent } from "../connection-delivery-validation.js";
import { existingOptions } from "../campaign-existing-validation.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  ConnectionConfigurationPatch,
  ConnectionConfigurationView,
} from "../messaging/connection-configuration.js";
import { type DataEnvelope, unwrapResponse } from "./response.js";

/** Saved team or project defaults. Connection overrides use connections.update. */
export class ConnectionConfigurationResource {
  readonly #transport: HttpTransport;
  readonly #projectId: string | null;
  constructor(transport: HttpTransport, projectId: string | null) {
    this.#transport = transport;
    this.#projectId = projectId;
    Object.freeze(this);
  }
  retrieve(
    options: RequestOptions = {},
  ): Promise<ApiResponse<ConnectionConfigurationView>> {
    return this.#transport
      .request<DataEnvelope<ConnectionConfigurationView>>({
        method: "GET",
        path: "/platform/connection-configuration",
        ...(this.#projectId === null
          ? {}
          : { query: { projectId: this.#projectId } }),
        ...existingOptions(options),
      })
      .then(unwrapResponse);
  }
  update(
    input: { configuration: ConnectionConfigurationPatch; revision: number },
    options: RequestOptions = {},
  ): Promise<ApiResponse<ConnectionConfigurationView>> {
    options = existingOptions(options, configurationIntent(input));
    return this.#transport
      .request<DataEnvelope<ConnectionConfigurationView>>({
        method: "PUT",
        path: "/platform/connection-configuration",
        body:
          this.#projectId === null
            ? campaignContractBody(input)
            : campaignContractBody({ ...input, projectId: this.#projectId }),
        ...existingOptions(options),
      })
      .then(unwrapResponse);
  }
}
