package polymorfa

import "context"

type LiveEventMetadata struct{ Cursor string }
type LiveEventSubscriptionOptions struct {
	Cursor  *string
	OnError func(error)
}

// EventStreamSource adapts retained webhook bodies to an application-owned live event consumer.
type EventStreamSource struct {
	open   func(EventStreamParams) (*EventStream, error)
	params EventStreamParams
}
type LiveEventSubscription struct {
	cancel context.CancelFunc
	done   <-chan struct{}
}

func (s *LiveEventSubscription) Cancel()               { s.cancel() }
func (s *LiveEventSubscription) Done() <-chan struct{} { return s.done }
func NewEventStreamSource(open func(EventStreamParams) (*EventStream, error), p EventStreamParams) (*EventStreamSource, error) {
	if open == nil {
		return nil, configuration("open", "A stream factory is required.")
	}
	p.Types = append([]string(nil), p.Types...)
	return &EventStreamSource{open, p}, nil
}
func (r *Events) LiveSource(p EventStreamParams) (*EventStreamSource, error) {
	if _, err := r.Stream(p); err != nil {
		return nil, err
	}
	return NewEventStreamSource(r.Stream, p)
}

// Subscribe starts one cancellable reader. Cancel returns immediately; Done closes after the body and watchdog are released.
func (s *EventStreamSource) Subscribe(ctx context.Context, listener func([]WebhookEvent, LiveEventMetadata), o LiveEventSubscriptionOptions) (*LiveEventSubscription, error) {
	if listener == nil {
		return nil, configuration("listener", "A live event listener is required.")
	}
	p := s.params
	p.Types = append([]string(nil), p.Types...)
	if o.Cursor != nil {
		p.Since = *o.Cursor
	}
	stream, err := s.open(p)
	if err != nil {
		return nil, err
	}
	if stream == nil {
		return nil, configuration("open", "The stream factory returned no stream.")
	}
	child, cancel := context.WithCancel(ctx)
	done := make(chan struct{})
	subscription := &LiveEventSubscription{cancel, done}
	go func() {
		defer close(done)
		defer cancel()
		for item, err := range stream.Items(child) {
			if err != nil {
				if child.Err() == nil && o.OnError != nil {
					o.OnError(err)
				}
				return
			}
			if child.Err() != nil {
				return
			}
			if item.Webhook != nil {
				listener([]WebhookEvent{*item.Webhook}, LiveEventMetadata{item.Cursor})
			}
		}
	}()
	return subscription, nil
}
