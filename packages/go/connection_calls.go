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

// ConnectionCallRecord is one call on a Connection, read from the Connection's data region.
type ConnectionCallRecord struct {
	CallID          string    `json:"callId"`
	ProjectID       string    `json:"projectId"`
	ConnectionID    string    `json:"connectionId"`
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

// ConnectionCallsPage is one page of a Connection's calls, newest first.
type ConnectionCallsPage struct {
	Success    bool                   `json:"success"`
	Data       []ConnectionCallRecord `json:"data"`
	NextCursor *string                `json:"nextCursor"`
}

// ListConnectionCallsParams filters a Connection's calls. Since and Until are ISO
// 8601 times bounding when a call started.
type ListConnectionCallsParams struct {
	ListParams
	Direction string
	Outcome   string
	Since     string
	Until     string
}

func (p ListConnectionCallsParams) query() url.Values {
	q := p.ListParams.query()
	setString(q, "direction", p.Direction)
	setString(q, "outcome", p.Outcome)
	setString(q, "since", p.Since)
	setString(q, "until", p.Until)
	return q
}

// ConnectionCalls reads a Connection's call history with the other party's identity.
// Client tokens need the read_calls action.
type ConnectionCalls struct{ t *transport }

// List returns one page of the Connection's calls, newest first.
func (r *ConnectionCalls) List(ctx context.Context, s string, p ListConnectionCallsParams, o ...RequestOptions) (Response[ConnectionCallsPage], error) {
	return request[ConnectionCallsPage](ctx, r.t, "GET", "/messaging/"+escaped(s)+"/calls", p.query(), nil, options(o))
}
