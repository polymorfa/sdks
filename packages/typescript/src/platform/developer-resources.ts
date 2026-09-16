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
