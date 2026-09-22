import { HttpTransport } from "../transport/http.js";
import type {
  ApiResponse,
  QueryValue,
  RequestOptions,
} from "../transport/types.js";
import { type DataEnvelope, unwrapResponse } from "./response.js";

/**
 * What was measured. Calls record `call.duration` (seconds) and, for outgoing
 * Cloud API calls, `call.cloud_pulses` (6-second pulses). The other meters
 * belong to voice automation and have no records yet.
 */
export type UsageMeter =
  | "call.duration"
  | "call.cloud_pulses"
  | "campaign.call"
  | "tts.characters"
  | "tts.seconds"
  | "stt.seconds"
  | "agent.seconds"
  | "agent.tokens"
  | "agent.provider_cost"
  | "channels.peak"
  | "storage.byte_days";

export type UsageUnit =
  | "second"
  | "pulse"
  | "call"
  | "character"
  | "token"
  | "provider_unit"
  | "channel"
  | "byte_day";

/** Whose provider key produced the usage. `none` for calls. */
export type UsageKeySource = "none" | "managed" | "customer";
export type UsagePricingState = "unpriced" | "priced" | "waived" | "settled";
export type UsageSourceKind =
  "call" | "attempt" | "flow_run" | "conversation" | "asset" | "team";

/** Dimensions of `call.duration` and `call.cloud_pulses` records. */
export interface CallUsageDimensions {
  readonly direction: "inbound" | "outbound";
  readonly upstream: "linked_device" | "cloud_api";
  readonly origin:
    "direct" | "campaign" | "flow" | "agent" | "inbound_automation";
  readonly participants: number;
  readonly connections: number;
  readonly sipLegs: number;
  readonly video: boolean;
}

export interface UsageRecord {
  readonly id: string;
  readonly meter: UsageMeter;
  readonly quantity: number;
  readonly unit: UsageUnit;
  /** Closed, per-meter attributes. See {@link CallUsageDimensions} for calls. */
  readonly dimensions: Readonly<Record<string, string | number | boolean>>;
  readonly keySource: UsageKeySource;
  readonly sourceKind: UsageSourceKind;
  /** The call id for call meters. */
  readonly sourceId: string;
  readonly projectId: string | null;
  /** The number (session name) the usage belongs to. */
  readonly session: string | null;
  readonly occurredAt: string;
  readonly recordedAt: string;
  /** Increases when a later observation corrects the record. Keep the highest. */
  readonly revision: number;
  /** `unpriced` while usage is measured but not charged. */
  readonly pricingState: UsagePricingState;
  readonly rateCard: { readonly id: string; readonly version: number } | null;
  readonly pricedCredits: number | null;
}

export interface UsageRecordPage {
  readonly records: readonly UsageRecord[];
  /** Pass as `cursor` for the next page; `null` on the last page. */
  readonly nextCursor: string | null;
}

export interface UsageMeterTotal {
  readonly meter: UsageMeter;
  readonly unit: UsageUnit;
  readonly keySource: UsageKeySource;
  readonly quantity: number;
  readonly records: number;
}

export interface UsageSummary {
  /** Calendar month in UTC, `YYYY-MM`. */
  readonly period: string;
  readonly start: string;
  readonly end: string;
  readonly projectId: string | null;
  readonly session: string | null;
  /** Always `false` while usage is measured but not charged. */
  readonly billingEnabled: boolean;
  readonly meters: readonly UsageMeterTotal[];
  /** Totals per number, most call time first (at most 100). */
  readonly numbers: readonly {
    readonly session: string;
    readonly projectId: string | null;
    readonly meters: readonly UsageMeterTotal[];
  }[];
  readonly numbersTruncated: boolean;
}

export type UsageGateKey =
  | "calls.outbound_monthly"
  | "voice.campaigns"
  | "voice.campaigns.recipients"
  | "voice.campaigns.calls_monthly"
  | "voice.channels.concurrent"
  | "voice.audio_library"
  | "voice.audio_library.assets"
  | "voice.flows"
  | "voice.agents.elevenlabs"
  | "voice.agents.openai_realtime"
  | "voice.providers.managed"
  | "voice.providers.customer_key"
  | "voice.agent_minutes_monthly"
  | "voice.tts_characters_monthly"
  | "voice.stt_minutes_monthly"
  | "voice.storage.recordings"
  | "voice.storage.transcripts";

