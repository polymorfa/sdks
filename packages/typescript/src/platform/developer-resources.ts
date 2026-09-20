import { PolymorfaConfigurationError } from "../errors.js";
import { CursorPage } from "../pagination.js";
import { RawClient } from "../raw.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import { withIdempotencyKey } from "../transport/idempotency.js";
import type {
  ClientOwner,
  CreateOrganizationWebhookInput,
  CreateProjectWebhookInput,
  ListDeliveryAttemptsParams,
  ListEventsParams,
  ListOperationsParams,
  ListOperationTransitionsParams,
  ListOrganizationOperationsParams,
  ManagementOperation,
  OperationTransition,
  OrganizationOperationCancellationReceipt,
  ProjectOperation,
  ProjectOperationCancellationReceipt,
  RetrieveOperationParams,
  RetrieveOrganizationOperationParams,
  WaitForOperationOptions,
  WaitForOrganizationOperationOptions,
  ListWebhookDeliveriesParams,
  ListWebhooksParams,
  OrganizationEvent,
  OrganizationEventReplayReceipt,
  OrganizationWebhook,
  OrganizationWebhookCreationReceipt,
  OrganizationWebhookDeletionReceipt,
  OrganizationWebhookDelivery,
  OrganizationWebhookDeliveryAttempt,
  OrganizationWebhookDeliveryRetryReceipt,
  OrganizationWebhookMutationReceipt,
  OrganizationWebhookSecretRotationReceipt,
  OrganizationWebhookTestReceipt,
  ProjectEvent,
  ProjectEventReplayReceipt,
  ProjectWebhook,
  ProjectWebhookCreationReceipt,
  ProjectWebhookDeletionReceipt,
  ProjectWebhookDelivery,
  ProjectWebhookDeliveryAttempt,
  ProjectWebhookDeliveryRetryReceipt,
  ProjectWebhookMutationReceipt,
  ProjectWebhookSecretRotationReceipt,
  ProjectWebhookTestReceipt,
  ReplayEventInput,
  RetryWebhookDeliveryInput,
  RetrieveEventParams,
  RotateWebhookSecretInput,
  TestWebhookInput,
  UpdateOrganizationWebhookInput,
  UpdateProjectWebhookInput,
} from "./developer-types.js";
import {
  EventStream,
  eventStreamSource,
  type EventStreamAcknowledgement,
  type EventStreamAcknowledgementReceipt,
  type EventStreamParams,
  type LiveEventSourceAdapter,
  type OrganizationEventStreamParams,
} from "./event-stream.js";
import {
  decodeCursorPage,
  type DataEnvelope,
  unwrapResponse,
} from "./response.js";

type EventFor<O extends ClientOwner> = O extends "project"
  ? ProjectEvent
  : OrganizationEvent;
type EventStreamParamsFor<O extends ClientOwner> = O extends "project"
  ? EventStreamParams
  : OrganizationEventStreamParams;
type EventReplayFor<O extends ClientOwner> = O extends "project"
  ? ProjectEventReplayReceipt
  : OrganizationEventReplayReceipt;
type WebhookFor<O extends ClientOwner> = O extends "project"
  ? ProjectWebhook
  : OrganizationWebhook;
type CreateWebhookFor<O extends ClientOwner> = O extends "project"
  ? CreateProjectWebhookInput
  : CreateOrganizationWebhookInput;
type UpdateWebhookFor<O extends ClientOwner> = O extends "project"
  ? UpdateProjectWebhookInput
  : UpdateOrganizationWebhookInput;
type WebhookCreationFor<O extends ClientOwner> = O extends "project"
  ? ProjectWebhookCreationReceipt
  : OrganizationWebhookCreationReceipt;
type WebhookMutationFor<O extends ClientOwner> = O extends "project"
  ? ProjectWebhookMutationReceipt
  : OrganizationWebhookMutationReceipt;
type WebhookDeletionFor<O extends ClientOwner> = O extends "project"
  ? ProjectWebhookDeletionReceipt
  : OrganizationWebhookDeletionReceipt;
type WebhookRotationFor<O extends ClientOwner> = O extends "project"
  ? ProjectWebhookSecretRotationReceipt
  : OrganizationWebhookSecretRotationReceipt;
type WebhookTestFor<O extends ClientOwner> = O extends "project"
  ? ProjectWebhookTestReceipt
  : OrganizationWebhookTestReceipt;
type DeliveryFor<O extends ClientOwner> = O extends "project"
  ? ProjectWebhookDelivery
  : OrganizationWebhookDelivery;
type AttemptFor<O extends ClientOwner> = O extends "project"
  ? ProjectWebhookDeliveryAttempt
  : OrganizationWebhookDeliveryAttempt;
