package polymorfa

import (
	"context"
	"encoding/json"
	"errors"
	"sync"
	"time"
)

type CallsFollowOptions struct {
	MinBackoff, MaxBackoff, Heartbeat time.Duration
	MediaReconnectAttempts            *int
}
type CallsEvent struct {
	Type  string
	Call  *Call
	Frame *LifecycleFrame
	Error error
}
type CallsSession struct {
	client       *CallsClient
	ctx          context.Context
	cancel       context.CancelFunc
	options      CallsFollowOptions
	events       chan CallsEvent
	mu           sync.Mutex
	lifecycle    *CallsLifecycle
	calls        map[string]*Call
	ended        []string
	pending      map[string][]LifecycleFrame
	pendingOrder []string
	connected    bool
	participant  string
	wg           sync.WaitGroup
}

// Follow authenticates one lifecycle connection, then follows the session until
// Close or context cancellation. Events applies backpressure to the reader.
func (c *CallsClient) Follow(ctx context.Context, o CallsFollowOptions) (*CallsSession, error) {
	if o.MinBackoff == 0 {
		o.MinBackoff = time.Second
	}
	if o.MaxBackoff == 0 {
		o.MaxBackoff = 30 * time.Second
	}
	if o.Heartbeat == 0 {
		o.Heartbeat = 15 * time.Second
	}
	if o.MinBackoff < 0 || o.MaxBackoff < o.MinBackoff || o.Heartbeat < 0 || o.MediaReconnectAttempts != nil && *o.MediaReconnectAttempts < 0 {
		return nil, configuration("follow", "Invalid Calls follow bounds.")
	}
	l, err := c.Connect(ctx)
	if err != nil {
		return nil, err
	}
	owned, cancel := context.WithCancel(ctx)
	s := &CallsSession{client: c, ctx: owned, cancel: cancel, options: o, events: make(chan CallsEvent, 64), lifecycle: l, calls: map[string]*Call{}, pending: map[string][]LifecycleFrame{}, connected: true, participant: l.Ready.Participant}
	if s.participant == "" && c.messaging.t.config.Credential.Kind != ClientToken {
		p := c.participant
		if p == "" {
			p = "default"
		}
		s.participant = "server:" + p
	}
	s.wg.Add(1)
	go s.run(l)
	return s, nil
}
func (s *CallsSession) Events() <-chan CallsEvent { return s.events }

