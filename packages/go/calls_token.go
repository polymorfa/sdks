package polymorfa

import (
	"context"
	"strings"
	"sync"
	"time"
)

type CallsToken struct {
	Value     string
	ExpiresAt time.Time
}

func (t CallsToken) String() string   { return "CallsToken[redacted]" }
func (t CallsToken) GoString() string { return t.String() }

type CallsTokenRequest struct{ Refresh bool }
type CallsTokenProvider func(context.Context, CallsTokenRequest) (CallsToken, error)
type callsTokenFetch struct {
	done       chan struct{}
	cancel     context.CancelFunc
	refresh    bool
	waiters    int
	generation uint64
	token      CallsToken
	err        error
}
type CallsTokenSource struct {
	provider   CallsTokenProvider
	mu         sync.Mutex
	cached     *CallsToken
	pending    *callsTokenFetch
	generation uint64
	now        func() time.Time
	skew       time.Duration
}

func NewCallsTokenSource(provider CallsTokenProvider) (*CallsTokenSource, error) {
	if provider == nil {
		return nil, configuration("tokenProvider", "A token provider is required.")
	}
	return &CallsTokenSource{provider: provider, now: time.Now, skew: 30 * time.Second}, nil
}
func (s *CallsTokenSource) Get(ctx context.Context, refresh bool) (CallsToken, error) {
	if ctx.Err() != nil {
		return CallsToken{}, contextError(ctx, ctx.Err())
	}
	s.mu.Lock()
	if !refresh && s.cached != nil && (s.cached.ExpiresAt.IsZero() || s.cached.ExpiresAt.Add(-s.skew).After(s.now())) {
		v := *s.cached
		s.mu.Unlock()
		return v, nil
	}
	if refresh {
		s.cached = nil
	}
	pending := s.pending
	if pending == nil || (refresh && !pending.refresh) {
		s.generation++
		providerCtx, cancel := context.WithCancel(context.Background())
		pending = &callsTokenFetch{done: make(chan struct{}), cancel: cancel, refresh: refresh, generation: s.generation}
		s.pending = pending
		go s.fetch(providerCtx, pending)
	}
	pending.waiters++
	s.mu.Unlock()
	select {
	case <-ctx.Done():
		s.mu.Lock()
		pending.waiters--
		if pending.waiters == 0 {
			if s.pending == pending {
				s.pending = nil
				s.generation++
			}
			pending.cancel()
		}
		s.mu.Unlock()
		return CallsToken{}, contextError(ctx, ctx.Err())
	case <-pending.done:
		s.mu.Lock()
		pending.waiters--
		s.mu.Unlock()
		return pending.token, pending.err
	}
}
func (s *CallsTokenSource) fetch(ctx context.Context, f *callsTokenFetch) {
	token, err := s.provider(ctx, CallsTokenRequest{Refresh: f.refresh})
	if err == nil {
		_, err = callsCredential(token.Value)
		if err == nil && !token.ExpiresAt.IsZero() && !token.ExpiresAt.After(s.now()) {
			err = configuration("token", "Token provider returned an expired token.")
		}
	}
	s.mu.Lock()
	f.token, f.err = token, err
	if s.pending == f {
		s.pending = nil
	}
	if err == nil && s.generation == f.generation {
		s.cached = &token
	}
	close(f.done)
	f.cancel()
	s.mu.Unlock()
}
func (s *CallsTokenSource) Invalidate() {
	s.mu.Lock()
	s.cached = nil
	s.pending = nil
	s.generation++
	s.mu.Unlock()
}
func callsCredential(value string) (Credential, error) {
	kind := OrganizationAPIKey
	if strings.HasPrefix(value, "pmfa_ct_") {
		kind = ClientToken
	} else if strings.HasPrefix(value, "pmfa_pt_") {
		kind = ProjectToken
	}
	c := Credential{Kind: kind, Value: value}
	return c, validateCredential(c, true)
}
func (c *CallsClient) api(ctx context.Context, refresh bool) (*MessagingClient, CallsToken, error) {
	if c.tokens == nil {
		return c.messaging, CallsToken{Value: c.messaging.t.config.Credential.Value}, nil
	}
	token, err := c.tokens.Get(ctx, refresh)
	if err != nil {
		return nil, token, err
	}
	credential, err := callsCredential(token.Value)
	if err != nil {
		return nil, token, err
	}
	cfg := c.messaging.t.config
	cfg.Credential = credential
	m, err := NewMessagingClient(cfg)
	return m, token, err
}
func (l *CallsLifecycle) RefreshAuth(ctx context.Context, token CallsToken) error {
	if _, err := callsCredential(token.Value); err != nil {
		return err
	}
	return l.sendAuth(ctx, token.Value)
}
func (m *CallsMediaSocket) RefreshAuth(ctx context.Context, token CallsToken, participant string) error {
	if _, err := callsCredential(token.Value); err != nil {
		return err
	}
	return m.sendAuth(ctx, token.Value, participant)
}
