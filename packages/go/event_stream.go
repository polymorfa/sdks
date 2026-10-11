package polymorfa

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"iter"
	"math/big"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

type EventStreamParams struct {
	ProjectID    string
	Types        []string
	Since        string
	Ack          string
	InitialDelay time.Duration
	MaxDelay     time.Duration
	Timeout      time.Duration
	OnGap        func(EventStreamGap)
	OnReconnect  func(error, time.Duration)
}
type EventStreamGap struct {
	Reason          string  `json:"reason"`
	MissedEvents    int64   `json:"missedEvents"`
	RequestedCursor *string `json:"requestedCursor"`
}
type EventStreamItem struct {
	Event    PlatformEvent
	StreamID string
	Sequence int64
	Webhook  *WebhookEvent
	Cursor   string
}
type EventStreamAcknowledgement struct {
	Cursor   string `json:"cursor"`
	Sequence int64  `json:"sequence"`
}
type EventStreamAcknowledgementReceipt struct {
	StreamID           string `json:"streamId"`
	AcknowledgedCursor string `json:"acknowledgedCursor"`
	Sequence           int64  `json:"sequence"`
	Replayed           bool   `json:"replayed"`
}
type EventStream struct {
	t         *transport
	path      string
	params    EventStreamParams
	mu        sync.Mutex
	cursor    string
	delivered uint64
}

func (r *Events) streamPath(project string) (string, error) {
	if r.prefix != "/platform" {
		return r.prefix + "/events/stream", nil
	}
	if err := validateProjectID(project); err != nil {
		return "", err
	}
	return "/platform/projects/" + escaped(project) + "/events/stream", nil
}
func (r *Events) Stream(p EventStreamParams) (*EventStream, error) {
	path, err := r.streamPath(p.ProjectID)
	if err != nil {
		return nil, err
	}
	if p.Ack != "" && p.Ack != "auto" && p.Ack != "manual" {
		return nil, validation("ack must be auto or manual.")
	}
	if p.InitialDelay == 0 {
		p.InitialDelay = time.Second
	}
	if p.MaxDelay == 0 {
		p.MaxDelay = 30 * time.Second
	}
	if p.InitialDelay < 0 || p.MaxDelay < p.InitialDelay {
		return nil, configuration("reconnect", "Reconnect delay bounds are invalid.")
	}
	return &EventStream{t: r.t, path: path, params: p, cursor: p.Since}, nil
}
func (r *Events) AcknowledgeStream(ctx context.Context, id string, b EventStreamAcknowledgement, projectID string, o ...RequestOptions) (Response[EventStreamAcknowledgementReceipt], error) {
	path, err := r.streamPath(projectID)
	if err != nil {
		return Response[EventStreamAcknowledgementReceipt]{}, err
	}
	return unwrapped[EventStreamAcknowledgementReceipt](ctx, r.t, "POST", path+"/"+escaped(id)+"/ack", nil, b, options(o))
}
func (s *EventStream) Cursor() string          { s.mu.Lock(); defer s.mu.Unlock(); return s.cursor }
func (s *EventStream) setCursor(cursor string) { s.mu.Lock(); s.cursor = cursor; s.mu.Unlock() }