// Done closes when the session stops. Event channels remain open so concurrent
// call cleanup can finish safely; consumers select on Done.
func (s *CallsSession) Done() <-chan struct{} { return s.ctx.Done() }
func (s *CallsSession) Connected() bool       { s.mu.Lock(); defer s.mu.Unlock(); return s.connected }
func (s *CallsSession) ParticipantReference() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.participant
}
func (s *CallsSession) GetCall(id string) *Call { s.mu.Lock(); defer s.mu.Unlock(); return s.calls[id] }
func (s *CallsSession) Calls() []*Call {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := []*Call{}
	for _, c := range s.calls {
		if c.Snapshot().State != "ended" {
			out = append(out, c)
		}
	}
	return out
}
func (s *CallsSession) emit(e CallsEvent) {
	select {
	case s.events <- e:
	case <-s.ctx.Done():
	}
}
func (s *CallsSession) run(l *CallsLifecycle) {
	defer s.wg.Done()
	defer s.cancel()
	backoff := s.options.MinBackoff
	for {
		s.emit(CallsEvent{Type: "ready"})
		err := s.readLifecycle(l)
		l.conn.CloseNow()
		s.mu.Lock()
		s.connected = false
		s.mu.Unlock()
		if s.ctx.Err() != nil {
			return
		}
		s.emit(CallsEvent{Type: "disconnected", Error: err})
		var apiErr *Error
		if errors.As(err, &apiErr) {
			if apiErr.Status == 4400 {
				return
			}
			if apiErr.Kind == AuthenticationError && s.client.tokens != nil {
				s.client.tokens.Invalidate()
				s.client.tokens.Get(s.ctx, true)
			}
		}
		for {
			if sleep(s.ctx, backoff) != nil {
				return
			}
			next, connectErr := s.client.Connect(s.ctx)
			if connectErr == nil {
				l = next
				backoff = s.options.MinBackoff
				s.mu.Lock()
				s.lifecycle = l
				s.connected = true
				if l.Ready.Participant != "" {
					s.participant = l.Ready.Participant
				}
				s.mu.Unlock()
				break
			}
			s.emit(CallsEvent{Type: "error", Error: connectErr})
			if errors.As(connectErr, &apiErr) && apiErr.Status == 4400 {
				return
			}
			backoff *= 2
			if backoff > s.options.MaxBackoff {
				backoff = s.options.MaxBackoff
			}
		}
	}
}
func (s *CallsSession) readLifecycle(l *CallsLifecycle) error {
	attempt, cancel := context.WithCancel(s.ctx)
	defer cancel()
	pingDone := make(chan struct{})
	go func() {
		defer close(pingDone)
		ticker := time.NewTicker(s.options.Heartbeat)
		defer ticker.Stop()
		token := l.Token
		var refresh <-chan time.Time
		var timer *time.Timer
		schedule := func() {
			if token.ExpiresAt.IsZero() || s.client.tokens == nil {
				refresh = nil
				return
			}
			remaining := time.Until(token.ExpiresAt)
			delay := remaining - time.Minute
			if remaining <= 2*time.Minute {
				delay = remaining / 2
			}
			if delay < time.Second {
				delay = time.Second
			}
			timer = time.NewTimer(delay)
			refresh = timer.C
		}
		schedule()
		defer func() {
			if timer != nil {
				timer.Stop()
			}
		}()
		for {
			select {
			case <-attempt.Done():
				return
			case <-ticker.C:
				if l.Ping(attempt) != nil {
					l.conn.CloseNow()
					return
				}
			case <-refresh:
				next, err := s.client.tokens.Get(attempt, true)
				if err != nil {
					s.emit(CallsEvent{Type: "error", Error: err})
					l.conn.CloseNow()
					return
				}
				if l.RefreshAuth(attempt, next) != nil {
					l.conn.CloseNow()
					return
				}
				token = next
				schedule()
			}
		}
	}()
	defer func() { cancel(); <-pingDone }()
	for {
		readCtx, stop := context.WithTimeout(attempt, s.options.Heartbeat*2)
		frame, err := l.Next(readCtx)
		stop()
		if err != nil {
			return err
		}
		if frame.Type == "event" {
			s.receive(frame)
		} else if frame.Type == "candidate" {
			s.emit(CallsEvent{Type: "candidate", Frame: &frame})
		} else if frame.Type == "error" {
			s.emit(CallsEvent{Type: "error", Error: &Error{Kind: ServerError, Code: frame.Code, Message: frame.Message}})
		}
	}
}
func (s *CallsSession) track(id, direction, peer string, video bool) *Call {
	connection, _ := CreateConnectionID()
	state := "incoming"
	if direction == "outbound" {
		state = "ringing"
	}
	callCtx, cancel := context.WithCancel(s.ctx)
	c := &Call{session: s, id: id, connectionID: connection, ctx: callCtx, cancel: cancel, events: make(chan CallEvent, 64), snapshot: CallSnapshot{ID: id, Direction: direction, Peer: peer, HasVideo: video, Capabilities: CallCapabilities{Video: video, Invite: true}, State: state, StartedAt: time.Now(), Participants: []CallParticipant{}, VideoSources: map[uint32]CallVideoSource{}}, participantRevisions: map[string]string{}}
	s.mu.Lock()
	if old := s.calls[id]; old != nil {
		s.mu.Unlock()
		cancel()
		return old
	}
	s.calls[id] = c
	queued := s.pending[id]
	delete(s.pending, id)
	s.mu.Unlock()
	s.emit(CallsEvent{Type: "call", Call: c})
	for _, f := range queued {
		s.apply(c, f)
	}
	return c
}
func (s *CallsSession) receive(f LifecycleFrame) {
	var p struct {
		Direction      string            `json:"direction"`
		From           WebhookIdentity   `json:"from"`
		HasVideo       bool              `json:"hasVideo"`
		LegacyHasVideo bool              `json:"has_video"`
		Capabilities   *CallCapabilities `json:"capabilities"`
	}
	if json.Unmarshal(f.Payload, &p) != nil {
		return
	}
	s.mu.Lock()
	c := s.calls[f.CallID]
	s.mu.Unlock()
	if f.Event == "call.received" {
		if c != nil || p.Direction == "outgoing" {
			return
		}
		peer := p.From.PhoneNumber
		if peer == "" {
			peer = p.From.ID
		}
		c = s.track(f.CallID, "inbound", peer, p.HasVideo || p.LegacyHasVideo)
		if p.Capabilities != nil {
			c.mu.Lock()
			c.snapshot.Capabilities = *p.Capabilities
			c.mu.Unlock()
		}
		if c.Snapshot().State != "ended" {
			s.emit(CallsEvent{Type: "incoming", Call: c})
		}
		return
	}
	switch f.Event {
	case "call.accepted", "call.ended", "call.missed", "call.rejected", "call.participant_joined", "call.participant_state", "call.participant_left":
	default:
		return
	}
	if c != nil {
		s.apply(c, f)
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	q := s.pending[f.CallID]
	if q == nil {
		s.pendingOrder = append(s.pendingOrder, f.CallID)
		if len(s.pendingOrder) > 64 {
			delete(s.pending, s.pendingOrder[0])
			s.pendingOrder = s.pendingOrder[1:]
		}
	}
	for _, old := range q {
		if old.Event == "call.ended" || old.Event == "call.missed" || old.Event == "call.rejected" {
			return
		}
	}
	if f.Event == "call.ended" || f.Event == "call.missed" || f.Event == "call.rejected" {
		q = nil
	}
	if len(q) >= 8 {
		q = q[1:]
	}
	s.pending[f.CallID] = append(q, f)
}
func (s *CallsSession) apply(c *Call, f LifecycleFrame) {
	if c.Snapshot().State == "ended" {
		return
	}
	switch f.Event {
	case "call.accepted":
		var p struct {
			AnsweredBy   string            `json:"answeredBy"`
			Exclusive    bool              `json:"exclusive"`
			Capabilities *CallCapabilities `json:"capabilities"`
		}
		if json.Unmarshal(f.Payload, &p) != nil {
			return
		}
		self := s.ParticipantReference()
		c.mu.Lock()
		c.snapshot.Claim = CallClaim{Answered: true, AnsweredBy: p.AnsweredBy, Exclusive: p.Exclusive}
		if p.Capabilities != nil {
			c.snapshot.Capabilities = *p.Capabilities
		}
		if p.Exclusive && p.AnsweredBy != "" && p.AnsweredBy != self {
			c.snapshot.Claim.ClaimedByOther = true
		}
		outbound := c.snapshot.Direction == "outbound"
		c.mu.Unlock()
		if c.Snapshot().Claim.ClaimedByOther {
			c.finish("claimed")
		} else if outbound {
			go func() {
				if err := c.attach(false); err != nil {
					c.failMedia(err)
				}
			}()
		} else {
			c.emit(CallEvent{Type: "claim"})
		}
	case "call.ended", "call.missed", "call.rejected":
		reason := "remote_hangup"
		var p struct {
			Reason string `json:"reason"`
		}
		json.Unmarshal(f.Payload, &p)
		if f.Event == "call.missed" {
			reason = "missed"
		} else if f.Event == "call.rejected" {
			reason = "rejected"
		} else if p.Reason != "" {
			reason = p.Reason
		}
		c.finish(reason)
	default:
		var p struct {
			CallID        string           `json:"callId"`
			Participant   *CallParticipant `json:"participant"`
			ParticipantID string           `json:"participantId"`
			Reason        string           `json:"reason"`
		}
		if json.Unmarshal(f.Payload, &p) != nil || p.CallID != "" && p.CallID != c.id {
			return
		}
		c.control(MediaControlFrame{Type: f.Event[5:], Participant: p.Participant, ParticipantID: p.ParticipantID, Reason: p.Reason})
	}
}
func (s *CallsSession) Place(ctx context.Context, b PlaceCallRequest, o ...RequestOptions) (*Call, error) {
	if s.ctx.Err() != nil {
		return nil, contextError(s.ctx, s.ctx.Err())
	}
	r, err := s.client.Place(ctx, b, o...)
	if err != nil {
		return nil, err
	}
	if s.ctx.Err() != nil {
		cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		s.client.End(cleanup, r.Data.Data.CallID)
		return nil, contextError(s.ctx, s.ctx.Err())
	}
	c := s.track(r.Data.Data.CallID, "outbound", b.To, r.Data.Data.Video)
	return c, nil
}
func (s *CallsSession) Close(ctx context.Context) error {
	s.cancel()
	s.mu.Lock()
	l := s.lifecycle
	s.mu.Unlock()
	if l != nil {
		l.conn.CloseNow()
	}
	var last error
	for _, c := range s.Calls() {
		if err := c.Leave(ctx); err != nil {
			last = err
		}
	}
	s.wg.Wait()
	return last
}

type CallCapabilities struct {
	Video  bool `json:"video"`
	Invite bool `json:"invite"`
}
type CallClaim struct {
	Answered       bool
	AnsweredBy     string
	Exclusive      bool
	ClaimedByOther bool
	CanJoin        bool
}
type CallVideoSource struct {
	ID                                  uint32
	Label                               string
	Participant                         *CallParticipant
	ConnectionID, ConnectionParticipant string
}
type CallSnapshot struct {
	ID, Direction, Peer, State, EndReason   string
	HasVideo                                bool
	Capabilities                            CallCapabilities
	Claim                                   CallClaim
	StartedAt, ConnectedAt, EndedAt         time.Time
	SampleRate                              int
	AudioMuted, VideoEnabled, ScreenSharing bool
	RemoteAudioMuted                        *bool
	HandRaised, SocialSupported             bool
	Participants                            []CallParticipant
	VideoSources                            map[uint32]CallVideoSource
	Reconnects                              int
}
type CallEvent struct {
	Type    string
	Audio   []int16
	Video   *VideoFrame
	Control *MediaControlFrame
	Error   error
	Reason  string
}
type Call struct {
	session              *CallsSession
	id, connectionID     string
	ctx                  context.Context
	cancel               context.CancelFunc
	mu                   sync.Mutex
	actionMu             sync.Mutex
	media                *CallsMediaSocket
	snapshot             CallSnapshot
	events               chan CallEvent
	participantRevisions map[string]string
	accepted             bool
	preferencesSet       bool
	reporter             *CallReporter
}

func (c *Call) ID() string               { return c.id }
func (c *Call) ConnectionID() string     { return c.connectionID }
func (c *Call) Events() <-chan CallEvent { return c.events }
func (c *Call) Done() <-chan struct{}    { return c.ctx.Done() }
func (c *Call) Snapshot() CallSnapshot {
	c.mu.Lock()
	defer c.mu.Unlock()
	v := c.snapshot
	v.Participants = append([]CallParticipant{}, v.Participants...)
	for i := range v.Participants {
		if v.Participants[i].HandRaised != nil {
			raised := *v.Participants[i].HandRaised
			v.Participants[i].HandRaised = &raised
		}
	}
	v.VideoSources = map[uint32]CallVideoSource{}
	for k, s := range c.snapshot.VideoSources {
		if s.Participant != nil {
			participant := *s.Participant
			if participant.HandRaised != nil {
				raised := *participant.HandRaised
				participant.HandRaised = &raised
			}
			s.Participant = &participant
		}
		v.VideoSources[k] = s
	}
	if v.RemoteAudioMuted != nil {
		copy := *v.RemoteAudioMuted
		v.RemoteAudioMuted = &copy
	}
	v.Claim.CanJoin = v.Claim.Answered && !v.Claim.Exclusive && v.State == "incoming"
	return v
}
func (c *Call) emit(e CallEvent) {
	select {
	case c.events <- e:
	case <-c.ctx.Done():
	}
}
func (c *Call) setState(state string) {
	c.mu.Lock()
	if c.snapshot.State == "ended" {
		c.mu.Unlock()
		return
	}
	c.snapshot.State = state
	c.mu.Unlock()
	c.emit(CallEvent{Type: "state"})
}
func (c *Call) finish(reason string) {
	c.mu.Lock()
	if c.snapshot.State == "ended" {
		c.mu.Unlock()
		return
	}
	c.snapshot.State = "ended"
	c.snapshot.EndReason = reason
	c.snapshot.EndedAt = time.Now()
	media := c.media
	c.media = nil
	c.mu.Unlock()
	c.emit(CallEvent{Type: "ended", Reason: reason})
	c.cancel()
	if media != nil {
		media.conn.CloseNow()
	}
	c.mu.Lock()
	r := c.reporter
	c.mu.Unlock()
	if r != nil {
		r.Stop()
	}
	c.session.mu.Lock()
	c.session.ended = append(c.session.ended, c.id)
	if len(c.session.ended) > 200 {
		old := c.session.ended[0]
		c.session.ended = c.session.ended[1:]
		delete(c.session.calls, old)
	}
	c.session.mu.Unlock()
	c.session.emit(CallsEvent{Type: "ended", Call: c})
}
func (c *Call) Answer(ctx context.Context, b AcceptCallRequest) error {
	c.actionMu.Lock()
	defer c.actionMu.Unlock()
	state := c.Snapshot()
	if state.State != "incoming" || state.Claim.ClaimedByOther {
		return &Error{Kind: ConflictError, Code: "invalid_state", Message: "Call cannot be answered in this state."}
	}
	c.setState("connecting")
	r, err := c.session.client.Answer(ctx, c.id, b)
	if err != nil {
		c.setState("incoming")
		return err
	}
	c.mu.Lock()
	c.accepted = true
	c.snapshot.Claim = CallClaim{Answered: r.Data.Data.Answered, AnsweredBy: r.Data.Data.AnsweredBy, Exclusive: r.Data.Data.Exclusive}
	c.mu.Unlock()
	if err = c.attach(false); err != nil {
		c.failMedia(err)
	}
	return err
}
func (c *Call) Join(ctx context.Context, video *bool) error {
	if !c.Snapshot().Claim.CanJoin {
		return &Error{Kind: ConflictError, Code: "call_not_answered", Message: "The call is not open to join."}
	}
	exclusive := false
	return c.Answer(ctx, AcceptCallRequest{Exclusive: &exclusive, Video: video})
}
func (c *Call) Reject(ctx context.Context) error {
	s := c.Snapshot()
	if s.State != "incoming" || s.Claim.Answered {
		return &Error{Kind: ConflictError, Code: "call_not_ringing", Message: "Call is not ringing."}
	}
	_, err := c.session.client.Reject(ctx, c.id)
	if err == nil {
		c.finish("rejected")
	}
	return err
}
func (c *Call) End(ctx context.Context) error {
	if c.Snapshot().State == "ended" {
		return nil
	}
	_, err := c.session.client.End(ctx, c.id)
	if err == nil {
		c.finish("hangup")
	}
	return err
}
func (c *Call) Leave(ctx context.Context) error {
	c.actionMu.Lock()
	defer c.actionMu.Unlock()
	s := c.Snapshot()
	if s.State == "ended" {
		return nil
	}
	if s.Direction == "outbound" && s.State == "ringing" {
		return c.End(ctx)
	}
	c.mu.Lock()
	accepted := c.accepted
	media := c.media
	c.mu.Unlock()
	if accepted {
		if media != nil {
			if err := media.Leave(ctx); err != nil {
				return err
			}
		} else {
			m, _, err := c.session.client.api(ctx, false)
			if err != nil {
				return err
			}
			if _, err = m.VoIP().Leave(ctx, c.id, LeaveCallRequest{ConnectionID: c.connectionID, Participant: c.session.client.participant}); err != nil {
				return err
			}
		}
	}
	c.finish("left")
	return nil
}
func (c *Call) attach(refresh bool) error {
	c.mu.Lock()
	if c.snapshot.State == "ended" || c.media != nil {
		c.mu.Unlock()
		return nil
	}
	c.snapshot.State = "connecting"
	c.mu.Unlock()
	if refresh && c.session.client.tokens != nil {
		if _, err := c.session.client.tokens.Get(c.ctx, true); err != nil {
			return err
		}
	}
	m, err := c.session.client.AttachMedia(c.ctx, c.id, c.connectionID)
	if err != nil {
		return err
	}
	c.mu.Lock()
	restore := c.preferencesSet
	preferences := c.snapshot
	c.mu.Unlock()
	if restore {
		if _, err = m.UpdateMediaState(c.ctx, &preferences.AudioMuted, &preferences.VideoEnabled, &preferences.ScreenSharing); err != nil {
			m.conn.CloseNow()
			return err
		}
	}
	c.mu.Lock()
	if c.snapshot.State == "ended" {
		c.mu.Unlock()
		m.conn.CloseNow()
		return nil
	}
	if c.media != nil {
		c.mu.Unlock()
		m.conn.CloseNow()
		return nil
	}
	c.media = m
	if c.reporter == nil {
		c.reporter, _ = NewCallReporter(c.connectionID, func(ctx context.Context, b CallReportRequest) error {
			client, _, err := c.session.client.api(ctx, false)
			if err != nil {
				return err
			}
			_, err = client.VoIP().Report(ctx, c.id, b, noRetry(RequestOptions{}))
			return err
		})
	}
	c.accepted = true
	c.snapshot.State = "connected"
	if c.snapshot.ConnectedAt.IsZero() {
		c.snapshot.ConnectedAt = time.Now()
	}
	c.snapshot.SampleRate = m.SampleRate
	c.snapshot.HasVideo = m.Video
	c.mu.Unlock()
	c.emit(CallEvent{Type: "connected"})
	go c.refreshMedia(m)
	go c.readMedia(m)
	return nil
}
func (c *Call) readMedia(m *CallsMediaSocket) {
	for {
		frame, err := m.Read(c.ctx)
		if err != nil {
			if c.ctx.Err() != nil {
				return
			}
			c.mu.Lock()
			if c.media != m {
				c.mu.Unlock()
				return
			}
			c.media = nil
			c.snapshot.RemoteAudioMuted = nil
			c.snapshot.VideoSources = map[uint32]CallVideoSource{}
			c.mu.Unlock()
			m.conn.CloseNow()
			var e *Error
			refresh := errors.As(err, &e) && e.Kind == AuthenticationError
			if e != nil && (e.Status == 4409 || e.Status == 4403 || e.Status == 4400 || e.Status == 4404) {
				c.failMedia(err)
				return
			}
			attempts := 3
			if c.session.options.MediaReconnectAttempts != nil {
				attempts = *c.session.options.MediaReconnectAttempts
			}
			for i := 0; i < attempts; i++ {
				c.setState("reconnecting")
				delay := c.session.options.MinBackoff * time.Duration(1<<i)
				if delay > 8*time.Second {
					delay = 8 * time.Second
				}
				if sleep(c.ctx, delay) != nil {
					return
				}
				err = c.attach(refresh)
				if err == nil {
					c.mu.Lock()
					c.snapshot.Reconnects++
					c.mu.Unlock()
					return
				}
				if errors.As(err, &e) && e.Kind == AuthenticationError {
					refresh = true
				} else if e != nil && (e.Kind == ConflictError || e.Kind == AuthorizationError) {
					break
				}
			}
			c.failMedia(err)
			return
		}
		if frame.Control != nil {
			c.control(*frame.Control)
		} else if frame.Video != nil {
			c.emit(CallEvent{Type: "video", Video: frame.Video})
		} else {
			c.emit(CallEvent{Type: "audio", Audio: frame.Audio})
		}
	}
}
func (c *Call) failMedia(err error) {
	c.emit(CallEvent{Type: "error", Error: err})
	cleanup, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if c.Snapshot().Claim.Exclusive {
		c.session.client.End(cleanup, c.id)
	} else {
		m, _, e := c.session.client.api(cleanup, false)
		if e == nil {
			m.VoIP().Leave(cleanup, c.id, LeaveCallRequest{ConnectionID: c.connectionID, Participant: c.session.client.participant})
		}
	}
	c.finish("connection_failed")
}
func (c *Call) control(f MediaControlFrame) {
	c.mu.Lock()
	switch f.Type {
	case "participant_joined", "participant_state":
		if !validCallParticipant(f.Participant) {
			c.mu.Unlock()
			return
		}
		encoded, _ := json.Marshal(f.Participant)
		if c.participantRevisions[f.Participant.ID] == string(encoded) {
			c.mu.Unlock()
			return
		}
		c.participantRevisions[f.Participant.ID] = string(encoded)
		found := false
		for i, p := range c.snapshot.Participants {
			if p.ID == f.Participant.ID {
				c.snapshot.Participants[i] = *f.Participant
				found = true
			}
		}
		if !found {
			c.snapshot.Participants = append(c.snapshot.Participants, *f.Participant)
		}
	case "participant_left":
		for i, p := range c.snapshot.Participants {
			if p.ID == f.ParticipantID {
				c.snapshot.Participants = append(c.snapshot.Participants[:i], c.snapshot.Participants[i+1:]...)
				break
			}
		}
	case "remote_media":
		c.snapshot.RemoteAudioMuted = f.AudioMuted
	case "hand_state":
		if f.Raised != nil {
			c.snapshot.HandRaised = *f.Raised
		}
		if f.Supported != nil {
			c.snapshot.SocialSupported = *f.Supported
		}
	case "video_source":
		source := CallVideoSource{ID: f.Source, Participant: f.Participant, ConnectionID: f.ConnectionID, ConnectionParticipant: f.ConnectionParticipant}
		if f.Participant != nil {
			source.Label = f.Participant.PhoneNumber
			if source.Label == "" {
				source.Label = f.Participant.ID
			}
		} else {
			source.Label = f.ConnectionParticipant
			if source.Label == "" {
				source.Label = f.ConnectionID
			}
		}
		c.snapshot.VideoSources[f.Source] = source
	case "video_source_removed":
		delete(c.snapshot.VideoSources, f.Source)
	}
	c.mu.Unlock()
	c.emit(CallEvent{Type: f.Type, Control: &f})
}
func (c *Call) WriteAudio(ctx context.Context, pcm []int16) error {
	c.mu.Lock()
	m := c.media
	c.mu.Unlock()
	if m == nil {
		return &Error{Kind: ConflictError, Code: "media_unavailable", Message: "Call has no attached media."}
	}
	return m.WriteAudio(ctx, pcm)
}
func (c *Call) WriteVideo(ctx context.Context, frame VideoFrame) error {
	c.mu.Lock()
	m := c.media
	c.mu.Unlock()
	if m == nil {
		return &Error{Kind: ConflictError, Code: "media_unavailable", Message: "Call has no attached media."}
	}
	frame.Source = 0
	return m.WriteVideo(ctx, frame)
}
func (c *Call) SetMediaState(ctx context.Context, a, v, screen *bool) error {
	c.mu.Lock()
	m := c.media
	c.mu.Unlock()
	if m == nil {
		return &Error{Kind: ConflictError, Code: "media_control_unavailable", Message: "Call has no attached media."}
	}
	state, err := m.UpdateMediaState(ctx, a, v, screen)
	if err == nil {
		c.mu.Lock()
		c.snapshot.AudioMuted = *state.AudioMuted
		c.snapshot.VideoEnabled = *state.VideoEnabled
		c.snapshot.ScreenSharing = state.ScreenSharing != nil && *state.ScreenSharing
		c.preferencesSet = true
		c.mu.Unlock()
	}
	return err
}
func (c *Call) AddParticipant(ctx context.Context, to string) (CallParticipant, error) {
	if c.Snapshot().State == "ended" {
		return CallParticipant{}, &Error{Kind: ConflictError, Code: "invalid_state", Message: "Call ended."}
	}
	m, _, err := c.session.client.api(ctx, false)
	if err != nil {
		return CallParticipant{}, err
	}
	r, err := m.VoIP().AddParticipant(ctx, c.id, AddCallParticipantRequest{To: to})
	return r.Data.Data, err
}
func (c *Call) RingParticipant(ctx context.Context, to string) error {
	m, _, err := c.session.client.api(ctx, false)
	if err != nil {
		return err
	}
	_, err = m.VoIP().RingParticipant(ctx, c.id, AddCallParticipantRequest{To: to})
	return err
}
func (c *Call) SendReaction(ctx context.Context, emoji string) error {
	if c.Snapshot().State != "connected" {
		return &Error{Kind: ConflictError, Code: "invalid_state", Message: "Call is not connected."}
	}
	m, _, err := c.session.client.api(ctx, false)
	if err != nil {
		return err
	}
	_, err = m.VoIP().SendReaction(ctx, c.id, CallReactionRequest{ConnectionID: c.connectionID, Participant: c.session.client.participant, Emoji: emoji})
	return err
}
func (c *Call) SetHandRaised(ctx context.Context, raised bool) error {
	if c.Snapshot().State != "connected" {
		return &Error{Kind: ConflictError, Code: "invalid_state", Message: "Call is not connected."}
	}
	m, _, err := c.session.client.api(ctx, false)
	if err != nil {
		return err
	}
	_, err = m.VoIP().SetHandRaised(ctx, c.id, HandRaisedRequest{ConnectionID: c.connectionID, Participant: c.session.client.participant, Raised: raised})
	return err
}
func (c *Call) Duration() time.Duration {
	s := c.Snapshot()
	if s.ConnectedAt.IsZero() {
		return 0
	}
	end := s.EndedAt
	if end.IsZero() {
		end = time.Now()
	}
	return end.Sub(s.ConnectedAt)
}
func (c *Call) refreshMedia(m *CallsMediaSocket) {
	if c.session.client.tokens == nil || m.Token.ExpiresAt.IsZero() {
		return
	}
	token := m.Token
	for {
		remaining := time.Until(token.ExpiresAt)
		delay := remaining - time.Minute
		if remaining <= 2*time.Minute {
			delay = remaining / 2
		}
		if delay < time.Second {
			delay = time.Second
		}
		if sleep(c.ctx, delay) != nil {
			return
		}
		c.mu.Lock()
		current := c.media == m
		c.mu.Unlock()
		if !current {
			return
		}
		next, err := c.session.client.tokens.Get(c.ctx, true)
		if err != nil {
			c.emit(CallEvent{Type: "error", Error: err})
			m.conn.CloseNow()
			return
		}
		if err = m.RefreshAuth(c.ctx, next, c.session.client.participant); err != nil {
			m.conn.CloseNow()
			return
		}
		token = next
		if token.ExpiresAt.IsZero() {
			return
		}
	}
}
