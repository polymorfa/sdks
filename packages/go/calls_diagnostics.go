package polymorfa

import (
	"context"
	"errors"
	"sync"
	"time"
)

// CallReporter absorbs transport failures and bounds diagnostic traffic. It
// never includes message content, peer identity, audio, or video.
type CallReporter struct {
	mu           sync.Mutex
	stopped      bool
	lastQuality  time.Time
	errorTimes   []time.Time
	send         func(context.Context, CallReportRequest) error
	connectionID string
	client       CallReportClient
}

func NewCallReporter(connectionID string, send func(context.Context, CallReportRequest) error) (*CallReporter, error) {
	if !connectionPattern.MatchString(connectionID) || send == nil {
		return nil, configuration("reporter", "A valid connection ID and report sender are required.")
	}
	return &CallReporter{connectionID: connectionID, send: send, client: CallReportClient{SDK: "polymorfa-go", Version: "0.1.0-dev.0", Platform: "other"}}, nil
}
func (r *CallReporter) Stop()         { r.mu.Lock(); r.stopped = true; r.mu.Unlock() }
func (r *CallReporter) Stopped() bool { r.mu.Lock(); defer r.mu.Unlock(); return r.stopped }
func (r *CallReporter) sendReport(report CallReportRequest) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		err := r.send(ctx, report)
		var e *Error
		if errors.As(err, &e) && e.Status >= 400 && e.Status < 500 && e.Status != 429 {
			r.Stop()
		}
	}()
}
func (r *CallReporter) Error(code string) {
	allowed := false
	for _, s := range []string{"media_permission_denied", "device_not_found", "device_in_use", "ice_failed", "negotiation_failed", "media_timeout", "reconnect_exhausted", "token_refresh_failed", "unsupported_browser", "other"} {
		if code == s {
			allowed = true
		}
	}
	if !allowed {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.stopped {
		return
	}
	now := time.Now()
	times := r.errorTimes[:0]
	for _, t := range r.errorTimes {
		if now.Sub(t) < time.Minute {
			times = append(times, t)
		}
	}
	r.errorTimes = times
	if len(times) >= 20 {
		return
	}
	r.errorTimes = append(r.errorTimes, now)
	client := r.client
	r.sendReport(CallReportRequest{Kind: "error", ConnectionID: r.connectionID, Client: &client, Error: &CallReportError{Code: code}})
}
func (r *CallReporter) Quality(q CallQuality) {
	has := false
	for _, p := range []*int{q.RTTMS, q.JitterMS} {
		if p != nil {
			if *p < 0 || *p > 60000 {
				if p == q.RTTMS {
					q.RTTMS = nil
				} else {
					q.JitterMS = nil
				}
			} else {
				has = true
			}
		}
	}
	for _, p := range []*int64{q.PacketsLost, q.PacketsReceived} {
		if p != nil {
			if *p < 0 || *p > 2147483647 {
				if p == q.PacketsLost {
					q.PacketsLost = nil
				} else {
					q.PacketsReceived = nil
				}
			} else {
				has = true
			}
		}
	}
	if q.Reconnects != nil {
		if *q.Reconnects < 0 || *q.Reconnects > 1000 {
			q.Reconnects = nil
		} else {
			has = true
		}
	}
	for _, p := range []*string{&q.AudioCodec, &q.VideoCodec} {
		if *p != "" {
			valid := true
			for _, c := range *p {
				if !(c >= 'a' && c <= 'z' || c >= 'A' && c <= 'Z' || c >= '0' && c <= '9' || c == '/' || c == '.' || c == '-') {
					valid = false
				}
			}
			if len(*p) > 32 || !valid {
				*p = ""
			} else {
				has = true
			}
		}
	}
	if q.CandidateType != "" {
		if q.CandidateType != "host" && q.CandidateType != "srflx" && q.CandidateType != "prflx" && q.CandidateType != "relay" {
			q.CandidateType = ""
		} else {
			has = true
		}
	}
	if !has {
		return
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.stopped || !r.lastQuality.IsZero() && time.Since(r.lastQuality) < 5*time.Second {
		return
	}
	r.lastQuality = time.Now()
	client := r.client
	r.sendReport(CallReportRequest{Kind: "quality", ConnectionID: r.connectionID, Client: &client, Quality: &q})
}
func (c *Call) ReportQuality(q CallQuality) {
	c.mu.Lock()
	r := c.reporter
	c.mu.Unlock()
	if r != nil {
		r.Quality(q)
	}
}
func (c *Call) ReportError(code string) {
	c.mu.Lock()
	r := c.reporter
	c.mu.Unlock()
	if r != nil {
		r.Error(code)
	}
}
