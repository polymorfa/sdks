import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  CheckContactsResponse,
  GetBlocklistResponse,
  GetBusinessProfileResponse,
  GetContactPictureResponse,
  GetContactResponse,
  GetUserDevicesResponse,
  GetUserInfoResponse,
  ListContactsResponse,
  SuccessResponse,
} from "./types.js";

export class ContactsResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListContactsResponse>> {
    return this.transport.request({
      method: "GET",
      path: contactsPath(connection),
      ...options,
    });
  }

  check(
    connection: string,
    phone: string | readonly string[],
    options: RequestOptions = {},
  ): Promise<ApiResponse<CheckContactsResponse>> {
    return this.transport.request({
      method: "GET",
      path: `${contactsPath(connection)}/check`,
      query: { phone: typeof phone === "string" ? phone : phone.join(",") },
      ...options,
    });
  }

  blocklist(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBlocklistResponse>> {
    return this.transport.request({
      method: "GET",
      path: `${contactsPath(connection)}/blocked`,
      ...options,
    });
  }

  retrieve(
    connection: string,
    contactId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetContactResponse>> {
    return this.transport.request({
      method: "GET",
      path: contactPath(connection, contactId),
      ...options,
    });
  }

  picture(
    connection: string,
    contactId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetContactPictureResponse>> {
    return this.getContactSubresource(
      connection,
      contactId,
      "picture",
      options,
    );
  }

  info(
    connection: string,
    contactId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetUserInfoResponse>> {
    return this.getContactSubresource(connection, contactId, "info", options);
  }

  devices(
    connection: string,
    contactId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetUserDevicesResponse>> {
    return this.getContactSubresource(
      connection,
      contactId,
      "devices",
      options,
    );
  }

  businessProfile(
    connection: string,
    contactId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBusinessProfileResponse>> {
    return this.getContactSubresource(
      connection,
      contactId,
      "business-profile",
      options,
    );
  }

  block(
    connection: string,
    contactId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.updateBlockState(connection, contactId, "block", options);
  }

  unblock(
    connection: string,
    contactId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.updateBlockState(connection, contactId, "unblock", options);
  }

  private getContactSubresource<T>(
    connection: string,
    contactId: string,
    resource: "picture" | "info" | "devices" | "business-profile",
    options: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.transport.request({
      method: "GET",
      path: `${contactPath(connection, contactId)}/${resource}`,
      ...options,
    });
  }

  private updateBlockState(
    connection: string,
    contactId: string,
    action: "block" | "unblock",
    options: RequestOptions,
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${contactPath(connection, contactId)}/${action}`,
      ...options,
    });
  }
}

function contactsPath(connection: string): string {
  return `/messaging/${encodeURIComponent(connection)}/contacts`;
}

function contactPath(connection: string, contactId: string): string {
  return `${contactsPath(connection)}/${encodeURIComponent(contactId)}`;
}
