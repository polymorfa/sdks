package polymorfa

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/url"
	"strings"
)

// WhatsAppMediaSendDescriptor is secret. Standard message sends transmit its
// media key to Polymorfa. Zero-knowledge sends belong to the application sidecar.
type WhatsAppMediaSendDescriptor struct {
	MediaType     UploadMediaType `json:"-"`
	DirectPath    string          `json:"-"`
	URL           string          `json:"-"`
	MediaKey      []byte          `json:"-"`
	FileSHA256    []byte          `json:"-"`
	FileEncSHA256 []byte          `json:"-"`
	FileLength    int64           `json:"-"`
	MimeType      string          `json:"-"`
	WhatsAppMediaSendMetadata
}

func (descriptor WhatsAppMediaSendDescriptor) String() string {
	return "WhatsAppMediaSendDescriptor[redacted]"
}
func (descriptor WhatsAppMediaSendDescriptor) GoString() string { return descriptor.String() }
func (descriptor WhatsAppMediaSendDescriptor) MarshalJSON() ([]byte, error) {
	return []byte(`{"redacted":true}`), nil
}

type WhatsAppMediaSendMetadata struct {
	MimeType          string `json:"-"`
	Thumbnail         []byte `json:"-"`
	Width             *int64 `json:"-"`
	Height            *int64 `json:"-"`
	Seconds           *int64 `json:"-"`
	Waveform          []byte `json:"-"`
	MediaKeyTimestamp *int64 `json:"-"`
	IsAnimated        *bool  `json:"-"`
}

func ToWhatsAppMediaSendDescriptor(upload WhatsAppMediaUploadResult, metadata ...WhatsAppMediaSendMetadata) (WhatsAppMediaSendDescriptor, error) {
	var extra WhatsAppMediaSendMetadata
	if len(metadata) > 0 {
		extra = metadata[0]
	}
	mime := extra.MimeType
	if mime == "" {
		mime = upload.MimeType
	}
	descriptor := WhatsAppMediaSendDescriptor{MediaType: upload.MediaType, DirectPath: upload.DirectPath, URL: upload.URL, MediaKey: bytes.Clone(upload.MediaKey), FileSHA256: bytes.Clone(upload.FileSHA256), FileEncSHA256: bytes.Clone(upload.FileEncSHA256), FileLength: upload.FileLength, MimeType: mime, WhatsAppMediaSendMetadata: extra}
	descriptor.Thumbnail = bytes.Clone(extra.Thumbnail)
	descriptor.Waveform = bytes.Clone(extra.Waveform)
	if err := descriptor.validate(); err != nil {
		return WhatsAppMediaSendDescriptor{}, err
	}
	return descriptor, nil
}
func ascii(value string, lowest byte) bool {
	for _, byte := range []byte(value) {
		if byte < lowest || byte > 126 {
			return false
		}
	}
	return true
}
func (descriptor WhatsAppMediaSendDescriptor) validate() error {
	if !validUploadType(descriptor.MediaType) {
		return configuration("mediaType", "Invalid descriptor media type.")
	}
	if descriptor.MimeType == "" || len(descriptor.MimeType) > 255 || !ascii(descriptor.MimeType, 32) {
		return configuration("mimeType", "A printable ASCII MIME type of 1–255 bytes is required.")
	}
	if len(descriptor.DirectPath) < 2 || len(descriptor.DirectPath) > 2048 || !strings.HasPrefix(descriptor.DirectPath, "/") || strings.HasPrefix(descriptor.DirectPath, "//") || !ascii(descriptor.DirectPath, 33) {
		return configuration("directPath", "A bounded single-slash directPath is required.")
	}
	target, err := url.Parse(descriptor.URL)
	if err != nil || len(descriptor.URL) > 2048 || !strings.HasPrefix(descriptor.URL, "https://") || target.Host == "" || target.User != nil || !ascii(descriptor.URL, 33) {
		return configuration("url", "A bounded HTTPS media URL without credentials is required.")
	}
	if descriptor.FileLength < 1 || descriptor.FileLength > 1<<31 {
		return configuration("fileLength", "fileLength must be 1–2147483648 bytes.")
	}
	if len(descriptor.MediaKey) != 32 || len(descriptor.FileSHA256) != 32 || len(descriptor.FileEncSHA256) != 32 {
		return configuration("mediaKey", "The media key and both hashes must contain 32 bytes.")
	}
	if (descriptor.Width == nil) != (descriptor.Height == nil) || (descriptor.Width != nil && (*descriptor.Width < 1 || *descriptor.Width > 65536 || *descriptor.Height < 1 || *descriptor.Height > 65536)) {
		return configuration("width", "Width and height must be supplied together between 1 and 65536.")
	}
	if descriptor.Seconds != nil && (*descriptor.Seconds < 0 || *descriptor.Seconds > 86400) {
		return configuration("seconds", "seconds must be 0–86400.")
	}
	if len(descriptor.Thumbnail) > 16384 {
		return configuration("thumbnail", "thumbnail must not exceed 16384 bytes.")
	}
	if descriptor.Waveform != nil && (len(descriptor.Waveform) < 64 || len(descriptor.Waveform) > 192) {
		return configuration("waveform", "waveform must contain 64–192 bytes.")
	}
	if descriptor.MediaKeyTimestamp != nil && (*descriptor.MediaKeyTimestamp < 1 || *descriptor.MediaKeyTimestamp > 1<<40) {
		return configuration("mediaKeyTimestamp", "mediaKeyTimestamp is outside the permitted range.")
	}
	if descriptor.MediaType == UploadSticker && (descriptor.MimeType != "image/webp" || descriptor.Thumbnail != nil || descriptor.Seconds != nil || descriptor.Waveform != nil) {
		return configuration("mediaType", "Stickers require image/webp without thumbnail, seconds or waveform.")
	}
	if descriptor.MediaType != UploadSticker && descriptor.IsAnimated != nil {
		return configuration("isAnimated", "isAnimated is only supported for stickers.")
	}
	return nil
}

