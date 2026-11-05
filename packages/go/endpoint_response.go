package polymorfa

import (
	"context"
	"encoding/json"
	"mime"
	"net/url"
)

func jsonResult(md Metadata, status int) bool {
	k, _, e := mime.ParseMediaType(md.Headers.Get("Content-Type"))
	return e == nil && k == "application/json" && md.Status == status
}

// Success policies are endpoint-local; legacy transport decoding stays unchanged.
func endpointBare[T any](ctx context.Context, t *transport, method, path string, q url.Values, body any, o RequestOptions, status int) (Response[T], error) {
	raw, e := request[json.RawMessage](ctx, t, method, path, q, body, o)
	r := Response[T]{Metadata: raw.Metadata}
	if e != nil {
		return r, e
	}
	if !jsonResult(raw.Metadata, status) || campaignDecode(raw.Data, &r.Data) != nil {
		return r, campaignResponseError(raw.Metadata)
	}
	if v, ok := any(r.Data).(UnlinkTestingPhoneDeviceResult); ok && !v.Unlinked {
		return r, campaignResponseError(raw.Metadata)
	}
	return r, nil
}
func endpointEnvelope[T any](ctx context.Context, t *transport, method, path string, q url.Values, body any, o RequestOptions) (Response[Envelope[T]], error) {
	raw, e := request[json.RawMessage](ctx, t, method, path, q, body, o)
	r := Response[Envelope[T]]{Metadata: raw.Metadata}
	if e != nil {
		return r, e
	}
	var env struct {
		Data    json.RawMessage `json:"data"`
		Success *bool           `json:"success"`
	}
	if !jsonResult(raw.Metadata, 200) || json.Unmarshal(raw.Data, &env) != nil || env.Success == nil || !*env.Success || len(env.Data) == 0 || campaignDecode(env.Data, &r.Data.Data) != nil {
		return r, campaignResponseError(raw.Metadata)
	}
	switch v := any(r.Data.Data).(type) {
	case GroupCapabilities:
		if v.Status != "synced" && v.Status != "unknown" {
			return r, campaignResponseError(raw.Metadata)
		}
		for _, c := range v.Capabilities {
			if c.Kind != "feature" || c.Unit != nil || c.Source != nil && *c.Source != "server" && *c.Source != "client_default" {
				return r, campaignResponseError(raw.Metadata)
			}
		}
	case HistorySyncChunkRetryResult:
		if v.RequestID == "" || v.Status != "requested" {
			return r, campaignResponseError(raw.Metadata)
		}
	case HistorySyncChunkDeleteResult:
		if v.Status != "deleted" {
			return r, campaignResponseError(raw.Metadata)
		}
	}
	r.Data.Success = true
	return r, nil
}
