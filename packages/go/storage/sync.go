package storage

import (
	"context"
	"encoding/json"
	polymorfa "github.com/polymorfa/sdks/packages/go"
	"iter"
	"sync"
	"time"
)

type HistoryDecoder func(context.Context, map[string]any, polymorfa.WebhookEvent) (map[string]any, error)

// HistoryDescriptorDecoder receives the validated raw public descriptor and original event.
// A nil projection is an error; use DescriptorMetadataOnly to consume progress deliberately.
type HistoryDescriptorDecoder func(context.Context, map[string]any, polymorfa.WebhookEvent) (map[string]any, error)
type HistoryDescriptorMode string

const (
	DescriptorDecode       HistoryDescriptorMode = "decode"
	DescriptorMetadataOnly HistoryDescriptorMode = "metadata-only"
)

type ApplyEventOptions struct {
	DecodeHistory           HistoryDecoder
	DecodeHistoryDescriptor HistoryDescriptorDecoder
	HistoryDescriptorMode   HistoryDescriptorMode
}

// ApplyEvent accepts only an already verified webhook event. A history decoder
// downloads/verifies/decrypts locally before returning complete protocol JSON.
func (e *Engine) ApplyEvent(ctx context.Context, event polymorfa.WebhookEvent, options ApplyEventOptions) (ApplyResult, error) {
	if options.HistoryDescriptorMode != "" && options.HistoryDescriptorMode != DescriptorDecode && options.HistoryDescriptorMode != DescriptorMetadataOnly {
		return ApplyResult{}, storageError("storage_invalid_history_descriptor_mode")
	}
	payload := object(jsonPayload(event.Payload))
	if _, descriptor := payload["delivery"]; event.Event == "history.sync" && descriptor {
		if err := validateHistoryDescriptor(payload); err != nil {
			return ApplyResult{}, err
		}
		if exists, err := e.HasEvent(ctx, event.Session, event.ID); err != nil || exists {
			return ApplyResult{}, err
		}
		batch, err := ReduceEvent(event)
		if err != nil {
			return ApplyResult{}, err
		}
		if options.HistoryDescriptorMode == DescriptorMetadataOnly {
			return e.Apply(ctx, batch)
		}
		if options.DecodeHistoryDescriptor == nil {
			return ApplyResult{}, storageError("storage_history_descriptor_decoder_required")
		}
		chunk, err := options.DecodeHistoryDescriptor(ctx, payload, event)
		if err != nil || !validDescriptorChunk(chunk) {
			return ApplyResult{}, storageError("storage_history_descriptor_decode_failed")
		}
		history, err := ReduceHistoryChunk(HistoryInput{SessionID: event.Session, Chunk: chunk, Identities: &HistoryIdentityIndex{}})
		if err != nil {
			return ApplyResult{}, storageError("storage_history_descriptor_decode_failed")
		}
		batch.Operations = append(history.Operations, batch.Operations...)
		return e.Apply(ctx, batch)
	}
	batch, err := ReduceEvent(event)
	if err != nil {
		return ApplyResult{}, err
	}
	if event.Event == "history.sync" && options.DecodeHistory != nil {
		payload := object(jsonPayload(event.Payload))
		if payload["kind"] != "history" {
			exists, err := e.HasEvent(ctx, event.Session, event.ID)
			if err != nil {
				return ApplyResult{}, err
			}
			if exists {
				return ApplyResult{}, nil
			}
			chunk, err := options.DecodeHistory(ctx, payload, event)
			if err != nil {
				return ApplyResult{}, err
			}
			if chunk != nil {
				history, err := ReduceHistoryChunk(HistoryInput{SessionID: event.Session, Chunk: chunk, Identities: HistoryIndexFromPayload(payload)})
				if err != nil {
					return ApplyResult{}, err
				}
				batch.Operations = append(history.Operations, batch.Operations...)
			}
		}
	}
	return e.Apply(ctx, batch)
}

// EventSource makes manual acknowledgement explicit and permits native custom
// sources without coupling merge policy to a network implementation.
type EventSource interface {
	Stream(context.Context, polymorfa.EventStreamParams) (iter.Seq2[polymorfa.EventStreamItem, error], error)
	Acknowledge(context.Context, polymorfa.EventStreamItem, string) error
}
type APIEventSource struct{ Events *polymorfa.Events }

