package polymorfa

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestCallsTokenProviderConcurrencyAndRefresh(t *testing.T) {
	var count atomic.Int32
	release := make(chan struct{})
	s, _ := NewCallsTokenSource(func(ctx context.Context, r CallsTokenRequest) (CallsToken, error) {
		n := count.Add(1)
		if n == 1 {
			select {
			case <-release:
			case <-ctx.Done():
				return CallsToken{}, ctx.Err()
			}
		}
		return CallsToken{Value: "pmfa_ct_current", ExpiresAt: time.Now().Add(time.Hour)}, nil
	})
	var wg sync.WaitGroup
	results := make(chan error, 8)
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); _, err := s.Get(context.Background(), false); results <- err }()
	}
	for count.Load() == 0 {
		time.Sleep(time.Millisecond)
	}
	time.Sleep(10 * time.Millisecond)
	close(release)
	wg.Wait()
	for i := 0; i < 8; i++ {
		if err := <-results; err != nil {
			t.Fatal(err)
		}
	}
	if count.Load() != 1 {
		t.Fatal("provider calls", count.Load())
	}
	if _, err := s.Get(context.Background(), false); err != nil || count.Load() != 1 {
		t.Fatal("cache", err)
	}
	if _, err := s.Get(context.Background(), true); err != nil || count.Load() != 2 {
		t.Fatal("refresh", err)
	}
	cancelled := make(chan struct{})
	blocking, _ := NewCallsTokenSource(func(ctx context.Context, r CallsTokenRequest) (CallsToken, error) {
		<-ctx.Done()
		close(cancelled)
		return CallsToken{}, ctx.Err()
	})
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Millisecond)
	defer cancel()
	_, err := blocking.Get(ctx, false)
	var e *Error
	if !errors.As(err, &e) || e.Kind != TimeoutError {
		t.Fatal(err)
	}
	select {
	case <-cancelled:
	case <-time.After(time.Second):
		t.Fatal("orphan provider not cancelled")
	}
}
func TestCallsTokenRefreshCannotUseStaleFetch(t *testing.T) {
	release := make(chan struct{})
	oldStarted := make(chan struct{})
	source, _ := NewCallsTokenSource(func(ctx context.Context, r CallsTokenRequest) (CallsToken, error) {
		if r.Refresh {
			return CallsToken{Value: "pmfa_ct_fresh"}, nil
		}
		close(oldStarted)
		<-release
		return CallsToken{Value: "pmfa_ct_stale"}, nil
	})
	old := make(chan CallsToken, 1)
	go func() { v, _ := source.Get(context.Background(), false); old <- v }()
	<-oldStarted
	fresh, err := source.Get(context.Background(), true)
	if err != nil || fresh.Value != "pmfa_ct_fresh" {
		t.Fatal(fresh, err)
	}
	close(release)
	<-old
	cached, _ := source.Get(context.Background(), false)
	if cached.Value != "pmfa_ct_fresh" {
		t.Fatal("stale fetch replaced cache")
	}
}
func TestCallsFollowNativeOrchestration(t *testing.T) {
	var accepts, mediaAttempts, refreshes, leaves atomic.Int32
	connectionIDs := make(chan string, 8)
	mediaClose := make(chan struct{})
	var lifecycleMu sync.Mutex
	var lifecycle *websocket.Conn
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/voip/ws":
			if r.URL.RawQuery != "" || r.Header.Get("Authorization") != "" {
				t.Error("client-token socket leaked credential/session")
			}
			conn, err := websocket.Accept(w, r, nil)
			if err != nil {
				return
			}
			defer conn.CloseNow()
			var auth map[string]string
			if wsjson.Read(r.Context(), conn, &auth) != nil {
				return
			}
			if auth["token"] != "pmfa_ct_initial" && auth["token"] != "pmfa_ct_refreshed" {
				t.Error("auth token", auth)
			}
			lifecycleMu.Lock()
			lifecycle = conn
			lifecycleMu.Unlock()
			wsjson.Write(r.Context(), conn, LifecycleFrame{Type: "ready", Participant: "client:app"})
			for _, f := range []LifecycleFrame{{Type: "event", Event: "call.ended", CallID: "terminal", Timestamp: "t", Payload: json.RawMessage(`{"reason":"missed"}`)}, {Type: "event", Event: "call.received", CallID: "terminal", Timestamp: "t", Payload: json.RawMessage(`{"from":{"id":"peer"}}`)}, {Type: "event", Event: "call.received", CallID: "incoming", Timestamp: "t", Payload: json.RawMessage(`{"from":{"id":"peer"},"hasVideo":true}`)}} {
				wsjson.Write(r.Context(), conn, f)
			}
			for {
				var frame map[string]string
				if wsjson.Read(r.Context(), conn, &frame) != nil {
					return
				}
				if frame["type"] == "ping" {
					wsjson.Write(r.Context(), conn, LifecycleFrame{Type: "pong"})
				}
			}
		case "/messaging/voip/calls/incoming/accept":
			accepts.Add(1)
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"success":true,"data":{"answered":true,"answeredBy":"client:app","exclusive":false}}`))
		case "/voip/calls/incoming/media":
			attempt := mediaAttempts.Add(1)
			conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{Subprotocols: []string{CallsMediaSubprotocol}})
			if err != nil {
				return
			}
			defer conn.CloseNow()
			var auth struct {
				Type, Token, ConnectionID string
				Participant               string
			}
			if wsjson.Read(r.Context(), conn, &auth) != nil {
				return
			}
			connectionIDs <- auth.ConnectionID
			if r.URL.RawQuery != "" || auth.Participant != "" {
				t.Error("client media identity boundary")
			}
			wsjson.Write(r.Context(), conn, map[string]any{"type": "ready", "sampleRate": 16000, "video": true})
			conn.Write(r.Context(), websocket.MessageBinary, EncodeAudioFrame([]int16{-2, 3}))
			for {
				var frame MediaControlFrame
				if wsjson.Read(r.Context(), conn, &frame) != nil {
					return
				}
				if frame.Type == "media_state" {
					conn.Write(r.Context(), websocket.MessageBinary, EncodeAudioFrame([]int16{7}))
					muted, video := true, false
					wsjson.Write(r.Context(), conn, MediaControlFrame{Type: "media_state", RequestID: frame.RequestID, AudioMuted: &muted, VideoEnabled: &video})
					if attempt == 1 {
						<-mediaClose
						conn.Close(websocket.StatusCode(4401), "expired")
						return
					}
				} else if frame.Type == "leave" {
					leaves.Add(1)
					return
				}
			}
		case "/messaging/voip/calls/incoming/reports":
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(`{"success":true}`))
		default:
			t.Error("unexpected request", r.Method, r.URL)
			w.WriteHeader(404)
		}
	}))
	defer s.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	client, err := NewCallsClient(CallsClientConfig{Config: Config{BaseURL: s.URL}, Session: "support", TokenProvider: func(ctx context.Context, r CallsTokenRequest) (CallsToken, error) {
		if r.Refresh {
			refreshes.Add(1)
			return CallsToken{Value: "pmfa_ct_refreshed"}, nil
		}
		return CallsToken{Value: "pmfa_ct_initial"}, nil
	}})
	if err != nil {
		t.Fatal(err)
	}
	session, err := client.Follow(ctx, CallsFollowOptions{MinBackoff: time.Millisecond, MaxBackoff: 5 * time.Millisecond, Heartbeat: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close(context.Background())
	var call *Call
	for call == nil {
		select {
		case event := <-session.Events():
			if event.Type == "incoming" {
				if event.Call.ID() != "incoming" {
					t.Fatal("terminal early event rang")
				}
				call = event.Call
			}
		case <-ctx.Done():
			t.Fatal("incoming timeout")
		}
	}
	if terminal := session.GetCall("terminal"); terminal == nil || terminal.Snapshot().State != "ended" {
		t.Fatal("early terminal event not applied")
	}
	if err = call.Answer(ctx, AcceptCallRequest{}); err != nil {
		t.Fatal(err)
	}
	if accepts.Load() != 1 || call.Snapshot().State != "connected" {
		t.Fatal("answer did not attach media")
	}
	firstConnection := <-connectionIDs
	audio := make(chan []int16, 8)
	go func() {
		for {
			select {
			case e := <-call.Events():
				if e.Type == "audio" {
					audio <- e.Audio
				}
			case <-ctx.Done():
				return
			}
		}
	}()
	muted := true
	if err = call.SetMediaState(ctx, &muted, nil, nil); err != nil {
		t.Fatal(err)
	}
	select {
	case a := <-audio:
		if len(a) != 2 || a[0] != -2 {
			t.Fatal(a)
		}
	case <-ctx.Done():
		t.Fatal("audio lost")
	}
	select {
	case a := <-audio:
		if len(a) != 1 || a[0] != 7 {
			t.Fatal(a)
		}
	case <-ctx.Done():
		t.Fatal("audio discarded during media acknowledgement")
	}
	close(mediaClose)
	select {
	case secondConnection := <-connectionIDs:
		if secondConnection != firstConnection {
			t.Fatal("reconnect changed connection identity")
		}
	case <-ctx.Done():
		t.Fatal("media did not reconnect")
	}
	for call.Snapshot().State != "connected" && ctx.Err() == nil {
		time.Sleep(time.Millisecond)
	}
	if refreshes.Load() != 1 {
		t.Fatal("unauthorized reconnect did not refresh token", refreshes.Load())
	}
	if err = call.Leave(ctx); err != nil {
		t.Fatal(err)
	}
	if call.Snapshot().State != "ended" || call.Snapshot().EndReason != "left" {
		t.Fatal(call.Snapshot())
	}
	lifecycleMu.Lock()
	conn := lifecycle
	lifecycleMu.Unlock()
	if conn == nil {
		t.Fatal("missing lifecycle")
	}
}
func TestCallsFollowRefreshesLifecycleOn4401(t *testing.T) {
	var attempts, refreshes atomic.Int32
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, e := websocket.Accept(w, r, nil)
		if e != nil {
			return
		}
		defer conn.CloseNow()
		var auth map[string]string
		wsjson.Read(r.Context(), conn, &auth)
		n := attempts.Add(1)
		if n == 2 && auth["token"] != "pmfa_ct_new" {
			t.Error("refused token reused")
		}
		wsjson.Write(r.Context(), conn, LifecycleFrame{Type: "ready"})
		if n == 1 {
			conn.Close(websocket.StatusCode(4401), "expired")
			return
		}
		for {
			var f map[string]string
			if wsjson.Read(r.Context(), conn, &f) != nil {
				return
			}
			if f["type"] == "ping" {
				wsjson.Write(r.Context(), conn, LifecycleFrame{Type: "pong"})
			}
		}
	}))
	defer s.Close()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	c, _ := NewCallsClient(CallsClientConfig{Config: Config{BaseURL: s.URL}, Session: "s", TokenProvider: func(ctx context.Context, r CallsTokenRequest) (CallsToken, error) {
		if r.Refresh {
			refreshes.Add(1)
			return CallsToken{Value: "pmfa_ct_new"}, nil
		}
		return CallsToken{Value: "pmfa_ct_old"}, nil
	}})
	session, err := c.Follow(ctx, CallsFollowOptions{MinBackoff: time.Millisecond, MaxBackoff: 2 * time.Millisecond, Heartbeat: time.Second})
	if err != nil {
		t.Fatal(err)
	}
	defer session.Close(context.Background())
	ready := 0
	for ready < 2 {
		select {
		case e := <-session.Events():
			if e.Type == "ready" {
				ready++
			}
		case <-ctx.Done():
			t.Fatal("no lifecycle reconnect")
		}
	}
	if attempts.Load() != 2 || refreshes.Load() != 1 {
		t.Fatal(attempts.Load(), refreshes.Load())
	}
}
func TestCallsOutboundEarlyAcceptedAndLateDisconnect(t *testing.T) {
	for _, late := range []bool{false, true} {
		t.Run(map[bool]string{true: "late_disconnected_placement", false: "early_acceptance"}[late], func(t *testing.T) {
			var lifeMu sync.Mutex
			var life *websocket.Conn
			release := make(chan struct{})
			placed := make(chan struct{})
			var ends atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				switch r.URL.Path {
				case "/voip/ws":
					conn, e := websocket.Accept(w, r, nil)
					if e != nil {
						return
					}
					defer conn.CloseNow()
					var auth any
					wsjson.Read(r.Context(), conn, &auth)
					lifeMu.Lock()
					life = conn
					lifeMu.Unlock()
					wsjson.Write(r.Context(), conn, LifecycleFrame{Type: "ready", Participant: "server:worker"})
					for {
						var frame any
						if wsjson.Read(r.Context(), conn, &frame) != nil {
							return
						}
					}
				case "/messaging/voip/calls":
					if r.Header.Get("Idempotency-Key") == "" {
						t.Error("place lacks key")
					}
					close(placed)
					if !late {
						lifeMu.Lock()
						conn := life
						lifeMu.Unlock()
						wsjson.Write(r.Context(), conn, LifecycleFrame{Type: "event", Event: "call.accepted", CallID: "outbound", Timestamp: "t", Payload: json.RawMessage(`{"answeredBy":"server:worker","exclusive":false}`)})
					}
					<-release
					w.Header().Set("Content-Type", "application/json")
					w.Write([]byte(`{"success":true,"data":{"callId":"outbound","session":"s","video":false}}`))
				case "/voip/calls/outbound/media":
					conn, e := websocket.Accept(w, r, &websocket.AcceptOptions{Subprotocols: []string{CallsMediaSubprotocol}})
					if e != nil {
						return
					}
					defer conn.CloseNow()
					var auth any
					wsjson.Read(r.Context(), conn, &auth)
					wsjson.Write(r.Context(), conn, map[string]any{"type": "ready", "sampleRate": 16000, "video": false})
					for {
						var frame any
						if wsjson.Read(r.Context(), conn, &frame) != nil {
							return
						}
					}
				case "/messaging/voip/calls/outbound":
					ends.Add(1)
					w.Header().Set("Content-Type", "application/json")
					w.Write([]byte(`{"success":true}`))
				default:
					t.Error(r.URL)
					w.WriteHeader(404)
				}
			}))
			defer server.Close()
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			c, _ := NewCallsClient(CallsClientConfig{Config: orgConfig(server.URL), Session: "s", Participant: "worker"})
			session, e := c.Follow(ctx, CallsFollowOptions{})
			if e != nil {
				t.Fatal(e)
			}
			result := make(chan *Call, 1)
			errs := make(chan error, 1)
			go func() {
				call, err := session.Place(ctx, PlaceCallRequest{To: "+15551234567"})
				result <- call
				errs <- err
			}()
			<-placed
			if late {
				session.Close(ctx)
			} else {
				time.Sleep(10 * time.Millisecond)
			}
			close(release)
			call, err := <-result, <-errs
			if late {
				if err == nil || call != nil || ends.Load() != 1 {
					t.Fatal("late placement not ended", call, err, ends.Load())
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			for call.Snapshot().State != "connected" && ctx.Err() == nil {
				time.Sleep(time.Millisecond)
			}
			if call.Snapshot().State != "connected" || !call.Snapshot().Claim.Answered {
				t.Fatal("early accepted event lost", call.Snapshot())
			}
			if err = call.End(ctx); err != nil {
				t.Fatal(err)
			}
			session.Close(ctx)
		})
	}
}
func TestMediaProtocolDropsMalformedControl(t *testing.T) {
	for _, raw := range []string{`{"type":"future"}`, `{"type":"media_state","requestId":"request_123","audioMuted":false}`, `{"type":"reaction","emoji":"bad","self":true}`, `{"type":"reaction","emoji":"👍","self":false}`, `{"type":"video_source","source":0,"connectionId":"connection_123"}`, `{"type":"participant_state","participant":{"id":"x","state":"invalid"}}`} {
		if _, ok := parseMediaControlFrame([]byte(raw)); ok {
			t.Fatal("malformed control accepted", raw)
		}
	}
	for _, raw := range []string{`{"type":"remote_media","audioMuted":null}`, `{"type":"media_state","requestId":"request_123","audioMuted":false,"videoEnabled":false}`, `{"type":"reaction","emoji":"👍","participantId":"42"}`, `{"type":"hand_state","raised":false,"supported":false}`} {
		if _, ok := parseMediaControlFrame([]byte(raw)); !ok {
			t.Fatal("valid control rejected", raw)
		}
	}
}
func TestCallReporterBoundsAndRefusal(t *testing.T) {
	reports := make(chan CallReportRequest, 30)
	r, _ := NewCallReporter("connection_123", func(ctx context.Context, v CallReportRequest) error { reports <- v; return nil })
	zero := 0
	r.Quality(CallQuality{RTTMS: &zero})
	r.Quality(CallQuality{RTTMS: &zero})
	r.Quality(CallQuality{})
	for i := 0; i < 25; i++ {
		r.Error("other")
	}
	for i := 0; i < 21; i++ {
		select {
		case v := <-reports:
			if v.ConnectionID != "connection_123" || v.Client.SDK != "polymorfa-go" {
				t.Fatal(v)
			}
		case <-time.After(time.Second):
			t.Fatal("missing report")
		}
	}
	select {
	case <-reports:
		t.Fatal("diagnostic limit exceeded")
	case <-time.After(10 * time.Millisecond):
	}
	refused := make(chan struct{})
	r2, _ := NewCallReporter("connection_123", func(ctx context.Context, v CallReportRequest) error {
		close(refused)
		return &Error{Kind: AuthorizationError, Status: 403}
	})
	r2.Error("other")
	<-refused
	for !r2.Stopped() {
		time.Sleep(time.Millisecond)
	}
	r2.Error("other")
}
