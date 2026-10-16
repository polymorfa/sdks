import type { CampaignRecipientStatus } from "./messaging/types.js";

export type CampaignReplyFlowSend =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "buttons";
      readonly body: string;
      readonly footer?: string;
      readonly buttons: readonly {
        readonly id: string;
        readonly text: string;
      }[];
    }
  | {
      readonly kind: "list";
      readonly body: string;
      readonly buttonText: string;
      readonly footer?: string;
      readonly rows: readonly {
        readonly id: string;
        readonly title: string;
        readonly description?: string;
      }[];
    }
  | {
      readonly kind: "flow_form";
      readonly flowId: string;
      readonly body: string;
      readonly buttonText: string;
      readonly footer?: string;
      readonly screen: string;
    };

export type CampaignReplyFlowMatch =
  | {
      readonly kind: "choice";
      readonly replyKind: "button" | "list";
      readonly id: string;
    }
  | { readonly kind: "keyword"; readonly value: string }
  | { readonly kind: "flow_submission" };

export interface CampaignReplyFlowNode {
  readonly id: string;
  readonly send?: CampaignReplyFlowSend;
  readonly edges: readonly {
    readonly match: CampaignReplyFlowMatch;
    readonly to: string;
  }[];
}

export interface CampaignReplyFlowDefinition {
  readonly entryNodeId: string;
  readonly nodes: readonly CampaignReplyFlowNode[];
}

export interface CreateCampaignReplyFlowRequest {
  readonly name: string;
  readonly definition: CampaignReplyFlowDefinition;
  readonly flowKey?: string;
  readonly revision?: number;
}

/** Organization calls select the project explicitly. Bound project calls omit it. */
export interface CampaignProjectParams {
  readonly projectId: string;
}

export interface CreatePlatformCampaignReplyFlowRequest extends CreateCampaignReplyFlowRequest {
  readonly projectId: string;
}

export interface CampaignReplyFlow {
  readonly id: string;
  readonly flowKey: string;
  readonly revision: number;
  readonly name: string;
  readonly definition: CampaignReplyFlowDefinition;
  /** Unix milliseconds. */
  readonly createdAt: number;
}

export interface CampaignTestSendRequest {
  readonly sessionId: string;
  readonly to: string;
  readonly sampleRecipientId?: string;
  readonly variables?: Readonly<Record<string, string | number | boolean>>;
}

export interface PlatformCampaignTestSendRequest extends CampaignTestSendRequest {
  readonly projectId: string;
}

export interface CampaignTestSend {
  readonly id: string;
  readonly campaignId: string;
  readonly status: "sent";
  readonly from: { readonly sessionId: string; readonly phone: string };
  readonly to: string;
  readonly messageId: string | null;
  readonly variables: Readonly<Record<string, string>>;
  readonly createdAt: number;
}

export interface SetCampaignReplyFlowRequest {
  /** Explicit null detaches the flow. */
  readonly replyFlowId: string | null;
}

export interface SetPlatformCampaignReplyFlowRequest extends SetCampaignReplyFlowRequest {
  readonly projectId: string;
}

export interface CampaignReplyFlowAssignment {
  readonly campaignId: string;
  readonly replyFlowId: string | null;
}

export interface CampaignTrackedLinkReport {
  readonly key: string;
  readonly url: string;
  readonly uniqueOpens: number;
  readonly totalOpens: number;
}

export type CampaignRecipientFailureReason =
  | "opted_out"
  | "cold_held"
  | "campaign_cancelled"
  | "invalid_recipient"
  | "session_not_connected"
  | "ack_timeout"
  | "blocked_by_safety"
  | "send_failed"
  | "missing_variable"
  | "other";

export interface CampaignRecipientExportParams {
  readonly status?: CampaignRecipientStatus;
  readonly reason?: CampaignRecipientFailureReason;
  readonly cursor?: string;
  readonly limit?: number;
}

/** One CSV page. Each page retains its own header and server quoting. */
export interface CampaignRecipientExportPage {
  readonly csv: string;
  readonly nextCursor: string | null;
  readonly filename: string | null;
}

export interface CampaignLaunchApproval {
  readonly id: string;
  readonly campaignId: string;
  readonly action: "launch" | "resume" | "reschedule";
  readonly status:
    "pending" | "approved" | "rejected" | "superseded" | "expired";
  readonly reasons: readonly ("audience_threshold" | "agent_request")[];
  readonly recipientCount: number;
  readonly scheduledAt: number | null;
  readonly requestedBy: { readonly type: string; readonly id: string };
  readonly requestedAt: number;
  readonly expiresAt: number;
  readonly decidedBy: string | null;
  readonly decidedAt: number | null;
  readonly operationId: string | null;
}

export interface CampaignSettings {
  readonly launchApproval: { readonly recipientThreshold: number | null };
}

export type AudienceProfileAttribute = string | number | boolean | null;
export type AudienceProfileSource = "api" | "csv" | "form";

export interface AudienceProfileProvenance {
  readonly source: AudienceProfileSource;
  readonly reference: string;
}