/**
 * For an active gate, `record` counts actions over the limit without refusing
 * them; `enforce` refuses them with `gate_limit_reached` (HTTP 402). `off`
 * does not check. An inactive gate's configured mode does not enforce a limit.
 */
export type UsageGateMode = "off" | "record" | "enforce";

export interface UsageGate {
  readonly key: UsageGateKey;
  readonly kind: "capability" | "quota" | "limit" | "concurrency";
  readonly subject: "team" | "number" | "project" | "campaign";
  readonly mode: UsageGateMode;
  /** Whether an action checks this gate today. */
  readonly active: boolean;
  /** `-1` for no limit; `null` when the limit applies per number and no `session` was given. */
  readonly limit: number | null;
  readonly used: number | null;
  readonly unit: UsageUnit | "count" | "minute" | null;
  readonly overLimit: boolean | null;
  /** Checks over the limit in the last 30 days (UTC). */
  readonly decisions: {
    readonly wouldBlock: number;
    readonly blocked: number;
    readonly evaluationError: number;
  };
}

export interface UsageGateList {
  readonly session: string | null;
  readonly gates: readonly UsageGate[];
}

export interface UsageSummaryParams {
  /** Organization keys only; a project client always reads its own project. */
  readonly projectId?: string;
  /** One number (session name). */
  readonly session?: string;
  /** Calendar month in UTC, `YYYY-MM`. Defaults to the current month. */
  readonly period?: string;
}

export interface UsageRecordParams extends UsageSummaryParams {
  /** Calendar month in UTC, `YYYY-MM`. Omit it to list records from every month. */
  readonly period?: string;
  /** One call's records. */
  readonly callId?: string;
  readonly meter?: UsageMeter;
  /** 1 to 100; defaults to 25. */
  readonly limit?: number;
  readonly cursor?: string;
}

export interface UsageGateParams {
  readonly projectId?: string;
  /** Include limits that apply per number. */
  readonly session?: string;
}

/**
 * Metered usage and usage gates. Usage is measured, not charged. Requires the
 * `sessions:read` scope; a project token reads only its own project's usage,
 * and gate state needs an organization key.
 */
export class UsageResource {
  constructor(
    private readonly transport: HttpTransport,
    private readonly projectId: string | null,
  ) {}

  /** `GET /platform/usage`: totals for one calendar month, by meter and by number. */
  async summary(
    params: UsageSummaryParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<UsageSummary>> {
    return unwrapResponse(
      await this.get<UsageSummary>("/platform/usage", params, options),
    );
  }

  /** `GET /platform/usage/records`: records newest first, one page. */
  async listRecords(
    params: UsageRecordParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<UsageRecordPage>> {
    return unwrapResponse(
      await this.get<UsageRecordPage>(
        "/platform/usage/records",
        params,
        options,
      ),
    );
  }

  /** Iterates every matching record across pages. */
  async *iterateRecords(
    params: Omit<UsageRecordParams, "cursor"> = {},
    options: RequestOptions = {},
  ): AsyncGenerator<UsageRecord, void, undefined> {
    let cursor: string | undefined;
    do {
      const page = await this.listRecords(
        { ...params, ...(cursor ? { cursor } : {}) },
        options,
      );
      yield* page.data.records;
      cursor = page.data.nextCursor ?? undefined;
    } while (cursor);
  }

  /**
   * `GET /platform/gates`: every usage gate with its mode, limit and usage.
   * Gate state covers the whole team, so this needs an organization client;
   * the API refuses project credentials with 403.
   */
  async listGates(
    params: UsageGateParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<UsageGateList>> {
    return unwrapResponse(
      await this.get<UsageGateList>("/platform/gates", params, options),
    );
  }

  private get<T>(
    path: "/platform/usage" | "/platform/usage/records" | "/platform/gates",
    params: object,
    options: RequestOptions,
  ): Promise<ApiResponse<DataEnvelope<T>>> {
    const query: Record<string, QueryValue> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) query[key] = value as QueryValue;
    }
    if (this.projectId !== null) query.projectId = this.projectId;
    return this.transport.request({
      method: "GET",
      path,
      ...options,
      query,
    });
  }
}
