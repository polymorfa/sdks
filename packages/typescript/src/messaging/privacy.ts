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
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetPrivacySettingsResponse>> {
    return this.transport.request({
      method: "GET",
      path: privacyPath(session),
      ...options,
    });
  }

  set(
    session: string,
    mutation: PrivacySettingMutation,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetPrivacySettingResponse>> {
    return this.transport.request({
      method: "PUT",
      path: `${privacyPath(session)}/${encodeURIComponent(mutation.setting)}`,
      body: { value: mutation.value },
      ...options,
    });
  }

  setDefaultDisappearingTimer(
    session: string,
    body: DefaultDisappearingTimerRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SetDefaultDisappearingTimerResponse>> {
    return this.transport.request({
      method: "PUT",
      path: `${privacyPath(session)}/disappearing/default`,
      body,
      ...options,
    });
  }
}

function privacyPath(session: string): string {
  return `/api/${encodeURIComponent(session)}/privacy`;
}
