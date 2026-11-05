package polymorfa

import "context"

type StatusResponse struct {
	Status      string `json:"status"`
	Uptime      string `json:"uptime"`
	Version     string `json:"version"`
	Environment string `json:"env"`
}
type VersionResponse struct {
	Version             string `json:"version"`
	BuildTime           string `json:"buildTime"`
	Environment         string `json:"env"`
	APIVersion          string `json:"apiVersion"`
	MinSupportedVersion string `json:"minSupportedVersion"`
}
type HealthCheck struct {
	Status string `json:"status"`
	Error  string `json:"error,omitempty"`
}
type HealthResponse struct {
	Status string                 `json:"status"`
	Checks map[string]HealthCheck `json:"checks"`
}
type PingResponse struct {
	Status string `json:"status"`
}
type SystemClient struct{ t *transport }

// NewSystemClient creates credential-free health and version probes. Any
// supplied credential is discarded and is never sent to the service.
func NewSystemClient(c Config) (*SystemClient, error) {
	t, err := newTransport(c, false)
	if err != nil {
		return nil, err
	}
	return &SystemClient{t}, nil
}
func (c *SystemClient) Status(ctx context.Context, o ...RequestOptions) (Response[StatusResponse], error) {
	return request[StatusResponse](ctx, c.t, "GET", "/messaging/info/status", nil, nil, options(o))
}
func (c *SystemClient) Version(ctx context.Context, o ...RequestOptions) (Response[VersionResponse], error) {
	return request[VersionResponse](ctx, c.t, "GET", "/messaging/info/version", nil, nil, options(o))
}
func (c *SystemClient) Health(ctx context.Context, o ...RequestOptions) (Response[HealthResponse], error) {
	return request[HealthResponse](ctx, c.t, "GET", "/health", nil, nil, options(o))
}
func (c *SystemClient) Ping(ctx context.Context, o ...RequestOptions) (Response[PingResponse], error) {
	return request[PingResponse](ctx, c.t, "GET", "/ping", nil, nil, options(o))
}

type BridgeRoute struct {
	WSURL     string `json:"wsUrl"`
	Region    string `json:"region"`
	Kind      string `json:"kind"`
	Signal    string `json:"signal"`
	TokenKind string `json:"tokenKind"`
	ExpiresAt int64  `json:"expiresAt"`
}
type BridgeClient struct{ t *transport }

func NewBridgeClient(c Config) (*BridgeClient, error) {
	if c.Credential.Kind != ProjectToken {
		return nil, configuration("credential", "Bridge clients require a project token.")
	}
	if err := validateCredential(c.Credential, false); err != nil {
		return nil, err
	}
	t, err := newTransport(c, true)
	if err != nil {
		return nil, err
	}
	return &BridgeClient{t}, nil
}
func (c *BridgeClient) Resolve(ctx context.Context, o ...RequestOptions) (Response[BridgeRoute], error) {
	return request[BridgeRoute](ctx, c.t, "GET", "/messaging/bridge/route", nil, nil, options(o))
}
