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
	Config        Config
	Session       string
	Participant   string
	ReadyTimeout  time.Duration
	TokenProvider CallsTokenProvider
}
type CallsClient struct {
	messaging    *MessagingClient
	session      string
	participant  string
	readyTimeout time.Duration
	tokens       *CallsTokenSource
}

func NewCallsClient(c CallsClientConfig) (*CallsClient, error) {
	if c.TokenProvider != nil && c.Config.Credential.Value == "" {
		c.Config.Credential = Credential{Kind: ClientToken, Value: "pmfa_ct_provider"}
	}
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
	client := &CallsClient{messaging: m, session: c.Session, participant: c.Participant, readyTimeout: c.ReadyTimeout}
	if c.TokenProvider != nil {
		client.tokens, _ = NewCallsTokenSource(c.TokenProvider)
	}
	return client, nil
}
func (c *CallsClient) Place(ctx context.Context, b PlaceCallRequest, o ...RequestOptions) (Response[Envelope[PlacedCall]], error) {
	b.Session = c.session
	b.Participant = c.participant
	opts, err := idempotent(options(o))
	if err != nil {
		return Response[Envelope[PlacedCall]]{}, err
	}
	m, _, err := c.api(ctx, false)
	if err != nil {
		return Response[Envelope[PlacedCall]]{}, err
	}
	return m.VoIP().Place(ctx, b, opts)
}
func (c *CallsClient) Answer(ctx context.Context, id string, b AcceptCallRequest, o ...RequestOptions) (Response[Envelope[AcceptedCall]], error) {
	b.Participant = c.participant
	m, _, err := c.api(ctx, false)
	if err != nil {
		return Response[Envelope[AcceptedCall]]{}, err
	}
	return m.VoIP().Accept(ctx, id, b, o...)
}
func (c *CallsClient) Reject(ctx context.Context, id string, o ...RequestOptions) (Response[Success], error) {
	m, _, err := c.api(ctx, false)
	if err != nil {
		return Response[Success]{}, err
	}
	return m.VoIP().Reject(ctx, id, RejectCallRequest{c.participant}, o...)
}
func (c *CallsClient) End(ctx context.Context, id string, o ...RequestOptions) (Response[Success], error) {
	m, _, err := c.api(ctx, false)
	if err != nil {
		return Response[Success]{}, err
	}
	return m.VoIP().End(ctx, id, o...)
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
type CallsLifecycle struct {
	conn  *websocket.Conn
	Ready LifecycleFrame
	Token CallsToken
}

func (c *CallsClient) Connect(ctx context.Context) (*CallsLifecycle, error) {
	m, token, err := c.api(ctx, false)
	if err != nil {
		return nil, err
	}
	u := c.socketURL("/voip/ws")
	if m.t.config.Credential.Kind != ClientToken {
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
	}{"auth", token.Value}); err != nil {
		conn.CloseNow()
		return nil, &Error{Kind: ConnectionError, Message: "Calls lifecycle authentication could not be sent."}
	}
	var frame LifecycleFrame
	if err = wsjson.Read(ready, conn, &frame); err != nil {
		conn.CloseNow()
		return nil, callSocketError(err)
	}
	if frame.Type != "ready" {
		conn.CloseNow()
		return nil, &Error{Kind: AuthenticationError, Code: "calls_authentication_failed", Message: "Calls lifecycle authentication was not confirmed."}
	}
	return &CallsLifecycle{conn: conn, Ready: frame, Token: token}, nil
}
func (l *CallsLifecycle) Next(ctx context.Context) (LifecycleFrame, error) {
	for {
		var frame LifecycleFrame
		if err := wsjson.Read(ctx, l.conn, &frame); err != nil {
			return frame, callSocketError(err)
		}
		if validLifecycleFrame(frame) {
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
	case 4429:
		kind = RateLimitError
		code = "calls_rate_limited"
	case 4400, 4404, 4409:
		kind = ConflictError
		code = "calls_unavailable"
	}
	return &Error{Kind: kind, Code: code, Status: int(websocket.CloseStatus(err)), Message: "Calls socket closed."}
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
	Token        CallsToken
	mu           sync.Mutex
	readerOnce   sync.Once
	frames       chan callsMediaResult
	readerDone   chan struct{}
	readerCancel context.CancelFunc
	ackMu        sync.Mutex
	ack          map[string]chan MediaControlFrame
	queueCount   int
}

func (c *CallsClient) AttachMedia(ctx context.Context, callID, connectionID string) (*CallsMediaSocket, error) {
	_, token, err := c.api(ctx, false)
	if err != nil {
		return nil, err
	}
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
	}{"auth", token.Value, connectionID, c.participant}
	if err = wsjson.Write(ready, conn, auth); err != nil {
		conn.CloseNow()
		return nil, &Error{Kind: ConnectionError, Message: "Call media authentication could not be sent."}
	}
	var frame MediaControlFrame
	if err = wsjson.Read(ready, conn, &frame); err != nil {
		conn.CloseNow()
		return nil, callSocketError(err)
	}
	if frame.Type != "ready" || frame.SampleRate <= 0 || frame.Video == nil {
		conn.CloseNow()
		return nil, &Error{Kind: AuthenticationError, Code: "calls_media_not_ready", Message: "Call media was not confirmed ready."}
	}
	return &CallsMediaSocket{conn: conn, ConnectionID: connectionID, SampleRate: frame.SampleRate, Video: *frame.Video, Token: token}, nil
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

type callsMediaResult struct {
	frame CallsMediaFrame
	err   error
}

func (m *CallsMediaSocket) startReader() {
	m.readerOnce.Do(func() {
		m.frames = make(chan callsMediaResult, 64)
		m.readerDone = make(chan struct{})
		m.ack = map[string]chan MediaControlFrame{}
		ctx, cancel := context.WithCancel(context.Background())
		m.readerCancel = cancel
		go func() {
			defer close(m.readerDone)
			defer close(m.frames)
			for {
				kind, b, err := m.conn.Read(ctx)
				if err != nil {
					select {
					case m.frames <- callsMediaResult{err: callSocketError(err)}:
					case <-ctx.Done():
					}
					return
				}
				var frame CallsMediaFrame
				if kind == websocket.MessageBinary {
					frame, err = DecodeMediaFrame(b)
					if err != nil {
						continue
					}
				} else {
					v, valid := parseMediaControlFrame(b)
					if !valid {
						continue
					}
					frame.Control = &v
					if v.Type == "media_state" || v.Type == "media_error" {
						m.ackMu.Lock()
						pending := m.ack[v.RequestID]
						if pending != nil {
							select {
							case pending <- v:
							default:
							}
						}
						m.ackMu.Unlock()
						if pending != nil {
							continue
						}
					}
				}
				select {
				case m.frames <- callsMediaResult{frame: frame}:
				case <-ctx.Done():
					return
				}
			}
		}()
	})
}
func (m *CallsMediaSocket) Read(ctx context.Context) (CallsMediaFrame, error) {
	m.startReader()
	select {
	case <-ctx.Done():
		return CallsMediaFrame{}, contextError(ctx, ctx.Err())
	case result, ok := <-m.frames:
		if !ok {
			return CallsMediaFrame{}, &Error{Kind: ConnectionError, Code: "calls_disconnected", Message: "Call media connection closed."}
		}
		return result.frame, result.err
	}
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
	m.Close()
	return err
}
func (m *CallsMediaSocket) Close() error {
	err := m.conn.Close(websocket.StatusNormalClosure, "")
	m.startReader()
	m.readerCancel()
	return err
}

// UpdateMediaState serializes at most 16 queued commands while the sole socket
// reader continues delivering audio, video and roster events. An unconfirmed
// command is never replayed automatically.
func (m *CallsMediaSocket) UpdateMediaState(ctx context.Context, a, v, screen *bool) (MediaControlFrame, error) {
	if a == nil && v == nil && screen == nil {
		return MediaControlFrame{}, validation("Specify at least one media preference.")
	}
	m.startReader()
	m.ackMu.Lock()
	if m.queueCount >= 16 {
		m.ackMu.Unlock()
		return MediaControlFrame{}, &Error{Kind: ConflictError, Code: "media_control_unavailable", Message: "Media control queue is full."}
	}
	m.queueCount++
	m.ackMu.Unlock()
	defer func() { m.ackMu.Lock(); m.queueCount--; m.ackMu.Unlock() }()
	m.mu.Lock()
	defer m.mu.Unlock()
	if ctx.Err() != nil {
		return MediaControlFrame{}, contextError(ctx, ctx.Err())
	}
	id, err := CreateConnectionID()
	if err != nil {
		return MediaControlFrame{}, err
	}
	reply := make(chan MediaControlFrame, 1)
	m.ackMu.Lock()
	m.ack[id] = reply
	m.ackMu.Unlock()
	defer func() { m.ackMu.Lock(); delete(m.ack, id); m.ackMu.Unlock() }()
	budget, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	frame := MediaControlFrame{Type: "media_state", RequestID: id, AudioMuted: a, VideoEnabled: v, ScreenSharing: screen}
	if err = wsjson.Write(budget, m.conn, frame); err != nil {
		return MediaControlFrame{}, callSocketError(err)
	}
	select {
	case <-budget.Done():
		return MediaControlFrame{}, &Error{Kind: TimeoutError, Code: "media_control_unknown", Message: "Media control was not confirmed."}
	case <-m.readerDone:
		return MediaControlFrame{}, &Error{Kind: ConnectionError, Code: "media_control_unknown", Message: "Media connection closed before acknowledgement."}
	case f := <-reply:
		if f.Type != "media_state" {
			return f, &Error{Kind: ConflictError, Code: f.Code, Message: "Media control was refused."}
		}
		if a != nil && *f.AudioMuted != *a || v != nil && *f.VideoEnabled != *v || screen != nil && ((f.ScreenSharing != nil && *f.ScreenSharing) != *screen) {
			return f, &Error{Kind: ConflictError, Code: "media_control_failed", Message: "Media control was not confirmed."}
		}
		return f, nil
	}
}
func (l *CallsLifecycle) sendAuth(ctx context.Context, token string) error {
	return wsjson.Write(ctx, l.conn, struct {
		Type  string `json:"type"`
		Token string `json:"token"`
	}{"auth", token})
}
func (m *CallsMediaSocket) sendAuth(ctx context.Context, token, participant string) error {
	return wsjson.Write(ctx, m.conn, struct {
		Type         string `json:"type"`
		Token        string `json:"token"`
		ConnectionID string `json:"connectionId"`
		Participant  string `json:"participant,omitempty"`
	}{"auth", token, m.ConnectionID, participant})
}
