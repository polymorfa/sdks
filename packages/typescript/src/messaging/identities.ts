import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  ResolveIdentityParams,
  ResolveIdentityResponse,
} from "./types.js";

export class IdentitiesResource {
  constructor(private readonly transport: HttpTransport) {}

  resolve(
    session: string,
    params: ResolveIdentityParams,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ResolveIdentityResponse>> {
    return this.transport.request({
      method: "GET",
      path: `/messaging/${encodeURIComponent(session)}/identities/resolve`,
      query: {
        phoneNumber: params.phoneNumber,
        id: params.id,
        username: params.username,
        usernameKey: params.usernameKey,
      },
      ...options,
    });
  }
}