// Wire explicitly returns secret-bearing send fields. Do not log this map.
func (descriptor WhatsAppMediaSendDescriptor) Wire() (map[string]any, error) {
	if err := descriptor.validate(); err != nil {
		return nil, err
	}
	encode := base64.StdEncoding.EncodeToString
	fields := map[string]any{"directPath": descriptor.DirectPath, "url": descriptor.URL, "mediaKey": encode(descriptor.MediaKey), "fileSha256": encode(descriptor.FileSHA256), "fileEncSha256": encode(descriptor.FileEncSHA256), "fileLength": descriptor.FileLength, "mimeType": descriptor.MimeType}
	if descriptor.Thumbnail != nil {
		fields["thumbnail"] = encode(descriptor.Thumbnail)
	}
	if descriptor.Waveform != nil {
		fields["waveform"] = encode(descriptor.Waveform)
	}
	if descriptor.Width != nil {
		fields["width"] = *descriptor.Width
		fields["height"] = *descriptor.Height
	}
	if descriptor.Seconds != nil {
		fields["seconds"] = *descriptor.Seconds
	}
	if descriptor.MediaKeyTimestamp != nil {
		fields["mediaKeyTimestamp"] = *descriptor.MediaKeyTimestamp
	}
	if descriptor.IsAnimated != nil {
		fields["isAnimated"] = *descriptor.IsAnimated
	}
	return fields, nil
}

type StickerContent struct {
	Descriptor *WhatsAppMediaSendDescriptor `json:"-"`
}
type messageSendWire struct {
	Transport     MessageTransport      `json:"transport,omitempty"`
	Conversation  ConversationReference `json:"conversation"`
	IsForwarded   *bool                 `json:"isForwarded,omitempty"`
	Mentions      []string              `json:"mentions,omitempty"`
	QuotedMessage *QuotedMessage        `json:"quotedMessage,omitempty"`
	Content       map[string]any        `json:"content"`
}

func descriptorMessage(body SendMessageRequest) (any, bool, error) {
	if body.Content.Product != nil && body.Content.Product.Image != nil && body.Content.Product.Image.Descriptor != nil {
		return nil, false, validation("Product images require URL or base64 media.")
	}
	contents := map[string]*MediaContent{"image": body.Content.Image, "video": body.Content.Video, "file": body.Content.File, "voice": body.Content.Voice}
	var content map[string]any
	for kind, media := range contents {
		if media == nil || media.Descriptor == nil {
			continue
		}
		expectedKind, _, err := uploadKind(media.Descriptor.MediaType)
		if err != nil || expectedKind != kind {
			return nil, false, validation("The descriptor media kind does not match this message.")
		}
		if media.URL != "" || media.Base64 != "" || media.MimeType != "" || (kind != "file" && media.Filename != "") || (kind != "voice" && media.PTT != nil) {
			return nil, false, validation("A descriptor cannot be combined with URL/base64/MIME or unsupported media fields.")
		}
		wire, err := media.Descriptor.Wire()
		if err != nil {
			return nil, false, err
		}
		fields := map[string]any{"descriptor": wire}
		if media.Caption != "" {
			fields["caption"] = media.Caption
		}
		if media.Filename != "" {
			fields["filename"] = media.Filename
		}
		if media.PTT != nil {
			fields["ptt"] = *media.PTT
		}
		content = map[string]any{kind: fields}
	}
	if body.Content.Sticker != nil {
		if body.Content.Sticker.Descriptor == nil {
			return nil, false, validation("Stickers require a send descriptor.")
		}
		if body.Content.Sticker.Descriptor.MediaType != UploadSticker {
			return nil, false, validation("Stickers require a sticker descriptor.")
		}
		wire, err := body.Content.Sticker.Descriptor.Wire()
		if err != nil {
			return nil, false, err
		}
		content = map[string]any{"sticker": map[string]any{"descriptor": wire}}
	}
	if content == nil {
		return body, false, nil
	}
	return messageSendWire{body.Transport, body.Conversation, body.IsForwarded, body.Mentions, body.QuotedMessage, content}, true, nil
}

