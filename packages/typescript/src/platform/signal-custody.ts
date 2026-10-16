import { requestContract } from "../campaign-contract-response.js";
import type { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import { type DataEnvelope, unwrapResponse } from "./response.js";
import type {
  CustomerSignalCustodyUpdate,
  ProjectSignalCustodyUpdate,
  SignalCustodyDefault,
} from "../campaign-contracts.js";
import {
  campaignContractBody,
  campaignContractOptions,
  contractUuid,
  validateCustodyUpdate,
} from "../campaign-contract-validation.js";

/** Future reservation defaults; these methods never convert existing Numbers. */
export class SignalCustodyResource {
  readonly #transport: HttpTransport;
  readonly #projectId: string;
  constructor(transport: HttpTransport, projectId: string) {
    this.#transport = transport;
    this.#projectId = projectId;
    Object.freeze(this);
  }

  retrieve(
    options: RequestOptions = {},
  ): Promise<ApiResponse<SignalCustodyDefault>> {
    return getProjectSignalCustody(
      this.#transport,
      this.#projectId,
      options,
    ).then(unwrapResponse);
  }
  update(
    body: ProjectSignalCustodyUpdate,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SignalCustodyDefault>> {
    return updateProjectSignalCustody(
      this.#transport,
      this.#projectId,
      body,
      options,
    ).then(unwrapResponse);
  }
  retrieveCustomer(
    customerId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SignalCustodyDefault>> {
    return getCustomerSignalCustody(
      this.#transport,
      this.#projectId,
      customerId,
      options,
    ).then(unwrapResponse);
  }
  updateCustomer(
    customerId: string,
    body: CustomerSignalCustodyUpdate,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SignalCustodyDefault>> {
    return updateCustomerSignalCustody(
      this.#transport,
      this.#projectId,
      customerId,
      body,
      options,
    ).then(unwrapResponse);
  }
}

export function getProjectSignalCustody(
  transport: HttpTransport,
  projectId: string,
  options: RequestOptions,
): Promise<ApiResponse<DataEnvelope<SignalCustodyDefault>>> {
  return requestContract(
    transport,
    {
      ...campaignContractOptions(options),
      method: "GET",
      path: custodyPath(projectId),
    },
    "custody",
  );
}
export function updateProjectSignalCustody(
  transport: HttpTransport,
  projectId: string,
  body: ProjectSignalCustodyUpdate,
  options: RequestOptions,
): Promise<ApiResponse<DataEnvelope<SignalCustodyDefault>>> {
  validateCustodyUpdate(body, false);
  return requestContract(
    transport,
    {
      ...campaignContractOptions(options, true),
      method: "PUT",
      path: custodyPath(projectId),
      body: campaignContractBody(body),
    },
    "custody",
  );
}
export function getCustomerSignalCustody(
  transport: HttpTransport,
  projectId: string,
  customerId: string,
  options: RequestOptions,
): Promise<ApiResponse<DataEnvelope<SignalCustodyDefault>>> {
  return requestContract(
    transport,
    {
      ...campaignContractOptions(options),
      method: "GET",
      path: custodyPath(projectId, contractUuid(customerId, "customerId")),
    },
    "custody",
  );
}
export function updateCustomerSignalCustody(
  transport: HttpTransport,
  projectId: string,
  customerId: string,
  body: CustomerSignalCustodyUpdate,
  options: RequestOptions,
): Promise<ApiResponse<DataEnvelope<SignalCustodyDefault>>> {
  validateCustodyUpdate(body, true);
  return requestContract(
    transport,
    {
      ...campaignContractOptions(options, true),
      method: "PUT",
      path: custodyPath(projectId, contractUuid(customerId, "customerId")),
      body: campaignContractBody(body),
    },
    "custody",
  );
}
function custodyPath(projectId: string, customerId?: string): string {
  const project = `/platform/projects/${encodeURIComponent(contractUuid(projectId, "projectId"))}`;
  return customerId === undefined
    ? `${project}/signal-custody`
    : `${project}/customers/${encodeURIComponent(contractUuid(customerId, "customerId"))}/signal-custody`;
}
