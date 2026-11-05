package polymorfa

import (
	"context"
	"encoding/json"
	"strings"
)

// RawRequester is implemented by organization, project and Messaging clients.
// Every page uses Raw, preserving the client's credential and project boundary.
type RawRequester interface {
	Raw(context.Context, RawRequest) (RawResponse, error)
}

type PageResult[T any] struct {
	Items      []T
	NextCursor string
}
type RawPageDecoder[T any] func(json.RawMessage, Metadata) (PageResult[T], error)
type RawPaginationOptions struct{ CursorParameter string }

// PaginateRaw loads one page using an application decoder. Use NextPage or All
// on the result to continue lazily. cursorParameter defaults to "cursor".
func PaginateRaw[T any](ctx context.Context, client RawRequester, request RawRequest, decode RawPageDecoder[T], options ...RawPaginationOptions) (*CursorPage[T], error) {
	if client == nil || decode == nil {
		return nil, configuration("pagination", "A raw client and page decoder are required.")
	}
	if len(options) > 1 {
		return nil, configuration("pagination", "Supply at most one pagination option.")
	}
	key := "cursor"
	if len(options) != 0 && options[0].CursorParameter != "" {
		key = options[0].CursorParameter
	}
	if strings.TrimSpace(key) == "" {
		return nil, configuration("cursorParameter", "The cursor parameter must be non-empty.")
	}
	request.Query = cloneQuery(request.Query)
	request.Options.Headers = request.Options.Headers.Clone()
	var load func(context.Context, RawRequest) (*CursorPage[T], error)
	load = func(ctx context.Context, r RawRequest) (*CursorPage[T], error) {
		response, err := client.Raw(ctx, r)
		if err != nil {
			return nil, err
		}
		decoded, err := decode(response.Data, response.Metadata)
		if err != nil {
			return nil, err
		}
		if decoded.NextCursor != "" && decoded.NextCursor == r.Query.Get(key) {
			return nil, &Error{Kind: ServerError, Code: "invalid_response", Message: "Pagination cursor did not advance.", Status: response.Metadata.Status, Metadata: response.Metadata}
		}
		page := &CursorPage[T]{Items: decoded.Items, NextCursor: decoded.NextCursor, Metadata: response.Metadata}
		page.load = func(ctx context.Context, cursor string) (*CursorPage[T], error) {
			next := r
			next.Query = cloneQuery(r.Query)
			next.Query.Set(key, cursor)
			next.Options.Headers = r.Options.Headers.Clone()
			return load(ctx, next)
		}
		return page, nil
	}
	return load(ctx, request)
}
