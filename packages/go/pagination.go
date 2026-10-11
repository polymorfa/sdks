package polymorfa

import (
	"context"
	"iter"
	"net/url"
)

type ListParams struct {
	Limit  int
	Cursor string
}

func (p ListParams) query() url.Values {
	q := url.Values{}
	setInt(q, "limit", p.Limit)
	setString(q, "cursor", p.Cursor)
	return q
}

// CursorPage supports manual NextPage and lazy All iteration. It does not
// fetch another page until the consumer asks for it.
type CursorPage[T any] struct {
	Items      []T
	NextCursor string
	Metadata   Metadata
	load       func(context.Context, string) (*CursorPage[T], error)
}

func (p *CursorPage[T]) HasMore() bool { return p.NextCursor != "" }
func (p *CursorPage[T]) NextPage(ctx context.Context) (*CursorPage[T], error) {
	if !p.HasMore() || p.load == nil {
		return nil, nil
	}
	return p.load(ctx, p.NextCursor)
}
func (p *CursorPage[T]) All(ctx context.Context) iter.Seq2[T, error] {
	return func(yield func(T, error) bool) {
		current := p
		seen := map[string]bool{}
		for current != nil {
			for _, v := range current.Items {
				if err := ctx.Err(); err != nil {
					var z T
					yield(z, contextError(ctx, err))
					return
				}
				if !yield(v, nil) {
					return
				}
			}
			if current.NextCursor != "" && seen[current.NextCursor] {
				var z T
				yield(z, &Error{Kind: ServerError, Code: "invalid_response", Message: "Pagination cursor did not advance."})
				return
			}
			seen[current.NextCursor] = true
			next, err := current.NextPage(ctx)
			if err != nil {
				var z T
				yield(z, err)
				return
			}
			current = next
		}
	}
}
func page[T any](ctx context.Context, t *transport, path string, q url.Values, o RequestOptions) (*CursorPage[T], error) {
	var wire struct {
		Data *[]T `json:"data"`
		Page struct {
			NextCursor *string `json:"nextCursor"`
		} `json:"page"`
	}
	r, err := request[struct {
		Data *[]T `json:"data"`
		Page struct {
			NextCursor *string `json:"nextCursor"`
		} `json:"page"`
	}](ctx, t, "GET", path, q, nil, o)
	if err != nil {
		return nil, err
	}
	wire = r.Data
	if wire.Data == nil {
		return nil, &Error{Kind: ServerError, Code: "invalid_response", Message: "The Polymorfa API returned an invalid collection envelope.", Metadata: r.Metadata}
	}
	p := &CursorPage[T]{Items: *wire.Data, Metadata: r.Metadata}
	if wire.Page.NextCursor != nil {
		p.NextCursor = *wire.Page.NextCursor
	}
	copied := cloneQuery(q)
	p.load = func(ctx context.Context, cursor string) (*CursorPage[T], error) {
		next := cloneQuery(copied)
		next.Set("cursor", cursor)
		return page[T](ctx, t, path, next, o)
	}
	return p, nil
}
