import type { RequestOptions } from "../transport/types.js";

export type ClientOwner = "organization" | "project";
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface EncodedEventPayload {
  readonly encoding: "base64";
  readonly contentType: "application/json";
  readonly data: string;
}

export type PayloadAvailability =
  "available" | "not_retained" | "expired" | "redacted" | "unavailable";

interface EventBase {
  readonly id: string;
  readonly organizationId: string;
  readonly type: string;
  readonly source: "runtime" | "platform" | "test";
  readonly environment: "development" | "production";
  readonly createdAt: string;
  readonly payloadAvailability: PayloadAvailability;
  readonly payload: EncodedEventPayload | null;
  readonly replayableUntil: string | null;
  readonly metadataExpiresAt: string;
}
export interface OrganizationEvent extends EventBase {
  readonly projectId: null;
}
export interface ProjectEvent extends EventBase {
  readonly projectId: string;
}

export interface ListEventsParams {
  readonly type?: string;
  readonly since?: string;
  readonly until?: string;
  readonly limit?: number;
  readonly cursor?: string;
}
export type ListOrganizationEventsParams = ListEventsParams;
export interface RetrieveEventParams {
  readonly includePayload?: boolean;
}
export interface ReplayEventInput {
  readonly webhookId: string;
}
export type ReplayOrganizationEventInput = ReplayEventInput;

export interface IdempotencyReceipt {
  readonly id: string;
  readonly key: string;
  readonly replayed: boolean;
  readonly createdAt: string;
  readonly expiresAt: string;
}
interface ReplayReceipt {
  readonly eventId: string;
  readonly deliveryId: string;
  readonly operationId: string;
  readonly idempotency: IdempotencyReceipt;
}
export type ProjectEventReplayReceipt = ReplayReceipt;
export type OrganizationEventReplayReceipt = ReplayReceipt;

