package polymorfa

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
)

const CallsMediaSubprotocol = "pmfa.calls.v2"
const CallsDefaultSampleRate = 16000

type CallsClientConfig struct {
	Config       Config
	Session      string
	Participant  string
	ReadyTimeout time.Duration
}
type CallsClient struct {
	messaging    *MessagingClient
	session      string
	participant  string
	readyTimeout time.Duration
}

func NewCallsClient(c CallsClientConfig) (*CallsClient, error) {
	m, err := NewMessagingClient(c.Config)
	if err != nil {
		return nil, err
	}
	if strings.TrimSpace(c.Session) == "" {
		return nil, configuration("session", "Calls requires a session.")
	}
	if c.Participant != "" {
		if err = m.VoIP().participant(c.Participant); err != nil {
			return nil, err
		}
	}
	if c.ReadyTimeout == 0 {
		c.ReadyTimeout = 10 * time.Second
	}
	if c.ReadyTimeout < 0 {
		return nil, configuration("readyTimeout", "Ready timeout must be positive.")
	}
	return &CallsClient{m, c.Session, c.Participant, c.ReadyTimeout}, nil
}
func (c *CallsClient) Place(ctx context.Context, b PlaceCallRequest, o ...RequestOptions) (Response[Envelope[PlacedCall]], error) {
	b.Session = c.session
	b.Participant = c.participant
	opts, err := idempotent(options(o))
	if err != nil {
		return Response[Envelope[PlacedCall]]{}, err
	}
	return c.messaging.VoIP().Place(ctx, b, opts)
}
func (c *CallsClient) Answer(ctx context.Context, id string, b AcceptCallRequest, o ...RequestOptions) (Response[Envelope[AcceptedCall]], error) {
	b.Participant = c.participant
	return c.messaging.VoIP().Accept(ctx, id, b, o...)
}
func (c *CallsClient) Reject(ctx context.Context, id string, o ...RequestOptions) (Response[Success], error) {
	return c.messaging.VoIP().Reject(ctx, id, RejectCallRequest{c.participant}, o...)
}
func (c *CallsClient) End(ctx context.Context, id string, o ...RequestOptions) (Response[Success], error) {
	return c.messaging.VoIP().End(ctx, id, o...)
}
func (c *CallsClient) socketURL(path string) string {
	u := *c.messaging.t.base
	u.Path, _ = url.PathUnescape(path)
	u.RawPath = path
	u.RawQuery = ""
	u.Fragment = ""
	if u.Scheme == "https" {
		u.Scheme = "wss"
	} else {
		u.Scheme = "ws"
	}
	return u.String()
}

type LifecycleFrame struct {
	Type         string            `json:"type"`
	Session      string            `json:"session,omitempty"`
	Participant  string            `json:"participant,omitempty"`
	Event        string            `json:"event,omitempty"`
	CallID       string            `json:"callId,omitempty"`
	Payload      json.RawMessage   `json:"payload,omitempty"`
	Timestamp    string            `json:"timestamp,omitempty"`
	ConnectionID string            `json:"connectionId,omitempty"`
	Candidate    *TrickleCandidate `json:"candidate,omitempty"`
	Code         string            `json:"code,omitempty"`
	Message      string            `json:"message,omitempty"`
}
type TrickleCandidate struct {
	Candidate     string `json:"candidate"`
	SDPMid        string `json:"sdpMid,omitempty"`
	SDPMLineIndex *int   `json:"sdpMLineIndex,omitempty"`
}
type CallsLifecycle struct{ conn *websocket.Conn }

