package polymorfa

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNativeDescriptorMessageWireAndLegacyVersion(t *testing.T) {
	key := bytes.Repeat([]byte{24}, 32)
	for _, kind := range []UploadMediaType{UploadImage, UploadVideo, UploadAudio, UploadVoiceNote, UploadDocument, UploadSticker} {
		t.Run(string(kind), func(t *testing.T) {
			mime := "fixture/binary"
			if kind == UploadSticker {
				mime = "image/webp"
			}
			encrypted, err := EncryptWhatsAppMedia(context.Background(), []byte("native descriptor fixture"), EncryptMediaOptions{MediaType: kind, MediaKey: key, MimeType: mime})
			if err != nil {
				t.Fatal(err)
			}
			descriptor, err := ToWhatsAppMediaSendDescriptor(WhatsAppMediaUploadResult{EncryptedMediaInfo: encrypted.EncryptedMediaInfo, WhatsAppUploadLocation: WhatsAppUploadLocation{DirectPath: "/fixture/path", URL: "https://cdn.whatsapp.net/fixture/path"}})
			if err != nil {
				t.Fatal(err)
			}
			serialized, _ := json.Marshal(descriptor)
			if string(serialized) != `{"redacted":true}` || strings.Contains(fmt.Sprintf("%#v", descriptor), base64.StdEncoding.EncodeToString(key)) {
				t.Fatal("descriptor secret formatting")
			}
			count := 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
				count++
				w.Header().Set("Content-Type", "application/json")
				var body map[string]any
				if json.NewDecoder(req.Body).Decode(&body) != nil {
					t.Error("message wire JSON")
				}
				if count == 1 {
					if req.Header.Get("Polymorfa-Version") != CustomerOwnedAPIVersion || req.Header.Get("Idempotency-Key") == "" {
						t.Error("descriptor API date/idempotency")
					}
					mapped, _, _ := uploadKind(kind)
					if kind == UploadDocument {
						mapped = "file"
					}
					content := body["content"].(map[string]any)[mapped].(map[string]any)
					wire := content["descriptor"].(map[string]any)
					if wire["mediaKey"] != base64.StdEncoding.EncodeToString(key) || wire["fileSha256"] != base64.StdEncoding.EncodeToString(encrypted.FileSHA256) || wire["mimeType"] != mime || wire["fileLength"] != float64(encrypted.FileLength) {
						t.Error("descriptor binary fields/metadata")
					}
				} else if req.Header.Get("Polymorfa-Version") != APIVersion {
					t.Error("ordinary send version changed")
				}
				if count == 1 {
					json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{"id": "fixture", "type": "image", "content": body["content"]}})
				} else {
					io.WriteString(w, `{"success":true,"data":{"id":"fixture","type":"text"}}`)
				}
			}))
			defer server.Close()
			sdk := mustMessaging(t, server.URL)
			media := &MediaContent{Descriptor: &descriptor}
			if kind == UploadVoiceNote {
				yes := true
				media.PTT = &yes
			}
			content := MessageContent{}
			switch kind {
			case UploadImage:
				content.Image = media
			case UploadVideo:
				content.Video = media
			case UploadDocument:
				content.File = media
			case UploadAudio, UploadVoiceNote:
				content.Voice = media
			case UploadSticker:
				content.Sticker = &StickerContent{Descriptor: &descriptor}
			}
			response, err := sdk.Messages().Send(context.Background(), "session", SendMessageRequest{Conversation: ConversationReference{ID: "conversation"}, Content: content})
			if err != nil {
				t.Fatal(err)
			}
			parsed := response.Data.Data.Content
			var returned *WhatsAppMediaSendDescriptor
			switch kind {
			case UploadImage:
				returned = parsed.Image.Descriptor
			case UploadVideo:
				returned = parsed.Video.Descriptor
			case UploadDocument:
				returned = parsed.File.Descriptor
			case UploadAudio, UploadVoiceNote:
				returned = parsed.Voice.Descriptor
			case UploadSticker:
				returned = parsed.Sticker.Descriptor
			}
			if returned == nil || !bytes.Equal(returned.MediaKey, key) || returned.MediaType != kind {
				t.Fatal("response descriptor was lost or misidentified")
			}
			text := "legacy"
			_, err = sdk.Messages().Send(context.Background(), "session", SendMessageRequest{Conversation: ConversationReference{ID: "conversation"}, Content: MessageContent{Text: &text}})
			if err != nil || count != 2 {
				t.Fatal("ordinary send", err)
			}
		})
	}
}
func TestDescriptorBoundsKindsAndExclusiveSources(t *testing.T) {
	info := EncryptedMediaInfo{MediaType: UploadImage, MediaKey: bytes.Repeat([]byte{1}, 32), FileSHA256: bytes.Repeat([]byte{2}, 32), FileEncSHA256: bytes.Repeat([]byte{3}, 32), FileLength: 1, MimeType: "image/jpeg"}
	upload := WhatsAppMediaUploadResult{EncryptedMediaInfo: info, WhatsAppUploadLocation: WhatsAppUploadLocation{DirectPath: "/fixture", URL: "https://cdn.whatsapp.net/fixture"}}
	negative := int64(-1)
	large := int64(65537)
	one := int64(1)
	seconds := int64(86401)
	stamp := int64(1<<40 + 1)
	falseValue := false
	for _, metadata := range []WhatsAppMediaSendMetadata{{Width: &one}, {Width: &large, Height: &one}, {Width: &negative, Height: &one}, {Seconds: &seconds}, {Waveform: []byte{1}}, {Thumbnail: make([]byte, 16385)}, {MediaKeyTimestamp: &stamp}, {IsAnimated: &falseValue}, {MimeType: "image/jpeg\r\nprivate"}} {
		if _, err := ToWhatsAppMediaSendDescriptor(upload, metadata); err == nil {
			t.Fatal("invalid metadata accepted")
		}
	}
	for _, mutate := range []func(*WhatsAppMediaUploadResult){func(v *WhatsAppMediaUploadResult) { v.FileLength = 0 }, func(v *WhatsAppMediaUploadResult) { v.MediaKey = make([]byte, 31) }, func(v *WhatsAppMediaUploadResult) { v.DirectPath = "//fixture" }, func(v *WhatsAppMediaUploadResult) { v.URL = "https://private:secret@cdn.whatsapp.net/fixture" }} {
		bad := upload
		mutate(&bad)
		if _, err := ToWhatsAppMediaSendDescriptor(bad); err == nil {
			t.Fatal("invalid descriptor accepted")
		}
	}
	descriptor, err := ToWhatsAppMediaSendDescriptor(upload)
	if err != nil {
		t.Fatal(err)
	}
	sdk := mustMessaging(t, "http://127.0.0.1:1")
	for _, content := range []MessageContent{{Image: &MediaContent{Descriptor: &descriptor, URL: "https://fixture.invalid"}}, {Image: &MediaContent{Descriptor: &descriptor, MimeType: "image/jpeg"}}, {Voice: &MediaContent{Descriptor: &descriptor}}, {Sticker: &StickerContent{Descriptor: &descriptor}}} {
		_, err := sdk.Messages().Send(context.Background(), "session", SendMessageRequest{Conversation: ConversationReference{ID: "conversation"}, Content: content})
		var typed *Error
		if !errors.As(err, &typed) || typed.Kind != ValidationError {
			t.Fatal("invalid media source reached transport", err)
		}
	}
}

func TestDescriptorResponseRejectsMalformedSecretFields(t *testing.T) {
	for _, wire := range []string{`{"image":{"descriptor":null}}`, `{"image":{"descriptor":{"mediaKey":"private secret"}}}`, `{"sticker":{"descriptor":[]}}`} {
		var content MessageContent
		if err := json.Unmarshal([]byte(wire), &content); err == nil {
			t.Fatal("malformed descriptor response accepted")
		}
	}
}
