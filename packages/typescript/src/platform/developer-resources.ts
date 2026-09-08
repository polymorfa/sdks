import {
  PolymorfaCancelledError,
  PolymorfaTimeoutError,
  PolymorfaValidationError,
} from "../errors.js";
import { CursorPage } from "../pagination.js";
import { RawClient } from "../raw.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  ClientOwner,
  CreateOrganizationWebhookInput,
  CreateProjectWebhookInput,
  ListDeliveryAttemptsParams,
  ListEventsParams,
  ListOperationTransitionsParams,
  ListOperationsParams,
  ListWebhookDeliveriesParams,
  ListWebhooksParams,
  OrganizationEvent,
  OrganizationEventReplayReceipt,
  OrganizationOperation,
  OrganizationOperationCancellationReceipt,
  OrganizationOperationTransition,
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
  ProjectOperation,
  ProjectOperationCancellationReceipt,
  ProjectOperationTransition,
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
  WaitForOperationOptions,
} from "./developer-types.js";
import {
  decodeCursorPage,
  type DataEnvelope,
  unwrapResponse,
} from "./response.js";

type EventFor<O extends ClientOwner> = O extends "project"
  ? ProjectEvent
  : OrganizationEvent;
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
type OperationFor<O extends ClientOwner> = O extends "project"
  ? ProjectOperation
  : OrganizationOperation;
type OperationTransitionFor<O extends ClientOwner> = O extends "project"
  ? ProjectOperationTransition
  : OrganizationOperationTransition;
type OperationCancellationFor<O extends ClientOwner> = O extends "project"
  ? ProjectOperationCancellationReceipt
  : OrganizationOperationCancellationReceipt;

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

const TERMINAL = new Set([
  "action_required",
  "succeeded",
  "failed",
  "cancelled",
]);

export class OperationsResourceV2<O extends ClientOwner> extends ResourceBase {
  list(
    params: ListOperationsParams = {},
    options: RequestOptions = {},
  ): Promise<CursorPage<OperationFor<O>>> {
    if (
      (params.resourceType === undefined) !==
      (params.resourceId === undefined)
    ) {
      throw new PolymorfaValidationError(
        "resourceType and resourceId must be supplied together.",
        { code: "invalid_operation_filter" },
      );
    }
    return this.page(this.path("/operations"), { ...params }, options);
  }
  retrieve(
    operationId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<OperationFor<O>>> {
    return this.fetchResource(
      this.path(`/operations/${encodeURIComponent(operationId)}`),
      options,
    );
  }
  listTransitions(
    operationId: string,
    params: ListOperationTransitionsParams = {},
    options: RequestOptions = {},
  ): Promise<CursorPage<OperationTransitionFor<O>>> {
    return this.page(
      this.path(`/operations/${encodeURIComponent(operationId)}/transitions`),
      { ...params },
      options,
    );
  }
  cancel(
    operationId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<OperationCancellationFor<O>>> {
    return this.mutate(
      "POST",
      this.path(`/operations/${encodeURIComponent(operationId)}/cancel`),
      undefined,
      options,
    );
  }
  async wait(
    operationId: string,
    options: WaitForOperationOptions = {},
  ): Promise<ApiResponse<OperationFor<O>>> {
    const maxWaitMs = integer(
      options.maxWaitMs ?? 300_000,
      "maxWaitMs",
      1,
      Number.MAX_SAFE_INTEGER,
    );
    const pollIntervalMs = integer(
      options.pollIntervalMs ?? 1_000,
      "pollIntervalMs",
      250,
      30_000,
    );
    const deadline = Date.now() + maxWaitMs;
    let firstRequest = true;
    while (true) {
      if (options.signal?.aborted === true)
        throw new PolymorfaCancelledError("The operation wait was cancelled.", {
          code: "operation_wait_cancelled",
        });
      if (!firstRequest && Date.now() >= deadline) {
        throw operationWaitTimeout(maxWaitMs);
      }
      firstRequest = false;
      const response = await this.retrieve(operationId, {
        ...options.requestOptions,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
      if (TERMINAL.has(response.data.status)) return response;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw operationWaitTimeout(maxWaitMs);
      const retryAfter = retryAfterMilliseconds(
        response.metadata.headers["retry-after"],
      );
      await wait(
        Math.min(Math.max(pollIntervalMs, retryAfter ?? 0), remaining),
        options.signal,
      );
    }
  }
}

function operationWaitTimeout(maxWaitMs: number): PolymorfaTimeoutError {
  return new PolymorfaTimeoutError(
    `The operation did not reach a terminal state within ${maxWaitMs}ms.`,
    { code: "operation_wait_timeout" },
  );
}

function retryAfterMilliseconds(
  value: string | undefined,
  now = Date.now(),
): number | undefined {
  if (value === undefined) return undefined;
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds * 1_000 : undefined;
  }
  const retryAt = Date.parse(value);
  return Number.isNaN(retryAt) ? undefined : Math.max(0, retryAt - now);
}

function integer(
  value: number,
  name: string,
  min: number,
  max: number,
): number {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    throw new PolymorfaValidationError(
      `${name} must be an integer from ${min} through ${max}.`,
      { code: `invalid_${name}` },
    );
  return value;
}

function wait(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) {
    return Promise.reject(
      new PolymorfaCancelledError("The operation wait was cancelled.", {
        code: "operation_wait_cancelled",
      }),
    );
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(
        new PolymorfaCancelledError("The operation wait was cancelled.", {
          code: "operation_wait_cancelled",
        }),
      );
    };
    signal?.addEventListener("abort", abort, { once: true });
  });
}