func (c *CallsClient) Connect(ctx context.Context) (*CallsLifecycle, error) {
	u := c.socketURL("/voip/ws")
	if c.messaging.t.config.Credential.Kind != ClientToken {
		u += "?session=" + url.QueryEscape(c.session)
		if c.participant != "" {
			u += "&participant=" + url.QueryEscape(c.participant)
		}
	}
	ready, cancel := context.WithTimeout(ctx, c.readyTimeout)
	defer cancel()
	conn, _, err := websocket.Dial(ready, u, &websocket.DialOptions{HTTPClient: c.messaging.t.client})
	if err != nil {
		return nil, &Error{Kind: ConnectionError, Message: "Calls lifecycle socket could not connect."}
	}
	if err = wsjson.Write(ready, conn, struct {
		Type  string `json:"type"`
		Token string `json:"token"`
	}{"auth", c.messaging.t.config.Credential.Value}); err != nil {
		conn.CloseNow()
		return nil, &Error{Kind: ConnectionError, Message: "Calls lifecycle authentication could not be sent."}
	}
	var frame LifecycleFrame
	if err = wsjson.Read(ready, conn, &frame); err != nil || frame.Type != "ready" {
		conn.CloseNow()
		return nil, &Error{Kind: AuthenticationError, Code: "calls_authentication_failed", Message: "Calls lifecycle authentication was not confirmed."}
	}
	return &CallsLifecycle{conn}, nil
}
func (l *CallsLifecycle) Next(ctx context.Context) (LifecycleFrame, error) {
	for {
		var frame LifecycleFrame
		if err := wsjson.Read(ctx, l.conn, &frame); err != nil {
			return frame, callSocketError(err)
		}
		switch frame.Type {
		case "ready", "event", "candidate", "error", "pong":
			return frame, nil
		}
	}
}
func (l *CallsLifecycle) Ping(ctx context.Context) error {
	return wsjson.Write(ctx, l.conn, struct {
		Type string `json:"type"`
	}{"ping"})
}
func (l *CallsLifecycle) SendCandidate(ctx context.Context, id, connection string, candidate TrickleCandidate) error {
	if !connectionPattern.MatchString(connection) {
		return validation("Invalid connection ID.")
	}
	return wsjson.Write(ctx, l.conn, struct {
		Type         string           `json:"type"`
		CallID       string           `json:"callId"`
		ConnectionID string           `json:"connectionId"`
		Candidate    TrickleCandidate `json:"candidate"`
	}{"candidate", id, connection, candidate})
}
func (l *CallsLifecycle) Close() error { return l.conn.Close(websocket.StatusNormalClosure, "") }
func callSocketError(err error) error {
	kind := ConnectionError
	code := "calls_disconnected"
	switch websocket.CloseStatus(err) {
	case 4401:
		kind = AuthenticationError
		code = "calls_authentication_failed"
	case 4403:
		kind = AuthorizationError
		code = "calls_refused"
	case 4400, 4404, 4409:
		kind = ConflictError
		code = "calls_unavailable"
	}
	return &Error{Kind: kind, Code: code, Message: "Calls socket closed."}
}
func CreateConnectionID() (string, error) {
	var b [18]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", &Error{Kind: ConnectionError, Message: "Could not create connection ID."}
	}
	return base64.RawURLEncoding.EncodeToString(b[:]), nil
}

type MediaControlFrame struct {
	Type                  string           `json:"type"`
	CallID                string           `json:"callId,omitempty"`
	ConnectionID          string           `json:"connectionId,omitempty"`
	SampleRate            int              `json:"sampleRate,omitempty"`
	Video                 *bool            `json:"video,omitempty"`
	AudioMuted            *bool            `json:"audioMuted,omitempty"`
	VideoEnabled          *bool            `json:"videoEnabled,omitempty"`
	ScreenSharing         *bool            `json:"screenSharing,omitempty"`
	RequestID             string           `json:"requestId,omitempty"`
	Code                  string           `json:"code,omitempty"`
	Message               string           `json:"message,omitempty"`
	Participant           *CallParticipant `json:"participant,omitempty"`
	ParticipantID         string           `json:"participantId,omitempty"`
	Source                uint32           `json:"source,omitempty"`
	ConnectionParticipant string           `json:"connectionParticipant,omitempty"`
	Reason                string           `json:"reason,omitempty"`
	Emoji                 *string          `json:"emoji,omitempty"`
	Self                  *bool            `json:"self,omitempty"`
	Raised                *bool            `json:"raised,omitempty"`
	Supported             *bool            `json:"supported,omitempty"`
}
type VideoFrame struct {
	Codec       byte
	Keyframe    bool
	Source      uint32
	TimestampUS uint64
	Data        []byte
}
type CallsMediaFrame struct {
	Audio   []int16
	Video   *VideoFrame
	Control *MediaControlFrame
}
type CallsMediaSocket struct {
	conn         *websocket.Conn
	ConnectionID string
	SampleRate   int
	Video        bool
	mu           sync.Mutex
}

