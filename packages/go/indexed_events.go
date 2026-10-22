package polymorfa

import (
	"context"
	"encoding/json"
	"strconv"
)

type ListIndexedEventsParams struct {
	AfterOffset string
	Type        string
	Limit       int
}
type IndexedEventPageMetadata struct {
	HasMore       bool    `json:"hasMore"`
	NextOffset    *string `json:"nextOffset"`
	HighWatermark string  `json:"highWatermark"`
}

func (p *IndexedEventPageMetadata) UnmarshalJSON(b []byte) error {
	var v struct {
		HasMore       *bool   `json:"hasMore"`
		NextOffset    *string `json:"nextOffset"`
		HighWatermark string  `json:"highWatermark"`
	}
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	if v.HasMore == nil {
		return validation("Indexed page must contain hasMore.")
	}
	p.HasMore = *v.HasMore
	p.NextOffset = v.NextOffset
	p.HighWatermark = v.HighWatermark
	return nil
}

type IndexedEventRead struct {
	Items    []PlatformEvent
	Page     IndexedEventPageMetadata
	Metadata Metadata
}

func streamOffset(v string) (int64, bool) {
	if v == "" || len(v) > 1 && v[0] == '0' {
		return 0, false
	}
	for _, r := range v {
		if r < '0' || r > '9' {
			return 0, false
		}
	}
	n, err := strconv.ParseInt(v, 10, 64)
	return n, err == nil && n >= 0
}
func (r *Events) ListIndexed(ctx context.Context, p ListIndexedEventsParams, o ...RequestOptions) (IndexedEventRead, error) {
	offset, ok := streamOffset(p.AfterOffset)
	if !ok {
		return IndexedEventRead{}, validation("afterOffset must be a non-negative decimal stream position.")
	}
	q := ListEventsParams{ListParams: ListParams{Limit: p.Limit}, AfterOffset: p.AfterOffset, Type: p.Type}.query()
	response, err := request[struct {
		Data *[]PlatformEvent          `json:"data"`
		Page *IndexedEventPageMetadata `json:"page"`
	}](ctx, r.t, "GET", r.prefix+"/events", q, nil, options(o))
	if err != nil {
		return IndexedEventRead{}, err
	}
	page := response.Data.Page
	valid := page != nil && response.Data.Data != nil
	if valid {
		high, good := streamOffset(page.HighWatermark)
		valid = good
		if page.HasMore {
			if page.NextOffset == nil {
				valid = false
			} else {
				next, good := streamOffset(*page.NextOffset)
				valid = valid && good && next > offset && next <= high
			}
		} else if page.NextOffset != nil {
			valid = false
		}
	}
	if !valid {
		return IndexedEventRead{}, &Error{Kind: ServerError, Code: "invalid_response", Message: "The API returned invalid indexed event metadata.", Status: response.Metadata.Status, Metadata: response.Metadata}
	}
	return IndexedEventRead{Items: *response.Data.Data, Page: *page, Metadata: response.Metadata}, nil
}
func (r *Events) offsetPage(ctx context.Context, p ListEventsParams, o RequestOptions) (*CursorPage[PlatformEvent], error) {
	if p.Cursor != "" || p.Since != "" || p.Until != "" {
		return nil, validation("afterOffset cannot be combined with cursor, since, or until.")
	}
	read, err := r.ListIndexed(ctx, ListIndexedEventsParams{AfterOffset: p.AfterOffset, Type: p.Type, Limit: p.Limit}, o)
	if err != nil {
		return nil, err
	}
	page := &CursorPage[PlatformEvent]{Items: read.Items, Metadata: read.Metadata, HighWatermark: read.Page.HighWatermark}
	if read.Page.NextOffset != nil {
		page.NextOffset = *read.Page.NextOffset
	}
	page.load = func(ctx context.Context, next string) (*CursorPage[PlatformEvent], error) {
		p.AfterOffset = next
		return r.offsetPage(ctx, p, o)
	}
	return page, nil
}
