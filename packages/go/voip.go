package polymorfa

import (
	"context"
	"encoding/json"
	"regexp"
	"strings"
)

type PlaceCallRequest struct {
	To           string   `json:"to,omitempty"`
	Participants []string `json:"participants,omitempty"`
	GroupID      string   `json:"groupId,omitempty"`
	Session      string   `json:"session,omitempty"`
	Video        *bool    `json:"video,omitempty"`
	Exclusive    *bool    `json:"exclusive,omitempty"`
	Participant  string   `json:"participant,omitempty"`
}
type PlacedCall struct {
	CallID  string `json:"callId"`
	Session string `json:"session"`
	Video   bool   `json:"video"`
}
type AcceptCallRequest struct {
	Exclusive   *bool  `json:"exclusive,omitempty"`
	Video       *bool  `json:"video,omitempty"`
	Participant string `json:"participant,omitempty"`
}
type AcceptedCall struct {
	Answered   bool   `json:"answered"`
	AnsweredBy string `json:"answeredBy"`
	Exclusive  bool   `json:"exclusive"`
}
type RejectCallRequest struct {
	Participant string `json:"participant,omitempty"`
}
type LeaveCallRequest struct {
	ConnectionID string `json:"connectionId"`
	Participant  string `json:"participant,omitempty"`
}
type CallReportClient struct {
	SDK      string `json:"sdk"`
	Version  string `json:"version"`
	Platform string `json:"platform"`
}
type CallQuality struct {
	RTTMS           *int   `json:"rttMs,omitempty"`
	JitterMS        *int   `json:"jitterMs,omitempty"`
	PacketsLost     *int64 `json:"packetsLost,omitempty"`
	PacketsReceived *int64 `json:"packetsReceived,omitempty"`
	AudioCodec      string `json:"audioCodec,omitempty"`
	VideoCodec      string `json:"videoCodec,omitempty"`
	CandidateType   string `json:"candidateType,omitempty"`
	Reconnects      *int   `json:"reconnects,omitempty"`
}
type CallReportError struct {
	Code string `json:"code"`
}
type CallReportRequest struct {
	Kind         string            `json:"kind"`
	ConnectionID string            `json:"connectionId"`
	Participant  string            `json:"participant,omitempty"`
	Client       *CallReportClient `json:"client,omitempty"`
	Quality      *CallQuality      `json:"quality,omitempty"`
	Error        *CallReportError  `json:"error,omitempty"`
}
type AddCallParticipantRequest struct {
	To string `json:"to"`
}
type CallParticipant struct {
	HandRaised  *bool  `json:"handRaised,omitempty"`
	ID          string `json:"id"`
	PhoneNumber string `json:"phoneNumber,omitempty"`
	BSUID       string `json:"bsuid,omitempty"`
	Username    string `json:"username,omitempty"`
	AudioMuted  bool   `json:"audioMuted"`
	Video       bool   `json:"video"`
	State       string `json:"state"`
}
type CallReactionRequest struct {
	ConnectionID string `json:"connectionId"`
	Participant  string `json:"participant,omitempty"`
	Emoji        string `json:"emoji"`
}
type HandRaisedRequest struct {
	ConnectionID string `json:"connectionId"`
	Participant  string `json:"participant,omitempty"`
	Raised       bool   `json:"raised"`
}
type CreateCallLinkRequest struct {
	Session string `json:"session"`
	Video   *bool  `json:"video,omitempty"`
}
type PreviewCallLinkRequest struct {
	CreateCallLinkRequest
	Token string `json:"token"`
}
type CreatedCallLink struct {
	Session string `json:"session"`
	Token   string `json:"token"`
	URL     string `json:"url"`
	Video   bool   `json:"video"`
}
type PreviewedCallLink struct {
	Session          string                `json:"session"`
	Video            bool                  `json:"video"`
	Creator          ConversationReference `json:"creator"`
	ApprovalRequired bool                  `json:"approvalRequired"`
	IsAdmin          bool                  `json:"isAdmin"`
}
type SessionCallSettings struct {
	CallsEnabled      bool    `json:"callsEnabled"`
	ConferenceMode    bool    `json:"conferenceMode"`
	InboundRoute      string  `json:"inboundRoute"`
	SIPTrunkID        *string `json:"sipTrunkId"`
	SIPClaim          bool    `json:"sipClaim"`
	HostCloudAPICalls bool    `json:"hostCloudApiCalls"`
	Revision          int64   `json:"revision"`
	UpdatedAt         *string `json:"updatedAt"`
}

// NullableString preserves the difference between omitted and explicitly null.
type NullableString struct{ Value *string }

func (v NullableString) MarshalJSON() ([]byte, error) { return json.Marshal(v.Value) }