var _ json.Marshaler = WhatsAppMediaSendDescriptor{}

// UnmarshalJSON preserves descriptor responses as typed secret-redacted values.
// The enclosing media kind supplies its HKDF identity; the wire object has none.
func (content *MessageContent) UnmarshalJSON(data []byte) error {
	type plain MessageContent
	var decoded plain
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	for field, kind := range map[string]UploadMediaType{"image": UploadImage, "video": UploadVideo, "file": UploadDocument, "voice": UploadAudio, "sticker": UploadSticker} {
		value, exists := raw[field]
		if !exists {
			continue
		}
		var record map[string]json.RawMessage
		if err := json.Unmarshal(value, &record); err != nil {
			return err
		}
		descriptor, exists := record["descriptor"]
		if !exists {
			continue
		}
		if field == "voice" && decoded.Voice != nil && decoded.Voice.PTT != nil && *decoded.Voice.PTT {
			kind = UploadVoiceNote
		}
		parsed, err := parseSendDescriptor(descriptor, kind)
		if err != nil {
			return err
		}
		switch field {
		case "image":
			decoded.Image.Descriptor = &parsed
		case "video":
			decoded.Video.Descriptor = &parsed
		case "file":
			decoded.File.Descriptor = &parsed
		case "voice":
			decoded.Voice.Descriptor = &parsed
		case "sticker":
			decoded.Sticker.Descriptor = &parsed
		}
	}
	*content = MessageContent(decoded)
	return nil
}
func parseSendDescriptor(data []byte, kind UploadMediaType) (WhatsAppMediaSendDescriptor, error) {
	var raw struct {
		DirectPath        string  `json:"directPath"`
		URL               string  `json:"url"`
		MediaKey          string  `json:"mediaKey"`
		FileSHA256        string  `json:"fileSha256"`
		FileEncSHA256     string  `json:"fileEncSha256"`
		FileLength        int64   `json:"fileLength"`
		MimeType          string  `json:"mimeType"`
		Thumbnail         *string `json:"thumbnail"`
		Waveform          *string `json:"waveform"`
		Width             *int64  `json:"width"`
		Height            *int64  `json:"height"`
		Seconds           *int64  `json:"seconds"`
		MediaKeyTimestamp *int64  `json:"mediaKeyTimestamp"`
		IsAnimated        *bool   `json:"isAnimated"`
	}
	if json.Unmarshal(data, &raw) != nil {
		return WhatsAppMediaSendDescriptor{}, uploadResponseError("The API returned an invalid media descriptor.")
	}
	decode := func(value string) ([]byte, error) {
		if strings.ContainsAny(value, " \r\n\t") {
			return nil, validation("Invalid descriptor base64.")
		}
		decoded, err := base64.StdEncoding.DecodeString(value)
		if err != nil {
			decoded, err = base64.RawStdEncoding.DecodeString(value)
		}
		return decoded, err
	}
	key, err := decode(raw.MediaKey)
	if err != nil {
		return WhatsAppMediaSendDescriptor{}, err
	}
	hash, err := decode(raw.FileSHA256)
	if err != nil {
		return WhatsAppMediaSendDescriptor{}, err
	}
	encryptedHash, err := decode(raw.FileEncSHA256)
	if err != nil {
		return WhatsAppMediaSendDescriptor{}, err
	}
	extra := WhatsAppMediaSendMetadata{Width: raw.Width, Height: raw.Height, Seconds: raw.Seconds, MediaKeyTimestamp: raw.MediaKeyTimestamp, IsAnimated: raw.IsAnimated}
	if raw.Thumbnail != nil {
		extra.Thumbnail, err = decode(*raw.Thumbnail)
		if err != nil {
			return WhatsAppMediaSendDescriptor{}, err
		}
	}
	if raw.Waveform != nil {
		extra.Waveform, err = decode(*raw.Waveform)
		if err != nil {
			return WhatsAppMediaSendDescriptor{}, err
		}
	}
	descriptor := WhatsAppMediaSendDescriptor{MediaType: kind, DirectPath: raw.DirectPath, URL: raw.URL, MediaKey: key, FileSHA256: hash, FileEncSHA256: encryptedHash, FileLength: raw.FileLength, MimeType: raw.MimeType, WhatsAppMediaSendMetadata: extra}
	if err = descriptor.validate(); err != nil {
		return WhatsAppMediaSendDescriptor{}, uploadResponseError("The API returned an invalid media descriptor.")
	}
	return descriptor, nil
}
