// Analytics additions pin their source in contracts/analytics-device-signals.json.
import { PolymorfaValidationError, PolymorfaServerError } from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type {
  ApiResponse,
  QueryValue,
  RequestOptions,
} from "../transport/types.js";
import { type DataEnvelope, unwrapResponse } from "./response.js";
export interface CallOutcomeMetrics {
  total: number;
  answered: number;
  missed: number;
  declined: number;
  failed: number;
  ringing: number;
  answerRate: number | null;
  talkSeconds: number;
  timedAnswered: number;
  timedPickup: number;
  averageTalkSeconds: number | null;
  medianTalkSeconds: number | null;
  p95TalkSeconds: number | null;
  averagePickupMs: number | null;
  p95PickupMs: number | null;
  shortAnswered: number;
  video: number;
}
export interface CallBusinessMetrics extends CallOutcomeMetrics {
  directions: { inbound: CallOutcomeMetrics; outbound: CallOutcomeMetrics };
  mediaQuality: {
    measuredCalls: number;
    averageJitterMs: number | null;
    averageRttMs: number | null;
    packetsLost: number | null;
  };
  appQuality: {
    measuredCalls: number;
    averageJitterMs: number | null;
    averageRttMs: number | null;
    packetLossRate: number | null;
    reconnects: number | null;
  };
  endReasons: { code: string; count: number }[];
  appErrors: { code: string; count: number }[];
  transports: { code: string; count: number }[];
  multiParticipantCalls: number;
  followUp: {
    eligibleMissed: number;
    returnedWithin24h: number;
    rate: number | null;
    averageDelayMs: number | null;
    pendingWindow: number;
    unknownContact: number;
  };
}
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
export type EstimatedMessagePlatform =
  | "web"
  | "android"
  | "iphone"
  | "ipad"
  | "macos"
  | "windows"
  | "wearable"
  | "ar_device"
  | "unknown";
