import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { GetUserSecurityCodeResponse } from "./types.js";

export class UsersResource {
  constructor(private readonly transport: HttpTransport) {}

  getSecurityCode(
    session: string,
    userId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetUserSecurityCodeResponse>> {
    return this.transport.request({
      method: "GET",
      path: `/messaging/${encodeURIComponent(session)}/users/${encodeURIComponent(userId)}/security-code`,
      ...options,
    });
  }
}