func (c *CallsClient) AttachMedia(ctx context.Context, callID, connectionID string) (*CallsMediaSocket, error) {
	if connectionID == "" {
		var err error
		connectionID, err = CreateConnectionID()
		if err != nil {
			return nil, err
		}
	}
	if !connectionPattern.MatchString(connectionID) {
		return nil, validation("Invalid media connection ID.")
	}
	ready, cancel := context.WithTimeout(ctx, c.readyTimeout)
	defer cancel()
	conn, _, err := websocket.Dial(ready, c.socketURL("/voip/calls/"+escaped(callID)+"/media"), &websocket.DialOptions{Subprotocols: []string{CallsMediaSubprotocol}, HTTPClient: c.messaging.t.client})
	if err != nil {
		return nil, &Error{Kind: ConnectionError, Message: "Call media socket could not connect."}
	}
	conn.SetReadLimit(16 << 20)
	if conn.Subprotocol() != CallsMediaSubprotocol {
		conn.CloseNow()
		return nil, &Error{Kind: ServerError, Code: "invalid_response", Message: "Call media subprotocol was not selected."}
	}
	auth := struct {
		Type         string `json:"type"`
		Token        string `json:"token"`
		ConnectionID string `json:"connectionId"`
		Participant  string `json:"participant,omitempty"`
	}{"auth", c.messaging.t.config.Credential.Value, connectionID, c.participant}
	if err = wsjson.Write(ready, conn, auth); err != nil {
		conn.CloseNow()
		return nil, &Error{Kind: ConnectionError, Message: "Call media authentication could not be sent."}
	}
	var frame MediaControlFrame
	if err = wsjson.Read(ready, conn, &frame); err != nil || frame.Type != "ready" || frame.SampleRate <= 0 || frame.Video == nil {
		conn.CloseNow()
		return nil, &Error{Kind: AuthenticationError, Code: "calls_media_not_ready", Message: "Call media was not confirmed ready."}
	}
	return &CallsMediaSocket{conn: conn, ConnectionID: connectionID, SampleRate: frame.SampleRate, Video: *frame.Video}, nil
}
func EncodeAudioFrame(pcm []int16) []byte {
	out := make([]byte, 1+2*len(pcm))
	out[0] = 1
	for i, v := range pcm {
		binary.LittleEndian.PutUint16(out[1+i*2:], uint16(v))
	}
	return out
}
func EncodeVideoFrame(v VideoFrame) []byte {
	out := make([]byte, 15+len(v.Data))
	out[0] = 2
	codec := v.Codec
	if codec == 0 {
		codec = 1
	}
	out[1] = codec
	if v.Keyframe {
		out[2] = 1
	}
	binary.BigEndian.PutUint32(out[3:], v.Source)
	binary.BigEndian.PutUint64(out[7:], v.TimestampUS)
	copy(out[15:], v.Data)
	return out
}
func DecodeMediaFrame(bytes []byte) (CallsMediaFrame, error) {
	if len(bytes) < 1 {
		return CallsMediaFrame{}, validation("Empty media frame.")
	}
	switch bytes[0] {
	case 1:
		if (len(bytes)-1)%2 != 0 {
			return CallsMediaFrame{}, validation("Malformed audio frame.")
		}
		pcm := make([]int16, (len(bytes)-1)/2)
		for i := range pcm {
			pcm[i] = int16(binary.LittleEndian.Uint16(bytes[1+i*2:]))
		}
		return CallsMediaFrame{Audio: pcm}, nil
	case 2:
		if len(bytes) <= 15 || bytes[1] != 1 {
			return CallsMediaFrame{}, validation("Malformed video frame.")
		}
		return CallsMediaFrame{Video: &VideoFrame{Codec: bytes[1], Keyframe: bytes[2]&1 != 0, Source: binary.BigEndian.Uint32(bytes[3:]), TimestampUS: binary.BigEndian.Uint64(bytes[7:]), Data: append([]byte(nil), bytes[15:]...)}}, nil
	}
	return CallsMediaFrame{}, validation("Unknown media frame kind.")
}
func (m *CallsMediaSocket) Read(ctx context.Context) (CallsMediaFrame, error) {
	kind, bytes, err := m.conn.Read(ctx)
	if err != nil {
		return CallsMediaFrame{}, callSocketError(err)
	}
	if kind == websocket.MessageBinary {
		return DecodeMediaFrame(bytes)
	}
	var frame MediaControlFrame
	if err = json.Unmarshal(bytes, &frame); err != nil {
		return CallsMediaFrame{}, validation("Invalid call control frame.")
	}
	return CallsMediaFrame{Control: &frame}, nil
}
func (m *CallsMediaSocket) WriteAudio(ctx context.Context, pcm []int16) error {
	return m.conn.Write(ctx, websocket.MessageBinary, EncodeAudioFrame(pcm))
}
func (m *CallsMediaSocket) WriteVideo(ctx context.Context, v VideoFrame) error {
	if v.Codec != 0 && v.Codec != 1 || len(v.Data) == 0 {
		return validation("Video requires an H.264 access unit.")
	}
	return m.conn.Write(ctx, websocket.MessageBinary, EncodeVideoFrame(v))
}
func (m *CallsMediaSocket) Ping(ctx context.Context) error {
	return wsjson.Write(ctx, m.conn, struct {
		Type string `json:"type"`
	}{"ping"})
}
func (m *CallsMediaSocket) Leave(ctx context.Context) error {
	err := wsjson.Write(ctx, m.conn, struct {
		Type string `json:"type"`
	}{"leave"})
	m.conn.Close(websocket.StatusNormalClosure, "")
	return err
}
func (m *CallsMediaSocket) Close() error { return m.conn.Close(websocket.StatusNormalClosure, "") }

