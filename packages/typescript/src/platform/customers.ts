import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  CreateCustomerPairingLinkRequest,
  CreateCustomerRequest,
  CreatedCustomerPairingLink,
  Customer,
  CustomerEvent,
  CustomerListEnvelope,
  CustomerNumber,
  CustomerPairingLink,
  CustomerProjectRequest,
  CustomersEnablement,
  CustomersStatus,
  DataEnvelope,
  ListCustomerEventsParams,
  ListCustomersParams,
  TransferCustomerNumberRequest,
  UpdateCustomerRequest,
} from "./types.js";

export class CustomersResource {
  constructor(private readonly transport: HttpTransport) {}

  status(
    projectId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<CustomersStatus>>> {
    return this.transport.request({
      method: "GET",
      path: `${projectCustomersPath(projectId)}/status`,
      ...options,
    });
  }

  enable(
    projectId: string,
    options: RequestOptions,
  ): Promise<ApiResponse<DataEnvelope<CustomersEnablement>>> {
    return this.transport.request({
      method: "POST",
      path: `${projectCustomersPath(projectId)}/enable`,
      ...options,
    });
  }

  list(
    params: ListCustomersParams,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CustomerListEnvelope>> {
    return this.transport.request({
      method: "GET",
      path: "/platform/customers",
      query: {
        projectId: params.projectId,
        ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
        ...(params.limit === undefined ? {} : { limit: params.limit }),
        ...(params.search === undefined ? {} : { search: params.search }),
        ...(params.status === undefined ? {} : { status: params.status }),
        ...(params.isDefault === undefined
          ? {}
          : { isDefault: params.isDefault }),
        ...(params.hasNumbers === undefined
          ? {}
          : { hasNumbers: params.hasNumbers }),
        ...(params.needsAttention === undefined
          ? {}
          : { needsAttention: params.needsAttention }),
      },
      ...options,
    });
  }

  create(
    body: CreateCustomerRequest = {},
    options: RequestOptions,
  ): Promise<ApiResponse<DataEnvelope<Customer>>> {
    return this.transport.request({
      method: "POST",
      path: "/platform/customers",
      body,
      ...options,
    });
  }

  retrieve(
    customerId: string,
    projectId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<Customer>>> {
    return this.transport.request({
      method: "GET",
      path: customerPath(customerId),
      query: { projectId },
      ...options,
    });
  }

  update(
    customerId: string,
    body: UpdateCustomerRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<Customer>>> {
    return this.transport.request({
      method: "PATCH",
      path: customerPath(customerId),
      body,
      ...options,
    });
  }

  archive(
    customerId: string,
    body: CustomerProjectRequest = {},
    options: RequestOptions,
  ): Promise<ApiResponse<DataEnvelope<Customer>>> {
    return this.lifecycle(customerId, "archive", body, options);
  }

  restore(
    customerId: string,
    body: CustomerProjectRequest = {},
    options: RequestOptions,
  ): Promise<ApiResponse<DataEnvelope<Customer>>> {
    return this.lifecycle(customerId, "restore", body, options);
  }

  listNumbers(
    customerId: string,
    projectId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly CustomerNumber[]>>> {
    return this.transport.request({
      method: "GET",
      path: `${customerPath(customerId)}/numbers`,
      query: { projectId },
      ...options,
    });
  }

  listEvents(
    customerId: string,
    params: ListCustomerEventsParams,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly CustomerEvent[]>>> {
    return this.transport.request({
      method: "GET",
      path: `${customerPath(customerId)}/events`,
      query: {
        projectId: params.projectId,
        ...(params.limit === undefined ? {} : { limit: params.limit }),
      },
      ...options,
    });
  }

  createPairingLink(
    customerId: string,
    body: CreateCustomerPairingLinkRequest = {},
    options: RequestOptions,
  ): Promise<ApiResponse<DataEnvelope<CreatedCustomerPairingLink>>> {
    return this.transport.request({
      method: "POST",
      path: `${customerPath(customerId)}/pairing-links`,
      body,
      ...options,
    });
  }

  listPairingLinks(
    customerId: string,
    projectId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly CustomerPairingLink[]>>> {
    return this.transport.request({
      method: "GET",
      path: `${customerPath(customerId)}/pairing-links`,
      query: { projectId },
      ...options,
    });
  }

  revokePairingLink(
    customerId: string,
    pairingLinkId: string,
    projectId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<CustomerPairingLink>>> {
    return this.transport.request({
      method: "DELETE",
      path: `${customerPath(customerId)}/pairing-links/${encodeURIComponent(pairingLinkId)}`,
      query: { projectId },
      ...options,
    });
  }

  transferNumber(
    customerId: string,
    sessionId: string,
    body: TransferCustomerNumberRequest,
    options: RequestOptions,
  ): Promise<ApiResponse<DataEnvelope<CustomerNumber>>> {
    return this.transport.request({
      method: "POST",
      path: `${customerPath(customerId)}/numbers/${encodeURIComponent(sessionId)}/transfer`,
      body,
      ...options,
    });
  }

  private lifecycle(
    customerId: string,
    action: "archive" | "restore",
    body: CustomerProjectRequest,
    options: RequestOptions,
  ): Promise<ApiResponse<DataEnvelope<Customer>>> {
    return this.transport.request({
      method: "POST",
      path: `${customerPath(customerId)}/${action}`,
      body,
      ...options,
    });
  }
}

function customerPath(customerId: string): string {
  return `/platform/customers/${encodeURIComponent(customerId)}`;
}

function projectCustomersPath(projectId: string): string {
  return `/platform/projects/${encodeURIComponent(projectId)}/customers`;
}
