package polymorfa

import (
	"context"
	"net/url"
)

// CallPeer is the other party on a call: user ID, phone number or username,
// as the call reported them.
type CallPeer struct {
	ID          string `json:"id,omitempty"`
	PhoneNumber string `json:"phoneNumber,omitempty"`
	Username    string `json:"username,omitempty"`
}

// SessionCallRecord is one call on a number, read from the number's data region.
type SessionCallRecord struct {
	CallID          string    `json:"callId"`
	ProjectID       string    `json:"projectId"`
	SessionID       string    `json:"sessionId"`
	Direction       string    `json:"direction"`
	Upstream        string    `json:"upstream"`
	Outcome         string    `json:"outcome"`
	State           string    `json:"state"`
	HasVideo        bool      `json:"hasVideo"`
	Peer            *CallPeer `json:"peer"`
	StartedAt       string    `json:"startedAt"`
	ConnectedAt     *string   `json:"connectedAt"`
	EndedAt         *string   `json:"endedAt"`
	DurationSeconds *int      `json:"durationSeconds"`
	EndReason       *string   `json:"endReason"`
}

// SessionCallsPage is one page of a number's calls, newest first.
type SessionCallsPage struct {
	Success    bool                `json:"success"`
	Data       []SessionCallRecord `json:"data"`
	NextCursor *string             `json:"nextCursor"`
}

// ListSessionCallsParams filters a number's calls. Since and Until are ISO
// 8601 times bounding when a call started.
type ListSessionCallsParams struct {
	ListParams
	Direction string
	Outcome   string
	Since     string
	Until     string
}

func (p ListSessionCallsParams) query() url.Values {
	q := p.ListParams.query()
	setString(q, "direction", p.Direction)
	setString(q, "outcome", p.Outcome)
	setString(q, "since", p.Since)
	setString(q, "until", p.Until)
	return q
}

// SessionCalls reads a number's call history with the other party's identity.
// Client tokens need the read_calls action.
type SessionCalls struct{ t *transport }

// List returns one page of the number's calls, newest first.
func (r *SessionCalls) List(ctx context.Context, s string, p ListSessionCallsParams, o ...RequestOptions) (Response[SessionCallsPage], error) {
	return request[SessionCallsPage](ctx, r.t, "GET", "/messaging/"+escaped(s)+"/calls", p.query(), nil, options(o))
}