type DeliveryRetryFor<O extends ClientOwner> = O extends "project"
  ? ProjectWebhookDeliveryRetryReceipt
  : OrganizationWebhookDeliveryRetryReceipt;

class ResourceBase {
  protected readonly raw: RawClient;
  constructor(
    protected readonly transport: HttpTransport,
    protected readonly prefix: string,
  ) {
    this.raw = new RawClient(transport);
  }

  protected path(suffix: string): string {
    return `${this.prefix}${suffix}`;
  }

  protected async fetchResource<T>(
    path: string,
    options: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return unwrapResponse(
      await this.transport.request<DataEnvelope<T>>({
        method: "GET",
        path,
        ...options,
      }),
    );
  }

  protected async mutate<T>(
    method: "POST" | "PATCH" | "DELETE",
    path: string,
    body: unknown,
    options: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return unwrapResponse(
      await this.transport.request<DataEnvelope<T>>({
        method,
        path,
        ...(body === undefined ? {} : { body }),
        ...options,
      }),
    );
  }

  protected page<T>(
    path: string,
    query: Record<string, unknown>,
    options: RequestOptions,
  ): Promise<CursorPage<T>> {
    return this.raw.paginate<T>(
      { method: "GET", path, query: query as never, ...options },
      decodeCursorPage<T>,
    );
  }
}

