package polymorfa

import (
	"context"
	"net/url"
	"strings"
)

type SIPTrunkOutbound struct {
	TargetURI    string  `json:"targetUri"`
	Transport    string  `json:"transport"`
	AuthUsername *string `json:"authUsername"`
	HasPassword  bool    `json:"hasPassword"`
	FromUser     *string `json:"fromUser"`
}
type SIPTrunkInbound struct {
	Username            string   `json:"username"`
	Realm               string   `json:"realm"`
	Session             *string  `json:"session"`
	AllowedAddresses    []string `json:"allowedAddresses"`
	AllowedDestinations []string `json:"allowedDestinations"`
}
type SIPTrunk struct {
	ID                 string            `json:"id"`
	ProjectID          string            `json:"projectId"`
	Name               string            `json:"name"`
	Enabled            bool              `json:"enabled"`
	Direction          string            `json:"direction"`
	Outbound           *SIPTrunkOutbound `json:"outbound"`
	Inbound            *SIPTrunkInbound  `json:"inbound"`
	Codecs             []string          `json:"codecs"`
	MaxConcurrentCalls int               `json:"maxConcurrentCalls"`
	Revision           int64             `json:"revision"`
	CreatedAt          string            `json:"createdAt"`
	UpdatedAt          string            `json:"updatedAt"`
}
type SIPTrunkCredentials struct {
	Username string `json:"username"`
	Password string `json:"password"`
	Realm    string `json:"realm"`
}

func (c SIPTrunkCredentials) String() string   { return "SIPTrunkCredentials[redacted]" }
func (c SIPTrunkCredentials) GoString() string { return c.String() }

type SIPTrunkCreated struct {
	Trunk              SIPTrunk             `json:"trunk"`
	InboundCredentials *SIPTrunkCredentials `json:"inboundCredentials,omitempty"`
}
type SIPTrunkDeleted struct {
	ID      string `json:"id"`
	Deleted bool   `json:"deleted"`
}
type SIPEndpointTransport struct {
	Transport string `json:"transport"`
	Port      int    `json:"port"`
	SRTP      string `json:"srtp"`
}
type SIPEndpointRTP struct {
	Protocol string `json:"protocol"`
	PortMin  int    `json:"portMin"`
	PortMax  int    `json:"portMax"`
}
type SIPEndpoint struct {
	Status     string                 `json:"status"`
	Host       *string                `json:"host"`
	Transports []SIPEndpointTransport `json:"transports"`
	RTP        *SIPEndpointRTP        `json:"rtp"`
}
type SIPOutboundInput struct {
	TargetURI    string            `json:"targetUri"`
	Transport    string            `json:"transport,omitempty"`
	AuthUsername *Nullable[string] `json:"authUsername,omitempty"`
	AuthPassword string            `json:"authPassword,omitempty"`
	FromUser     *Nullable[string] `json:"fromUser,omitempty"`
}

func (c SIPOutboundInput) String() string   { return "SIPOutboundInput[redacted]" }
func (c SIPOutboundInput) GoString() string { return c.String() }

type SIPInboundInput struct {
	Session             *Nullable[string] `json:"session,omitempty"`
	AllowedAddresses    []string          `json:"allowedAddresses"`
	AllowedDestinations *[]string         `json:"allowedDestinations,omitempty"`
}
type CreateSIPTrunkRequest struct {
	Name               string            `json:"name"`
	Enabled            *bool             `json:"enabled,omitempty"`
	Direction          string            `json:"direction"`
	Outbound           *SIPOutboundInput `json:"outbound,omitempty"`
	Inbound            *SIPInboundInput  `json:"inbound,omitempty"`
	Codecs             *[]string         `json:"codecs,omitempty"`
	MaxConcurrentCalls *int              `json:"maxConcurrentCalls,omitempty"`
}
type SIPOutboundPatch struct {
	TargetURI    *string           `json:"targetUri,omitempty"`
	Transport    *string           `json:"transport,omitempty"`
	AuthUsername *Nullable[string] `json:"authUsername,omitempty"`
	AuthPassword *string           `json:"authPassword,omitempty"`
	FromUser     *Nullable[string] `json:"fromUser,omitempty"`
}

