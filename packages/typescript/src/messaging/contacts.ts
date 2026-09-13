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
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListContactsResponse>> {
    return this.transport.request({
      method: "GET",
      path: contactsPath(session),
      ...options,
    });
  }

  check(
    session: string,
    phone: string | readonly string[],
    options: RequestOptions = {},
  ): Promise<ApiResponse<CheckContactsResponse>> {
    return this.transport.request({
      method: "GET",
      path: `${contactsPath(session)}/check`,
      query: { phone: typeof phone === "string" ? phone : phone.join(",") },
      ...options,
    });
  }

  blocklist(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBlocklistResponse>> {
    return this.transport.request({
      method: "GET",
      path: `${contactsPath(session)}/blocked`,
      ...options,
    });
  }

  retrieve(
    session: string,
    contactId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetContactResponse>> {
    return this.transport.request({
      method: "GET",
      path: contactPath(session, contactId),
      ...options,
    });
  }

  picture(
    session: string,
    contactId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetContactPictureResponse>> {
    return this.getContactSubresource(session, contactId, "picture", options);
  }

  info(
    session: string,
    contactId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetUserInfoResponse>> {
    return this.getContactSubresource(session, contactId, "info", options);
  }

  devices(
    session: string,
    contactId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetUserDevicesResponse>> {
    return this.getContactSubresource(session, contactId, "devices", options);
  }

  businessProfile(
    session: string,
    contactId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetBusinessProfileResponse>> {
    return this.getContactSubresource(
      session,
      contactId,
      "business-profile",
      options,
    );
  }

  block(
    session: string,
    contactId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.updateBlockState(session, contactId, "block", options);
  }

  unblock(
    session: string,
    contactId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.updateBlockState(session, contactId, "unblock", options);
  }

  private getContactSubresource<T>(
    session: string,
    contactId: string,
    resource: "picture" | "info" | "devices" | "business-profile",
    options: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.transport.request({
      method: "GET",
      path: `${contactPath(session, contactId)}/${resource}`,
      ...options,
    });
  }

  private updateBlockState(
    session: string,
    contactId: string,
    action: "block" | "unblock",
    options: RequestOptions,
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.transport.request({
      method: "POST",
      path: `${contactPath(session, contactId)}/${action}`,
      ...options,
    });
  }
}

function contactsPath(session: string): string {
  return `/messaging/${encodeURIComponent(session)}/contacts`;
}

function contactPath(session: string, contactId: string): string {
  return `${contactsPath(session)}/${encodeURIComponent(contactId)}`;
}
