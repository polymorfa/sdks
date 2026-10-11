package polymorfa

import (
	"context"
	"net/url"
)

type HistoryMessageSummary struct {
	ID          string             `json:"id"`
	WhatsAppIDs WhatsAppMessageIDs `json:"whatsapp_ids"`
	WhatsAppID  string             `json:"whatsapp_id,omitempty"`
	Direction   string             `json:"direction"`
	Type        string             `json:"type"`
	Timestamp   string             `json:"timestamp"`
}
type HistoryChat struct {
	Conversation   ConversationReference `json:"conversation"`
	Kind           string                `json:"kind"`
	LastActivityAt string                `json:"lastActivityAt"`
	LastMessage    HistoryMessageSummary `json:"lastMessage"`
}
type HistoryMedia struct {
	ID         string `json:"id"`
	MimeType   string `json:"mimeType"`
	FileLength int64  `json:"fileLength"`
	URL        string `json:"url"`
}
type HistoryMessage struct {
	HistoryMessageSummary
	Conversation struct {
		ConversationReference
		Sender *ConversationReference `json:"sender,omitempty"`
	} `json:"conversation"`
	FromMe            bool     `json:"fromMe"`
	PushName          string   `json:"pushName,omitempty"`
	Text              string   `json:"text,omitempty"`
	Caption           string   `json:"caption,omitempty"`
	MimeType          string   `json:"mimeType,omitempty"`
	Filename          string   `json:"filename,omitempty"`
	PTT               *bool    `json:"ptt,omitempty"`
	Latitude          *float64 `json:"latitude,omitempty"`
	Longitude         *float64 `json:"longitude,omitempty"`
	DisplayName       string   `json:"displayName,omitempty"`
	Title             string   `json:"title,omitempty"`
	Reaction          string   `json:"reaction,omitempty"`
	ReactionTo        string   `json:"reactionTo,omitempty"`
	Edited            *bool    `json:"edited,omitempty"`
	Unavailable       *bool    `json:"unavailable,omitempty"`
	UnavailableReason string   `json:"unavailableReason,omitempty"`
	PollOptions       []struct {
		Name string `json:"name"`
		Hash string `json:"hash"`
	} `json:"pollOptions,omitempty"`
	Media          []HistoryMedia `json:"media,omitempty"`
	MediaRetrieval *struct {
		State  string `json:"state"`
		Reason string `json:"reason,omitempty"`
	} `json:"mediaRetrieval,omitempty"`
}
type HistoryPage[T any] struct {
	Success        bool    `json:"success"`
	Data           []T     `json:"data"`
	HasMore        bool    `json:"hasMore"`
	NextCursor     *string `json:"nextCursor"`
	PreviousCursor *string `json:"previousCursor"`
}
type ListHistoryChatsParams struct {
	ListParams
	Kind         string
	ActiveSince  string
	ActiveBefore string
}

func (p ListHistoryChatsParams) query() url.Values {
	q := p.ListParams.query()
	setString(q, "kind", p.Kind)
	setString(q, "activeSince", p.ActiveSince)
	setString(q, "activeBefore", p.ActiveBefore)
	return q
}

type ListHistoryMessagesParams struct {
	ListParams
	Order     string
	Since     string
	Until     string
	Direction string
	Types     string
}

func (p ListHistoryMessagesParams) query() url.Values {
	q := p.ListParams.query()
	setString(q, "order", p.Order)
	setString(q, "since", p.Since)
	setString(q, "until", p.Until)
	setString(q, "direction", p.Direction)
	setString(q, "types", p.Types)
	return q
}

type EditMessageRequest struct {
	Transport MessageTransport `json:"transport,omitempty"`
	Text      string           `json:"text"`
}
type DisappearingTimerRequest struct {
	DurationSeconds int `json:"durationSeconds"`
}
type Chats struct{ t *transport }

