import { HttpTransport } from "../transport/http.js";
import type {
  ApiResponse,
  QueryValue,
  RequestOptions,
} from "../transport/types.js";
import type {
  BanSafeClaim,
  BanSafeClaimsEnvelope,
  BanSafeCollectionEnvelope,
  BanSafeEnforcementEnvelope,
  BanSafeFindingsEnvelope,
  BanSafeHealthActionsEnvelope,
  BanSafeHealthEnvelope,
  BanSafeHealthHistory,
  BanSafeIncident,
  BanSafeIncidentReceipt,
  BanSafeIncidentsEnvelope,
  BanSafeSignalDefinition,
  BanSafeNumberDetail,
  BanSafeTelemetryDetail,
  BanSafeTelemetryHistoryEnvelope,
  DataEnvelope,
  ListBanSafeClaimsParams,
  ListBanSafeCollectionParams,
  ListBanSafeEnforcementParams,
  ListBanSafeFindingsParams,
  ListBanSafeHealthActionsParams,
  ListBanSafeHealthHistoryParams,
  ListBanSafeHealthParams,
  ListBanSafeIncidentsParams,
  ListBanSafeTelemetryHistoryParams,
  ReportBanSafeIncidentRequest,
} from "./types.js";

export class BanSafeResource {
  constructor(private readonly transport: HttpTransport) {}

  listHealth(
    params: ListBanSafeHealthParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<BanSafeHealthEnvelope>> {
    return this.get("/platform/bansafe/health", params, options);
  }

  getHealth(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<BanSafeNumberDetail>>> {
    return this.get(
      `/platform/bansafe/health/${encodeURIComponent(session)}`,
      {},
      options,
    );
  }

  listHealthHistory(
    session: string,
    params: ListBanSafeHealthHistoryParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<BanSafeHealthHistory>>> {
    return this.get(
      `/platform/bansafe/health/${encodeURIComponent(session)}/history`,
      params,
      options,
    );
  }

  listSignals(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly BanSafeSignalDefinition[]>>> {
    return this.get("/platform/bansafe/signals", {}, options);
  }

  getTelemetry(
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<BanSafeTelemetryDetail>>> {
    return this.get(
      `/platform/bansafe/telemetry/${encodeURIComponent(session)}`,
      {},
      options,
    );
  }

  listTelemetryHistory(
    session: string,
    params: ListBanSafeTelemetryHistoryParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<BanSafeTelemetryHistoryEnvelope>> {
    return this.get(
      `/platform/bansafe/telemetry/${encodeURIComponent(session)}/history`,
      params,
      options,
    );
  }

  listCollection(
    params: ListBanSafeCollectionParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<BanSafeCollectionEnvelope>> {
    return this.get("/platform/bansafe/collection", params, options);
  }

  listHealthActions(
    params: ListBanSafeHealthActionsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<BanSafeHealthActionsEnvelope>> {
    return this.get("/platform/bansafe/health-actions", params, options);
  }

  listFindings(
    params: ListBanSafeFindingsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<BanSafeFindingsEnvelope>> {
    return this.get("/platform/bansafe/findings", params, options);
  }

  listEnforcement(
    params: ListBanSafeEnforcementParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<BanSafeEnforcementEnvelope>> {
    return this.get("/platform/bansafe/enforcement", params, options);
  }

  listIncidents(
    params: ListBanSafeIncidentsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<BanSafeIncidentsEnvelope>> {
    return this.get("/platform/bansafe/incidents", params, options);
  }

  createIncident(
    body: ReportBanSafeIncidentRequest,
    options: RequestOptions,
  ): Promise<ApiResponse<DataEnvelope<BanSafeIncidentReceipt>>> {
    return this.transport.request({
      method: "POST",
      path: "/platform/bansafe/incidents",
      body,
      ...options,
    });
  }

  retractIncident(
    incidentId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<BanSafeIncident>>> {
    return this.transport.request({
      method: "POST",
      path: `/platform/bansafe/incidents/${encodeURIComponent(incidentId)}/retract`,
      ...options,
    });
  }

  listClaims(
    params: ListBanSafeClaimsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<BanSafeClaimsEnvelope>> {
    return this.get("/platform/bansafe/claims", params, options);
  }

  getClaim(
    claimId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<BanSafeClaim>>> {
    return this.get(
      `/platform/bansafe/claims/${encodeURIComponent(claimId)}`,
      {},
      options,
    );
  }

  private get<T>(
    path: string,
    params: object,
    options: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.transport.request({
      method: "GET",
      path,
      query: params as Readonly<Record<string, QueryValue>>,
      ...options,
    });
  }
}