// UpdateMediaState is ordered. The caller must not also Read while it waits.
// A timeout is an unknown outcome; the command is never automatically replayed.
func (m *CallsMediaSocket) UpdateMediaState(ctx context.Context, audioMuted, videoEnabled, screenSharing *bool) (MediaControlFrame, error) {
	if audioMuted == nil && videoEnabled == nil && screenSharing == nil {
		return MediaControlFrame{}, validation("Specify at least one media preference.")
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	id, err := CreateConnectionID()
	if err != nil {
		return MediaControlFrame{}, err
	}
	budget, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	frame := MediaControlFrame{Type: "media_state", RequestID: id, AudioMuted: audioMuted, VideoEnabled: videoEnabled, ScreenSharing: screenSharing}
	if err = wsjson.Write(budget, m.conn, frame); err != nil {
		return MediaControlFrame{}, callSocketError(err)
	}
	for {
		next, err := m.Read(budget)
		if err != nil {
			return MediaControlFrame{}, &Error{Kind: TimeoutError, Code: "media_control_unknown", Message: "Media control was not confirmed."}
		}
		if next.Control == nil || next.Control.RequestID != id {
			continue
		}
		reply := next.Control
		if reply.Type != "media_state" || reply.AudioMuted == nil || reply.VideoEnabled == nil || audioMuted != nil && *reply.AudioMuted != *audioMuted || videoEnabled != nil && *reply.VideoEnabled != *videoEnabled || screenSharing != nil && (reply.ScreenSharing == nil && *screenSharing || reply.ScreenSharing != nil && *reply.ScreenSharing != *screenSharing) {
			return *reply, &Error{Kind: ConflictError, Code: "media_control_failed", Message: "Media control was not confirmed."}
		}
		return *reply, nil
	}
}