func chatPath(s, id string) string { return "/messaging/" + escaped(s) + "/chats/" + escaped(id) }
func chatMessagePath(s, id, message string) string {
	return chatPath(s, id) + "/messages/" + escaped(message)
}
func (r *Chats) List(ctx context.Context, s string, p ListHistoryChatsParams, o ...RequestOptions) (Response[HistoryPage[HistoryChat]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[HistoryPage[HistoryChat]]{}, err
	}
	return request[HistoryPage[HistoryChat]](ctx, r.t, "GET", "/messaging/"+escaped(s)+"/chats", p.query(), nil, options(o))
}
func (r *Chats) Retrieve(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[HistoryChat]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[HistoryChat]]{}, err
	}
	return request[Envelope[HistoryChat]](ctx, r.t, "GET", chatPath(s, id), nil, nil, options(o))
}
func (r *Chats) ListMessages(ctx context.Context, s, id string, p ListHistoryMessagesParams, o ...RequestOptions) (Response[HistoryPage[HistoryMessage]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[HistoryPage[HistoryMessage]]{}, err
	}
	return request[HistoryPage[HistoryMessage]](ctx, r.t, "GET", chatPath(s, id)+"/messages", p.query(), nil, options(o))
}
func (r *Chats) RetrieveMessage(ctx context.Context, s, id, message string, o ...RequestOptions) (Response[Envelope[HistoryMessage]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[HistoryMessage]]{}, err
	}
	return request[Envelope[HistoryMessage]](ctx, r.t, "GET", chatMessagePath(s, id, message), nil, nil, options(o))
}
func (r *Chats) DownloadMessageMedia(ctx context.Context, s, id, message string, o ...RequestOptions) (Response[[]byte], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[[]byte]{}, err
	}
	return downloadBytes(ctx, r.t, chatMessagePath(s, id, message)+"/media", options(o))
}
func (r *Chats) DownloadMessageMediaStream(ctx context.Context, s, id, message string, o ...RequestOptions) (*MediaDownload, error) {
	if err := serverOnly(r.t); err != nil {
		return nil, err
	}
	return downloadStream(ctx, r.t, chatMessagePath(s, id, message)+"/media", options(o))
}
func (r *Chats) EditMessage(ctx context.Context, s, id, message string, b EditMessageRequest, opts ...RequestOptions) (Response[Success], error) {
	o, err := idempotent(options(opts))
	if err != nil {
		return Response[Success]{}, err
	}
	return request[Success](ctx, r.t, "PUT", chatMessagePath(s, id, message), nil, b, o)
}
func (r *Chats) DeleteMessage(ctx context.Context, s, id, message string, transport MessageTransport, opts ...RequestOptions) (Response[Success], error) {
	o, err := idempotent(options(opts))
	if err != nil {
		return Response[Success]{}, err
	}
	q := url.Values{}
	setString(q, "transport", string(transport))
	return request[Success](ctx, r.t, "DELETE", chatMessagePath(s, id, message), q, nil, o)
}
func (r *Chats) Archive(ctx context.Context, s, id string, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "POST", chatPath(s, id)+"/archive", nil, nil, options(o))
}
func (r *Chats) Unarchive(ctx context.Context, s, id string, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "POST", chatPath(s, id)+"/unarchive", nil, nil, options(o))
}
func (r *Chats) SetDisappearingTimer(ctx context.Context, s, id string, b DisappearingTimerRequest, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "PUT", chatPath(s, id)+"/disappearing", nil, b, options(o))
}

// CustomerServiceWindow is observed state; unknown never authorizes a send.
type CustomerServiceWindow struct {
	State     string  `json:"state"`
	Reason    *string `json:"reason"`
	OpenedAt  *string `json:"openedAt"`
	ExpiresAt *string `json:"expiresAt"`
	CheckedAt string  `json:"checkedAt"`
}

func (r *Chats) GetServiceWindow(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[CustomerServiceWindow]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[CustomerServiceWindow]]{}, err
	}
	return request[Envelope[CustomerServiceWindow]](ctx, r.t, "GET", chatPath(s, id)+"/service-window", nil, nil, options(o))
}
