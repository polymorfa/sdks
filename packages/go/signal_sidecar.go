package polymorfa

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/url"
	"runtime"
	"strings"
	"sync/atomic"
	"time"
	"unicode/utf8"
)

const signalMaxJSON = 8 * 1024 * 1024

type SignalSidecarOptions struct {
	URL        string
	Secret     string
	HTTPClient *http.Client
	Timeout    time.Duration
}

func (SignalSidecarOptions) String() string               { return "SignalSidecarOptions[redacted]" }
func (v SignalSidecarOptions) GoString() string           { return v.String() }
func (SignalSidecarOptions) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }

type SignalSidecarClient struct {
	baseURL, secret string
	client          *http.Client
	timeout         time.Duration
}

func (*SignalSidecarClient) String() string               { return "SignalSidecarClient[redacted]" }
func (v *SignalSidecarClient) GoString() string           { return v.String() }
func (*SignalSidecarClient) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }

// signalSecret accepts an independent application secret of at least 16
// visible ASCII characters. The reserved pmfa_ prefix belongs to Polymorfa
// credentials and is rejected before any request or HMAC check.
func signalSecret(value string) bool {
	if len(value) < 16 || strings.HasPrefix(value, "pmfa_") {
		return false
	}
	for _, b := range []byte(value) {
		if b < 33 || b > 126 {
			return false
		}
	}
	return true
}
func NewSignalSidecarClient(options SignalSidecarOptions) (*SignalSidecarClient, error) {
	if runtime.GOOS == "js" || runtime.GOOS == "wasip1" {
		return nil, configuration("runtime", "Signal sidecar clients require a server runtime.")
	}
	target, err := url.Parse(options.URL)
	if err != nil || target.Host == "" || target.User != nil || target.RawQuery != "" || target.Fragment != "" || (target.Path != "" && target.Path != "/") || !signalSecret(options.Secret) {
		return nil, configuration("signalSidecar", "A root service URL and separate application secret are required.")
	}
	if target.Scheme != "https" {
		ip := net.ParseIP(target.Hostname())
		if target.Scheme != "http" || (target.Hostname() != "localhost" && (ip == nil || !ip.IsLoopback())) {
			return nil, configuration("signalSidecar", "HTTPS is required except on loopback.")
		}
	}
	timeout := options.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	if timeout < 0 {
		return nil, configuration("timeout", "A positive sidecar timeout is required.")
	}
	hc := http.DefaultClient
	if options.HTTPClient != nil {
		hc = options.HTTPClient
	}
	client := *hc
	client.Jar = nil
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	return &SignalSidecarClient{strings.TrimSuffix(target.String(), "/"), options.Secret, &client, timeout}, nil
}
func signalInvalid() error {
	return &Error{Kind: ServerError, Code: "signal_sidecar_invalid_response", Message: "The Signal sidecar returned an invalid response."}
}
func signalHTTPError(status int) error {
	kind := ServerError
	switch status {
	case 400:
		kind = ValidationError
	case 401:
		kind = AuthenticationError
	case 403:
		kind = AuthorizationError
	case 404:
		kind = NotFoundError
	case 409:
		kind = ConflictError
	case 429:
		kind = RateLimitError
	}
	return &Error{Kind: kind, Code: "signal_sidecar_request_failed", Message: "The Signal sidecar refused the request.", Status: status}
}
func signalNetworkError(ctx context.Context) error {
	if ctx.Err() != nil {
		return contextError(ctx, ctx.Err())
	}
	return &Error{Kind: ConnectionError, Code: "signal_sidecar_connection_failed", Message: "The Signal sidecar connection failed."}
}
func (c *SignalSidecarClient) open(ctx context.Context, method, path string, body any, authenticated, stream bool) (*http.Response, context.CancelFunc, error) {
	if c == nil || c.client == nil {
		return nil, nil, configuration("signalSidecar", "Create a configured Signal sidecar client first.")
	}
	var raw []byte
	var err error
	if body != nil {
		raw, err = json.Marshal(body)
		if err != nil || len(raw) > signalMaxJSON {
			return nil, nil, validation("Invalid Signal send body.")
		}
	}
	var owned context.Context
	var cancel context.CancelFunc
	var timer *time.Timer
	var headerTimedOut atomic.Bool
	if stream {
		owned, cancel = context.WithCancel(ctx)
		timer = time.AfterFunc(c.timeout, func() { headerTimedOut.Store(true); cancel() })
	} else {
		owned, cancel = context.WithTimeout(ctx, c.timeout)
	}
	req, err := http.NewRequestWithContext(owned, method, c.baseURL+path, bytes.NewReader(raw))
	if err != nil {
		cancel()
		if timer != nil {
			timer.Stop()
		}
		return nil, nil, validation("Invalid Signal request.")
	}
	if authenticated {
		req.Header.Set("Authorization", "Bearer "+c.secret)
	}
	req.Header.Set("Accept", "application/json")
	if stream {
		req.Header.Set("Accept", "text/event-stream")
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	client := *c.client
	if stream {
		client.Timeout = 0
	}
	response, err := client.Do(req)
	if timer != nil {
		timer.Stop()
	}
	if err != nil {
		failure := signalNetworkError(owned)
		if headerTimedOut.Load() && ctx.Err() == nil {
			failure = &Error{Kind: TimeoutError, Code: "signal_sidecar_timeout", Message: "The Signal sidecar request timed out."}
		}
		cancel()
		return nil, nil, failure
	}
	if owned.Err() != nil {
		response.Body.Close()
		failure := signalNetworkError(owned)
		cancel()
		return nil, nil, failure
	}
	if response.Request == nil {
		response.Request = req
	}
	return response, cancel, nil
}
func (c *SignalSidecarClient) request(ctx context.Context, method, path string, body any, authenticated bool, expected int) ([]byte, error) {
	response, cancel, err := c.open(ctx, method, path, body, authenticated, false)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer response.Body.Close()
	raw, err := io.ReadAll(io.LimitReader(response.Body, signalMaxJSON+1))
	if err != nil {
		return nil, signalNetworkError(response.Request.Context())
	}
	if len(raw) > signalMaxJSON {
		return nil, signalInvalid()
	}
	if response.StatusCode != expected {
		return nil, signalHTTPError(response.StatusCode)
	}
	if expected != 204 && strings.ToLower(strings.TrimSpace(strings.Split(response.Header.Get("Content-Type"), ";")[0])) != "application/json" {
		return nil, signalInvalid()
	}
	return raw, nil
}
func (c *SignalSidecarClient) Health(ctx context.Context) error {
	raw, err := c.request(ctx, "GET", "/healthz", nil, false, 200)
	if err != nil {
		return err
	}
	var value struct {
		Status string `json:"status"`
	}
	if json.Unmarshal(raw, &value) != nil || value.Status != "ok" {
		return signalInvalid()
	}
	return nil
}
func (c *SignalSidecarClient) Sessions(ctx context.Context) (SignalSessions, error) {
	raw, err := c.request(ctx, "GET", "/v1/sessions", nil, true, 200)
	if err != nil {
		return SignalSessions{}, err
	}
	var result SignalSessions
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &result) != nil || json.Unmarshal(raw, &fields) != nil || result.NodeID == "" || result.Sessions == nil {
		return SignalSessions{}, signalInvalid()
	}
	var sessions []map[string]json.RawMessage
	if json.Unmarshal(fields["sessions"], &sessions) != nil {
		return SignalSessions{}, signalInvalid()
	}
	for _, session := range sessions {
		for _, field := range []string{"id", "lease_generation", "claimed", "has_device_keys", "state", "pn", "lid"} {
			if session[field] == nil || (field != "pn" && field != "lid" && bytes.Equal(session[field], []byte("null"))) {
				return SignalSessions{}, signalInvalid()
			}
		}
	}
	return result, nil
}
func (c *SignalSidecarClient) Send(ctx context.Context, session string, body SignalSendRequest) (SignalSendOutcome, error) {
	if session == "" || !utf8.ValidString(session) || body.To == "" || !utf8.ValidString(body.To) || (body.Text != nil && !utf8.ValidString(*body.Text)) || (body.Text == nil) == (body.Media == nil) || (body.Text != nil && *body.Text == "") {
		return SignalSendOutcome{}, validation("Signal sends require a target and exactly one non-empty text or media body.")
	}
	wire := map[string]any{"to": body.To}
	if body.Text != nil {
		wire["text"] = *body.Text
	} else {
		if body.Media.validateSend() != nil {
			return SignalSendOutcome{}, validation("Invalid Signal media descriptor.")
		}
		type mediaWire SignalMediaDescriptor
		wire["media"] = mediaWire(*body.Media)
	}
	raw, err := c.request(ctx, "POST", "/v1/sessions/"+url.PathEscape(session)+"/messages", wire, true, 200)
	if err != nil {
		return SignalSendOutcome{}, err
	}
	var result SignalSendOutcome
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &result) != nil || json.Unmarshal(raw, &fields) != nil || result.MessageID == "" || fields["server_timestamp"] == nil || fields["resent"] == nil || bytes.Equal(fields["server_timestamp"], []byte("null")) || bytes.Equal(fields["resent"], []byte("null")) {
		return SignalSendOutcome{}, signalInvalid()
	}
	return result, nil
}

// Acknowledge is manual. Call after durable application processing. Cancellation
// or timeout does not undo an ACK or send that the service already accepted.
func (c *SignalSidecarClient) Acknowledge(ctx context.Context, eventID string) error {
	if eventID == "" {
		return validation("An event ID is required.")
	}
	_, err := c.request(ctx, "POST", "/v1/events/"+url.PathEscape(eventID)+"/ack", nil, true, 204)
	return err
}
