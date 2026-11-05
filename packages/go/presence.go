package polymorfa

import (
	"context"
)

type PresenceData struct {
	Desired       string `json:"desired,omitempty"`
	DesiredAt     string `json:"desiredAt,omitempty"`
	LastSent      string `json:"lastSent,omitempty"`
	LastSentAt    string `json:"lastSentAt,omitempty"`
	Authoritative bool   `json:"authoritative"`
}
type ChatPresenceData struct {
	Policy                string `json:"policy"`
	Status                string `json:"status"`
	UnknownReason         string `json:"unknownReason,omitempty"`
	Available             *bool  `json:"available,omitempty"`
	LastSeen              string `json:"lastSeen,omitempty"`
	ObservedAt            string `json:"observedAt,omitempty"`
	SubscriptionExpiresAt string `json:"subscriptionExpiresAt,omitempty"`
	Stale                 bool   `json:"stale"`
	TypingPolicy          string `json:"typingPolicy"`
	TypingStatus          string `json:"typingStatus"`
	TypingUnknownReason   string `json:"typingUnknownReason,omitempty"`
	ChatState             *struct {
		Sender     string `json:"sender"`
		State      string `json:"state"`
		Media      string `json:"media,omitempty"`
		ObservedAt string `json:"observedAt"`
		Stale      bool   `json:"stale"`
	} `json:"chatState,omitempty"`
}
type PresenceMutationResult struct {
	Success bool   `json:"success"`
	Message string `json:"message,omitempty"`
	Data    *struct {
		Status    string `json:"status,omitempty"`
		RequestID string `json:"requestId,omitempty"`
		ExpiresAt string `json:"expiresAt,omitempty"`
	} `json:"data,omitempty"`
}
type Presence struct{ t *transport }

func (c *MessagingClient) Presence() *Presence { return &Presence{c.t} }
func presencePath(s string) string             { return "/messaging/" + escaped(s) + "/presence" }
func (r *Presence) Set(ctx context.Context, s, state string, o ...RequestOptions) (Response[PresenceMutationResult], error) {
	return request[PresenceMutationResult](ctx, r.t, "POST", presencePath(s), nil, struct {
		Presence string `json:"presence"`
	}{state}, options(o))
}
func (r *Presence) Get(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[PresenceData]], error) {
	return request[Envelope[PresenceData]](ctx, r.t, "GET", presencePath(s), nil, nil, options(o))
}
func (r *Presence) GetForChat(ctx context.Context, s, id string, o ...RequestOptions) (Response[Envelope[ChatPresenceData]], error) {
	return request[Envelope[ChatPresenceData]](ctx, r.t, "GET", presencePath(s)+"/"+escaped(id), nil, nil, options(o))
}
func (r *Presence) Subscribe(ctx context.Context, s, id string, o ...RequestOptions) (Response[PresenceMutationResult], error) {
	return request[PresenceMutationResult](ctx, r.t, "POST", presencePath(s)+"/"+escaped(id)+"/subscribe", nil, nil, options(o))
}