export interface WhatsAppDeviceAnalytics {
  detector: "message_id_prefix/v1";
  measured: boolean;
  complete: boolean;
  observedBuckets: number;
  customerMessages: number | null;
  accountMessages: number | null;
  customerPlatforms: {
    platform: EstimatedMessagePlatform;
    messages: number;
    share: number | null;
  }[];
  accountPlatforms: {
    platform: EstimatedMessagePlatform;
    messages: number;
    share: number | null;
  }[];
  /** Inventory belongs to one number. The combined summary has null inventory. */
  inventory: null | {
    listObserved: boolean;
    listCurrent: boolean;
    observedAt: number | null;
    deviceCount: number | null;
    truncated: boolean;
    devices: {
      deviceIndex: number;
      estimatedPlatform: EstimatedMessagePlatform;
      reportedClass:
        "phone" | "desktop_app" | "browser" | "business_api" | "unknown";
      lastActiveAt: number | null;
      listed: boolean | null;
    }[];
  };
}
export interface WhatsAppConversationGroup {
  ts: number;
  messageType:
    | "text"
    | "image"
    | "video"
    | "audio"
    | "document"
    | "sticker"
    | "interactive"
    | "template"
    | "other";
  textBand: "none" | "short" | "medium" | "long" | "very_long" | "unknown";
  origin: "api" | "campaign" | "other";
  callingCode: string;
  customerDevices: "single" | "multiple" | "unknown";
  completedConversations: number;
  deliveredConversations: number;
  readConversations: number;
  repliedConversations: number;
  replyLatencySumMs: number;
  readRate: number | null;
  replyRate: number | null;
  averageCustomerReplyMs: number | null;
}
export interface WhatsAppConversationBreakdown {
  measured: boolean;
  complete: boolean;
  observedBuckets: number;
  droppedConversations: number;
  truncated: boolean;
  buckets: { ts: number; complete: boolean }[];
  rows: WhatsAppConversationGroup[];
}
export interface WhatsAppMetrics {
  deviceAnalytics: WhatsAppDeviceAnalytics;
  conversationBreakdown: WhatsAppConversationBreakdown;
  calls: CallBusinessMetrics;
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
    completedPhoneActivityPeriods: number;
    phoneActivityMs: number;
    averagePhoneActivityMs: number | null;
    phoneQuietGaps: number;
    phoneQuietMs: number;
    averagePhoneQuietMs: number | null;
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
  callSeries: (CallOutcomeMetrics & { sessionId: string; ts: number })[];
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
    completedPhoneActivityPeriods: number;
    phoneActivityMs: number;
    phoneQuietGaps: number;
    phoneQuietMs: number;
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
export interface AnalyticsMetricsParams {
  readonly projectId?: string;
  readonly sessionId?: string;
  /** Completed UTC hours, 1-168. Default 24. */
  readonly windowHours?: number;
  /** Include bounded metadata breakdowns. Default false. */
  readonly segments?: boolean;
  readonly format?: "prometheus" | "openmetrics";
}
/** Message aggregates from Linked Devices telemetry and retained call outcomes. Requires sessions:read.
 * Owners/admins enable Analytics in the Console. Disabled results contain no
 * business data. Read/reply percentages are completed 24-hour direct-chat
 * cohorts; null means there is no denominator or coverage is incomplete. */
export class AnalyticsResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly projectId: string | null,
  ) {}
  /** Collector-compatible windowed gauges. Never apply rate() or increase().
   * Disabled Analytics returns enablement and window metadata only. */
  async metrics(
    params: AnalyticsMetricsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<string>> {
    for (const key of ["projectId", "sessionId"] as const) {
      if (
        params[key] !== undefined &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          params[key],
        )
      )
        throw new PolymorfaValidationError(`${key} must be a UUID.`, {
          code: "invalid_analytics_filter",
        });
    }
    if (
      this.projectId !== null &&
      params.projectId !== undefined &&
      params.projectId.toLowerCase() !== this.projectId.toLowerCase()
    )
      throw new PolymorfaValidationError(
        "Analytics cannot read outside the client's project.",
        { code: "invalid_analytics_filter" },
      );
    if (
      params.windowHours !== undefined &&
      (!Number.isInteger(params.windowHours) ||
        params.windowHours < 1 ||
        params.windowHours > 168)
    )
      throw new PolymorfaValidationError(
        "windowHours must be an integer from 1 to 168.",
        { code: "invalid_analytics_range" },
      );
    if (params.segments !== undefined && typeof params.segments !== "boolean")
      throw new PolymorfaValidationError("segments must be a boolean.", {
        code: "invalid_analytics_filter",
      });
    const format = params.format ?? "prometheus";
    if (format !== "prometheus" && format !== "openmetrics")
      throw new PolymorfaValidationError(
        "format must be prometheus or openmetrics.",
        { code: "invalid_analytics_filter" },
      );
    const query: Record<string, QueryValue> = { ...params, format };
    if (this.projectId !== null) delete query.projectId;
    const response = await this.transport.requestText(
      {
        ...options,
        method: "GET",
        path:
          this.projectId === null
            ? "/platform/analytics/metrics"
            : `/platform/projects/${encodeURIComponent(this.projectId)}/analytics/metrics`,
        query,
      },
      format === "openmetrics" ? "application/openmetrics-text" : "text/plain",
    );
    const expected =
      format === "openmetrics" ? "application/openmetrics-text" : "text/plain";
    if (
      !/^# TYPE polymorfa_analytics_enabled gauge$/m.test(response.data) ||
      response.metadata.headers["content-type"]
        ?.split(";", 1)[0]
        ?.trim()
        .toLowerCase() !== expected ||
      (format === "openmetrics" && !response.data.endsWith("# EOF\n"))
    )
      throw new PolymorfaServerError(
        "The API returned an invalid analytics metrics response.",
        {
          code: "invalid_response",
          status: response.metadata.status,
          metadata: response.metadata,
        },
      );
    return response;
  }
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
      params.projectId.toLowerCase() !== this.projectId.toLowerCase()
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