export interface WebhookRetryPolicyInput {
  readonly maximumAttempts: number;
  readonly backoff: "constant" | "linear" | "exponential";
  readonly initialDelaySeconds: number;
}
export type WebhookRetryPolicy = WebhookRetryPolicyInput;
export interface WebhookHeaderInput {
  readonly name: string;
  readonly value: string;
}
export interface WebhookHeaderMetadata {
  readonly name: string;
}
export interface WebhookSigningSecretMetadata {
  readonly version: number;
  readonly createdAt: string;
  readonly previousValidUntil: string | null;
}
interface WebhookBase {
  readonly id: string;
  readonly organizationId: string;
  readonly url: string;
  readonly eventTypes: readonly string[];
  readonly enabled: boolean;
  readonly format: "native" | "meta";
  readonly retryPolicy: WebhookRetryPolicy;
  readonly headers: readonly WebhookHeaderMetadata[];
  readonly secret: WebhookSigningSecretMetadata;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface OrganizationWebhook extends WebhookBase {
  readonly owner: "organization";
  readonly projectId: null;
}
export interface ProjectWebhook extends WebhookBase {
  readonly owner: "project";
  readonly projectId: string;
}
interface CreateWebhookInputBase {
  readonly url: string;
  readonly eventTypes: readonly string[];
  readonly enabled?: boolean;
  readonly format?: "native" | "meta";
  readonly retryPolicy?: WebhookRetryPolicyInput;
  readonly headers?: readonly WebhookHeaderInput[];
}
export type CreateOrganizationWebhookInput = CreateWebhookInputBase;
export type CreateProjectWebhookInput = CreateWebhookInputBase;
interface UpdateWebhookInputBase {
  readonly url?: string;
  readonly eventTypes?: readonly string[];
  readonly enabled?: boolean;
  readonly format?: "native" | "meta";
  readonly retryPolicy?: WebhookRetryPolicyInput;
  readonly headers?: readonly WebhookHeaderInput[];
}
export type UpdateOrganizationWebhookInput = UpdateWebhookInputBase;
export type UpdateProjectWebhookInput = UpdateWebhookInputBase;
export interface ListWebhooksParams {
  readonly eventType?: string;
  readonly enabled?: boolean;
  readonly limit?: number;
  readonly cursor?: string;
}
export type ListOrganizationWebhooksParams = ListWebhooksParams;
export interface RotateWebhookSecretInput {
  readonly overlapSeconds?: number;
}
export type RetryWebhookDeliveryInput = Readonly<Record<string, never>>;
export type TestWebhookInput =
  | {
      readonly eventType?: string;
      readonly body?: never;
      readonly sessionId?: never;
    }
  | {
      readonly eventType?: string;
      readonly body: EncodedEventPayload;
      readonly sessionId: string;
    };

interface WebhookCreationReceipt<T> {
  readonly webhook: T;
  readonly operationId: null;
  readonly idempotency: IdempotencyReceipt;
  readonly secret: string | null;
  readonly secretAvailable: boolean;
}
export type OrganizationWebhookCreationReceipt =
  WebhookCreationReceipt<OrganizationWebhook>;
export type ProjectWebhookCreationReceipt =
  WebhookCreationReceipt<ProjectWebhook>;
interface WebhookMutationReceipt<T> {
  readonly webhook: T;
  readonly operationId: null;
  readonly idempotency: IdempotencyReceipt;
}
export type OrganizationWebhookMutationReceipt =
  WebhookMutationReceipt<OrganizationWebhook>;
export type ProjectWebhookMutationReceipt =
  WebhookMutationReceipt<ProjectWebhook>;
interface WebhookDeletionReceipt {
  readonly webhookId: string;
  readonly deleted: true;
  readonly operationId: null;
  readonly idempotency: IdempotencyReceipt;
}
export type OrganizationWebhookDeletionReceipt = WebhookDeletionReceipt;
export type ProjectWebhookDeletionReceipt = WebhookDeletionReceipt;
interface WebhookSecretRotationReceipt {
  readonly webhookId: string;
  readonly operationId: null;
  readonly secret: string | null;
  readonly secretAvailable: boolean;
  readonly secretMetadata: WebhookSigningSecretMetadata;
  readonly idempotency: IdempotencyReceipt;
}
export type OrganizationWebhookSecretRotationReceipt =
  WebhookSecretRotationReceipt;
export type ProjectWebhookSecretRotationReceipt = WebhookSecretRotationReceipt;
export type OrganizationWebhookTestReceipt = ReplayReceipt;
export type ProjectWebhookTestReceipt = ReplayReceipt;

export type WebhookDeliveryStatus =
  "pending" | "delivering" | "retrying" | "succeeded" | "failed";
interface WebhookDeliveryBase {
  readonly id: string;
  readonly organizationId: string;
  readonly eventId: string;
  readonly webhookId: string;
  readonly status: WebhookDeliveryStatus;
  readonly attemptCount: number;
  readonly capabilities: { readonly retryable: boolean };
  readonly payloadAvailability: PayloadAvailability;
  readonly replayableUntil: string | null;
  readonly metadataExpiresAt: string;
  readonly nextAttemptAt: string | null;
  readonly lastAttemptAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly lastOutcome: {
    readonly statusCode: number | null;
    readonly errorCode: string | null;
  } | null;
}
export interface OrganizationWebhookDelivery extends WebhookDeliveryBase {
  readonly projectId: null;
}
export interface ProjectWebhookDelivery extends WebhookDeliveryBase {
  readonly projectId: string;
}
export interface ListWebhookDeliveriesParams {
  readonly webhookId?: string;
  readonly eventId?: string;
  readonly status?: WebhookDeliveryStatus;
  readonly since?: string;
  readonly until?: string;
  readonly limit?: number;
  readonly cursor?: string;
}
export type ListOrganizationWebhookDeliveriesParams =
  ListWebhookDeliveriesParams;
export interface ListDeliveryAttemptsParams {
  readonly limit?: number;
  readonly cursor?: string;
}
interface WebhookDeliveryAttemptBase {
  readonly id: string;
  readonly organizationId: string;
  readonly deliveryId: string;
  readonly number: number;
  readonly status: "pending" | "delivering" | "succeeded" | "failed";
  readonly startedAt: string | null;
  readonly completedAt: string | null;
  readonly nextRetryAt: string | null;
  readonly durationMs: number | null;
  readonly statusCode: number | null;
  readonly errorCode: string | null;
  readonly metadataExpiresAt: string;
}
export interface OrganizationWebhookDeliveryAttempt extends WebhookDeliveryAttemptBase {
  readonly projectId: null;
}
export interface ProjectWebhookDeliveryAttempt extends WebhookDeliveryAttemptBase {
  readonly projectId: string;
}
interface WebhookDeliveryRetryReceipt {
  readonly deliveryId: string;
  readonly attemptId: string;
  readonly operationId: string;
  readonly idempotency: IdempotencyReceipt;
}
export type OrganizationWebhookDeliveryRetryReceipt =
  WebhookDeliveryRetryReceipt;
export type ProjectWebhookDeliveryRetryReceipt = WebhookDeliveryRetryReceipt;

export type OperationStatus =
  | "pending"
  | "running"
  | "action_required"
  | "cancelling"
  | "succeeded"
  | "failed"
  | "cancelled";
export type OperationKind =
  | "auth_projection_repair"
  | "session_lifecycle"
  | "auth_session_purge"
  | "label_projection_purge"
  | "billing_reconciliation"
  | "auto_top_up"
  | "campaign"
  | "production_enrollment"
  | "retention_sweep"
  | "webhook_redrive";
export interface OperationProgress {
  readonly code: string;
  readonly current: number | null;
  readonly total: number | null;
}
export interface OperationError {
  readonly code: string;
  readonly retryable: boolean;
  readonly details: Readonly<Record<string, JsonValue>> | null;
}
export interface OperationActionRequired {
  readonly code: string;
  readonly details: Readonly<Record<string, JsonValue>> | null;
}
interface OperationBase {
  readonly id: string;
  readonly organizationId: string;
  readonly kind: OperationKind;
  readonly resource: { readonly type: string; readonly id: string };
  readonly status: OperationStatus;
  readonly sequence: number;
  readonly capabilities: {
    readonly cancellable: boolean;
    readonly watchable: boolean;
  };
  readonly progress: OperationProgress | null;
  readonly result: JsonValue;
  readonly error: OperationError | null;
  readonly actionRequired: OperationActionRequired | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly completedAt: string | null;
}
export interface OrganizationOperation extends OperationBase {
  readonly projectId: null;
}
export interface ProjectOperation extends OperationBase {
  readonly projectId: string;
}
export type ManagementOperation = OrganizationOperation | ProjectOperation;
export type ManagementOperationStatus = OperationStatus;
export type ManagementOperationKind = OperationKind;
export type ManagementOperationProgress = OperationProgress;
export type ManagementOperationError = OperationError;
export type ManagementOperationActionRequired = OperationActionRequired;
export interface ListOperationsParams {
  readonly status?: OperationStatus;
  readonly kind?: OperationKind;
  readonly resourceType?: string;
  readonly resourceId?: string;
  readonly since?: string;
  readonly until?: string;
  readonly limit?: number;
  readonly cursor?: string;
}
export type ListOrganizationOperationsParams = ListOperationsParams;
export type ListOperationTransitionsParams =
  | {
      readonly afterSequence?: number;
      readonly cursor?: never;
      readonly limit?: number;
    }
  | {
      readonly cursor: string;
      readonly afterSequence?: never;
      readonly limit?: number;
    };
export interface OperationTransition {
  readonly operationId: string;
  readonly sequence: number;
  readonly fromStatus: OperationStatus | null;
  readonly toStatus: OperationStatus;
  readonly reasonCode: string | null;
  readonly occurredAt: string;
  readonly snapshot: {
    readonly progress: OperationProgress | null;
    readonly error: OperationError | null;
    readonly actionRequired: OperationActionRequired | null;
  };
}
export type OrganizationOperationTransition = OperationTransition;
export type ProjectOperationTransition = OperationTransition;
interface OperationCancellationReceipt<T> {
  readonly operation: T;
  readonly operationId: string;
  readonly idempotency: IdempotencyReceipt;
}
export type OrganizationOperationCancellationReceipt =
  OperationCancellationReceipt<OrganizationOperation>;
export type ProjectOperationCancellationReceipt =
  OperationCancellationReceipt<ProjectOperation>;
export interface WaitForOperationOptions {
  readonly maxWaitMs?: number;
  readonly pollIntervalMs?: number;
  readonly requestOptions?: Omit<RequestOptions, "signal">;
  readonly signal?: AbortSignal;
}
