package polymorfa

import (
	"bufio"
	"context"
	"io"
	"iter"
	"net/url"
	"strings"
	"sync"
)

// SignalEventStream reads one connection. There is no resume cursor, automatic
// reconnect or automatic ACK in the pinned sidecar service contract.
type SignalEventStream struct {
	body    io.ReadCloser
	cancel  context.CancelFunc
	ctx     context.Context
	session string
	mu      sync.Mutex
	started bool
}

func (*SignalEventStream) String() string               { return "SignalEventStream[redacted]" }
func (s *SignalEventStream) GoString() string           { return s.String() }
func (*SignalEventStream) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }
func (s *SignalEventStream) Close() error               { s.cancel(); return s.body.Close() }
func (c *SignalSidecarClient) OpenEvents(ctx context.Context, sessionID string) (*SignalEventStream, error) {
	path := "/v1/events"
	if sessionID != "" {
		path += "?session_id=" + url.QueryEscape(sessionID)
	}
	response, cancel, err := c.open(ctx, "GET", path, nil, true, true)
	if err != nil {
		return nil, err
	}
	if response.StatusCode != 200 {
		response.Body.Close()
		cancel()
		return nil, signalHTTPError(response.StatusCode)
	}
	if strings.ToLower(strings.TrimSpace(strings.Split(response.Header.Get("Content-Type"), ";")[0])) != "text/event-stream" {
		response.Body.Close()
		cancel()
		return nil, signalInvalid()
	}
	return &SignalEventStream{body: response.Body, cancel: cancel, ctx: response.Request.Context(), session: sessionID}, nil
}
func (s *SignalEventStream) Items() iter.Seq2[SignalEvent, error] {
	return func(yield func(SignalEvent, error) bool) {
		s.mu.Lock()
		if s.started {
			s.mu.Unlock()
			yield(SignalEvent{}, configuration("stream", "A Signal event stream can be consumed once."))
			return
		}
		s.started = true
		s.mu.Unlock()
		defer s.Close()
		scanner := bufio.NewScanner(s.body)
		scanner.Split(splitSSELines)
		scanner.Buffer(make([]byte, 4096), signalMaxJSON+1)
		id, eventType := "", ""
		lines := []string{}
		size := 0
		for scanner.Scan() {
			if s.ctx.Err() != nil {
				yield(SignalEvent{}, signalNetworkError(s.ctx))
				return
			}
			line := strings.TrimPrefix(scanner.Text(), "\ufeff")
			if line == "" {
				if len(lines) > 0 {
					event, err := parseSignalEvent([]byte(strings.Join(lines, "\n")))
					if err != nil || event.ID != id || event.Type != eventType || (s.session != "" && event.SessionID != s.session) {
						yield(SignalEvent{}, signalInvalid())
						return
					}
					if !yield(event, nil) {
						return
					}
				}
				id, eventType = "", ""
				lines = nil
				size = 0
				continue
			}
			if strings.HasPrefix(line, ":") {
				continue
			}
			field, value, found := strings.Cut(line, ":")
			if !found {
				value = ""
			}
			value = strings.TrimPrefix(value, " ")
			switch field {
			case "id":
				if strings.ContainsRune(value, 0) {
					yield(SignalEvent{}, signalInvalid())
					return
				}
				id = value
			case "event":
				eventType = value
			case "data":
				size += len(value) + 1
				if size > signalMaxJSON {
					yield(SignalEvent{}, signalInvalid())
					return
				}
				lines = append(lines, value)
			}
		}
		if s.ctx.Err() != nil {
			yield(SignalEvent{}, signalNetworkError(s.ctx))
			return
		}
		if scanner.Err() != nil {
			yield(SignalEvent{}, signalInvalid())
			return
		}
		yield(SignalEvent{}, &Error{Kind: ConnectionError, Code: "signal_sidecar_stream_closed", Message: "The Signal sidecar event stream closed."})
	}
}
