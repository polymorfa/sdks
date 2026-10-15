import type { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { DataEnvelope } from "./response.js";
import type {
  AudienceConsentAssertion,
  AudienceProfile,
  AudienceProfileImportJob,
  AudienceProfilePage,
  CreateAudienceProfileImportRequest,
  DeleteAudienceProfileResult,
  ListAudienceProfilesParams,
  PutAudienceProfileRequest,
} from "../campaign-contracts.js";
import {
  campaignContractBody,
  campaignContractOptions,
  contractInteger,
  contractUuid,
  validateProfileImport,
  validateProfilePage,
  validateProfilePhone,
  validateProfilePut,
} from "../campaign-contract-validation.js";

/** Customer-supplied campaign profiles, independent of synchronized contacts. */
export class AudienceProfilesResource {
  readonly imports: AudienceProfileImportsResource;
  readonly #transport: HttpTransport;

  constructor(transport: HttpTransport) {
    this.#transport = transport;
    this.imports = new AudienceProfileImportsResource(transport);
    Object.freeze(this);
  }

  list(
    params: ListAudienceProfilesParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<AudienceProfilePage<AudienceProfile>>> {
    const query = validateProfilePage(params);
    return this.#transport.request({
      ...campaignContractOptions(options),
      method: "GET",
      path: "/platform/audience-profiles",
      query,
    });
  }

  retrieve(
    phone: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AudienceProfile>>> {
    return this.#transport.request({
      ...campaignContractOptions(options),
      method: "GET",
      path: profilePath(phone),
    });
  }

  put(
    phone: string,
    body: PutAudienceProfileRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AudienceProfile>>> {
    validateProfilePut(body);
    return this.#transport.request({
      ...campaignContractOptions(options, true),
      method: "PUT",
      path: profilePath(phone),
      body: campaignContractBody(body),
    });
  }

  delete(
    phone: string,
    expectedRevision: number,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<DeleteAudienceProfileResult>>> {
    contractInteger(expectedRevision, "expectedRevision", 1);
    return this.#transport.request({
      ...campaignContractOptions(options, true),
      method: "DELETE",
      path: profilePath(phone),
      query: { expectedRevision: String(expectedRevision) },
    });
  }

  listConsent(
    phone: string,
    params: ListAudienceProfilesParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<AudienceProfilePage<AudienceConsentAssertion>>> {
    const query = validateProfilePage(params);
    return this.#transport.request({
      ...campaignContractOptions(options),
      method: "GET",
      path: `${profilePath(phone)}/consent`,
      query,
    });
  }
}

export class AudienceProfileImportsResource {
  readonly #transport: HttpTransport;
  constructor(transport: HttpTransport) {
    this.#transport = transport;
    Object.freeze(this);
  }

  create(
    body: CreateAudienceProfileImportRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AudienceProfileImportJob>>> {
    validateProfileImport(body);
    return this.#transport.request({
      ...campaignContractOptions(options, true),
      method: "POST",
      path: "/platform/audience-profile-imports",
      body: campaignContractBody(body),
    });
  }

  retrieve(
    jobId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AudienceProfileImportJob>>> {
    return this.#transport.request({
      ...campaignContractOptions(options),
      method: "GET",
      path: importPath(jobId),
    });
  }

  /** Cancel the durable job. Aborting an HTTP waiter does not cancel it. */
  cancel(
    jobId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AudienceProfileImportJob>>> {
    return this.#transport.request({
      ...campaignContractOptions(options, true),
      method: "DELETE",
      path: importPath(jobId),
    });
  }
}

function profilePath(phone: string): string {
  return `/platform/audience-profiles/${encodeURIComponent(validateProfilePhone(phone))}`;
}
function importPath(jobId: string): string {
  return `/platform/audience-profile-imports/${encodeURIComponent(contractUuid(jobId, "jobId"))}`;
}
