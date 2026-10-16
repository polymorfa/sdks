package polymorfa

import (
	"context"
	"encoding/base64"
	"regexp"
)

type HistorySyncResource struct{ t *transport }

func (client *MessagingClient) HistorySync() *HistorySyncResource {
	return &HistorySyncResource{client.t}
}

type HistorySyncType string

const (
	HistoryInitialBootstrap HistorySyncType = "INITIAL_BOOTSTRAP"
	HistoryInitialStatusV3  HistorySyncType = "INITIAL_STATUS_V3"
	HistoryFull             HistorySyncType = "FULL"
	HistoryRecent           HistorySyncType = "RECENT"
	HistoryPushName         HistorySyncType = "PUSH_NAME"
	HistoryNonBlockingData  HistorySyncType = "NON_BLOCKING_DATA"
	HistoryOnDemand         HistorySyncType = "ON_DEMAND"
)

type HistorySyncChunkRetryRequest struct {
	SyncType       HistorySyncType `json:"syncType"`
	ChunkOrder     uint32          `json:"chunkOrder"`
	ChunkMessageID string          `json:"chunkMessageId,omitempty"`
	Regenerate     *bool           `json:"regenerate,omitempty"`
}
type HistorySyncChunkRetryResult struct {
	RequestID string `json:"requestId"`
	Status    string `json:"status"`
}
type HistorySyncChunkDeleteRequest struct {
	DirectPath         string `json:"-"`
	FileEncSHA256      []byte `json:"-"`
	EncHandle          string `json:"-"`
	CompanionMetaNonce string `json:"-"`
}

func (HistorySyncChunkDeleteRequest) String() string {
	return "HistorySyncChunkDeleteRequest[redacted]"
}
func (v HistorySyncChunkDeleteRequest) GoString() string { return v.String() }
func (HistorySyncChunkDeleteRequest) MarshalJSON() ([]byte, error) {
	return []byte(`{"redacted":true}`), nil
}

type HistorySyncChunkDeleteResult struct {
	Status string `json:"status"`
}

var historyMessageID = regexp.MustCompile(`^[A-Za-z0-9._:-]{1,128}$`)
var historyPath = regexp.MustCompile(`^/[A-Za-z0-9._~%/=&?+-]+$`)
var historyToken = regexp.MustCompile(`^[A-Za-z0-9._~%/=+-]{1,512}$`)

// RequestChunkRetry explicitly asks the phone for another history.sync event.
// API authority enforces history consent and sessions:manage. No automatic retry.
func (resource *HistorySyncResource) RequestChunkRetry(ctx context.Context, session string, body HistorySyncChunkRetryRequest, opts ...RequestOptions) (Response[Envelope[HistorySyncChunkRetryResult]], error) {
	var zero Response[Envelope[HistorySyncChunkRetryResult]]
	if err := serverOnly(resource.t); err != nil {
		return zero, err
	}
	if session == "" {
		return zero, configuration("session", "A session is required.")
	}
	switch body.SyncType {
	case HistoryInitialBootstrap, HistoryInitialStatusV3, HistoryFull, HistoryRecent, HistoryPushName, HistoryNonBlockingData, HistoryOnDemand:
	default:
		return zero, configuration("syncType", "Invalid history retry type.")
	}
	if body.ChunkMessageID != "" && !historyMessageID.MatchString(body.ChunkMessageID) {
		return zero, configuration("chunkMessageId", "Invalid history chunk message identifier.")
	}
	response, err := endpointEnvelope[HistorySyncChunkRetryResult](ctx, resource.t, "POST", "/messaging/"+escaped(session)+"/history/chunks/retry", nil, body, customerOwnedOptions(options(opts)))
	if err == nil && (response.Data.Data.RequestID == "" || response.Data.Data.Status != "requested") {
		return zero, uploadResponseError("The API returned an invalid history retry result.")
	}
	return response, err
}

// DeleteChunk is explicit. Call only after durable local processing; it never
// deletes the application's copy. Timeout/cancellation does not undo deletion.
func (resource *HistorySyncResource) DeleteChunk(ctx context.Context, session string, body HistorySyncChunkDeleteRequest, opts ...RequestOptions) (Response[Envelope[HistorySyncChunkDeleteResult]], error) {
	var zero Response[Envelope[HistorySyncChunkDeleteResult]]
	if err := serverOnly(resource.t); err != nil {
		return zero, err
	}
	if session == "" || len(body.DirectPath) > 1024 || !historyPath.MatchString(body.DirectPath) || len(body.FileEncSHA256) != 32 || (body.EncHandle != "" && !historyToken.MatchString(body.EncHandle)) || (body.CompanionMetaNonce != "" && !historyToken.MatchString(body.CompanionMetaNonce)) {
		return zero, configuration("history", "Invalid history deletion descriptor.")
	}
	wire := map[string]any{"directPath": body.DirectPath, "fileEncSha256": base64.StdEncoding.EncodeToString(body.FileEncSHA256)}
	if body.EncHandle != "" {
		wire["encHandle"] = body.EncHandle
	}
	if body.CompanionMetaNonce != "" {
		wire["companionMetaNonce"] = body.CompanionMetaNonce
	}
	response, err := endpointEnvelope[HistorySyncChunkDeleteResult](ctx, resource.t, "POST", "/messaging/"+escaped(session)+"/history/media/delete", nil, wire, customerOwnedOptions(options(opts)))
	if err == nil && response.Data.Data.Status != "deleted" {
		return zero, uploadResponseError("The API returned an invalid history deletion result.")
	}
	return response, err
}
