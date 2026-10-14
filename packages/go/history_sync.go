package polymorfa

import (
	"bytes"
	"compress/flate"
	"compress/gzip"
	"compress/zlib"
	"context"
	"encoding/binary"
	"encoding/json"
	"io"
	"net/http"
	"unicode/utf8"
)

const DefaultHistorySyncMaxInflatedBytes int64 = 512 * 1024 * 1024

// HistoryProtobufField preserves the original tag, value and complete wire bytes.
// Length-delimited data is opaque unless the pinned schema identifies a message.
type HistoryProtobufField struct {
	Number   uint32
	WireType uint8
	Raw      []byte
	Bytes    []byte
	Integer  uint64
}

func (HistoryProtobufField) String() string               { return "HistoryProtobufField[redacted]" }
func (v HistoryProtobufField) GoString() string           { return v.String() }
func (HistoryProtobufField) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }

type HistorySyncData struct {
	Protobuf      []byte
	Fields        []HistoryProtobufField
	SyncType      uint32
	ChunkOrder    *uint32
	Progress      *uint32
	Conversations []HistoryConversation
	Decoded       any
}

func (HistorySyncData) String() string               { return "HistorySyncData[redacted]" }
func (v HistorySyncData) GoString() string           { return v.String() }
func (HistorySyncData) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }

type HistoryConversation struct {
	ID       string
	Protobuf []byte
	Fields   []HistoryProtobufField
	Messages []HistorySyncMessage
}

func (HistoryConversation) String() string               { return "HistoryConversation[redacted]" }
func (v HistoryConversation) GoString() string           { return v.String() }
func (HistoryConversation) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }

type HistorySyncMessage struct {
	Protobuf        []byte
	Fields          []HistoryProtobufField
	MessageProtobuf []byte
	MessageOrderID  *uint64
}

func (HistorySyncMessage) String() string               { return "HistorySyncMessage[redacted]" }
func (v HistorySyncMessage) GoString() string           { return v.String() }
func (HistorySyncMessage) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }

type DecodeHistorySyncOptions struct {
	MaxInflatedBytes int64
	// Decoder receives a private copy of verified, inflated protobuf. It may use
	// the full pinned proto2 schema; the lossless Protobuf field is always retained.
	Decoder func(context.Context, []byte) (any, error)
}
type DownloadHistoryChunkOptions struct {
	DecodeHistorySyncOptions
	MaxBytes   int64
	HTTPClient *http.Client
}
type HistorySyncChunkDescriptor struct {
	DirectPath    string
	MediaKey      []byte
	FileSHA256    []byte
	FileEncSHA256 []byte
	FileLength    *int64
}

func (HistorySyncChunkDescriptor) String() string     { return "HistorySyncChunkDescriptor[redacted]" }
func (v HistorySyncChunkDescriptor) GoString() string { return v.String() }
func (HistorySyncChunkDescriptor) MarshalJSON() ([]byte, error) {
	return []byte(`{"redacted":true}`), nil
}

// HistorySyncChunkInput chooses exactly one descriptor or compressed inline blob.
type HistorySyncChunkInput struct {
	Descriptor    *HistorySyncChunkDescriptor
	InlinePayload []byte
}

func (HistorySyncChunkInput) String() string               { return "HistorySyncChunkInput[redacted]" }
func (v HistorySyncChunkInput) GoString() string           { return v.String() }
func (HistorySyncChunkInput) MarshalJSON() ([]byte, error) { return []byte(`{"redacted":true}`), nil }
func historyInvalid() error {
	return mediaError("media_invalid_ciphertext", "The history chunk is not valid compressed HistorySync data.")
}

