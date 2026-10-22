package polymorfa

import (
	"context"
	"encoding/json"
	"net/url"
	"strings"
)

type Flows struct {
	t         *transport
	projectID string
}

func (c *ProjectClient) Flows() *Flows { return &Flows{c.t, c.projectID} }
func flowPath(id string) (string, error) {
	if strings.TrimSpace(id) == "" {
		return "", configuration("flowId", "Flow ID is required.")
	}
	return "/platform/flows/" + escaped(id), nil
}
func flowRequest[T any](ctx context.Context, r *Flows, method, path string, b any, q url.Values, o []RequestOptions) (Response[T], error) {
	opts := options(o)
	if method == "GET" || method == "DELETE" {
		if q == nil {
			q = url.Values{}
		} else {
			q = cloneQuery(q)
		}
		q.Set("projectId", r.projectID)
	} else {
		value := map[string]json.RawMessage{}
		if b != nil {
			raw, err := json.Marshal(b)
			if err != nil {
				return Response[T]{}, err
			}
			if err = json.Unmarshal(raw, &value); err != nil {
				return Response[T]{}, err
			}
		}
		project, _ := json.Marshal(r.projectID)
		value["projectId"] = project
		b = value
	}
	if method != "GET" {
		opts = noRetry(opts)
	}
	return unwrapped[T](ctx, r.t, method, path, q, b, opts)
}
func flowIDRequest[T any](ctx context.Context, r *Flows, method, id, suffix string, b any, q url.Values, o []RequestOptions) (Response[T], error) {
	path, err := flowPath(id)
	if err != nil {
		return Response[T]{}, err
	}
	return flowRequest[T](ctx, r, method, path+suffix, b, q, o)
}
func (r *Flows) List(ctx context.Context, o ...RequestOptions) (Response[[]FlowSummary], error) {
	return flowRequest[[]FlowSummary](ctx, r, "GET", "/platform/flows", nil, nil, o)
}
func (r *Flows) Create(ctx context.Context, b CreateFlowRequest, o ...RequestOptions) (Response[FlowDraft], error) {
	return flowRequest[FlowDraft](ctx, r, "POST", "/platform/flows", b, nil, o)
}
func (r *Flows) Retrieve(ctx context.Context, id string, o ...RequestOptions) (Response[*FlowDraft], error) {
	if !functionUUID.MatchString(strings.ToLower(id)) {
		return Response[*FlowDraft]{}, validation("flowId must be a valid UUID.")
	}
	return flowIDRequest[*FlowDraft](ctx, r, "GET", id, "", nil, nil, o)
}
func (r *Flows) Update(ctx context.Context, id string, b UpdateFlowRequest, o ...RequestOptions) (Response[FlowDraft], error) {
	return flowIDRequest[FlowDraft](ctx, r, "PATCH", id, "", b, nil, o)
}
func (r *Flows) Delete(ctx context.Context, id string, o ...RequestOptions) (Response[FlowOK], error) {
	return flowIDRequest[FlowOK](ctx, r, "DELETE", id, "", nil, nil, o)
}
func (r *Flows) Upload(ctx context.Context, id string, b FlowProviderRequest, o ...RequestOptions) (Response[FlowProviderResult], error) {
	return flowIDRequest[FlowProviderResult](ctx, r, "POST", id, "/upload", b, nil, o)
}
func (r *Flows) Publish(ctx context.Context, id string, b FlowProviderRequest, o ...RequestOptions) (Response[FlowProviderResult], error) {
	return flowIDRequest[FlowProviderResult](ctx, r, "POST", id, "/publish", b, nil, o)
}
func (r *Flows) Deprecate(ctx context.Context, id string, b FlowProviderRequest, o ...RequestOptions) (Response[FlowProviderResult], error) {
	return flowIDRequest[FlowProviderResult](ctx, r, "POST", id, "/deprecate", b, nil, o)
}
func (r *Flows) Discard(ctx context.Context, id string, b FlowProviderRequest, o ...RequestOptions) (Response[FlowProviderResult], error) {
	return flowIDRequest[FlowProviderResult](ctx, r, "POST", id, "/discard", b, nil, o)
}
func (r *Flows) Sync(ctx context.Context, id string, b FlowProviderRequest, o ...RequestOptions) (Response[FlowProviderResult], error) {
	return flowIDRequest[FlowProviderResult](ctx, r, "POST", id, "/sync", b, nil, o)
}
func (r *Flows) Receipts(ctx context.Context, id string, o ...RequestOptions) (Response[[]FlowProviderOperation], error) {
	return flowIDRequest[[]FlowProviderOperation](ctx, r, "GET", id, "/receipts", nil, nil, o)
}
func flowNumberQuery(p FlowNumberRequest) (url.Values, error) {
	if strings.TrimSpace(p.SessionID) == "" {
		return nil, validation("sessionId is required.")
	}
	return url.Values{"sessionId": {p.SessionID}}, nil
}
func (r *Flows) Endpoint(ctx context.Context, id string, p FlowNumberRequest, o ...RequestOptions) (Response[FlowEndpointState], error) {
	q, err := flowNumberQuery(p)
	if err != nil {
		return Response[FlowEndpointState]{}, err
	}
	return flowIDRequest[FlowEndpointState](ctx, r, "GET", id, "/endpoint", nil, q, o)
}
func (r *Flows) SetEndpoint(ctx context.Context, id string, b SetFlowEndpointRequest, o ...RequestOptions) (Response[FlowEndpointSetResult], error) {
	invalid := strings.TrimSpace(b.SessionID) == "" || b.ExpectedRevision != nil && *b.ExpectedRevision < 1
	switch b.Mode {
	case "forward", "direct":
		u, err := url.Parse(b.URL)
		invalid = invalid || err != nil || len(b.URL) > 2048 || u == nil || u.Scheme != "https" || u.Host == "" || u.User != nil || u.Fragment != "" || b.FunctionID != "" || b.DeploymentID != nil
		if b.Mode == "direct" && b.RotateSigningSecret != nil {
			invalid = true
		}
	case "function":
		invalid = invalid || b.FunctionID == "" || b.URL != "" || b.RotateSigningSecret != nil
	default:
		invalid = true
	}
	if invalid {
		return Response[FlowEndpointSetResult]{}, validation("Invalid Flow endpoint mode, identity, URL or revision.")
	}
	return flowIDRequest[FlowEndpointSetResult](ctx, r, "PUT", id, "/endpoint", b, nil, o)
}
func (r *Flows) DeleteEndpoint(ctx context.Context, id string, p FlowNumberRequest, o ...RequestOptions) (Response[FlowOK], error) {
	q, err := flowNumberQuery(p)
	if err != nil {
		return Response[FlowOK]{}, err
	}
	return flowIDRequest[FlowOK](ctx, r, "DELETE", id, "/endpoint", nil, q, o)
}
func (r *Flows) EndpointReceipts(ctx context.Context, id string, p ListFlowEndpointReceiptsParams, o ...RequestOptions) (Response[[]FlowEndpointReceipt], error) {
	if p.Limit < 0 || p.Limit > 100 {
		return Response[[]FlowEndpointReceipt]{}, validation("limit must be from 1 to 100.")
	}
	q := url.Values{}
	setString(q, "sessionId", p.SessionID)
	setInt(q, "limit", p.Limit)
	return flowIDRequest[[]FlowEndpointReceipt](ctx, r, "GET", id, "/endpoint/receipts", nil, q, o)
}
func (r *Flows) EncryptionKey(ctx context.Context, p FlowNumberRequest, o ...RequestOptions) (Response[FlowEncryptionCustody], error) {
	q, err := flowNumberQuery(p)
	if err != nil {
		return Response[FlowEncryptionCustody]{}, err
	}
	return flowRequest[FlowEncryptionCustody](ctx, r, "GET", "/platform/flow-encryption-keys", nil, q, o)
}
func (r *Flows) RotateEncryptionKey(ctx context.Context, p FlowNumberRequest, o ...RequestOptions) (Response[FlowEncryptionKeyRotation], error) {
	if _, err := flowNumberQuery(p); err != nil {
		return Response[FlowEncryptionKeyRotation]{}, err
	}
	return flowRequest[FlowEncryptionKeyRotation](ctx, r, "POST", "/platform/flow-encryption-keys/rotate", p, nil, o)
}
