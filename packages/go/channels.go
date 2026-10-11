package polymorfa

import (
	"context"
	"encoding/json"
	"net/url"
	"strconv"
)

type AsyncAccepted struct {
	RequestID string `json:"requestId"`
}

// AsyncResult narrows runner admission from the completed resource result.
// RequestID means accepted asynchronously; Value means a completed response.
type AsyncResult[T any] struct {
	Value    *T
	Accepted *AsyncAccepted
}

func (r *AsyncResult[T]) UnmarshalJSON(b []byte) error {
	var admission struct {
		RequestID string `json:"requestId"`
	}
	if err := json.Unmarshal(b, &admission); err != nil {
		return err
	}
	if admission.RequestID != "" {
		r.Accepted = &AsyncAccepted{admission.RequestID}
		return nil
	}
	var v T
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	r.Value = &v
	return nil
}
func (r AsyncResult[T]) MarshalJSON() ([]byte, error) {
	if r.Accepted != nil {
		return json.Marshal(r.Accepted)
	}
	return json.Marshal(r.Value)
}

type Channel struct {
	ID          string `json:"id,omitempty"`
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
	ProfileURL  string `json:"profileUrl,omitempty"`
	Followers   *int64 `json:"followers,omitempty"`
	Muted       *bool  `json:"muted,omitempty"`
	Preview     *bool  `json:"preview,omitempty"`
}
type CreateChannelRequest struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Picture     string `json:"picture,omitempty"`
}
type ChannelMessage struct {
	Position       int64                 `json:"position"`
	ID             string                `json:"id"`
	WhatsAppIDs    WhatsAppMessageIDs    `json:"whatsapp_ids"`
	WhatsAppID     string                `json:"whatsapp_id,omitempty"`
	Conversation   ConversationReference `json:"conversation"`
	Type           string                `json:"type"`
	Timestamp      string                `json:"timestamp"`
	Views          int64                 `json:"views"`
	ReactionCounts map[string]int64      `json:"reactionCounts"`
	Text           string                `json:"text,omitempty"`
}
type ChannelMessagesParams struct {
	Count  int
	Before *int64
}
type ChannelMessageUpdatesParams struct {
	Count int
	Since *int64
	After *int64
}
type ChannelReactionRequest struct {
	Reaction string `json:"reaction"`
}
type ChannelLiveUpdates struct {
	DurationSeconds int `json:"durationSeconds"`
}
type ChannelActionResult struct {
	Status string `json:"status"`
}
type Channels struct{ t *transport }

func (c *MessagingClient) Channels() *Channels { return &Channels{c.t} }
func channelsPath(s string) string             { return messagingPath(s) + "/channels" }
func channelPath(s, id string) string          { return channelsPath(s) + "/" + escaped(id) }
func (r *Channels) List(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[[]Channel]], error) {
	return request[Envelope[[]Channel]](ctx, r.t, "GET", channelsPath(s), nil, nil, options(o))
}
func (r *Channels) Create(ctx context.Context, s string, b CreateChannelRequest, o ...RequestOptions) (Response[Envelope[AsyncResult[Channel]]], error) {
	return request[Envelope[AsyncResult[Channel]]](ctx, r.t, "POST", channelsPath(s), nil, b, options(o))
}
func (r *Channels) Retrieve(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[Channel]], error) {
	return request[Envelope[Channel]](ctx, r.t, "GET", channelPath(s, id), nil, nil, options(o))
}
func (r *Channels) Delete(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[AsyncResult[ChannelActionResult]]], error) {
	return request[Envelope[AsyncResult[ChannelActionResult]]](ctx, r.t, "DELETE", channelPath(s, id), nil, nil, options(o))
}
func (r *Channels) ListMessages(ctx context.Context, s, id string, p ChannelMessagesParams, o ...RequestOptions) (Response[Envelope[[]ChannelMessage]], error) {
	q := url.Values{}
	setInt(q, "count", p.Count)
	if p.Before != nil {
		q.Set("before", strconv.FormatInt(*p.Before, 10))
	}
	return request[Envelope[[]ChannelMessage]](ctx, r.t, "GET", channelPath(s, id)+"/messages", q, nil, options(o))
}
func (r *Channels) ListMessageUpdates(ctx context.Context, s, id string, p ChannelMessageUpdatesParams, o ...RequestOptions) (Response[Envelope[[]ChannelMessage]], error) {
	q := url.Values{}
	setInt(q, "count", p.Count)
	if p.Since != nil {
		q.Set("since", strconv.FormatInt(*p.Since, 10))
	}
	if p.After != nil {
		q.Set("after", strconv.FormatInt(*p.After, 10))
	}
	return request[Envelope[[]ChannelMessage]](ctx, r.t, "GET", channelPath(s, id)+"/message-updates", q, nil, options(o))
}
func (r *Channels) MarkMessageViewed(ctx context.Context, s, id, messageID string, o ...RequestOptions) (Response[Envelope[AsyncResult[ChannelActionResult]]], error) {
	return request[Envelope[AsyncResult[ChannelActionResult]]](ctx, r.t, "POST", channelPath(s, id)+"/messages/"+escaped(messageID)+"/viewed", nil, nil, options(o))
}
func (r *Channels) ReactToMessage(ctx context.Context, s, id, messageID string, b ChannelReactionRequest, o ...RequestOptions) (Response[Envelope[AsyncResult[ChannelActionResult]]], error) {
	opts, err := idempotent(options(o))
	if err != nil {
		return Response[Envelope[AsyncResult[ChannelActionResult]]]{}, err
	}
	return request[Envelope[AsyncResult[ChannelActionResult]]](ctx, r.t, "POST", channelPath(s, id)+"/messages/"+escaped(messageID)+"/reaction", nil, b, opts)
}
func (r *Channels) SubscribeToLiveUpdates(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[AsyncResult[ChannelLiveUpdates]]], error) {
	return request[Envelope[AsyncResult[ChannelLiveUpdates]]](ctx, r.t, "POST", channelPath(s, id)+"/live-updates", nil, nil, options(o))
}
func (r *Channels) Follow(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[AsyncResult[ChannelActionResult]]], error) {
	return r.action(ctx, s, id, "follow", options(o))
}
func (r *Channels) Unfollow(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[AsyncResult[ChannelActionResult]]], error) {
	return r.action(ctx, s, id, "unfollow", options(o))
}
func (r *Channels) Mute(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[AsyncResult[ChannelActionResult]]], error) {
	return r.action(ctx, s, id, "mute", options(o))
}
func (r *Channels) Unmute(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[AsyncResult[ChannelActionResult]]], error) {
	return r.action(ctx, s, id, "unmute", options(o))
}
func (r *Channels) action(ctx context.Context, s, id, action string, o RequestOptions) (Response[Envelope[AsyncResult[ChannelActionResult]]], error) {
	return request[Envelope[AsyncResult[ChannelActionResult]]](ctx, r.t, "POST", channelPath(s, id)+"/"+action, nil, nil, o)
}