func (c SIPOutboundPatch) String() string   { return "SIPOutboundPatch[redacted]" }
func (c SIPOutboundPatch) GoString() string { return c.String() }

type SIPInboundPatch struct {
	Session             *Nullable[string] `json:"session,omitempty"`
	AllowedAddresses    *[]string         `json:"allowedAddresses,omitempty"`
	AllowedDestinations *[]string         `json:"allowedDestinations,omitempty"`
}
type UpdateSIPTrunkRequest struct {
	ExpectedRevision   *int64            `json:"expectedRevision,omitempty"`
	Name               *string           `json:"name,omitempty"`
	Enabled            *bool             `json:"enabled,omitempty"`
	Direction          *string           `json:"direction,omitempty"`
	Outbound           *SIPOutboundPatch `json:"outbound,omitempty"`
	Inbound            *SIPInboundPatch  `json:"inbound,omitempty"`
	Codecs             *[]string         `json:"codecs,omitempty"`
	MaxConcurrentCalls *int              `json:"maxConcurrentCalls,omitempty"`
}
type SIPTrunks struct {
	t           *transport
	projectID   string
	confineByID bool
}
type OrganizationSIPTrunks struct{ *SIPTrunks }

func (c *OrganizationClient) SIPTrunks() *OrganizationSIPTrunks {
	return &OrganizationSIPTrunks{&SIPTrunks{t: c.t}}
}
func (c *ProjectClient) SIPTrunks() *SIPTrunks {
	return &SIPTrunks{c.t, c.projectID, c.t.config.Credential.Kind == OrganizationAPIKey}
}
func sipTrunkPath(id string) (string, error) {
	if strings.TrimSpace(id) == "" {
		return "", configuration("trunkId", "A SIP trunk id is required.")
	}
	return "/platform/sip-trunks/" + escaped(id), nil
}
func (r *OrganizationSIPTrunks) List(ctx context.Context, projectID string, o ...RequestOptions) (Response[[]SIPTrunk], error) {
	if err := validateProjectID(projectID); err != nil {
		return Response[[]SIPTrunk]{}, err
	}
	return r.list(ctx, projectID, options(o))
}
func (r *SIPTrunks) List(ctx context.Context, o ...RequestOptions) (Response[[]SIPTrunk], error) {
	return r.list(ctx, r.projectID, options(o))
}
func (r *SIPTrunks) list(ctx context.Context, id string, o RequestOptions) (Response[[]SIPTrunk], error) {
	return unwrapped[[]SIPTrunk](ctx, r.t, "GET", "/platform/sip-trunks", url.Values{"projectId": {id}}, nil, o)
}
func (r *OrganizationSIPTrunks) Create(ctx context.Context, projectID string, b CreateSIPTrunkRequest, o ...RequestOptions) (Response[SIPTrunkCreated], error) {
	if err := validateProjectID(projectID); err != nil {
		return Response[SIPTrunkCreated]{}, err
	}
	return r.create(ctx, projectID, b, options(o))
}
func (r *SIPTrunks) Create(ctx context.Context, b CreateSIPTrunkRequest, o ...RequestOptions) (Response[SIPTrunkCreated], error) {
	return r.create(ctx, r.projectID, b, options(o))
}
func (r *SIPTrunks) create(ctx context.Context, id string, b CreateSIPTrunkRequest, o RequestOptions) (Response[SIPTrunkCreated], error) {
	switch b.Direction {
	case "outbound":
		if b.Outbound == nil || b.Inbound != nil {
			return Response[SIPTrunkCreated]{}, validation("Outbound direction requires only outbound configuration.")
		}
	case "inbound":
		if b.Inbound == nil || b.Outbound != nil {
			return Response[SIPTrunkCreated]{}, validation("Inbound direction requires only inbound configuration.")
		}
	case "both":
		if b.Inbound == nil || b.Outbound == nil {
			return Response[SIPTrunkCreated]{}, validation("Both direction requires inbound and outbound configuration.")
		}
	default:
		return Response[SIPTrunkCreated]{}, validation("SIP direction must be inbound, outbound or both.")
	}
	body := struct {
		CreateSIPTrunkRequest
		ProjectID string `json:"projectId"`
	}{b, id}
	return unwrapped[SIPTrunkCreated](ctx, r.t, "POST", "/platform/sip-trunks", nil, body, o)
}
func (r *SIPTrunks) Endpoint(ctx context.Context, o ...RequestOptions) (Response[SIPEndpoint], error) {
	return unwrapped[SIPEndpoint](ctx, r.t, "GET", "/platform/sip/endpoint", nil, nil, options(o))
}
func (r *SIPTrunks) assertProject(v SIPTrunk) error {
	if r.projectID != "" && !strings.EqualFold(v.ProjectID, r.projectID) {
		return &Error{Kind: NotFoundError, Code: "resource_not_found", Status: 404, Message: "SIP trunk not found."}
	}
	return nil
}
func (r *SIPTrunks) Retrieve(ctx context.Context, id string, o ...RequestOptions) (Response[SIPTrunk], error) {
	path, err := sipTrunkPath(id)
	if err != nil {
		return Response[SIPTrunk]{}, err
	}
	result, err := unwrapped[SIPTrunk](ctx, r.t, "GET", path, nil, nil, options(o))
	if err == nil {
		err = r.assertProject(result.Data)
	}
	if err != nil {
		return Response[SIPTrunk]{Metadata: result.Metadata}, err
	}
	return result, nil
}
func (r *SIPTrunks) confine(ctx context.Context, id string, o RequestOptions) error {
	if !r.confineByID {
		return nil
	}
	o.IdempotencyKey = ""
	o.Headers = o.Headers.Clone()
	for name := range o.Headers {
		if strings.EqualFold(name, "Idempotency-Key") {
			o.Headers.Del(name)
		}
	}
	_, err := r.Retrieve(ctx, id, o)
	return err
}
func (r *SIPTrunks) Update(ctx context.Context, id string, b UpdateSIPTrunkRequest, o ...RequestOptions) (Response[SIPTrunk], error) {
	path, err := sipTrunkPath(id)
	if err != nil {
		return Response[SIPTrunk]{}, err
	}
	if err = r.confine(ctx, id, options(o)); err != nil {
		return Response[SIPTrunk]{}, err
	}
	return unwrapped[SIPTrunk](ctx, r.t, "PATCH", path, nil, b, options(o))
}
func (r *SIPTrunks) Delete(ctx context.Context, id string, o ...RequestOptions) (Response[SIPTrunkDeleted], error) {
	path, err := sipTrunkPath(id)
	if err != nil {
		return Response[SIPTrunkDeleted]{}, err
	}
	if err = r.confine(ctx, id, options(o)); err != nil {
		return Response[SIPTrunkDeleted]{}, err
	}
	return unwrapped[SIPTrunkDeleted](ctx, r.t, "DELETE", path, nil, nil, options(o))
}
func (r *SIPTrunks) RotateCredentials(ctx context.Context, id string, o ...RequestOptions) (Response[SIPTrunkCredentials], error) {
	path, err := sipTrunkPath(id)
	if err != nil {
		return Response[SIPTrunkCredentials]{}, err
	}
	if err = r.confine(ctx, id, options(o)); err != nil {
		return Response[SIPTrunkCredentials]{}, err
	}
	return unwrapped[SIPTrunkCredentials](ctx, r.t, "POST", path+"/credentials", nil, nil, options(o))
}