export class EventsResource<O extends ClientOwner> extends ResourceBase {
  list(
    params: ListEventsParams = {},
    options: RequestOptions = {},
  ): Promise<CursorPage<EventFor<O>>> {
    return this.page(this.path("/events"), { ...params }, options);
  }
  retrieve(
    eventId: string,
    params: RetrieveEventParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<EventFor<O>>> {
    return this.transport
      .request<DataEnvelope<EventFor<O>>>({
        method: "GET",
        path: this.path(`/events/${encodeURIComponent(eventId)}`),
        query: params as Readonly<Record<string, never>>,
        ...options,
      })
      .then(unwrapResponse);
  }
  replay(
    eventId: string,
    input: ReplayEventInput,
    options: RequestOptions = {},
  ): Promise<ApiResponse<EventReplayFor<O>>> {
    return this.mutate(
      "POST",
      this.path(`/events/${encodeURIComponent(eventId)}/replays`),
      input,
      options,
    );
  }
  /**
   * Streams a project's events over server-sent events with automatic
   * reconnect and resume. Requires `events:listen` and the Event streams
   * beta. Organization clients pass `projectId`.
   */
  stream(
    params: EventStreamParamsFor<O> = {} as EventStreamParamsFor<O>,
  ): EventStream {
    return new EventStream(this.transport, this.streamPath(params), params);
  }
  /**
   * Acknowledges every event up to `sequence` on a stream opened with
   * `ack: "manual"`. Use the same credential that opened the stream.
   */
  acknowledgeStream(
    streamId: string,
    input: EventStreamAcknowledgement &
      (O extends "project" ? object : { readonly projectId: string }),
    options: RequestOptions = {},
  ): Promise<ApiResponse<EventStreamAcknowledgementReceipt>> {
    const body = { cursor: input.cursor, sequence: input.sequence };
    const base = this.streamPath(input as never);
    return this.transport
      .request<DataEnvelope<EventStreamAcknowledgementReceipt>>({
        method: "POST",
        path: `${base}/${encodeURIComponent(streamId)}/ack`,
        body,
        ...options,
      })
      .then(unwrapResponse);
  }
  /** A `@polymorfa/store` live source over `stream()`; see `eventStreamSource`. */
  liveSource(
    params: Omit<EventStreamParamsFor<O>, "since" | "signal"> = {} as Omit<
      EventStreamParamsFor<O>,
      "since" | "signal"
    >,
  ): LiveEventSourceAdapter {
    return eventStreamSource(
      (next) => this.stream({ ...params, ...next } as EventStreamParamsFor<O>),
      params,
    );
  }
  private streamPath(
    params: EventStreamParams | OrganizationEventStreamParams,
  ): string {
    if (this.prefix.startsWith("/platform/projects/"))
      return this.path("/events/stream");
    const projectId = (params as Partial<OrganizationEventStreamParams>)
      .projectId;
    if (typeof projectId !== "string" || projectId.trim() === "") {
      throw new PolymorfaConfigurationError(
        "Organization clients must pass projectId to stream events.",
        "projectId",
      );
    }
    return `/platform/projects/${encodeURIComponent(projectId)}/events/stream`;
  }
}

export class WebhooksResource<O extends ClientOwner> extends ResourceBase {
  list(
    params: ListWebhooksParams = {},
    options: RequestOptions = {},
  ): Promise<CursorPage<WebhookFor<O>>> {
    return this.page(this.path("/webhooks"), { ...params }, options);
  }
  create(
    input: CreateWebhookFor<O>,
    options: RequestOptions = {},
  ): Promise<ApiResponse<WebhookCreationFor<O>>> {
    return this.mutate("POST", this.path("/webhooks"), input, options);
  }
  retrieve(
    webhookId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<WebhookFor<O>>> {
    return this.fetchResource(
      this.path(`/webhooks/${encodeURIComponent(webhookId)}`),
      options,
    );
  }
  update(
    webhookId: string,
    input: UpdateWebhookFor<O>,
    options: RequestOptions = {},
  ): Promise<ApiResponse<WebhookMutationFor<O>>> {
    return this.mutate(
      "PATCH",
      this.path(`/webhooks/${encodeURIComponent(webhookId)}`),
      input,
      options,
    );
  }
  delete(
    webhookId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<WebhookDeletionFor<O>>> {
    return this.mutate(
      "DELETE",
      this.path(`/webhooks/${encodeURIComponent(webhookId)}`),
      undefined,
      options,
    );
  }
  test(
    webhookId: string,
    input: TestWebhookInput = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<WebhookTestFor<O>>> {
    return this.mutate(
      "POST",
      this.path(`/webhooks/${encodeURIComponent(webhookId)}/tests`),
      input,
      options,
    );
  }
  rotateSecret(
    webhookId: string,
    input: RotateWebhookSecretInput = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<WebhookRotationFor<O>>> {
    return this.mutate(
      "POST",
      this.path(`/webhooks/${encodeURIComponent(webhookId)}/secret-rotations`),
      input,
      options,
    );
  }
}

export class WebhookDeliveriesResource<
  O extends ClientOwner,
> extends ResourceBase {
  list(
    params: ListWebhookDeliveriesParams = {},
    options: RequestOptions = {},
  ): Promise<CursorPage<DeliveryFor<O>>> {
    return this.page(this.path("/webhook-deliveries"), { ...params }, options);
  }
  retrieve(
    deliveryId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DeliveryFor<O>>> {
    return this.fetchResource(
      this.path(`/webhook-deliveries/${encodeURIComponent(deliveryId)}`),
      options,
    );
  }
  listAttempts(
    deliveryId: string,
    params: ListDeliveryAttemptsParams = {},
    options: RequestOptions = {},
  ): Promise<CursorPage<AttemptFor<O>>> {
    return this.page(
      this.path(
        `/webhook-deliveries/${encodeURIComponent(deliveryId)}/attempts`,
      ),
      { ...params },
      options,
    );
  }
  retrieveAttempt(
    deliveryId: string,
    attemptId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<AttemptFor<O>>> {
    return this.fetchResource(
      this.path(
        `/webhook-deliveries/${encodeURIComponent(deliveryId)}/attempts/${encodeURIComponent(attemptId)}`,
      ),
      options,
    );
  }
  retry(
    deliveryId: string,
    input: RetryWebhookDeliveryInput = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<DeliveryRetryFor<O>>> {
    return this.mutate(
      "POST",
      this.path(`/webhook-deliveries/${encodeURIComponent(deliveryId)}/retry`),
      input,
      options,
    );
  }
}

type OperationFor<O extends ClientOwner> = O extends "project"
  ? ProjectOperation
  : ManagementOperation;
type ListOperationsFor<O extends ClientOwner> = O extends "project"
  ? ListOperationsParams
  : ListOrganizationOperationsParams;
type RetrieveOperationParamsFor<O extends ClientOwner> = O extends "project"
  ? RetrieveOperationParams
  : RetrieveOrganizationOperationParams;
type WaitOptionsFor<O extends ClientOwner> = O extends "project"
  ? WaitForOperationOptions
  : WaitForOrganizationOperationOptions;
type OperationCancellationFor<O extends ClientOwner> = O extends "project"
  ? ProjectOperationCancellationReceipt
  : OrganizationOperationCancellationReceipt;

const TERMINAL_OPERATION_STATUSES = new Set([
  "succeeded",
  "failed",
  "cancelled",
]);
/** Longest server-side wait for one request, in seconds. */
export const OPERATION_WAIT_MAX_SECONDS = 30;

/**
 * Asynchronous operations (campaign sends, production enrollments, and other
 * durable work). Organization clients see team and project operations;
 * project clients see only their project. Requires `operations:read`;
 * `cancel` requires `operations:cancel`.
 */
export class OperationsResource<O extends ClientOwner> extends ResourceBase {
  list(
    params: ListOperationsFor<O> = {} as ListOperationsFor<O>,
    options: RequestOptions = {},
  ): Promise<CursorPage<OperationFor<O>>> {
    return this.page(this.path("/operations"), { ...params }, options);
  }
  /** Gets one operation. `params.wait` long-polls for up to 30 seconds. */
  get(
    operationId: string,
    params: RetrieveOperationParamsFor<O> = {} as RetrieveOperationParamsFor<O>,
    options: RequestOptions = {},
  ): Promise<ApiResponse<OperationFor<O>>> {
    if (
      params.wait !== undefined &&
      (!Number.isInteger(params.wait) ||
        params.wait < 0 ||
        params.wait > OPERATION_WAIT_MAX_SECONDS)
    ) {
      throw new PolymorfaConfigurationError(
        `wait must be an integer between 0 and ${OPERATION_WAIT_MAX_SECONDS}.`,
        "wait",
      );
    }
    const wait = params.wait ?? 0;
    return this.transport
      .request<DataEnvelope<OperationFor<O>>>({
        method: "GET",
        path: this.path(`/operations/${encodeURIComponent(operationId)}`),
        query: { ...params } as Readonly<Record<string, never>>,
        ...options,
        // The request stays open for the wait; leave headroom for the response.
        ...(wait > 0 && options.timeoutMs === undefined
          ? { timeoutMs: (wait + 15) * 1000 }
          : {}),
      })
      .then(unwrapResponse);
  }
  listTransitions(
    operationId: string,
    params: ListOperationTransitionsParams = {},
    options: RequestOptions = {},
  ): Promise<CursorPage<OperationTransition>> {
    return this.page(
      this.path(`/operations/${encodeURIComponent(operationId)}/transitions`),
      { ...params },
      options,
    );
  }
  /**
   * Requests cancellation. Only operations whose `capabilities.cancellable`
   * is true accept it; others fail with 409 `operation_conflict`. An
   * Idempotency-Key is generated when `options.idempotencyKey` is omitted.
   */
  cancel(
    operationId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<OperationCancellationFor<O>>> {
    return this.mutate(
      "POST",
      this.path(`/operations/${encodeURIComponent(operationId)}/cancel`),
      undefined,
      withIdempotencyKey(options),
    );
  }
  /**
   * Waits until the operation is terminal (`succeeded`, `failed`,
   * `cancelled`), its sequence passes `afterSequence`, or `maxWaitMs`
   * (default 5 minutes) elapses, using server long-polls. Returns the latest
   * state; check `status`, because the wait can end first.
   */
  async wait(
    operationId: string,
    options: WaitOptionsFor<O> = {} as WaitOptionsFor<O>,
  ): Promise<ApiResponse<OperationFor<O>>> {
    const maxWaitMs = options.maxWaitMs ?? 5 * 60_000;
    if (!Number.isFinite(maxWaitMs) || maxWaitMs < 0) {
      throw new PolymorfaConfigurationError(
        "maxWaitMs must be a finite, non-negative number of milliseconds.",
        "maxWaitMs",
      );
    }
    const deadline = Date.now() + maxWaitMs;
    let latest: ApiResponse<OperationFor<O>> | undefined;
    for (;;) {
      options.signal?.throwIfAborted();
      const remaining = Math.max(0, deadline - Date.now());
      const wait = Math.min(
        OPERATION_WAIT_MAX_SECONDS,
        Math.floor(remaining / 1000),
      );
      // Bound the request itself by what is left of the budget, so a server
      // that holds the connection open cannot extend the wait. The last read
      // still gets a second to answer, so a spent budget returns real state
      // instead of an abort.
      const budget = new AbortController();
      const timer = setTimeout(
        () => budget.abort(),
        Math.max(remaining, 1_000),
      );
      const abortBudget = () => budget.abort(options.signal?.reason);
      options.signal?.addEventListener("abort", abortBudget, { once: true });
      let response: ApiResponse<OperationFor<O>>;
      try {
        response = await this.get(
          operationId,
          {
            wait,
            ...((options as WaitForOrganizationOperationOptions).projectId ===
            undefined
              ? {}
              : {
                  projectId: (options as WaitForOrganizationOperationOptions)
                    .projectId,
                }),
            ...(options.afterSequence === undefined
              ? {}
              : { afterSequence: options.afterSequence }),
          } as RetrieveOperationParamsFor<O>,
          { ...options.requestOptions, signal: budget.signal },
        );
      } catch (error) {
        // The caller's own abort always propagates. A budget abort returns the
        // last state this wait observed, and only fails when it has none.
        options.signal?.throwIfAborted();
        if (!budget.signal.aborted || latest === undefined) throw error;
        return latest;
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", abortBudget);
      }
      latest = response;
      const operation = response.data;
      if (
        TERMINAL_OPERATION_STATUSES.has(operation.status) ||
        (options.afterSequence !== undefined &&
          operation.sequence > options.afterSequence) ||
        wait === 0 ||
        Date.now() >= deadline
      ) {
        return response;
      }
    }
  }
}
