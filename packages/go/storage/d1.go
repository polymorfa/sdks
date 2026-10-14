package storage

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const D1BridgeContract = "polymorfa-d1-storage-v1"
const d1MaxBody = 8 * 1024 * 1024

type Adapter interface {
	Capabilities() Capabilities
	Get(context.Context, string, []string) (map[string]Row, error)
	Commit(context.Context, []Write) (CommitResult, error)
	Query(context.Context, string, Query) ([]Row, error)
}
type D1Options struct {
	URL         string
	Authority   string
	TablePrefix string
	Secret      string
	HTTPClient  *http.Client
	Timeout     time.Duration
}

func (D1Options) String() string               { return "D1Options[redacted]" }
func (v D1Options) GoString() string           { return v.String() }
func (D1Options) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }

type D1Adapter struct {
	baseURL, authority, prefix, secret string
	client                             *http.Client
	timeout                            time.Duration
	setupAllowed                       bool
	verified                           bool
}

func (*D1Adapter) String() string               { return "D1Adapter[redacted]" }
func (v *D1Adapter) GoString() string           { return v.String() }
func (*D1Adapter) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }
func NewD1Adapter(ctx context.Context, options D1Options) (*D1Adapter, error) {
	target, err := url.Parse(options.URL)
	if err != nil || target.Host == "" || target.User != nil || target.RawQuery != "" || target.Fragment != "" || (target.Path != "" && target.Path != "/") || !authorityPattern.MatchString(options.Authority) || !prefixPattern.MatchString(options.TablePrefix) || len(options.Secret) < 32 || len(options.Secret) > 256 {
		return nil, invalid()
	}
	if target.Scheme != "https" {
		ip := net.ParseIP(target.Hostname())
		if target.Scheme != "http" || (target.Hostname() != "localhost" && (ip == nil || !ip.IsLoopback())) {
			return nil, invalid()
		}
	}
	for _, b := range []byte(options.Secret) {
		if b < 33 || b > 126 {
			return nil, invalid()
		}
	}
	timeout := options.Timeout
	if timeout == 0 {
		timeout = 30 * time.Second
	}
	if timeout < 0 {
		return nil, invalid()
	}
	hc := http.DefaultClient
	if options.HTTPClient != nil {
		hc = options.HTTPClient
	}
	client := *hc
	client.Jar = nil
	client.CheckRedirect = func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }
	adapter := &D1Adapter{baseURL: strings.TrimSuffix(target.String(), "/"), authority: options.Authority, prefix: options.TablePrefix, secret: options.Secret, client: &client, timeout: timeout}
	data, err := adapter.request(ctx, "GET", "/handshake", nil)
	if err != nil {
		return nil, err
	}
	var capabilities struct {
		Atomic  bool  `json:"atomicCommit"`
		Commit  int   `json:"maxCommitSize"`
		Get     int   `json:"maxGetSize"`
		Query   int   `json:"maxQuerySize"`
		Body    int   `json:"maxBodyBytes"`
		Deletes bool  `json:"conditionalDeletes"`
		Setup   *bool `json:"setupAllowed"`
	}
	if json.Unmarshal(data, &capabilities) != nil || !capabilities.Atomic || capabilities.Commit != 50 || capabilities.Get != 1000 || capabilities.Query != 1000 || capabilities.Body != d1MaxBody || !capabilities.Deletes || capabilities.Setup == nil {
		return nil, &Error{Code: "untrusted_storage_response"}
	}
	adapter.setupAllowed = *capabilities.Setup
	adapter.verified = true
	return adapter, nil
}
func (a *D1Adapter) Capabilities() Capabilities {
	if !a.verified {
		return Capabilities{}
	}
	return Capabilities{AtomicCommit: true, MaxCommitSize: 50}
}
func signD1(secret, message string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(message))
	return "v1=" + hex.EncodeToString(mac.Sum(nil))
}
func (a *D1Adapter) request(ctx context.Context, method, path string, body any) (json.RawMessage, error) {
	if !a.verified && path != "/handshake" {
		return nil, &Error{Code: "storage_handshake_required"}
	}
	var raw []byte
	var err error
	if body != nil {
		raw, err = json.Marshal(body)
		if err != nil || len(raw) > d1MaxBody {
			return nil, invalid()
		}
	}
	nonceBytes := make([]byte, 32)
	if _, err := rand.Read(nonceBytes); err != nil {
		return nil, &Error{Code: "storage_random_failed"}
	}
	nonce := base64.RawURLEncoding.EncodeToString(nonceBytes)
	owned, cancel := context.WithTimeout(ctx, a.timeout)
	defer cancel()
	req, err := http.NewRequestWithContext(owned, method, a.baseURL+path, bytes.NewReader(raw))
	if err != nil {
		return nil, invalid()
	}
	req.Header.Set("Authorization", "Bearer "+a.secret)
	req.Header.Set("Polymorfa-Storage-Authority", a.authority)
	req.Header.Set("Polymorfa-Storage-Prefix", a.prefix)
	req.Header.Set("Polymorfa-Storage-Nonce", nonce)
	req.Header.Set("Polymorfa-Storage-Signature", signD1(a.secret, nonce+"."+method+"."+path+"."+string(raw)))
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	response, err := a.client.Do(req)
	if err != nil {
		return nil, d1NetworkError(owned)
	}
	defer response.Body.Close()
	data, err := io.ReadAll(io.LimitReader(response.Body, d1MaxBody+1))
	if err != nil {
		return nil, d1NetworkError(owned)
	}
	if len(data) > d1MaxBody || !utf8.Valid(data) || response.Header.Get("Polymorfa-Storage-Nonce") != nonce || !hmac.Equal([]byte(response.Header.Get("Polymorfa-Storage-Signature")), []byte(signD1(a.secret, nonce+"."+strconv.Itoa(response.StatusCode)+"."+string(data)))) {
		return nil, &Error{Code: "untrusted_storage_response"}
	}
	var envelope struct {
		Contract  string          `json:"contract"`
		Schema    int             `json:"schemaVersion"`
		Authority string          `json:"authority"`
		Prefix    string          `json:"tablePrefix"`
		Data      json.RawMessage `json:"data"`
	}
	if json.Unmarshal(data, &envelope) != nil || envelope.Contract != D1BridgeContract || envelope.Schema != SchemaVersion || envelope.Authority != a.authority || envelope.Prefix != a.prefix || len(envelope.Data) == 0 {
		return nil, &Error{Code: "untrusted_storage_response"}
	}
	var decoded any
	if json.Unmarshal(envelope.Data, &decoded) != nil {
		return nil, &Error{Code: "untrusted_storage_response"}
	}
	count := 0
	if validateJSON(decoded, 0, &count) != nil {
		return nil, &Error{Code: "untrusted_storage_response"}
	}
	if response.StatusCode != 200 {
		return nil, &Error{Code: "storage_operation_rejected"}
	}
	return envelope.Data, nil
}
func d1NetworkError(ctx context.Context) error {
	if ctx.Err() == context.Canceled {
		return &Error{Code: "storage_cancelled"}
	}
	if ctx.Err() == context.DeadlineExceeded {
		return &Error{Code: "storage_timeout"}
	}
	return &Error{Code: "storage_connection_failed"}
}
func (a *D1Adapter) Setup(ctx context.Context) error {
	if !a.setupAllowed {
		return &Error{Code: "storage_setup_disabled"}
	}
	data, err := a.request(ctx, "POST", "/setup", struct{}{})
	if err != nil {
		return err
	}
	var result CommitResult
	if json.Unmarshal(data, &result) != nil || !result.OK {
		return &Error{Code: "untrusted_storage_response"}
	}
	return nil
}
func (a *D1Adapter) Get(ctx context.Context, entity string, ids []string) (map[string]Row, error) {
	if _, ok := schema[entity]; !ok || len(ids) > 1000 {
		return nil, invalid()
	}
	requested := map[string]bool{}
	for _, id := range ids {
		if id == "" || len(id) > 4096 || !utf8.ValidString(id) {
			return nil, invalid()
		}
		requested[id] = true
	}
	if ids == nil {
		ids = []string{}
	}
	data, err := a.request(ctx, "POST", "/get", struct {
		Entity string   `json:"entity"`
		IDs    []string `json:"ids"`
	}{entity, ids})
	if err != nil {
		return nil, err
	}
	var rows []Row
	if json.Unmarshal(data, &rows) != nil || bytes.Equal(data, []byte("null")) {
		return nil, &Error{Code: "untrusted_storage_response"}
	}
	result := map[string]Row{}
	for _, row := range rows {
		if ValidateRow(entity, row) != nil {
			return nil, &Error{Code: "untrusted_storage_response"}
		}
		id := row["_id"].(string)
		if !requested[id] || result[id] != nil {
			return nil, &Error{Code: "untrusted_storage_response"}
		}
		result[id] = row
	}
	return result, nil
}
func (a *D1Adapter) Commit(ctx context.Context, writes []Write) (CommitResult, error) {
	if ValidateWrites(writes, 50) != nil {
		return CommitResult{}, invalid()
	}
	if writes == nil {
		writes = []Write{}
	}
	// Remote unconditional deletes require a same-session CAS lease in this batch.
	for _, w := range writes {
		if w.Kind != "delete" || w.ExpectedRev != nil {
			continue
		}
		scope := "k" + strings.SplitN(strings.TrimPrefix(w.ID, "k"), ":", 2)[0]
		fenced := false
		for _, fence := range writes {
			if fence.Kind == "put" && fence.Entity == "leases" && fence.ExpectedRev != nil && fence.Row["_id"] == scope {
				rev, ok := revision(fence.Row["_rev"])
				if ok && rev == *fence.ExpectedRev+1 {
					fenced = true
				}
			}
		}
		if !fenced {
			return CommitResult{}, invalid()
		}
	}
	data, err := a.request(ctx, "POST", "/commit", struct {
		Writes []Write `json:"writes"`
	}{writes})
	if err != nil {
		return CommitResult{}, err
	}
	var result struct {
		OK        *bool    `json:"ok"`
		Conflicts []string `json:"conflicts"`
	}
	if json.Unmarshal(data, &result) != nil || result.OK == nil || (!*result.OK && (len(result.Conflicts) == 0 || len(result.Conflicts) > len(writes))) || (*result.OK && len(result.Conflicts) > 0) {
		return CommitResult{}, &Error{Code: "untrusted_storage_response"}
	}
	slots := map[string]bool{}
	for _, w := range writes {
		id := w.ID
		if w.Kind == "put" {
			id = w.Row["_id"].(string)
		}
		slots[id] = true
	}
	for _, id := range result.Conflicts {
		if !slots[id] {
			return CommitResult{}, &Error{Code: "untrusted_storage_response"}
		}
	}
	return CommitResult{*result.OK, result.Conflicts}, nil
}
func (a *D1Adapter) Query(ctx context.Context, entity string, q Query) ([]Row, error) {
	idx, err := validateQuery(entity, q, 1000)
	if err != nil {
		return nil, err
	}
	data, err := a.request(ctx, "POST", "/query", struct {
		Entity string `json:"entity"`
		Query  Query  `json:"query"`
	}{entity, q})
	if err != nil {
		return nil, err
	}
	var rows []Row
	if json.Unmarshal(data, &rows) != nil || bytes.Equal(data, []byte("null")) || len(rows) > q.Limit {
		return nil, &Error{Code: "untrusted_storage_response"}
	}
	seen := map[string]bool{}
	var previous *Cursor
	for _, row := range rows {
		if ValidateRow(entity, row) != nil {
			return nil, &Error{Code: "untrusted_storage_response"}
		}
		id := row["_id"].(string)
		if seen[id] {
			return nil, &Error{Code: "untrusted_storage_response"}
		}
		seen[id] = true
		for _, field := range idx.Equals {
			if row[field] != q.Equals[field] {
				return nil, &Error{Code: "untrusted_storage_response"}
			}
		}
		sortValue := float64(0)
		if row[idx.Sort] != nil {
			sortValue, _ = number(row[idx.Sort])
		}
		for op, value := range q.Range {
			if op == "gt" && sortValue <= value || op == "gte" && sortValue < value || op == "lt" && sortValue >= value || op == "lte" && sortValue > value {
				return nil, &Error{Code: "untrusted_storage_response"}
			}
		}
		cursor := Cursor{sortValue, id}
		for _, before := range []*Cursor{q.After, previous} {
			if before != nil {
				cmp := compareCursor(cursor, *before)
				if q.Order == "desc" && cmp >= 0 || q.Order != "desc" && cmp <= 0 {
					return nil, &Error{Code: "untrusted_storage_response"}
				}
			}
		}
		previous = &cursor
	}
	return rows, nil
}
func compareCursor(a, b Cursor) int {
	if a.Sort < b.Sort {
		return -1
	}
	if a.Sort > b.Sort {
		return 1
	}
	return strings.Compare(a.ID, b.ID)
}

var _ Adapter = (*D1Adapter)(nil)
