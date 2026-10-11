package polymorfa

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"math/big"
	"net/http"
	"net/url"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const Version = "0.1.0-dev.0"
const APIVersion = "2026-09-22"

type CredentialKind string

const (
	OrganizationAPIKey CredentialKind = "organizationApiKey"
	ProjectToken       CredentialKind = "projectToken"
	ClientToken        CredentialKind = "clientToken"
)

type Credential struct {
	Kind  CredentialKind
	Value string
}

// String deliberately redacts the bearer credential.
func (c Credential) String() string   { return string(c.Kind) + ":[redacted]" }
func (c Credential) GoString() string { return c.String() }

type Config struct {
	Credential        Credential
	BaseURL           string
	APIVersion        string
	Timeout           *time.Duration
	MaxNetworkRetries *int
	HTTPClient        *http.Client
}
type RequestOptions struct {
	APIVersion        string
	Headers           http.Header
	IdempotencyKey    string
	MaxNetworkRetries *int
	Timeout           time.Duration
}
type Metadata struct {
	Status        int
	RequestID     string
	APIVersion    string
	Attempts      int
	Headers       http.Header
	Transport     string
	RoutingReason string
	OperationID   string
}
type Response[T any] struct {
	Data     T
	Metadata Metadata
}
type Envelope[T any] struct {
	Success bool `json:"success"`
	Data    T    `json:"data"`
}
type Success struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
}
type RawRequest struct {
	Method  string
	Path    string
	Query   url.Values
	Body    any
	Options RequestOptions
}

// RawResponse is the explicit escape hatch for contracts not yet modeled.
type RawResponse = Response[json.RawMessage]

type ErrorKind string

const (
	ConfigurationError   ErrorKind = "configuration"
	ValidationError      ErrorKind = "validation"
	AuthenticationError  ErrorKind = "authentication"
	AuthorizationError   ErrorKind = "authorization"
	PaymentRequiredError ErrorKind = "payment_required"
	NotFoundError        ErrorKind = "not_found"
	ConflictError        ErrorKind = "conflict"
	RateLimitError       ErrorKind = "rate_limit"
	ServerError          ErrorKind = "server"
	ConnectionError      ErrorKind = "connection"
	TimeoutError         ErrorKind = "timeout"
	CancelledError       ErrorKind = "cancelled"
)

// Error preserves API error codes, including codes added after this SDK release.
type Error struct {
	Kind            ErrorKind
	Code            string
	Message         string
	Field           string
	Status          int
	RequestID       string
	RequestLogURL   string
	DocURL          string
	RateLimitReason string
	Details         json.RawMessage
	Metadata        Metadata
	Cause           error
}

func (e *Error) Error() string { return e.Message }
func (e *Error) Unwrap() error { return e.Cause }
func configuration(field, message string) error {
	return &Error{Kind: ConfigurationError, Code: "configuration_error", Field: field, Message: message}
}
func validation(message string) error {
	return &Error{Kind: ValidationError, Code: "invalid_parameter", Message: message}
}

var organizationPattern = regexp.MustCompile(`^pmfa_[A-Za-z0-9_-]{72}$`)
var projectPattern = regexp.MustCompile(`^pmfa_pt_[A-Za-z0-9_-]{93}[AQgw]$`)

func validateCredential(c Credential, messaging bool) error {
	if runtime.GOOS == "js" || runtime.GOOS == "wasip1" {
		return configuration("runtime", "Server credentials cannot be used in browser or WASM runtimes.")
	}
	switch c.Kind {
	case OrganizationAPIKey:
		if !organizationPattern.MatchString(c.Value) || strings.HasPrefix(c.Value, "pmfa_pt_") || strings.HasPrefix(c.Value, "pmfa_ct_") || strings.HasPrefix(c.Value, "pmfa_ls_") || strings.HasPrefix(c.Value, "pmfa_at_") || strings.HasPrefix(c.Value, "pmfa_wst_") || strings.HasPrefix(c.Value, "pmfa_sd_") {
			return configuration("credential", "Organization API keys require the canonical pmfa_ v1 format.")
		}
	case ProjectToken:
		if !projectPattern.MatchString(c.Value) {
			return configuration("credential", "Project tokens require the canonical pmfa_pt_ v1 format.")
		}
	case ClientToken:
		if !messaging || !strings.HasPrefix(c.Value, "pmfa_ct_") || len(c.Value) <= 8 {
			return configuration("credential", "Client tokens are accepted only by Messaging and require the pmfa_ct_ prefix.")
		}
	default:
		return configuration("credential", "Select an explicit credential kind.")
	}
	return nil
}

