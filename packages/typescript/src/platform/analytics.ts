// Platform analytics contract: polymorfa/polymorfa@c582f0c25efd24d6e5939b6d49b22abe57e26eca
import { PolymorfaValidationError } from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type {
  ApiResponse,
  QueryValue,
  RequestOptions,
} from "../transport/types.js";
import { type DataEnvelope, unwrapResponse } from "./response.js";
export interface WhatsAppBusinessSegment {
  dimension:
    | "message_type"
    | "text_band"
    | "origin"
    | "calling_code"
    | "customer_devices";
  key: string;
  sendAttempts: number;
  sent: number;
  sendFailures: number;
  sendFailureRate: number | null;
  completedConversations: number;
  deliveredConversations: number;
  readConversations: number;
  repliedConversations: number;
  deliveryRate: number | null;
  readRate: number | null;
  replyRate: number | null;
  averageCustomerReplyMs: number | null;
  readRateInterval95: [number, number] | null;
  replyRateInterval95: [number, number] | null;
  readRateDifference: number | null;
  replyRateDifference: number | null;
  shareOfConversations: number | null;
  shareOfSends: number | null;
}
export interface WhatsAppEngagement {
  windowHours: 24;
  completedConversations: number;
  deliveredConversations: number;
  readConversations: number;
  repliedConversations: number;
  deliveryRate: number | null;
  readRate: number | null;
  replyRate: number | null;
  averageCustomerReplyMs: number | null;
  complete: boolean;
  droppedConversations: number;
  droppedRecords: number;
  droppedReceiptJoins: number;
}
export interface WhatsAppMetrics {
  measured: boolean;
  observedHours: number;
  lastObservedAt: number | null;
  outgoingMessages: number;
  incomingMessages: number;
  sendAttempts: number;
  sendFailures: number;
  sendFailureRate: number | null;
  businessReplies: number;
  averageBusinessResponseMs: number | null;
  onlineMs: number;
  disconnects: number;
  connectFailures: number;
  streamErrors: number;
  keepaliveTimeouts: number;
  engagement: WhatsAppEngagement;
  messageAnalysis: { complete: boolean; segments: WhatsAppBusinessSegment[] };
  customerActivity: {
    observed: boolean;
    onlineSignals: number;
    offlineSignals: number;
    typingSignals: number;
  };
  accountActivity: {
    observed: boolean;
    primaryPhoneActivitySignals: number;
    primaryPhoneActivePeriods: number;
    primaryPhoneMessages: number;
    otherDeviceMessages: number;
    primaryPhoneReplies: number;
    otherDeviceReplies: number;
    averagePrimaryPhoneResponseMs: number | null;
    averageOtherDeviceResponseMs: number | null;
    lastPrimaryPhoneAt: number | null;
  };
  responseQueue: {
    awaitingReply: number;
    oldestWaitingMs: number;
    observedAt: number;
    complete: boolean;
  } | null;
}
export interface WhatsAppAnalytics {
  enabled: boolean;
  period: { start: number; end: number };
  requestVitals: {
    requests: number;
    failures: number;
    errorRate: number | null;
  };
  summary:
    | (WhatsAppMetrics & {
        totalNumbers: number;
        measuredNumbers: number;
        connectedNumbers: number;
      })
    | null;
  numbers: (WhatsAppMetrics & {
    sessionId: string;
    projectId: string;
    projectName: string;
    name: string;
    backend: string;
    status: string;
  })[];
  series: {
    customerOnlineSignals: number;
    customerTypingSignals: number;
    primaryPhoneMessages: number;
    otherDeviceMessages: number;
    primaryPhoneReplies: number;
    phoneActivePeriods: number;
    sessionId: string;
    ts: number;
    outgoingMessages: number;
    incomingMessages: number;
    sendFailures: number;
    businessReplies: number;
    averageBusinessResponseMs: number | null;
    onlineMs: number;
    disconnects: number;
  }[];
}
export interface AnalyticsSettings {
  enabled: boolean;
}

export interface AnalyticsParams {
  readonly projectId?: string;
  readonly sessionId?: string;
  /** Unix milliseconds; defaults to the preceding 30 days. Maximum range 366 days. */
  readonly start?: number;
  readonly end?: number;
}
/** Number aggregates from Linked Devices telemetry. Requires sessions:read.
 * Owners/admins enable Analytics in the Console. Disabled results contain no
 * business data. Read/reply percentages are completed 24-hour direct-chat
 * cohorts; null means there is no denominator or coverage is incomplete. */
export class AnalyticsResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly projectId: string | null,
  ) {}
  async get(
    params: AnalyticsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<WhatsAppAnalytics>> {
    for (const key of ["projectId", "sessionId"] as const) {
      const value = params[key];
      if (
        value !== undefined &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value,
        )
      )
        throw new PolymorfaValidationError(`${key} must be a UUID.`, {
          code: "invalid_analytics_filter",
        });
    }
    if (
      this.projectId !== null &&
      params.projectId !== undefined &&
      params.projectId !== this.projectId
    )
      throw new PolymorfaValidationError(
        "Analytics cannot read outside the client's project.",
        { code: "invalid_analytics_filter" },
      );
    for (const key of ["start", "end"] as const) {
      const value = params[key];
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
        throw new PolymorfaValidationError(
          `${key} must be Unix milliseconds.`,
          { code: "invalid_analytics_range" },
        );
    }
    if (
      params.start !== undefined &&
      params.end !== undefined &&
      (params.end < params.start ||
        params.end - params.start > 366 * 86_400_000)
    )
      throw new PolymorfaValidationError(
        "Choose an ordered analytics range of up to 366 days.",
        { code: "invalid_analytics_range" },
      );
    const query: Record<string, QueryValue> = {};
    for (const [key, value] of Object.entries(params))
      if (value !== undefined) query[key] = value;
    if (this.projectId !== null) delete query.projectId;
    return unwrapResponse(
      await this.transport.request<DataEnvelope<WhatsAppAnalytics>>({
        ...options,
        method: "GET",
        path:
          this.projectId === null
            ? "/platform/analytics"
            : `/platform/projects/${encodeURIComponent(this.projectId)}/analytics`,
        query,
      }),
    );
  }
}