/** An assertion does not override opt-outs or grant permission to send. */
export interface AudienceProfileConsentInput extends AudienceProfileProvenance {
  readonly purpose: "campaigns";
  readonly allowed: boolean;
  readonly assertedAt: number;
}

export interface AudienceProfile {
  readonly id: string;
  readonly phone: string;
  readonly revision: number;
  readonly tags: readonly string[];
  readonly attributes: Readonly<Record<string, AudienceProfileAttribute>>;
  readonly provenance: AudienceProfileProvenance | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface PutAudienceProfileRequest {
  readonly tags: readonly string[];
  readonly attributes: Readonly<Record<string, AudienceProfileAttribute>>;
  readonly expectedRevision?: number;
  readonly provenance?: AudienceProfileProvenance;
  readonly consent?: AudienceProfileConsentInput;
}

export interface AudienceConsentAssertion extends AudienceProfileConsentInput {
  readonly id: string;
  readonly profileRevision: number;
  readonly createdAt: number;
}

export interface ListAudienceProfilesParams {
  readonly cursor?: string;
  readonly limit?: number;
}

export interface AudienceProfilePage<T> {
  readonly data: readonly T[];
  readonly page: {
    readonly nextCursor: string | null;
    readonly hasMore: boolean;
  };
}

export interface DeleteAudienceProfileResult {
  readonly deleted: true;
  readonly phone: string;
  readonly revision: number;
}

export interface AudienceProfileImportMapping {
  readonly phone: string;
  readonly tags: string;
  readonly attributes: string;
  readonly expectedRevision?: string;
  readonly provenanceReference?: string;
  readonly consentAllowed?: string;
  readonly consentAssertedAt?: string;
  readonly consentReference?: string;
}

export interface CreateAudienceProfileImportRequest {
  readonly replayKey: string;
  /** Canonical standard base64 of UTF-8 CSV, up to 10 MiB decoded. */
  readonly csvBase64: string;
  readonly mapping?: AudienceProfileImportMapping;
}

export interface AudienceProfileImportJob {
  readonly id: string;
  readonly state: "queued" | "completed" | "cancelled";
  readonly totalValid: number;
  readonly invalidCount: number;
  readonly invalidSamples: readonly {
    readonly row: number;
    readonly reason: string;
  }[];
  readonly conflictSamples: readonly {
    readonly row: number;
    readonly reason: "quota" | "revision_conflict";
  }[];
  readonly processedValid: number;
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly conflictCount: number;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly completedAt: number | null;
}

export type CampaignRetargetOutcome =
  | "delivered"
  | "not_delivered"
  | "read"
  | "not_read"
  | "replied"
  | "not_replied"
  | "failed";

export interface CreateAudienceFromCampaignRequest {
  readonly name: string;
  readonly campaignId: string;
  readonly outcome: CampaignRetargetOutcome;
  readonly projectId?: string;
}

export interface AudienceFromCampaignResult {
  readonly id: string;
  readonly name: string;
  readonly source: "campaign";
  readonly recipientCount: number;
  readonly fileId: string | null;
  readonly columns: readonly string[] | null;
  readonly sampleRow: Readonly<Record<string, string>> | null;
  /** This field is an open object in the public contract. */
  readonly mapping: Readonly<Record<string, unknown>> | null;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly sourceCampaignId: string;
  readonly outcome: CampaignRetargetOutcome;
  readonly matchedCount: number;
  readonly optedOutCount: number;
}

export type StopConfirmationLocale = "en" | "pt-BR" | "es";

export interface StopConfirmationSettings {
  readonly teamId: string;
  readonly enabled: boolean;
  readonly locale: StopConfirmationLocale | null;
  readonly revision: number;
  readonly textRevision: 1;
  readonly acknowledgement: string | null;
  readonly updatedAt: number | null;
}

export type UpdateStopConfirmationSettingsInput = {
  readonly teamId: string;
  readonly revision: number;
} & (
  | { readonly enabled: true; readonly locale: StopConfirmationLocale }
  | { readonly enabled: false; readonly locale: StopConfirmationLocale | null }
);

export interface StopConfirmationSummary {
  readonly enabled: boolean;
  readonly counts: {
    readonly queued: number;
    readonly admitted: number;
    readonly completed: number;
    readonly failed: number;
    readonly unknown: number;
  };
}

export type SignalCustodyMode = "standard" | "zero_knowledge";

export interface SignalCustodyDefault {
  readonly signalModeDefault: SignalCustodyMode | null;
  readonly effectiveSignalMode: SignalCustodyMode;
  readonly revision: number;
}

export interface ProjectSignalCustodyUpdate {
  readonly expectedRevision: number;
  readonly signalModeDefault: SignalCustodyMode;
}

export interface CustomerSignalCustodyUpdate {
  readonly expectedRevision: number;
  /** Null restores inheritance from the Project. */
  readonly signalModeDefault: SignalCustodyMode | null;
}

/** Campaign-authored substitutions. Empty bindings are valid draft values. */
export interface CampaignVariableBinding {
  readonly source?: string;
  readonly fallback?: string;
}
export type CampaignVariableMapping = Readonly<
  Record<string, CampaignVariableBinding>
>;
export interface CampaignTrackedLink {
  readonly key: string;
  readonly url: string;
}