type transport struct {
	config  Config
	base    *url.URL
	client  *http.Client
	retries int
	timeout time.Duration
}

func newTransport(c Config, authenticated bool) (*transport, error) {
	if c.BaseURL == "" {
		c.BaseURL = "https://api.polymorfa.com"
	}
	u, err := url.Parse(c.BaseURL)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return nil, configuration("baseURL", "baseURL must be an HTTP(S) origin or base path without credentials, query or fragment.")
	}
	if authenticated && u.Scheme != "https" && u.Hostname() != "localhost" && u.Hostname() != "127.0.0.1" && u.Hostname() != "::1" {
		return nil, configuration("baseURL", "Credentialed clients require HTTPS except for loopback servers.")
	}
	timeout := 30 * time.Second
	if c.Timeout != nil {
		timeout = *c.Timeout
	}
	if timeout <= 0 {
		return nil, configuration("timeout", "timeout must be positive.")
	}
	if c.APIVersion == "" {
		c.APIVersion = APIVersion
	}
	retries := 2
	if c.MaxNetworkRetries != nil {
		retries = *c.MaxNetworkRetries
	}
	if retries < 0 {
		return nil, configuration("maxNetworkRetries", "maxNetworkRetries must be non-negative.")
	}
	hc := http.DefaultClient
	if c.HTTPClient != nil {
		hc = c.HTTPClient
	}
	copyClient := *hc
	// Never forward a bearer credential to a redirect target. Media follows
	// approved storage redirects separately using a credential-free request.
	copyClient.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	if !authenticated {
		c.Credential = Credential{}
	}
	return &transport{config: c, base: u, client: &copyClient, retries: retries, timeout: timeout}, nil
}
func escaped(v string) string { return url.PathEscape(v) }
func options(opts []RequestOptions) RequestOptions {
	if len(opts) > 0 {
		return opts[0]
	}
	return RequestOptions{}
}
func idempotent(o RequestOptions) (RequestOptions, error) {
	if o.IdempotencyKey != "" || o.Headers.Get("Idempotency-Key") != "" {
		return o, nil
	}
	var b [16]byte
	if _, err := rand.Read(b[:]); err != nil {
		return o, &Error{Kind: ConnectionError, Message: "Could not create idempotency key.", Cause: err}
	}
	o.IdempotencyKey = "sdk_" + hex.EncodeToString(b[:])
	return o, nil
}
func noRetry(o RequestOptions) RequestOptions { zero := 0; o.MaxNetworkRetries = &zero; return o }
func cloneQuery(q url.Values) url.Values {
	r := url.Values{}
	for k, v := range q {
		r[k] = append([]string(nil), v...)
	}
	return r
}
func (t *transport) request(ctx context.Context, method, path string, q url.Values, body any, o RequestOptions) (*http.Response, Metadata, error) {
	return t.open(ctx, method, path, q, body, o, false)
}
func (t *transport) open(ctx context.Context, method, path string, q url.Values, body any, o RequestOptions, streaming bool) (*http.Response, Metadata, error) {
	var data []byte
	var err error
	if body != nil {
		data, err = json.Marshal(body)
		if err != nil {
			return nil, Metadata{}, validation("Request body must be JSON serializable.")
		}
	}
	u := *t.base
	if !strings.HasPrefix(path, "/") || strings.HasPrefix(path, "//") || strings.Contains(path, "\\") || strings.ContainsAny(path, "?#") {
		return nil, Metadata{}, validation("Request path must be an absolute API path without query or fragment.")
	}
	decoded, err := url.PathUnescape(path)
	if err != nil {
		return nil, Metadata{}, validation("Invalid request path encoding.")
	}
	for _, s := range strings.Split(decoded, "/") {
		if s == ".." || s == "." {
			return nil, Metadata{}, validation("Request path cannot contain traversal segments.")
		}
	}
	u.RawPath = path
	u.Path, err = url.PathUnescape(u.RawPath)
	if err != nil {
		return nil, Metadata{}, validation("Invalid request path.")
	}
	u.RawQuery = q.Encode()
	timeout := t.timeout
	if o.Timeout != 0 {
		timeout = o.Timeout
	}
	if timeout < 0 {
		return nil, Metadata{}, configuration("timeout", "timeout must be positive.")
	}
	retries := t.retries
	if o.MaxNetworkRetries != nil {
		retries = *o.MaxNetworkRetries
	}
	if retries < 0 {
		return nil, Metadata{}, configuration("maxNetworkRetries", "maxNetworkRetries must be non-negative.")
	}
	key := o.IdempotencyKey
	if key == "" {
		key = o.Headers.Get("Idempotency-Key")
	}
	safe := method == "GET" || method == "HEAD" || method == "OPTIONS" || key != ""
	for attempt := 1; ; attempt++ {
		if err := ctx.Err(); err != nil {
			return nil, Metadata{}, contextError(ctx, err)
		}
		reqCtx, cancel := context.WithCancel(ctx)
		timer := time.AfterFunc(timeout, cancel)
		req, err := http.NewRequestWithContext(reqCtx, method, u.String(), bytes.NewReader(data))
		if err != nil {
			cancel()
			return nil, Metadata{}, validation("Invalid HTTP request.")
		}
		req.Header.Set("Accept", "application/json")
		if body != nil {
			req.Header.Set("Content-Type", "application/json")
		}
		if t.config.Credential.Value != "" {
			req.Header.Set("Authorization", "Bearer "+t.config.Credential.Value)
		}
		version := t.config.APIVersion
		if o.APIVersion != "" {
			version = o.APIVersion
		}
		req.Header.Set("Polymorfa-Version", version)
		req.Header.Set("User-Agent", "polymorfa-go/"+Version+" Go/"+runtime.Version())
		for k, v := range o.Headers {
			req.Header[k] = append([]string(nil), v...)
		}
		if key != "" {
			req.Header.Set("Idempotency-Key", key)
		}
		resp, err := t.client.Do(req)
		if err != nil {
			cancelled := ctx.Err() != nil
			timedOut := reqCtx.Err() != nil
			timer.Stop()
			cancel()
			if cancelled {
				return nil, Metadata{}, contextError(ctx, err)
			}
			if !safe || attempt > retries {
				return nil, Metadata{}, networkError(err, timedOut)
			}
			if err := sleep(ctx, retryDelay(nil, attempt)); err != nil {
				return nil, Metadata{}, contextError(ctx, err)
			}
			continue
		}
		if streaming {
			timer.Stop()
		}
		md := metadata(resp, attempt)
		retryable := resp.StatusCode == 408 || resp.StatusCode == 409 || resp.StatusCode == 429 || resp.StatusCode >= 500
		if safe && retryable && attempt <= retries && resp.Header.Get("Idempotent-Replayed") != "true" {
			delay := retryDelay(resp, attempt)
			io.Copy(io.Discard, io.LimitReader(resp.Body, 65536))
			resp.Body.Close()
			timer.Stop()
			cancel()
			if err := sleep(ctx, delay); err != nil {
				return nil, md, contextError(ctx, err)
			}
			continue
		}
		resp.Body = &cancelBody{ReadCloser: resp.Body, cancel: func() { timer.Stop(); cancel() }}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			if resp.StatusCode >= 300 && resp.StatusCode < 400 {
				return resp, md, nil
			}
			e := decodeError(resp, md)
			resp.Body.Close()
			return nil, md, e
		}
		return resp, md, nil
	}
}

