import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  DefaultDisappearingTimerRequest,
  GetPrivacySettingsResponse,
  PrivacySettingMutation,
  SetDefaultDisappearingTimerResponse,
  SetPrivacySettingResponse,
} from "./types.js";

export class PrivacyResource {
  constructor(private readonly transport: HttpTransport) {}

  get(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetPrivacySettingsResponse>> {
    return this.transport.request({
      method: "GET",
      path: privacyPath(connection),
      ...options,
    });
  }

  set(
    connection: string,
    mutation: PrivacySettingMutation,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetPrivacySettingResponse>> {
    return this.transport.request({
      method: "PUT",
      path: `${privacyPath(connection)}/${encodeURIComponent(mutation.setting)}`,
      body: { value: mutation.value },
      ...options,
    });
  }

  setDefaultDisappearingTimer(
    connection: string,
    body: DefaultDisappearingTimerRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetDefaultDisappearingTimerResponse>> {
    return this.transport.request({
      method: "PUT",
      path: `${privacyPath(connection)}/disappearing/default`,
      body,
      ...options,
    });
  }
}

function privacyPath(connection: string): string {
  return `/messaging/${encodeURIComponent(connection)}/privacy`;
}
