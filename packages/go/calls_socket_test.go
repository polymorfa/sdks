package polymorfa

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
	"time"
)

func TestCallsLifecycleNativeSocket(t *testing.T) {
	done := make(chan error, 1)
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/voip/ws" || r.URL.Query().Get("session") != "support" || r.URL.Query().Get("participant") != "worker" || r.Header.Get("Authorization") != "" || r.URL.Query().Get("token") != "" {
			t.Error("lifecycle URL/header boundary", r.URL, r.Header)
		}
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			done <- err
			return
		}
		defer conn.CloseNow()
		ctx, cancel := context.WithTimeout(r.Context(), time.Second)
		defer cancel()
		var auth struct {
			Type  string `json:"type"`
			Token string `json:"token"`
		}
		if err = wsjson.Read(ctx, conn, &auth); err != nil {
			done <- err
			return
		}
		if auth.Type != "auth" || auth.Token != orgConfig("").Credential.Value {
			t.Error("first message authentication")
		}
		wsjson.Write(ctx, conn, LifecycleFrame{Type: "ready", Session: "support", Participant: "worker"})
		wsjson.Write(ctx, conn, LifecycleFrame{Type: "future_frame"})
		wsjson.Write(ctx, conn, LifecycleFrame{Type: "event", Event: "call.offer", CallID: "call", Timestamp: "today", Payload: json.RawMessage(`{"direction":"inbound"}`)})
		var candidate LifecycleFrame
		if err = wsjson.Read(ctx, conn, &candidate); err == nil && (candidate.Type != "candidate" || candidate.ConnectionID != "connection_123" || candidate.Candidate == nil || candidate.Candidate.Candidate != "candidate:fixture") {
			t.Error(candidate)
		}
		done <- err
		conn.Close(websocket.StatusNormalClosure, "")
	}))
	defer s.Close()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	client, err := NewCallsClient(CallsClientConfig{Config: orgConfig(s.URL), Session: "support", Participant: "worker"})
	if err != nil {
		t.Fatal(err)
	}
	lifecycle, err := client.Connect(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer lifecycle.Close()
	event, err := lifecycle.Next(ctx)
	if err != nil || event.Event != "call.offer" || event.CallID != "call" {
		t.Fatal(event, err)
	}
	if err = lifecycle.SendCandidate(ctx, "call", "connection_123", TrickleCandidate{Candidate: "candidate:fixture"}); err != nil {
		t.Fatal(err)
	}
	if err = <-done; err != nil {
		t.Fatal(err)
	}
}
func TestCallsMediaNativeSocket(t *testing.T) {
	done := make(chan error, 1)
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.EscapedPath() != "/voip/calls/call%2Fid/media" || r.URL.RawQuery != "" || r.Header.Get("Authorization") != "" {
			t.Error("media URL/header boundary", r.URL, r.Header)
		}
		conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{Subprotocols: []string{CallsMediaSubprotocol}})
		if err != nil {
			done <- err
			return
		}
		defer conn.CloseNow()
		ctx, cancel := context.WithTimeout(r.Context(), time.Second)
		defer cancel()
		var auth struct {
			Type         string `json:"type"`
			Token        string `json:"token"`
			ConnectionID string `json:"connectionId"`
			Participant  string `json:"participant"`
		}
		if err = wsjson.Read(ctx, conn, &auth); err != nil {
			done <- err
			return
		}
		if auth.Type != "auth" || auth.ConnectionID != "connection_123" || auth.Participant != "worker" || auth.Token != orgConfig("").Credential.Value {
			t.Error("media first message")
		}
		video := true
		wsjson.Write(ctx, conn, MediaControlFrame{Type: "ready", SampleRate: 16000, Video: &video})
		kind, encoded, err := conn.Read(ctx)
		if err != nil {
			done <- err
			return
		}
		if kind != websocket.MessageBinary || !bytes.Equal(encoded, []byte{1, 0, 128, 0, 0, 255, 127}) {
			t.Error("wire PCM", kind, encoded)
		}
		conn.Write(ctx, kind, encoded)
		kind, encoded, err = conn.Read(ctx)
		if err != nil {
			done <- err
			return
		}
		if kind != websocket.MessageBinary || !bytes.Equal(encoded, []byte{2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 42, 0, 0, 0, 1, 9}) {
			t.Error("wire H264", kind, encoded)
		}
		conn.Write(ctx, kind, encoded)
		var state MediaControlFrame
		if err = wsjson.Read(ctx, conn, &state); err != nil {
			done <- err
			return
		}
		if state.Type != "media_state" || state.RequestID == "" || state.AudioMuted == nil || !*state.AudioMuted {
			t.Error(state)
		}
		off := false
		state.VideoEnabled = &off
		wsjson.Write(ctx, conn, state)
		done <- nil
		var leave MediaControlFrame
		wsjson.Read(ctx, conn, &leave)
		conn.Close(websocket.StatusNormalClosure, "")
	}))
	defer s.Close()
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	client, err := NewCallsClient(CallsClientConfig{Config: orgConfig(s.URL), Session: "support", Participant: "worker"})
	if err != nil {
		t.Fatal(err)
	}
	socket, err := client.AttachMedia(ctx, "call/id", "connection_123")
	if err != nil {
		t.Fatal(err)
	}
	defer socket.Close()
	if socket.SampleRate != 16000 || !socket.Video {
		t.Fatal("ready media")
	}
	audio := []int16{-32768, 0, 32767}
	if err = socket.WriteAudio(ctx, audio); err != nil {
		t.Fatal(err)
	}
	frame, err := socket.Read(ctx)
	if err != nil || !reflect.DeepEqual(frame.Audio, audio) {
		t.Fatal(frame, err)
	}
	video := VideoFrame{Codec: 1, Keyframe: true, TimestampUS: 42, Data: []byte{0, 0, 0, 1, 9}}
	if err = socket.WriteVideo(ctx, video); err != nil {
		t.Fatal(err)
	}
	frame, err = socket.Read(ctx)
	if err != nil || frame.Video == nil || !reflect.DeepEqual(*frame.Video, video) {
		t.Fatal(frame, err)
	}
	muted := true
	state, err := socket.UpdateMediaState(ctx, &muted, nil, nil)
	if err != nil || state.AudioMuted == nil || !*state.AudioMuted {
		t.Fatal(state, err)
	}
	if err = <-done; err != nil {
		t.Fatal(err)
	}
	socket.Leave(ctx)
}
func TestCallsAuthAndCodecFailures(t *testing.T) {
	for _, value := range [][]byte{nil, {1, 1}, {2, 1, 0}, {2, 9, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1}, {4, 0}} {
		if _, err := DecodeMediaFrame(value); err == nil {
			t.Fatal("malformed media accepted", value)
		}
	}
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.CloseNow()
		var auth map[string]string
		wsjson.Read(r.Context(), conn, &auth)
		wsjson.Write(r.Context(), conn, LifecycleFrame{Type: "error", Code: "invalid_token", Message: "Refused"})
	}))
	defer s.Close()
	client, err := NewCallsClient(CallsClientConfig{Config: orgConfig(s.URL), Session: "support"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.Connect(context.Background())
	e, ok := err.(*Error)
	if !ok || e.Kind != AuthenticationError {
		t.Fatal(err)
	}
}
