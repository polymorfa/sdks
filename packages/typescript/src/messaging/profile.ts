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
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetProfileResponse>> {
    return this.transport.request({
      method: "GET",
      path: profilePath(session),
      ...options,
    });
  }

  setName(
    session: string,
    body: SetProfileNameRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetProfileNameResponse>> {
    return this.transport.request({
      method: "PUT",
      path: `${profilePath(session)}/name`,
      body,
      ...options,
    });
  }

  setStatus(
    session: string,
    body: SetProfileStatusRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetProfileStatusResponse>> {
    return this.transport.request({
      method: "PUT",
      path: `${profilePath(session)}/status`,
      body,
      ...options,
    });
  }

  setPicture(
    session: string,
    body: SetProfilePictureRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetProfilePictureResponse>> {
    return this.transport.request({
      method: "PUT",
      path: `${profilePath(session)}/picture`,
      body,
      ...options,
    });
  }

  deletePicture(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DeleteProfilePictureResponse>> {
    return this.transport.request({
      method: "DELETE",
      path: `${profilePath(session)}/picture`,
      ...options,
    });
  }
}

function profilePath(session: string): string {
  return `/messaging/${encodeURIComponent(session)}/profile`;
}
