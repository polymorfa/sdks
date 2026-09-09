import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  VoipAgentTokenRequest,
  VoipAgentTokenResponse,
  VoipSocketTicketRequest,
  VoipSocketTicketResponse,
  VoipTokenRequest,
  VoipTokenResponse,
} from "./types.js";

/**
 * Server-side calls support: minting the short-lived client token that
 * `@polymorfa/browser` uses for the `/messaging/voip/calls/{id}` signaling paths,
 * socket tickets for a server-driven calls WebSocket, and per-call agent
 * tickets for voice agents. The session's client rules must grant
 * `voip_place`, `voip_answer`, and `voip_signal` to browsers.
 */
export class VoipResource {
  constructor(private readonly transport: HttpTransport) {}

  token(
    body: VoipTokenRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<VoipTokenResponse>> {
    return this.transport.request({
      method: "POST",
      path: "/messaging/voip/token",
      body,
      ...options,
    });
  }

  /** Single-use ticket for the calls WebSocket; a server key names the session. */
  socketTicket(
    body: VoipSocketTicketRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<VoipSocketTicketResponse>> {
    return this.transport.request({
      method: "POST",
      path: "/messaging/voip/ws-ticket",
      body,
      ...options,
    });
  }

  /** Per-call ticket a voice agent presents to the voip pod (server keys only). */
  agentToken(
    callId: string,
    body: VoipAgentTokenRequest = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<VoipAgentTokenResponse>> {
    return this.transport.request({
      method: "POST",
      path: `/messaging/voip/calls/${encodeURIComponent(callId)}/agent-token`,
      body,
      ...options,
    });
  }
}
