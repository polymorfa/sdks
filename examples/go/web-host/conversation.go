package main

import (
	"encoding/json"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	polymorfa "github.com/polymorfa/sdks/packages/go"
)

// Application-owned example state, never HMS. It lasts for this process only.
// At capacity, sends fail closed rather than forgetting their replay keys.
type conversationState struct {
	mu        sync.Mutex
	sendMu    sync.Mutex
	messages  []conversationMessage
	attempts  map[string]*sendAttempt
	eventIDs  []string
	received  int
	lastEvent string
}
type conversationMessage struct {
	ID        string `json:"id"`
	ClientID  string `json:"clientId,omitempty"`
	Text      string `json:"text"`
	CreatedAt int64  `json:"createdAt"`
	Direction string `json:"direction"`
	Status    string `json:"status"`
	Receipt   string `json:"receipt,omitempty"`
}
type sendAttempt struct {
	text    string
	message *conversationMessage
}

var callerKey = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func (a *app) sendMessage(w http.ResponseWriter, r *http.Request) {
	if !a.originAllowed(w, r) {
		return
	}
	if _, ok := a.authenticated(r); !ok {
		http.Error(w, "Sign in required.", 401)
		return
	}
	key := r.Header.Get("Idempotency-Key")
	var input struct {
		Text string `json:"text"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16384))
	decoder.DisallowUnknownFields()
	if decoder.Decode(&input) != nil || decoder.Decode(new(any)) != io.EOF || !callerKey.MatchString(key) || strings.TrimSpace(input.Text) == "" || len(input.Text) > 4096 {
		http.Error(w, "Send text and a UUID Idempotency-Key; targets are assigned by the server.", 400)
		return
	}
	if a.peer == "" {
		http.Error(w, "No authorized recipient configured.", 503)
		return
	}
	s := &a.conversation
	s.sendMu.Lock()
	defer s.sendMu.Unlock()
	if s.attempts == nil {
		s.attempts = map[string]*sendAttempt{}
	}
	attempt := s.attempts[key]
	if attempt != nil {
		if attempt.text != input.Text {
			http.Error(w, "This key belongs to different text.", 409)
			return
		}
		if attempt.message != nil {
			writeJSON(w, attempt.message)
			return
		}
	} else {
		if len(s.attempts) >= 128 {
			http.Error(w, "Example send capacity reached. Restart the example for a new session.", 429)
			return
		}
		attempt = &sendAttempt{text: input.Text}
		s.attempts[key] = attempt
	}
	result, err := a.client.Messages().Send(r.Context(), a.session, polymorfa.SendMessageRequest{
		Conversation: polymorfa.ConversationReference{PhoneNumber: a.peer}, Content: polymorfa.MessageContent{Text: &input.Text},
	}, polymorfa.RequestOptions{IdempotencyKey: key, Timeout: 60 * time.Second})
	if err != nil || !result.Data.Success || result.Data.Data.ID == "" {
		// An interrupted send may have succeeded. Keep its key and text so retry
		// asks the API for the same operation, never creates a replacement send.
		http.Error(w, "Send outcome unknown. Retry this message with the same key.", 502)
		return
	}
	receipt := result.Data.Data
	at, err := time.Parse(time.RFC3339Nano, receipt.Timestamp)
	if err != nil {
		at = time.Now()
	}
	message := conversationMessage{ID: receipt.ID, ClientID: key, Text: input.Text, CreatedAt: at.UnixMilli(), Direction: "outbound", Status: "sent", Receipt: receipt.Status}
	s.mu.Lock()
	s.upsert(message)
	s.mu.Unlock()
	attempt.message = &message
	writeJSON(w, message)
}

func (s *conversationState) upsert(message conversationMessage) {
	for i, old := range s.messages {
		if old.ID == message.ID {
			s.messages[i] = message
			return
		}
	}
	s.messages = append(s.messages, message)
	if len(s.messages) > 100 {
		s.messages = append([]conversationMessage(nil), s.messages[len(s.messages)-100:]...)
	}
}

func (a *app) receiveEvent(_ *http.Request, event polymorfa.WebhookEvent) error {
	if event.Session != a.session {
		return nil
	}
	payload, known, err := event.TypedPayload()
	if err != nil {
		return err
	}
	if !known {
		return nil
	}
	s := &a.conversation
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, id := range s.eventIDs {
		if id == event.ID {
			return nil
		}
	}
	switch p := payload.(type) {
	case *polymorfa.LinkedDeviceMessagePayload:
		if event.Event != "message.received" || p.FromMe || p.IsGroup || !a.assignedPeer(p.Conversation.PhoneNumber) || p.Text == "" || p.ID == "" || len(p.Text) > 4096 {
			return nil
		}
		s.upsert(conversationMessage{ID: p.ID, Text: p.Text, CreatedAt: p.Timestamp * 1000, Direction: "inbound", Status: "sent", Receipt: "received"})
	case *polymorfa.MessageAckPayload:
		if !a.assignedPeer(p.Conversation.PhoneNumber) {
			return nil
		}
		for _, reference := range p.Messages {
			for i := range s.messages {
				m := &s.messages[i]
				if m.ID == reference.ID && m.Direction == "outbound" && receiptRank(p.Type) > receiptRank(m.Receipt) {
					m.Receipt = p.Type
				}
			}
		}
	default:
		return nil
	}
	s.received++
	s.lastEvent = event.Event
	s.eventIDs = append(s.eventIDs, event.ID)
	if len(s.eventIDs) > 1024 {
		s.eventIDs = s.eventIDs[len(s.eventIDs)-1024:]
	}
	return nil
}
func (a *app) assignedPeer(phone string) bool {
	return a.peer != "" && strings.TrimPrefix(phone, "+") == strings.TrimPrefix(a.peer, "+")
}
func receiptRank(value string) int {
	switch value {
	case "read", "played":
		return 3
	case "delivered", "delivery":
		return 2
	case "sent", "server":
		return 1
	}
	return 0
}

func (a *app) conversationSnapshot(w http.ResponseWriter, r *http.Request) {
	if _, ok := a.authenticated(r); !ok {
		http.Error(w, "Sign in required.", 401)
		return
	}
	s := &a.conversation
	s.mu.Lock()
	defer s.mu.Unlock()
	messages := append([]conversationMessage{}, s.messages...)
	writeJSON(w, map[string]any{"messages": messages, "peer": a.peer, "session": a.session, "receivedEvents": s.received, "lastEvent": s.lastEvent})
}
