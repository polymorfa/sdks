import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  DeleteProfilePictureResponse,
  GetProfileResponse,
  SetProfileNameRequest,
  SetProfileNameResponse,
  SetProfilePictureRequest,
  SetProfilePictureResponse,
  SetProfileStatusRequest,
  SetProfileStatusResponse,
} from "./types.js";

export class ProfileResource {
  constructor(private readonly transport: HttpTransport) {}

  get(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetProfileResponse>> {
    return this.transport.request({
      method: "GET",
      path: profilePath(connection),
      ...options,
    });
  }

  setName(
    connection: string,
    body: SetProfileNameRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetProfileNameResponse>> {
    return this.transport.request({
      method: "PUT",
      path: `${profilePath(connection)}/name`,
      body,
      ...options,
    });
  }

  setStatus(
    connection: string,
    body: SetProfileStatusRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetProfileStatusResponse>> {
    return this.transport.request({
      method: "PUT",
      path: `${profilePath(connection)}/status`,
      body,
      ...options,
    });
  }

  setPicture(
    connection: string,
    body: SetProfilePictureRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetProfilePictureResponse>> {
    return this.transport.request({
      method: "PUT",
      path: `${profilePath(connection)}/picture`,
      body,
      ...options,
    });
  }

  deletePicture(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DeleteProfilePictureResponse>> {
    return this.transport.request({
      method: "DELETE",
      path: `${profilePath(connection)}/picture`,
      ...options,
    });
  }
}

function profilePath(connection: string): string {
  return `/messaging/${encodeURIComponent(connection)}/profile`;
}
