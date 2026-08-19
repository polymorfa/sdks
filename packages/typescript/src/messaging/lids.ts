import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { ResolveLidParams, ResolveLidsResponse } from "./types.js";

export class LidsResource {
  constructor(private readonly transport: HttpTransport) {}

  resolve(
    session: string,
    params: ResolveLidParams,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ResolveLidsResponse>> {
    return this.transport.request({
      method: "GET",
      path: `/api/${encodeURIComponent(session)}/lids/resolve`,
      query: {
        phoneNumber: params.phoneNumber,
        id: params.id,
        lid: params.lid,
        username: params.username,
        usernameKey: params.usernameKey,
      },
      ...options,
    });
  }
}