type cancelBody struct {
	io.ReadCloser
	cancel context.CancelFunc
}

func (b *cancelBody) Close() error { err := b.ReadCloser.Close(); b.cancel(); return err }
func metadata(r *http.Response, attempts int) Metadata {
	h := http.Header{}
	for _, name := range []string{"content-type", "x-polymorfa-transport", "x-polymorfa-routing-reason", "x-polymorfa-operation-id", "x-request-id", "polymorfa-version", "retry-after", "polymorfa-data-region", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset", "polymorfa-ratelimit-reason", "polymorfa-next-cursor"} {
		if value := r.Header.Get(name); value != "" {
			h.Set(name, value)
		}
	}
	id := r.Header.Get("X-Request-Id")
	if id == "" {
		id = r.Header.Get("Request-Id")
	}
	return Metadata{Status: r.StatusCode, RequestID: id, APIVersion: r.Header.Get("Polymorfa-Version"), Attempts: attempts, Headers: h, Transport: r.Header.Get("X-Polymorfa-Transport"), RoutingReason: r.Header.Get("X-Polymorfa-Routing-Reason"), OperationID: r.Header.Get("X-Polymorfa-Operation-Id")}
}
func contextError(ctx context.Context, cause error) error {
	k := CancelledError
	m := "Request was cancelled."
	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		k = TimeoutError
		m = "Request deadline exceeded."
	}
	return &Error{Kind: k, Message: m, Cause: cause}
}
func networkError(cause error, timeout bool) error {
	k := ConnectionError
	m := "Could not connect to the Polymorfa API."
	if timeout {
		k = TimeoutError
		m = "Request timed out."
	}
	return &Error{Kind: k, Message: m, Cause: cause}
}
func sleep(ctx context.Context, d time.Duration) error {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-timer.C:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}
func retryDelay(r *http.Response, attempt int) time.Duration {
	if r != nil {
		h := r.Header.Get("Retry-After")
		if n, e := strconv.ParseFloat(h, 64); e == nil && n >= 0 && !math.IsInf(n, 0) && !math.IsNaN(n) {
			return min(time.Duration(min(n, 60)*float64(time.Second)), time.Minute)
		}
		if d, e := http.ParseTime(h); e == nil {
			return min(max(time.Until(d), 0), time.Minute)
		}
	}
	cap := min(500*time.Millisecond*time.Duration(1<<min(attempt-1, 4)), 5*time.Second)
	n, e := rand.Int(rand.Reader, big.NewInt(int64(cap/2)+1))
	if e != nil {
		return cap
	}
	return cap/2 + time.Duration(n.Int64())
}
func decodeError(r *http.Response, md Metadata) error {
	e := &Error{Status: r.StatusCode, RequestID: md.RequestID, Metadata: md, RateLimitReason: r.Header.Get("Polymorfa-RateLimit-Reason"), Message: fmt.Sprintf("Polymorfa API returned HTTP %d.", r.StatusCode)}
	switch r.StatusCode {
	case 400, 422:
		e.Kind = ValidationError
	case 401:
		e.Kind = AuthenticationError
	case 403:
		e.Kind = AuthorizationError
	case 402:
		e.Kind = PaymentRequiredError
	case 404:
		e.Kind = NotFoundError
	case 409:
		e.Kind = ConflictError
	case 429:
		e.Kind = RateLimitError
	default:
		e.Kind = ServerError
	}
	var v struct {
		Error struct {
			Code          string          `json:"code"`
			Message       string          `json:"message"`
			RequestID     string          `json:"request_id"`
			RequestLogURL string          `json:"request_log_url"`
			Docs          string          `json:"docs"`
			Details       json.RawMessage `json:"details"`
		} `json:"error"`
	}
	if strings.Contains(strings.ToLower(r.Header.Get("Content-Type")), "json") && json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&v) == nil {
		e.Code = v.Error.Code
		if v.Error.Message != "" {
			e.Message = v.Error.Message
		}
		if v.Error.RequestID != "" {
			e.RequestID = v.Error.RequestID
		}
		e.RequestLogURL = v.Error.RequestLogURL
		e.DocURL = v.Error.Docs
		e.Details = v.Error.Details
	}
	return e
}
func request[T any](ctx context.Context, t *transport, method, path string, q url.Values, body any, o RequestOptions) (Response[T], error) {
	var result Response[T]
	resp, md, err := t.request(ctx, method, path, q, body, o)
	result.Metadata = md
	if err != nil {
		return result, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return result, &Error{Kind: ServerError, Code: "unexpected_redirect", Message: "Unexpected API redirect.", Metadata: md}
	}
	if resp.StatusCode == 204 {
		return result, nil
	}
	if !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "json") {
		return result, &Error{Kind: ServerError, Code: "invalid_response", Message: "The Polymorfa API returned a non-JSON response.", Metadata: md}
	}
	dec := json.NewDecoder(resp.Body)
	if err := dec.Decode(&result.Data); err != nil {
		if ctx.Err() != nil {
			return result, contextError(ctx, err)
		}
		if resp.Request != nil && resp.Request.Context().Err() != nil {
			return result, networkError(err, true)
		}
		return result, &Error{Kind: ServerError, Code: "invalid_response", Message: "The Polymorfa API returned invalid JSON.", Metadata: md, Cause: err}
	}
	var trailing any
	if dec.Decode(&trailing) != io.EOF {
		return result, &Error{Kind: ServerError, Code: "invalid_response", Message: "The Polymorfa API returned trailing JSON data.", Metadata: md}
	}
	return result, nil
}
func unwrapped[T any](ctx context.Context, t *transport, method, path string, q url.Values, body any, o RequestOptions) (Response[T], error) {
	r, err := request[struct {
		Data *T `json:"data"`
	}](ctx, t, method, path, q, body, o)
	result := Response[T]{Metadata: r.Metadata}
	if err != nil {
		return result, err
	}
	if r.Data.Data == nil {
		return result, &Error{Kind: ServerError, Code: "invalid_response", Message: "The Polymorfa API returned an invalid data envelope.", Metadata: r.Metadata}
	}
	result.Data = *r.Data.Data
	return result, nil
}
