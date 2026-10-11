package polymorfa

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"strings"
)

func requestText(ctx context.Context, t *transport, path string, q url.Values, contentType string, o RequestOptions) (Response[string], error) {
	var result Response[string]
	o.Headers = o.Headers.Clone()
	if o.Headers == nil {
		o.Headers = http.Header{}
	}
	o.Headers.Set("Accept", contentType)
	r, md, err := t.request(ctx, "GET", path, q, nil, o)
	result.Metadata = md
	if err != nil {
		return result, err
	}
	defer r.Body.Close()
	if r.StatusCode >= 300 {
		return result, &Error{Kind: ServerError, Code: "unexpected_redirect", Message: "Unexpected API redirect.", Metadata: md}
	}
	if strings.ToLower(strings.TrimSpace(strings.Split(r.Header.Get("Content-Type"), ";")[0])) != contentType {
		return result, &Error{Kind: ServerError, Code: "invalid_response", Message: "The API returned an unexpected text content type.", Metadata: md, Status: md.Status, RequestID: md.RequestID}
	}
	b, err := io.ReadAll(r.Body)
	if err != nil {
		return result, responseBodyError(ctx, r, md, err)
	}
	result.Data = string(b)
	return result, nil
}