type UpdateCallSettingsRequest struct {
	CallsEnabled      *bool           `json:"callsEnabled,omitempty"`
	ConferenceMode    *bool           `json:"conferenceMode,omitempty"`
	InboundRoute      string          `json:"inboundRoute,omitempty"`
	SIPTrunkID        *NullableString `json:"sipTrunkId,omitempty"`
	SIPClaim          *bool           `json:"sipClaim,omitempty"`
	HostCloudAPICalls *bool           `json:"hostCloudApiCalls,omitempty"`
	ExpectedRevision  *int64          `json:"expectedRevision,omitempty"`
}
type CallPermissionLimit struct {
	Period     string  `json:"period"`
	MaxAllowed int     `json:"maxAllowed"`
	Used       int     `json:"used"`
	ResetsAt   *string `json:"resetsAt"`
}
type CallPermissionAction struct {
	Allowed bool                  `json:"allowed"`
	Limits  []CallPermissionLimit `json:"limits"`
}
type CallPermissionState struct {
	Status    string  `json:"status"`
	ExpiresAt *string `json:"expiresAt"`
	Source    *string `json:"source"`
	UpdatedAt *string `json:"updatedAt"`
	CheckedAt *string `json:"checkedAt"`
	Fresh     bool    `json:"fresh"`
	Actions   *struct {
		RequestPermission *CallPermissionAction `json:"requestPermission"`
		StartCall         *CallPermissionAction `json:"startCall"`
	} `json:"actions"`
}
type CallPermission struct {
	CallPermissionState
	Conversation ConversationReference `json:"conversation"`
}
type CheckCallRequest struct {
	Session string `json:"session"`
	To      string `json:"to"`
}
type CallCheck struct {
	Allowed    bool                 `json:"allowed"`
	Refusal    *string              `json:"refusal"`
	Permission *CallPermissionState `json:"permission"`
}
type VoIP struct{ t *transport }

