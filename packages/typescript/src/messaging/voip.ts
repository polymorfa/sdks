import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { VoipTokenRequest, VoipTokenResponse } from "./types.js";

/**
 * Browser call signaling support. The only server-side operation is minting
 * the short-lived client token that `@polymorfa/browser` uses for the
 * `/api/voip/calls/{id}` signaling paths; the session's client rules must
 * grant `voip_place`, `voip_answer`, and `voip_signal`.
 */
export class VoipResource {
  constructor(private readonly transport: HttpTransport) {}

  token(
    body: VoipTokenRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<VoipTokenResponse>> {
    return this.transport.request({
      method: "POST",
      path: "/api/voip/token",
      body,
      ...options,
    });
  }
}
