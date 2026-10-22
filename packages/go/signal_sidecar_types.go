package polymorfa

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"unicode/utf8"
)

const SignalSidecarSourceCommit = "8aa191ef0d4c318229c91bcdf474bf2d79dac47c"

type SignalSession struct {
	ID              string  `json:"id"`
	LeaseGeneration uint64  `json:"lease_generation"`
	Claimed         bool    `json:"claimed"`
	HasDeviceKeys   bool    `json:"has_device_keys"`
	State           string  `json:"state"`
	PN              *string `json:"pn"`
	LID             *string `json:"lid"`
}

func (SignalSession) String() string               { return "SignalSession[redacted]" }
func (v SignalSession) GoString() string           { return v.String() }
func (SignalSession) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }

type SignalSessions struct {
	NodeID   string          `json:"node_id"`
	Sessions []SignalSession `json:"sessions"`
}

func (SignalSessions) String() string               { return "SignalSessions[redacted]" }
func (v SignalSessions) GoString() string           { return v.String() }
func (SignalSessions) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }

type SignalMediaDescriptor struct {
	Kind              string  `json:"kind"`
	DirectPath        string  `json:"direct_path"`
	URL               string  `json:"url,omitempty"`
	MediaKey          []byte  `json:"media_key"`
	FileSHA256        []byte  `json:"file_sha256"`
	FileEncSHA256     []byte  `json:"file_enc_sha256"`
	FileLength        uint64  `json:"file_length"`
	MimeType          string  `json:"mimetype"`
	Caption           *string `json:"caption,omitempty"`
	FileName          *string `json:"file_name,omitempty"`
	Width             *uint32 `json:"width,omitempty"`
	Height            *uint32 `json:"height,omitempty"`
	Seconds           *uint32 `json:"seconds,omitempty"`
	MediaKeyTimestamp *int64  `json:"media_key_timestamp,omitempty"`
	PTT               *bool   `json:"ptt,omitempty"`
}

func (SignalMediaDescriptor) String() string               { return "SignalMediaDescriptor[redacted]" }
func (v SignalMediaDescriptor) GoString() string           { return v.String() }
func (SignalMediaDescriptor) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }

// ToSignalMediaDescriptor keeps attachment keys on the customer's service path.
func ToSignalMediaDescriptor(upload WhatsAppMediaUploadResult) (SignalMediaDescriptor, error) {
	kind := string(upload.MediaType)
	var ptt *bool
	if upload.MediaType == UploadVoiceNote {
		kind = "audio"
		yes := true
		ptt = &yes
	}
	result := SignalMediaDescriptor{Kind: kind, DirectPath: upload.DirectPath, URL: upload.URL, MediaKey: bytes.Clone(upload.MediaKey), FileSHA256: bytes.Clone(upload.FileSHA256), FileEncSHA256: bytes.Clone(upload.FileEncSHA256), FileLength: uint64(upload.FileLength), MimeType: upload.MimeType, PTT: ptt}
	if upload.FileLength < 1 || result.validateSend() != nil {
		return SignalMediaDescriptor{}, validation("Invalid Signal media descriptor.")
	}
	return result, nil
}
func (d SignalMediaDescriptor) validateSend() error {
	switch d.Kind {
	case "image", "video", "audio", "document", "sticker":
	default:
		return validation("Invalid Signal media kind.")
	}
	if !utf8.ValidString(d.DirectPath) || !utf8.ValidString(d.MimeType) || !utf8.ValidString(d.URL) || (d.Caption != nil && !utf8.ValidString(*d.Caption)) || (d.FileName != nil && !utf8.ValidString(*d.FileName)) {
		return validation("Invalid Signal media text.")
	}
	if d.DirectPath == "" || d.MimeType == "" || d.FileLength == 0 || len(d.MediaKey) != 32 || len(d.FileSHA256) != 32 || len(d.FileEncSHA256) != 32 {
		return validation("Invalid Signal media descriptor.")
	}
	return nil
}

type SignalHistoryDescriptor struct {
	NotificationProto        []byte  `json:"notification_proto"`
	DirectPath               *string `json:"direct_path"`
	MediaKey                 []byte  `json:"media_key"`
	FileSHA256               []byte  `json:"file_sha256"`
	FileEncSHA256            []byte  `json:"file_enc_sha256"`
	OriginalMessageID        *string `json:"original_message_id"`
	PeerDataRequestSessionID *string `json:"peer_data_request_session_id"`
	InlinePayload            []byte  `json:"inline_payload"`
	SyncType                 *int64  `json:"sync_type"`
	ChunkOrder               *int64  `json:"chunk_order"`
	Progress                 *int64  `json:"progress"`
	FileLength               *uint64 `json:"file_length"`
}

func (SignalHistoryDescriptor) String() string               { return "SignalHistoryDescriptor[redacted]" }
func (v SignalHistoryDescriptor) GoString() string           { return v.String() }
func (SignalHistoryDescriptor) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }

type SignalEvent struct {
	ID              string                   `json:"id"`
	Type            string                   `json:"type"`
	SessionID       string                   `json:"session_id"`
	Chat            string                   `json:"chat"`
	Sender          string                   `json:"sender"`
	SenderAlt       *string                  `json:"sender_alt,omitempty"`
	MessageID       string                   `json:"message_id"`
	Timestamp       int64                    `json:"timestamp"`
	IsFromMe        bool                     `json:"is_from_me"`
	Redelivered     bool                     `json:"redelivered"`
	IdentityChanged bool                     `json:"identity_changed"`
	MessageProto    []byte                   `json:"message_proto"`
	Text            *string                  `json:"text,omitempty"`
	Media           *SignalMediaDescriptor   `json:"media,omitempty"`
	History         *SignalHistoryDescriptor `json:"history,omitempty"`
	RawJSON         json.RawMessage          `json:"-"`
}

func (SignalEvent) String() string               { return "SignalEvent[redacted]" }
func (v SignalEvent) GoString() string           { return v.String() }
func (SignalEvent) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }
func strictSignalBytes(fields map[string]json.RawMessage, name string, nullable bool) bool {
	raw, exists := fields[name]
	if !exists {
		return nullable
	}
	if bytes.Equal(raw, []byte("null")) {
		return nullable
	}
	var encoded string
	if json.Unmarshal(raw, &encoded) != nil {
		return false
	}
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	return err == nil && base64.StdEncoding.EncodeToString(decoded) == encoded
}
func parseSignalEvent(raw []byte) (SignalEvent, error) {
	if !utf8.Valid(raw) {
		return SignalEvent{}, signalInvalid()
	}
	var fields map[string]json.RawMessage
	if json.Unmarshal(raw, &fields) != nil || fields == nil {
		return SignalEvent{}, signalInvalid()
	}
	for _, name := range []string{"id", "type", "session_id", "chat", "sender", "message_id", "timestamp", "is_from_me", "redelivered", "identity_changed", "message_proto"} {
		value, ok := fields[name]
		if !ok || bytes.Equal(value, []byte("null")) {
			return SignalEvent{}, signalInvalid()
		}
	}
	if !strictSignalBytes(fields, "message_proto", false) {
		return SignalEvent{}, signalInvalid()
	}
	var event SignalEvent
	if json.Unmarshal(raw, &event) != nil || event.ID == "" || event.SessionID == "" || (event.Type != "message" && event.Type != "history.sync") {
		return SignalEvent{}, signalInvalid()
	}
	if event.Type == "history.sync" && (event.History == nil || len(event.MessageProto) != 0) {
		return SignalEvent{}, signalInvalid()
	}
	if event.History != nil {
		var history map[string]json.RawMessage
		if json.Unmarshal(fields["history"], &history) != nil || !strictSignalBytes(history, "notification_proto", false) {
			return SignalEvent{}, signalInvalid()
		}
		for _, key := range []string{"media_key", "file_sha256", "file_enc_sha256", "inline_payload"} {
			if !strictSignalBytes(history, key, true) {
				return SignalEvent{}, signalInvalid()
			}
		}
	}
	if event.Media != nil {
		var media map[string]json.RawMessage
		if json.Unmarshal(fields["media"], &media) != nil {
			return SignalEvent{}, signalInvalid()
		}
		for _, name := range []string{"kind", "direct_path", "media_key", "file_sha256", "file_enc_sha256", "file_length", "mimetype"} {
			if media[name] == nil || bytes.Equal(media[name], []byte("null")) {
				return SignalEvent{}, signalInvalid()
			}
		}
		for _, key := range []string{"media_key", "file_sha256", "file_enc_sha256"} {
			if !strictSignalBytes(media, key, false) {
				return SignalEvent{}, signalInvalid()
			}
		}
		switch event.Media.Kind {
		case "image", "video", "audio", "document", "sticker":
		default:
			return SignalEvent{}, signalInvalid()
		}
	}
	event.RawJSON = bytes.Clone(raw)
	return event, nil
}

type SignalSendRequest struct {
	To    string
	Text  *string
	Media *SignalMediaDescriptor
}

func (SignalSendRequest) String() string               { return "SignalSendRequest[redacted]" }
func (v SignalSendRequest) GoString() string           { return v.String() }
func (SignalSendRequest) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }

type SignalSendOutcome struct {
	MessageID       string `json:"message_id"`
	ServerTimestamp int64  `json:"server_timestamp"`
	Resent          bool   `json:"resent"`
}

// SignalWebhookStore atomically deduplicates and durably applies the event.
// true means newly applied; false means previously applied. No in-memory fallback.
type SignalWebhookStore interface {
	ApplyOnce(context.Context, SignalEvent) (bool, error)
}