// parseHistoryFields validates all wire types, including unknown legacy groups.
// Parsing is bounded by the inflated size, one million fields and 64 group levels.
func parseHistoryFields(data []byte, count *int, depth int, group uint32) ([]HistoryProtobufField, int, error) {
	if depth > 64 {
		return nil, 0, historyInvalid()
	}
	fields := []HistoryProtobufField{}
	offset := 0
	for offset < len(data) {
		start := offset
		tag, n := binary.Uvarint(data[offset:])
		if n <= 0 || tag>>3 == 0 || tag>>3 > (1<<29)-1 {
			return nil, 0, historyInvalid()
		}
		offset += n
		number, wire := uint32(tag>>3), uint8(tag&7)
		if wire == 4 {
			if group == number {
				return fields, offset, nil
			}
			return nil, 0, historyInvalid()
		}
		*count++
		if *count > 1000000 {
			return nil, 0, historyInvalid()
		}
		field := HistoryProtobufField{Number: number, WireType: wire}
		switch wire {
		case 0:
			value, n := binary.Uvarint(data[offset:])
			if n <= 0 {
				return nil, 0, historyInvalid()
			}
			offset += n
			field.Integer = value
		case 1, 5:
			size := 8
			if wire == 5 {
				size = 4
			}
			if len(data)-offset < size {
				return nil, 0, historyInvalid()
			}
			field.Bytes = data[offset : offset+size]
			offset += size
		case 2:
			size, n := binary.Uvarint(data[offset:])
			if n <= 0 {
				return nil, 0, historyInvalid()
			}
			offset += n
			if size > uint64(len(data)-offset) {
				return nil, 0, historyInvalid()
			}
			field.Bytes = data[offset : offset+int(size)]
			offset += int(size)
		case 3:
			_, used, err := parseHistoryFields(data[offset:], count, depth+1, number)
			if err != nil {
				return nil, 0, err
			}
			field.Bytes = data[offset : offset+used]
			offset += used
		default:
			return nil, 0, historyInvalid()
		}
		field.Raw = data[start:offset]
		fields = append(fields, field)
	}
	if group != 0 {
		return nil, 0, historyInvalid()
	}
	return fields, offset, nil
}
func historyFields(data []byte, count *int) ([]HistoryProtobufField, error) {
	fields, _, err := parseHistoryFields(data, count, 0, 0)
	return fields, err
}
func historyConversation(raw []byte, count *int) (HistoryConversation, error) {
	fields, err := historyFields(raw, count)
	if err != nil {
		return HistoryConversation{}, err
	}
	result := HistoryConversation{Protobuf: raw, Fields: fields}
	hasID := false
	for _, field := range fields {
		if field.Number == 1 && field.WireType == 2 {
			if !utf8.Valid(field.Bytes) {
				return HistoryConversation{}, historyInvalid()
			}
			result.ID = string(field.Bytes)
			hasID = true
		}
		if field.Number == 2 && field.WireType == 2 {
			msgFields, err := historyFields(field.Bytes, count)
			if err != nil {
				return HistoryConversation{}, err
			}
			msg := HistorySyncMessage{Protobuf: field.Bytes, Fields: msgFields}
			for _, part := range msgFields {
				if part.Number == 1 && part.WireType == 2 {
					if _, err := historyFields(part.Bytes, count); err != nil {
						return HistoryConversation{}, err
					}
					msg.MessageProtobuf = part.Bytes
				}
				if part.Number == 2 && part.WireType == 0 {
					value := part.Integer
					msg.MessageOrderID = &value
				}
			}
			result.Messages = append(result.Messages, msg)
		}
	}
	if !hasID {
		return HistoryConversation{}, historyInvalid()
	}
	return result, nil
}