func (s APIEventSource) Stream(ctx context.Context, params polymorfa.EventStreamParams) (iter.Seq2[polymorfa.EventStreamItem, error], error) {
	if s.Events == nil {
		return nil, invalid()
	}
	stream, err := s.Events.Stream(params)
	if err != nil {
		return nil, err
	}
	return stream.Items(ctx), nil
}
func (s APIEventSource) Acknowledge(ctx context.Context, item polymorfa.EventStreamItem, projectID string) error {
	if s.Events == nil {
		return invalid()
	}
	_, err := s.Events.AcknowledgeStream(ctx, item.StreamID, polymorfa.EventStreamAcknowledgement{Cursor: item.Cursor, Sequence: item.Sequence}, projectID)
	return err
}

type SyncOptions struct {
	CheckpointSession string
	CheckpointStream  string
	Params            polymorfa.EventStreamParams
	RequirePayload    *bool
	Apply             ApplyEventOptions
	OnApplied         func(polymorfa.EventStreamItem, ApplyResult) error
	Now               func() time.Time
}

// SyncToStorage blocks until the source ends, fails, or ctx is cancelled. It
// always orders event commit -> checkpoint CAS -> explicit stream ACK. Resume
// starts at the durable cursor; gaps and missing payloads fail before advance.
func SyncToStorage(ctx context.Context, source EventSource, target *Engine, options SyncOptions) error {
	if options.Apply.HistoryDescriptorMode != "" && options.Apply.HistoryDescriptorMode != DescriptorDecode && options.Apply.HistoryDescriptorMode != DescriptorMetadataOnly {
		return storageError("storage_invalid_history_descriptor_mode")
	}
	if source == nil || target == nil {
		return invalid()
	}
	session, stream := options.CheckpointSession, options.CheckpointStream
	if session == "" {
		session = "*"
	}
	if stream == "" {
		stream = "events"
	}
	saved, err := target.GetCheckpoint(ctx, session, stream)
	if err != nil {
		return err
	}
	expected := &ExpectedCursor{}
	params := options.Params
	params.Ack = "manual"
	if params.Types == nil {
		params.Types = append([]string{}, StoredEventTypes...)
	}
	params.Since = ""
	if saved != nil {
		expected.Value = strValue(saved.Cursor)
		params.Since = saved.Cursor
	}
	owned, cancel := context.WithCancel(ctx)
	defer cancel()
	var gapMu sync.Mutex
	var gapErr error
	previous := params.OnGap
	params.OnGap = func(gap polymorfa.EventStreamGap) {
		gapMu.Lock()
		gapErr = storageError("storage_retention_gap")
		gapMu.Unlock()
		cancel()
		if previous != nil {
			previous(gap)
		}
	}
	items, err := source.Stream(owned, params)
	if err != nil {
		return err
	}
	now := options.Now
	if now == nil {
		now = time.Now
	}
	require := options.RequirePayload == nil || *options.RequirePayload
	for item, itemErr := range items {
		gapMu.Lock()
		gap := gapErr
		gapMu.Unlock()
		if gap != nil {
			return gap
		}
		if err := owned.Err(); err != nil {
			return err
		}
		if itemErr != nil {
			return itemErr
		}
		if item.Cursor == "" || item.StreamID == "" {
			return invalid()
		}
		if item.Webhook == nil && require {
			return storageError("storage_event_payload_missing")
		}
		result := ApplyResult{}
		if item.Webhook != nil {
			result, err = target.ApplyEvent(owned, *item.Webhook, options.Apply)
			if err != nil {
				return err
			}
		}
		updated := float64(now().UnixMilli())
		_, err = target.Apply(owned, Batch{SessionID: session, Operations: []Operation{{Kind: "checkpoint", SessionID: session, Stream: stream, Cursor: item.Cursor, ExpectedCursor: expected, Position: nil, UpdatedAt: &updated}}})
		if err != nil {
			return err
		}
		expected = &ExpectedCursor{strValue(item.Cursor)}
		if err = source.Acknowledge(owned, item, params.ProjectID); err != nil {
			return err
		}
		if options.OnApplied != nil {
			if err = options.OnApplied(item, result); err != nil {
				return err
			}
		}
	}
	gapMu.Lock()
	gap := gapErr
	gapMu.Unlock()
	if gap != nil {
		return gap
	}
	return ctx.Err()
}

func jsonPayload(raw json.RawMessage) any { var value any; json.Unmarshal(raw, &value); return value }
