package polymorfa

import (
	"context"
	"net/url"
	"strconv"
	"time"
)

type Projects struct{ t *transport }

func (r *Projects) List(ctx context.Context, o ...RequestOptions) (Response[Envelope[[]ProjectWithStats]], error) {
	return request[Envelope[[]ProjectWithStats]](ctx, r.t, "GET", "/platform/projects", nil, nil, options(o))
}
func (r *Projects) Create(ctx context.Context, b CreateProjectRequest, o ...RequestOptions) (Response[Envelope[Project]], error) {
	return request[Envelope[Project]](ctx, r.t, "POST", "/platform/projects", nil, b, options(o))
}
func (r *Projects) RequestProductionEnrollment(ctx context.Context, id string, b ProductionEnrollmentRequest, o ...RequestOptions) (Response[Envelope[ProductionEnrollmentResult]], error) {
	return request[Envelope[ProductionEnrollmentResult]](ctx, r.t, "POST", "/platform/projects/"+escaped(id)+"/promote", nil, b, options(o))
}
func (r *Projects) ApproveProductionEnrollment(ctx context.Context, id, op string, o ...RequestOptions) (Response[Envelope[ProductionEnrollmentCommandResult]], error) {
	return request[Envelope[ProductionEnrollmentCommandResult]](ctx, r.t, "POST", "/platform/projects/"+escaped(id)+"/production-enrollments/"+escaped(op)+"/approve", nil, nil, options(o))
}
func (r *Projects) CancelProductionEnrollment(ctx context.Context, id, op string, o ...RequestOptions) (Response[Envelope[ProductionEnrollmentCommandResult]], error) {
	return request[Envelope[ProductionEnrollmentCommandResult]](ctx, r.t, "POST", "/platform/projects/"+escaped(id)+"/production-enrollments/"+escaped(op)+"/cancel", nil, nil, options(o))
}

type Events struct {
	t      *transport
	prefix string
}

func (r *Events) List(ctx context.Context, p ListEventsParams, o ...RequestOptions) (*CursorPage[PlatformEvent], error) {
	return page[PlatformEvent](ctx, r.t, r.prefix+"/events", p.query(), options(o))
}
func (r *Events) Retrieve(ctx context.Context, id string, includePayload *bool, o ...RequestOptions) (Response[PlatformEvent], error) {
	q := url.Values{}
	setBool(q, "includePayload", includePayload)
	return unwrapped[PlatformEvent](ctx, r.t, "GET", r.prefix+"/events/"+escaped(id), q, nil, options(o))
}
func (r *Events) Replay(ctx context.Context, id string, b ReplayEventRequest, o ...RequestOptions) (Response[EventReplayReceipt], error) {
	return unwrapped[EventReplayReceipt](ctx, r.t, "POST", r.prefix+"/events/"+escaped(id)+"/replays", nil, b, options(o))
}

type Webhooks struct {
	t      *transport
	prefix string
}

func (r *Webhooks) List(ctx context.Context, p ListWebhooksParams, o ...RequestOptions) (*CursorPage[PlatformWebhook], error) {
	return page[PlatformWebhook](ctx, r.t, r.prefix+"/webhooks", p.query(), options(o))
}
func (r *Webhooks) Create(ctx context.Context, b CreateWebhookRequest, o ...RequestOptions) (Response[WebhookCreationReceipt], error) {
	return unwrapped[WebhookCreationReceipt](ctx, r.t, "POST", r.prefix+"/webhooks", nil, b, options(o))
}
func (r *Webhooks) Retrieve(ctx context.Context, id string, o ...RequestOptions) (Response[PlatformWebhook], error) {
	return unwrapped[PlatformWebhook](ctx, r.t, "GET", r.prefix+"/webhooks/"+escaped(id), nil, nil, options(o))
}
func (r *Webhooks) Update(ctx context.Context, id string, b UpdateWebhookRequest, o ...RequestOptions) (Response[WebhookMutationReceipt], error) {
	return unwrapped[WebhookMutationReceipt](ctx, r.t, "PATCH", r.prefix+"/webhooks/"+escaped(id), nil, b, options(o))
}
func (r *Webhooks) Delete(ctx context.Context, id string, o ...RequestOptions) (Response[WebhookDeletionReceipt], error) {
	return unwrapped[WebhookDeletionReceipt](ctx, r.t, "DELETE", r.prefix+"/webhooks/"+escaped(id), nil, nil, options(o))
}
func (r *Webhooks) Test(ctx context.Context, id string, b TestWebhookRequest, o ...RequestOptions) (Response[EventReplayReceipt], error) {
	if r.prefix == "/platform" && (b.Body != nil || b.SessionID != "") {
		return Response[EventReplayReceipt]{}, validation("Organization webhook tests cannot accept body or sessionId.")
	}
	return unwrapped[EventReplayReceipt](ctx, r.t, "POST", r.prefix+"/webhooks/"+escaped(id)+"/tests", nil, b, options(o))
}
func (r *Webhooks) RotateSecret(ctx context.Context, id string, b RotateWebhookSecretRequest, o ...RequestOptions) (Response[WebhookRotationReceipt], error) {
	return unwrapped[WebhookRotationReceipt](ctx, r.t, "POST", r.prefix+"/webhooks/"+escaped(id)+"/secret-rotations", nil, b, options(o))
}