// DecodeHistorySyncPayload accepts gzip, zlib or raw deflate, as WAGzip.js:37-38
// in Cellar whatsapp-1049950004. It never discards protobuf or unknown fields.
// The handwritten model exposes core history fields; Decoder handles the full schema.
func DecodeHistorySyncPayload(ctx context.Context, compressed []byte, options DecodeHistorySyncOptions) (HistorySyncData, error) {
	if ctx.Err() != nil {
		return HistorySyncData{}, contextError(ctx, ctx.Err())
	}
	limit := options.MaxInflatedBytes
	if limit == 0 {
		limit = DefaultHistorySyncMaxInflatedBytes
	}
	if limit < 1 || limit > 9007199254740991 {
		return HistorySyncData{}, configuration("maxInflatedBytes", "A positive safe byte limit is required.")
	}
	source := bytes.NewReader(compressed)
	var reader io.ReadCloser
	var err error
	if len(compressed) >= 2 && compressed[0] == 31 && compressed[1] == 139 {
		var r *gzip.Reader
		r, err = gzip.NewReader(source)
		if err == nil {
			r.Multistream(false)
			reader = r
		}
	} else if len(compressed) >= 2 && compressed[0]&15 == 8 && (int(compressed[0])<<8|int(compressed[1]))%31 == 0 {
		reader, err = zlib.NewReader(source)
	} else {
		reader = flate.NewReader(source)
	}
	if err != nil {
		return HistorySyncData{}, historyInvalid()
	}
	defer reader.Close()
	var output bytes.Buffer
	buffer := make([]byte, 32768)
	for {
		if ctx.Err() != nil {
			return HistorySyncData{}, contextError(ctx, ctx.Err())
		}
		n, readErr := reader.Read(buffer)
		if int64(output.Len())+int64(n) > limit {
			return HistorySyncData{}, mediaError("media_too_large", "The inflated history chunk exceeds the permitted size.")
		}
		output.Write(buffer[:n])
		if readErr == io.EOF {
			break
		}
		if readErr != nil || n == 0 {
			return HistorySyncData{}, historyInvalid()
		}
	}
	if source.Len() != 0 {
		return HistorySyncData{}, historyInvalid()
	}
	raw := output.Bytes()
	count := 0
	fields, err := historyFields(raw, &count)
	if err != nil {
		return HistorySyncData{}, err
	}
	result := HistorySyncData{Protobuf: raw, Fields: fields}
	hasType := false
	for _, field := range fields {
		if field.WireType == 0 && (field.Number == 1 || field.Number == 5 || field.Number == 6) {
			if field.Integer > 1<<32-1 {
				return HistorySyncData{}, historyInvalid()
			}
			value := uint32(field.Integer)
			switch field.Number {
			case 1:
				result.SyncType = value
				hasType = true
			case 5:
				result.ChunkOrder = &value
			case 6:
				result.Progress = &value
			}
		}
		if field.Number == 2 && field.WireType == 2 {
			conversation, err := historyConversation(field.Bytes, &count)
			if err != nil {
				return HistorySyncData{}, err
			}
			result.Conversations = append(result.Conversations, conversation)
		}
	}
	if !hasType {
		return HistorySyncData{}, historyInvalid()
	}
	if options.Decoder != nil {
		result.Decoded, err = options.Decoder(ctx, bytes.Clone(raw))
		if ctx.Err() != nil {
			return HistorySyncData{}, contextError(ctx, ctx.Err())
		}
		if err != nil {
			return HistorySyncData{}, historyInvalid()
		}
	}
	return result, nil
}
func DownloadHistoryChunk(ctx context.Context, input HistorySyncChunkInput, options DownloadHistoryChunkOptions) (HistorySyncData, error) {
	if ctx.Err() != nil {
		return HistorySyncData{}, contextError(ctx, ctx.Err())
	}
	if (input.Descriptor == nil) == (input.InlinePayload == nil) {
		return HistorySyncData{}, configuration("history", "Choose one descriptor or inline payload.")
	}
	if options.MaxInflatedBytes < 0 || options.MaxInflatedBytes > 9007199254740991 {
		return HistorySyncData{}, configuration("maxInflatedBytes", "A positive safe byte limit is required.")
	}
	bound := options.MaxBytes
	if bound == 0 {
		bound = DefaultWhatsAppMediaMaxBytes
	}
	if bound < 1 || bound > 9007199254740991 {
		return HistorySyncData{}, configuration("maxBytes", "A positive safe byte limit is required.")
	}
	compressed := input.InlinePayload
	if input.Descriptor != nil {
		d := input.Descriptor
		if len(d.MediaKey) != 32 || len(d.FileSHA256) != 32 || len(d.FileEncSHA256) != 32 {
			return HistorySyncData{}, mediaError("media_invalid_descriptor", "History keys and hashes must contain 32 bytes.")
		}
		downloaded, err := DownloadWhatsAppMedia(ctx, WhatsAppMediaDescriptor{MediaKind: "md-msg-hist", DirectPath: d.DirectPath, MediaKey: d.MediaKey, FileSHA256: d.FileSHA256, FileEncSHA256: d.FileEncSHA256, FileLength: d.FileLength}, WhatsAppMediaDownloadOptions{MaxBytes: bound, HTTPClient: options.HTTPClient})
		if err != nil {
			return HistorySyncData{}, err
		}
		compressed = downloaded.Bytes
	}
	if int64(len(compressed)) > bound {
		return HistorySyncData{}, mediaError("media_too_large", "The compressed history chunk exceeds the permitted size.")
	}
	return DecodeHistorySyncPayload(ctx, compressed, options.DecodeHistorySyncOptions)
}

var _ json.Marshaler = HistorySyncData{}
