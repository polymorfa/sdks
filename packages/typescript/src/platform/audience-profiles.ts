import { requestContract } from "../campaign-contract-response.js";
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
    return requestContract(
      this.#transport,
      {
        ...campaignContractOptions(options),
        method: "GET",
        path: "/platform/audience-profiles",
        query,
      },
      "profiles",
      false,
      true,
    );
  }

  retrieve(
    phone: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AudienceProfile>>> {
    return requestContract(
      this.#transport,
      {
        ...campaignContractOptions(options),
        method: "GET",
        path: profilePath(phone),
      },
      "profile",
    );
  }

  put(
    phone: string,
    body: PutAudienceProfileRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AudienceProfile>>> {
    validateProfilePut(body);
    return requestContract(
      this.#transport,
      {
        ...campaignContractOptions(options, true),
        method: "PUT",
        path: profilePath(phone),
        body: campaignContractBody(body),
      },
      "profile",
    );
  }

  delete(
    phone: string,
    expectedRevision: number,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<DeleteAudienceProfileResult>>> {
    contractInteger(expectedRevision, "expectedRevision", 1);
    return requestContract(
      this.#transport,
      {
        ...campaignContractOptions(options, true),
        method: "DELETE",
        path: profilePath(phone),
        query: { expectedRevision: String(expectedRevision) },
      },
      "profileDelete",
    );
  }

  listConsent(
    phone: string,
    params: ListAudienceProfilesParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<AudienceProfilePage<AudienceConsentAssertion>>> {
    const query = validateProfilePage(params);
    return requestContract(
      this.#transport,
      {
        ...campaignContractOptions(options),
        method: "GET",
        path: `${profilePath(phone)}/consent`,
        query,
      },
      "consents",
      false,
      true,
    );
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
    return requestContract(
      this.#transport,
      {
        ...campaignContractOptions(options, true),
        method: "POST",
        path: "/platform/audience-profile-imports",
        body: campaignContractBody(body),
      },
      "import",
    );
  }

  retrieve(
    jobId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AudienceProfileImportJob>>> {
    return requestContract(
      this.#transport,
      {
        ...campaignContractOptions(options),
        method: "GET",
        path: importPath(jobId),
      },
      "import",
    );
  }

  /** Cancel the durable job. Aborting an HTTP waiter does not cancel it. */
  cancel(
    jobId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<AudienceProfileImportJob>>> {
    return requestContract(
      this.#transport,
      {
        ...campaignContractOptions(options, true),
        method: "DELETE",
        path: importPath(jobId),
      },
      "import",
    );
  }
}

function profilePath(phone: string): string {
  return `/platform/audience-profiles/${encodeURIComponent(validateProfilePhone(phone))}`;
}
function importPath(jobId: string): string {
  return `/platform/audience-profile-imports/${encodeURIComponent(contractUuid(jobId, "jobId"))}`;
}