var participantPattern = regexp.MustCompile(`^[A-Za-z0-9._:@-]{1,128}$`)
var connectionPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{8,64}$`)
var targetPattern = regexp.MustCompile(`^(?:\+[1-9][0-9]{1,14}|[1-9][0-9]{0,18})$`)
var groupPattern = regexp.MustCompile(`^[1-9][0-9]{0,18}$`)

func (r *VoIP) participant(p string) error {
	if p == "" {
		return nil
	}
	if r.t.config.Credential.Kind == ClientToken {
		return configuration("participant", "A client token cannot set participant.")
	}
	if !participantPattern.MatchString(p) {
		return validation("Invalid participant reference.")
	}
	return nil
}
func callPath(id string) string { return "/messaging/voip/calls/" + escaped(id) }
func (r *VoIP) Place(ctx context.Context, b PlaceCallRequest, o ...RequestOptions) (Response[Envelope[PlacedCall]], error) {
	if r.t.config.Credential.Kind != ClientToken && strings.TrimSpace(b.Session) == "" {
		return Response[Envelope[PlacedCall]]{}, validation("Server call placement requires session.")
	}
	if err := r.participant(b.Participant); err != nil {
		return Response[Envelope[PlacedCall]]{}, err
	}
	valid := false
	if b.GroupID != "" {
		valid = b.To == "" && b.Participants == nil && groupPattern.MatchString(b.GroupID)
	} else if b.Participants != nil {
		valid = b.To == "" && len(b.Participants) >= 2 && len(b.Participants) <= 31
		seen := map[string]bool{}
		for _, p := range b.Participants {
			if !targetPattern.MatchString(p) || seen[p] {
				valid = false
			}
			seen[p] = true
		}
	} else {
		valid = targetPattern.MatchString(b.To)
	}
	if !valid {
		return Response[Envelope[PlacedCall]]{}, validation("Provide to, one public groupId, or 2 to 31 distinct participants.")
	}
	return request[Envelope[PlacedCall]](ctx, r.t, "POST", "/messaging/voip/calls", nil, b, options(o))
}
func (r *VoIP) Accept(ctx context.Context, id string, b AcceptCallRequest, o ...RequestOptions) (Response[Envelope[AcceptedCall]], error) {
	if err := r.participant(b.Participant); err != nil {
		return Response[Envelope[AcceptedCall]]{}, err
	}
	return request[Envelope[AcceptedCall]](ctx, r.t, "POST", callPath(id)+"/accept", nil, b, options(o))
}
func (r *VoIP) Reject(ctx context.Context, id string, b RejectCallRequest, o ...RequestOptions) (Response[Success], error) {
	if err := r.participant(b.Participant); err != nil {
		return Response[Success]{}, err
	}
	var body any
	if b.Participant != "" {
		body = b
	}
	return request[Success](ctx, r.t, "POST", callPath(id)+"/reject", nil, body, options(o))
}
func (r *VoIP) Leave(ctx context.Context, id string, b LeaveCallRequest, o ...RequestOptions) (Response[Success], error) {
	if err := r.participant(b.Participant); err != nil {
		return Response[Success]{}, err
	}
	if !connectionPattern.MatchString(b.ConnectionID) {
		return Response[Success]{}, validation("connectionId must be 8 to 64 letters, digits, underscores, or hyphens.")
	}
	return request[Success](ctx, r.t, "POST", callPath(id)+"/leave", nil, b, options(o))
}
func (r *VoIP) End(ctx context.Context, id string, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "DELETE", callPath(id), nil, nil, options(o))
}
func (r *VoIP) AddParticipant(ctx context.Context, id string, b AddCallParticipantRequest, o ...RequestOptions) (Response[Envelope[CallParticipant]], error) {
	return request[Envelope[CallParticipant]](ctx, r.t, "POST", callPath(id)+"/participants", nil, b, options(o))
}
func (r *VoIP) RingParticipant(ctx context.Context, id string, b AddCallParticipantRequest, o ...RequestOptions) (Response[Success], error) {
	return request[Success](ctx, r.t, "POST", callPath(id)+"/participants/ring", nil, b, options(o))
}
func (r *VoIP) SendReaction(ctx context.Context, id string, b CallReactionRequest, o ...RequestOptions) (Response[Success], error) {
	if err := r.participant(b.Participant); err != nil {
		return Response[Success]{}, err
	}
	allowed := map[string]bool{"": true, "👍": true, "❤️": true, "😂": true, "😮": true, "😢": true, "🙏": true}
	if !connectionPattern.MatchString(b.ConnectionID) || !allowed[b.Emoji] {
		return Response[Success]{}, validation("Invalid call reaction or connection ID.")
	}
	return request[Success](ctx, r.t, "POST", callPath(id)+"/reaction", nil, b, noRetry(options(o)))
}
func (r *VoIP) SetHandRaised(ctx context.Context, id string, b HandRaisedRequest, o ...RequestOptions) (Response[Success], error) {
	if err := r.participant(b.Participant); err != nil {
		return Response[Success]{}, err
	}
	if !connectionPattern.MatchString(b.ConnectionID) {
		return Response[Success]{}, validation("Invalid connection ID.")
	}
	return request[Success](ctx, r.t, "POST", callPath(id)+"/hand", nil, b, noRetry(options(o)))
}
func (r *VoIP) RetrieveCallPermission(ctx context.Context, s, to string, o ...RequestOptions) (Response[Envelope[CallPermission]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[CallPermission]]{}, err
	}
	if strings.TrimSpace(s) == "" || strings.TrimSpace(to) == "" {
		return Response[Envelope[CallPermission]]{}, validation("session and to are required.")
	}
	return request[Envelope[CallPermission]](ctx, r.t, "GET", "/messaging/"+escaped(s)+"/call-permissions/"+escaped(to), nil, nil, options(o))
}
func (r *VoIP) Check(ctx context.Context, b CheckCallRequest, o ...RequestOptions) (Response[Envelope[CallCheck]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[CallCheck]]{}, err
	}
	if strings.TrimSpace(b.Session) == "" || strings.TrimSpace(b.To) == "" {
		return Response[Envelope[CallCheck]]{}, validation("session and to are required.")
	}
	return request[Envelope[CallCheck]](ctx, r.t, "POST", "/messaging/voip/calls/check", nil, b, options(o))
}
func (r *VoIP) RetrieveCallSettings(ctx context.Context, s string, o ...RequestOptions) (Response[Envelope[SessionCallSettings]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[SessionCallSettings]]{}, err
	}
	return request[Envelope[SessionCallSettings]](ctx, r.t, "GET", sessionPath(s)+"/call-settings", nil, nil, options(o))
}
func (r *VoIP) UpdateCallSettings(ctx context.Context, s string, b UpdateCallSettingsRequest, o ...RequestOptions) (Response[Envelope[SessionCallSettings]], error) {
	if err := serverOnly(r.t); err != nil {
		return Response[Envelope[SessionCallSettings]]{}, err
	}
	if b.CallsEnabled == nil && b.ConferenceMode == nil && b.InboundRoute == "" && b.SIPTrunkID == nil && b.SIPClaim == nil && b.HostCloudAPICalls == nil {
		return Response[Envelope[SessionCallSettings]]{}, validation("Send at least one call setting.")
	}
	if b.InboundRoute != "" && b.InboundRoute != "clients" && b.InboundRoute != "sip_trunk" || b.ExpectedRevision != nil && *b.ExpectedRevision < 0 {
		return Response[Envelope[SessionCallSettings]]{}, validation("Invalid inboundRoute or expectedRevision.")
	}
	return request[Envelope[SessionCallSettings]](ctx, r.t, "PUT", sessionPath(s)+"/call-settings", nil, b, options(o))
}
func (r *VoIP) assertLink(b CreateCallLinkRequest, o RequestOptions) error {
	if err := serverOnly(r.t); err != nil {
		return err
	}
	if strings.TrimSpace(b.Session) == "" || len(b.Session) > 128 {
		return validation("Call links require a session of at most 128 characters.")
	}
	if o.IdempotencyKey != "" || o.Headers.Get("Idempotency-Key") != "" {
		return validation("Call links do not support Idempotency-Key; never retry an unknown outcome.")
	}
	return nil
}
func (r *VoIP) CreateCallLink(ctx context.Context, b CreateCallLinkRequest, opts ...RequestOptions) (Response[Envelope[CreatedCallLink]], error) {
	o := options(opts)
	if err := r.assertLink(b, o); err != nil {
		return Response[Envelope[CreatedCallLink]]{}, err
	}
	return request[Envelope[CreatedCallLink]](ctx, r.t, "POST", "/messaging/voip/call-links", nil, b, noRetry(o))
}
func (r *VoIP) PreviewCallLink(ctx context.Context, b PreviewCallLinkRequest, opts ...RequestOptions) (Response[Envelope[PreviewedCallLink]], error) {
	o := options(opts)
	if err := r.assertLink(b.CreateCallLinkRequest, o); err != nil {
		return Response[Envelope[PreviewedCallLink]]{}, err
	}
	if !regexp.MustCompile(`^[A-Za-z0-9_-]{1,256}$`).MatchString(b.Token) {
		return Response[Envelope[PreviewedCallLink]]{}, validation("Provide a valid call-link token.")
	}
	return request[Envelope[PreviewedCallLink]](ctx, r.t, "POST", "/messaging/voip/call-links/preview", nil, b, noRetry(o))
}
func (r *VoIP) Report(ctx context.Context, id string, b CallReportRequest, o ...RequestOptions) (Response[Success], error) {
	if err := r.participant(b.Participant); err != nil {
		return Response[Success]{}, err
	}
	if !connectionPattern.MatchString(b.ConnectionID) {
		return Response[Success]{}, validation("Invalid report connectionId.")
	}
	if b.Client != nil {
		if !regexp.MustCompile(`^[a-z0-9@/._-]{1,32}$`).MatchString(b.Client.SDK) || len(b.Client.Version) > 32 || !regexp.MustCompile(`^[0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6}(?:[-+][0-9A-Za-z.+-]{1,24})?$`).MatchString(b.Client.Version) || (b.Client.Platform != "browser" && b.Client.Platform != "node" && b.Client.Platform != "other") {
			return Response[Success]{}, validation("Invalid report client metadata.")
		}
	}
	if b.Kind == "error" {
		codes := map[string]bool{"media_permission_denied": true, "device_not_found": true, "device_in_use": true, "ice_failed": true, "negotiation_failed": true, "media_timeout": true, "reconnect_exhausted": true, "token_refresh_failed": true, "unsupported_browser": true, "other": true}
		if b.Error == nil || b.Quality != nil || !codes[b.Error.Code] {
			return Response[Success]{}, validation("An error report needs a known error code.")
		}
	} else if b.Kind == "quality" && b.Quality != nil && b.Error == nil {
		q := b.Quality
		raw, _ := json.Marshal(q)
		var fields map[string]json.RawMessage
		json.Unmarshal(raw, &fields)
		if len(fields) == 0 {
			return Response[Success]{}, validation("A quality report needs at least one figure.")
		}
		for _, n := range []*int{q.RTTMS, q.JitterMS} {
			if n != nil && (*n < 0 || *n > 60000) {
				return Response[Success]{}, validation("RTT and jitter must be 0 to 60000.")
			}
		}
		for _, n := range []*int64{q.PacketsLost, q.PacketsReceived} {
			if n != nil && (*n < 0 || *n > 2147483647) {
				return Response[Success]{}, validation("Packet figures must be 0 to 2147483647.")
			}
		}
		codec := regexp.MustCompile(`^[A-Za-z0-9/.-]{1,32}$`)
		if q.Reconnects != nil && (*q.Reconnects < 0 || *q.Reconnects > 1000) || q.AudioCodec != "" && !codec.MatchString(q.AudioCodec) || q.VideoCodec != "" && !codec.MatchString(q.VideoCodec) {
			return Response[Success]{}, validation("Invalid quality figures.")
		}
		if q.CandidateType != "" && q.CandidateType != "host" && q.CandidateType != "srflx" && q.CandidateType != "prflx" && q.CandidateType != "relay" {
			return Response[Success]{}, validation("Invalid ICE candidate type.")
		}
	} else {
		return Response[Success]{}, validation("kind must be quality or error with the matching payload.")
	}
	return request[Success](ctx, r.t, "POST", callPath(id)+"/reports", nil, b, options(o))
}