type WebhookDeliveries struct {
	t      *transport
	prefix string
}

func (r *WebhookDeliveries) List(ctx context.Context, p ListWebhookDeliveriesParams, o ...RequestOptions) (*CursorPage[WebhookDelivery], error) {
	return page[WebhookDelivery](ctx, r.t, r.prefix+"/webhook-deliveries", p.query(), options(o))
}
func (r *WebhookDeliveries) Retrieve(ctx context.Context, id string, o ...RequestOptions) (Response[WebhookDelivery], error) {
	return unwrapped[WebhookDelivery](ctx, r.t, "GET", r.prefix+"/webhook-deliveries/"+escaped(id), nil, nil, options(o))
}
func (r *WebhookDeliveries) ListAttempts(ctx context.Context, id string, p ListParams, o ...RequestOptions) (*CursorPage[WebhookDeliveryAttempt], error) {
	return page[WebhookDeliveryAttempt](ctx, r.t, r.prefix+"/webhook-deliveries/"+escaped(id)+"/attempts", p.query(), options(o))
}
func (r *WebhookDeliveries) RetrieveAttempt(ctx context.Context, id, attempt string, o ...RequestOptions) (Response[WebhookDeliveryAttempt], error) {
	return unwrapped[WebhookDeliveryAttempt](ctx, r.t, "GET", r.prefix+"/webhook-deliveries/"+escaped(id)+"/attempts/"+escaped(attempt), nil, nil, options(o))
}
func (r *WebhookDeliveries) Retry(ctx context.Context, id string, o ...RequestOptions) (Response[WebhookDeliveryRetryReceipt], error) {
	return unwrapped[WebhookDeliveryRetryReceipt](ctx, r.t, "POST", r.prefix+"/webhook-deliveries/"+escaped(id)+"/retry", nil, struct{}{}, options(o))
}

type Operations struct {
	t      *transport
	prefix string
}

func (r *Operations) List(ctx context.Context, p ListOperationsParams, o ...RequestOptions) (*CursorPage[Operation], error) {
	return page[Operation](ctx, r.t, r.prefix+"/operations", p.query(), options(o))
}
func (r *Operations) Get(ctx context.Context, id string, p RetrieveOperationParams, opts ...RequestOptions) (Response[Operation], error) {
	if p.Wait < 0 || p.Wait > 30 {
		return Response[Operation]{}, configuration("wait", "wait must be between 0 and 30 seconds.")
	}
	q := url.Values{}
	setInt(q, "wait", p.Wait)
	if p.AfterSequence != nil {
		q.Set("afterSequence", strconv.FormatInt(*p.AfterSequence, 10))
	}
	setString(q, "projectId", p.ProjectID)
	o := options(opts)
	if p.Wait > 0 && o.Timeout == 0 {
		o.Timeout = time.Duration(p.Wait+15) * time.Second
	}
	return unwrapped[Operation](ctx, r.t, "GET", r.prefix+"/operations/"+escaped(id), q, nil, o)
}
func (r *Operations) ListTransitions(ctx context.Context, id string, p ListParams, afterSequence *int64, o ...RequestOptions) (*CursorPage[OperationTransition], error) {
	if p.Cursor != "" && afterSequence != nil {
		return nil, validation("cursor cannot be combined with afterSequence.")
	}
	q := p.query()
	if afterSequence != nil {
		q.Set("afterSequence", strconv.FormatInt(*afterSequence, 10))
	}
	return page[OperationTransition](ctx, r.t, r.prefix+"/operations/"+escaped(id)+"/transitions", q, options(o))
}
func (r *Operations) Cancel(ctx context.Context, id string, opts ...RequestOptions) (Response[OperationCancellationReceipt], error) {
	o, err := idempotent(options(opts))
	if err != nil {
		return Response[OperationCancellationReceipt]{}, err
	}
	return unwrapped[OperationCancellationReceipt](ctx, r.t, "POST", r.prefix+"/operations/"+escaped(id)+"/cancel", nil, nil, o)
}
func (r *Operations) Wait(ctx context.Context, id string, p RetrieveOperationParams, maxWait time.Duration, o ...RequestOptions) (Response[Operation], error) {
	if maxWait < 0 {
		return Response[Operation]{}, configuration("maxWait", "maxWait must be non-negative.")
	}
	if maxWait == 0 {
		maxWait = 5 * time.Minute
	}
	deadline := time.Now().Add(maxWait)
	var latest Response[Operation]
	have := false
	for {
		remaining := time.Until(deadline)
		p.Wait = min(30, max(0, int(remaining/time.Second)))
		budget, cancel := context.WithTimeout(ctx, max(remaining, time.Second))
		result, err := r.Get(budget, id, p, o...)
		cancel()
		if err != nil {
			if ctx.Err() != nil {
				return latest, contextError(ctx, ctx.Err())
			}
			if have && time.Now().After(deadline) {
				return latest, nil
			}
			return latest, err
		}
		latest = result
		have = true
		if result.Data.Status == "succeeded" || result.Data.Status == "failed" || result.Data.Status == "cancelled" || p.AfterSequence != nil && result.Data.Sequence > *p.AfterSequence || p.Wait == 0 || time.Now().After(deadline) {
			return latest, nil
		}
	}
}