// Items reads one stream, reconnecting with the last delivered cursor. Cancel
// context to close the connection. Only one iterator should consume a stream.
func (s *EventStream) Items(ctx context.Context) iter.Seq2[EventStreamItem, error] {
	return func(yield func(EventStreamItem, error) bool) {
		delay := s.params.InitialDelay
		for {
			if ctx.Err() != nil {
				return
			}
			s.mu.Lock()
			before := s.delivered
			s.mu.Unlock()
			err, stopped := s.consume(ctx, yield)
			s.mu.Lock()
			madeProgress := s.delivered > before
			s.mu.Unlock()
			if madeProgress {
				delay = s.params.InitialDelay
			}
			if stopped || ctx.Err() != nil {
				return
			}
			var apiError *Error
			if errors.As(err, &apiError) && (apiError.Kind == AuthenticationError || apiError.Kind == AuthorizationError || apiError.Kind == ValidationError || apiError.Kind == NotFoundError || apiError.Status == 410 || apiError.Code == "stream_revoked") {
				yield(EventStreamItem{}, err)
				return
			}
			if errors.As(err, &apiError) && apiError.Code == "stream_expiry" {
				delay = s.params.InitialDelay
			}
			wait := streamJitter(delay)
			if apiError != nil && apiError.Metadata.Headers.Get("Retry-After") != "" {
				wait = min(retryDelay(&http.Response{Header: apiError.Metadata.Headers}, 1), s.params.MaxDelay)
			}
			if s.params.OnReconnect != nil {
				s.params.OnReconnect(err, wait)
			}
			if sleep(ctx, wait) != nil {
				return
			}
			delay = min(delay*2, s.params.MaxDelay)
		}
	}
}
func (s *EventStream) consume(ctx context.Context, yield func(EventStreamItem, error) bool) (error, bool) {
	streamCtx, cancel := context.WithCancelCause(ctx)
	defer cancel(nil)
	q := url.Values{}
	if len(s.params.Types) > 0 {
		q.Set("types", strings.Join(s.params.Types, ","))
	}
	if s.params.Ack == "manual" {
		q.Set("ack", "manual")
	}
	h := http.Header{"Accept": {"text/event-stream"}}
	if cursor := s.Cursor(); cursor != "" {
		h.Set("Last-Event-ID", cursor)
	}
	resp, md, err := s.t.open(streamCtx, "GET", s.path, q, nil, noRetry(RequestOptions{Headers: h, Timeout: s.params.Timeout}), true)
	if err != nil {
		return err, false
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 || !strings.Contains(resp.Header.Get("Content-Type"), "text/event-stream") {
		return &Error{Kind: ServerError, Code: "invalid_response", Message: "Expected an SSE event stream.", Metadata: md}, false
	}
	watch := newStreamWatchdog(resp.Body, cancel)
	defer watch.close()
	scanner := bufio.NewScanner(watch)
	scanner.Split(splitSSELines)
	scanner.Buffer(make([]byte, 4096), 1<<20)
	var data []string
	for scanner.Scan() {
		line := strings.TrimPrefix(scanner.Text(), "\ufeff")
		if line == "" {
			if len(data) == 0 {
				continue
			}
			var frame struct {
				HeartbeatIntervalMS int64         `json:"heartbeatIntervalMs"`
				Type                string        `json:"type"`
				Event               PlatformEvent `json:"event"`
				StreamID            string        `json:"streamId"`
				Sequence            int64         `json:"sequence"`
				Cursor              string        `json:"cursor"`
				Reason              string        `json:"reason"`
				MissedEvents        int64         `json:"missedEvents"`
				RequestedCursor     *string       `json:"requestedCursor"`
			}
			err := json.Unmarshal([]byte(strings.Join(data, "\n")), &frame)
			data = nil
			if err != nil {
				return &Error{Kind: ServerError, Code: "invalid_response", Message: "Invalid event stream frame."}, false
			}
			switch frame.Type {
			case "ready":
				if frame.HeartbeatIntervalMS > 0 {
					watch.setInterval(time.Duration(frame.HeartbeatIntervalMS) * time.Millisecond)
				}
			case "event":
				item := EventStreamItem{Event: frame.Event, StreamID: frame.StreamID, Sequence: frame.Sequence, Cursor: frame.Cursor}
				if frame.Event.Payload != nil {
					bytes, e := base64.StdEncoding.DecodeString(frame.Event.Payload.Data)
					if e != nil {
						return validation("Invalid stream payload encoding."), false
					}
					event, e := ParseVerifiedWebhookEvent(bytes)
					if e != nil {
						return e, false
					}
					item.Webhook = &event
				}
				s.setCursor(frame.Cursor)
				s.mu.Lock()
				s.delivered++
				s.mu.Unlock()
				if !yield(item, nil) {
					return nil, true
				}
			case "checkpoint":
				if frame.Cursor != "" {
					s.setCursor(frame.Cursor)
				}
			case "gap":
				if frame.Reason == "retention_exceeded" {
					if s.params.OnGap != nil {
						s.params.OnGap(EventStreamGap{frame.Reason, frame.MissedEvents, frame.RequestedCursor})
					}
				} else {
					return &Error{Kind: ConnectionError, Code: "stream_gap", Message: "Event stream reported a gap."}, false
				}
			case "revoked":
				return &Error{Kind: AuthorizationError, Code: "stream_revoked", Message: "Event stream authorization was revoked."}, false
			case "expiry":
				return &Error{Kind: ConnectionError, Code: "stream_expiry", Message: "Event stream expired."}, false
			case "dropped":
				return io.EOF, false
			}
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
		if field == "data" {
			data = append(data, value)
		}
	}
	if cause := context.Cause(streamCtx); cause != nil {
		return cause, false
	}
	if err := scanner.Err(); err != nil {
		return &Error{Kind: ConnectionError, Message: "Event stream connection closed."}, false
	}
	return io.EOF, false
}
func splitSSELines(data []byte, atEOF bool) (advance int, token []byte, err error) {
	for i, b := range data {
		if b == '\n' {
			return i + 1, data[:i], nil
		}
		if b == '\r' {
			if i+1 == len(data) && !atEOF {
				return 0, nil, nil
			}
			advance = i + 1
			if i+1 < len(data) && data[i+1] == '\n' {
				advance++
			}
			return advance, data[:i], nil
		}
	}
	if atEOF && len(data) > 0 {
		return len(data), data, nil
	}
	return 0, nil, nil
}

func streamJitter(ceiling time.Duration) time.Duration {
	n, err := rand.Int(rand.Reader, big.NewInt(int64(ceiling/2)+1))
	if err != nil {
		return ceiling
	}
	return ceiling/2 + time.Duration(n.Int64())
}

type streamWatchdog struct {
	reader   io.Reader
	mu       sync.Mutex
	timer    *time.Timer
	interval time.Duration
	closed   bool
}

func newStreamWatchdog(r io.Reader, cancel context.CancelCauseFunc) *streamWatchdog {
	w := &streamWatchdog{reader: r, interval: 30 * time.Second}
	w.timer = time.AfterFunc(w.interval, func() {
		cancel(&Error{Kind: ConnectionError, Code: "heartbeat_missed", Message: "Event stream heartbeat was missed."})
	})
	return w
}
func (w *streamWatchdog) Read(p []byte) (int, error) {
	n, err := w.reader.Read(p)
	if n > 0 {
		w.mu.Lock()
		if !w.closed {
			w.timer.Reset(w.interval)
		}
		w.mu.Unlock()
	}
	return n, err
}
func (w *streamWatchdog) setInterval(interval time.Duration) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.interval = interval * 2
	if !w.closed {
		w.timer.Reset(w.interval)
	}
}
func (w *streamWatchdog) close() { w.mu.Lock(); defer w.mu.Unlock(); w.closed = true; w.timer.Stop() }
