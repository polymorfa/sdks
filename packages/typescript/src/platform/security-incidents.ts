import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  DataEnvelope,
  SecurityIncident,
  SecurityIncidentAcknowledgement,
} from "./types.js";

export class SecurityIncidentsResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly SecurityIncident[]>>> {
    return this.transport.request({
      method: "GET",
      path: "/v1/incidents",
      ...options,
    });
  }

  acknowledge(
    incidentId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<SecurityIncidentAcknowledgement>>> {
    return this.transport.request({
      method: "POST",
      path: `/v1/incidents/${encodeURIComponent(incidentId)}/acknowledge`,
      ...options,
    });
  }
}
