package polymorfa

import (
	"encoding/json"
	"time"
)

// DirectHistorySyncCommon carries projected public IDs. Retry identity is the
// linked_devices ID, never the event UUID. Length checks belong to downloaders.
type DirectHistorySyncCommon struct {
	webhookPayloadBase
	Delivery                 string              `json:"delivery"`
	WhatsAppIDs              WhatsAppMessageIDs  `json:"whatsapp_ids"`
	OriginalWhatsAppIDs      *WhatsAppMessageIDs `json:"original_whatsapp_ids,omitempty"`
	WhatsAppID               string              `json:"whatsapp_id,omitempty"`
	OriginalWhatsAppID       string              `json:"original_whatsapp_id,omitempty"`
	SyncType                 string              `json:"syncType"`
	ChunkOrder               *uint64             `json:"chunkOrder,omitempty"`
	Progress                 *int                `json:"progress,omitempty"`
	FileLength               uint64              `json:"fileLength"`
	OldestMessageAt          *string             `json:"oldestMessageAt,omitempty"`
	PeerDataRequestSessionID *string             `json:"peerDataRequestSessionId,omitempty"`
}
type DirectHistorySyncMedia struct {
	Type          string  `json:"type"`
	DirectPath    string  `json:"directPath"`
	MediaKey      string  `json:"mediaKey"`
	FileSHA256    string  `json:"fileSha256"`
	FileEncSHA256 string  `json:"fileEncSha256"`
	EncHandle     *string `json:"encHandle,omitempty"`
}

func (DirectHistorySyncMedia) String() string     { return "DirectHistorySyncMedia[redacted]" }
func (v DirectHistorySyncMedia) GoString() string { return v.String() }

type DirectHistorySyncMediaPayload struct {
	DirectHistorySyncCommon
	Media DirectHistorySyncMedia `json:"media"`
}
type DirectHistorySyncInline struct {
	Encoding string `json:"encoding"`
	Data     string `json:"data"`
}

func (DirectHistorySyncInline) String() string     { return "DirectHistorySyncInline[redacted]" }
func (v DirectHistorySyncInline) GoString() string { return v.String() }

type DirectHistorySyncInlinePayload struct {
	DirectHistorySyncCommon
	Inline DirectHistorySyncInline `json:"inline"`
}

func (DirectHistorySyncMediaPayload) String() string {
	return "DirectHistorySyncMediaPayload[redacted]"
}
func (v DirectHistorySyncMediaPayload) GoString() string { return v.String() }
func (DirectHistorySyncInlinePayload) String() string {
	return "DirectHistorySyncInlinePayload[redacted]"
}
func (v DirectHistorySyncInlinePayload) GoString() string { return v.String() }
func decodeDirectHistoryPayload(b []byte) (KnownWebhookPayload, error) {
	var m map[string]json.RawMessage
	if json.Unmarshal(b, &m) != nil || m == nil {
		return nil, validation("Invalid history descriptor payload.")
	}
	_, media := m["media"]
	_, inline := m["inline"]
	if media == inline {
		return nil, validation("History delivery requires exactly one descriptor branch.")
	}
	var common DirectHistorySyncCommon
	if campaignDecode(b, &common) != nil {
		return nil, validation("Invalid history descriptor common fields.")
	}
	if common.Delivery != "descriptor" || common.SyncType == "" || common.Progress != nil && (*common.Progress < 0 || *common.Progress > 100) {
		return nil, validation("Invalid history descriptor metadata.")
	}
	if common.OldestMessageAt != nil {
		if _, e := time.Parse(time.RFC3339Nano, *common.OldestMessageAt); e != nil {
			return nil, validation("Invalid oldest message datetime.")
		}
	}
	if media {
		var v DirectHistorySyncMediaPayload
		if campaignDecode(b, &v) != nil {
			return nil, validation("Invalid history media descriptor.")
		}
		d := v.Media
		if d.Type != "md-msg-hist" || d.DirectPath == "" || d.MediaKey == "" || d.FileSHA256 == "" || d.FileEncSHA256 == "" {
			return nil, validation("Invalid history media descriptor.")
		}
		return &v, nil
	}
	var v DirectHistorySyncInlinePayload
	if campaignDecode(b, &v) != nil {
		return nil, validation("Invalid inline history descriptor.")
	}
	if v.Inline.Encoding != "zlib-base64-protobuf" || v.Inline.Data == "" {
		return nil, validation("Invalid inline history descriptor.")
	}
	return &v, nil
}

// Descriptor-bearing diagnostic serialization follows the media descriptor
// policy. The original signed webhook bytes remain on WebhookEvent.Payload.
func (DirectHistorySyncMedia) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }
func (DirectHistorySyncMediaPayload) MarshalJSON() ([]byte, error) {
	return []byte(`{"redacted":true}`), nil
}
func (DirectHistorySyncInlinePayload) MarshalJSON() ([]byte, error) {
	return []byte(`{"redacted":true}`), nil
}
func (DirectHistorySyncInline) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }
