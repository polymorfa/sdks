package polymorfa

import (
	"bytes"
	"compress/zlib"
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func historyGolden(t *testing.T) map[string]any {
	t.Helper()
	data, err := os.ReadFile("testdata/history-local.json")
	if err != nil {
		t.Fatal(err)
	}
	var v map[string]any
	if json.Unmarshal(data, &v) != nil {
		t.Fatal("history fixture JSON")
	}
	return v
}
func historyBytes(t *testing.T, v map[string]any, name string) []byte {
	t.Helper()
	out, err := base64.StdEncoding.DecodeString(v[name].(string))
	if err != nil {
		t.Fatal(err)
	}
	return out
}
func compressedHistory(raw []byte) []byte {
	var out bytes.Buffer
	w := zlib.NewWriter(&out)
	w.Write(raw)
	w.Close()
	return out.Bytes()
}
func TestHistoryLosslessCompressionFormatsAndDecoder(t *testing.T) {
	v := historyGolden(t)
	raw := historyBytes(t, v, "protobuf")
	unknown := historyBytes(t, v, "unknownFields")
	for _, format := range []string{"zlib", "gzip", "rawDeflate"} {
		calls := 0
		decoded, err := DownloadHistoryChunk(context.Background(), HistorySyncChunkInput{InlinePayload: historyBytes(t, v, format)}, DownloadHistoryChunkOptions{DecodeHistorySyncOptions: DecodeHistorySyncOptions{Decoder: func(ctx context.Context, b []byte) (any, error) {
			calls++
			if !bytes.Equal(b, raw) {
				t.Error("decoder changed raw protobuf")
			}
			b[0] = 0
			return "custom-model", nil
		}}})
		if err != nil {
			t.Fatal(format, err)
		}
		if !bytes.Equal(decoded.Protobuf, raw) || decoded.SyncType != 3 || *decoded.ChunkOrder != 2 || *decoded.Progress != 100 || decoded.Decoded != "custom-model" || calls != 1 {
			t.Fatal("lossless history core fields")
		}
		c := decoded.Conversations[0]
		m := c.Messages[0]
		if c.ID != "user@lid" || !bytes.Equal(m.MessageProtobuf, historyBytes(t, v, "messageProtobuf")) || *m.MessageOrderID != ^uint64(0) {
			t.Fatal("raw message/uint64 preservation")
		}
		rebuilt := []byte{}
		for _, f := range decoded.Fields {
			rebuilt = append(rebuilt, f.Raw...)
		}
		if !bytes.Equal(rebuilt, raw) || !bytes.HasSuffix(rebuilt, unknown) {
			t.Fatal("unknown protobuf fields/groups lost")
		}
		encoded, _ := json.Marshal(decoded)
		if string(encoded) != `{"redacted":true}` || strings.Contains(fmt.Sprintf("%#v", decoded), "private history") {
			t.Fatal("history formatting leak")
		}
	}
}
func TestHistoryMalformedBoundsAndCancellation(t *testing.T) {
	v := historyGolden(t)
	valid := historyBytes(t, v, "zlib")
	for _, compressed := range [][]byte{nil, []byte("invalid"), valid[:len(valid)-1], append(bytes.Clone(valid), 0), append(bytes.Clone(valid), valid...), compressedHistory([]byte{0x08}), compressedHistory([]byte{0x08, 3, 0x12, 1, 0xff}), compressedHistory([]byte{0x08, 3, 0x2c}), compressedHistory([]byte{0x08, 3, 0x2b}), compressedHistory([]byte{0x08, 3, 0x12, 0}), compressedHistory([]byte{0x08, 3, 0x12, 3, 0x0a, 1, 0xff})} {
		calls := 0
		_, err := DecodeHistorySyncPayload(context.Background(), compressed, DecodeHistorySyncOptions{Decoder: func(context.Context, []byte) (any, error) { calls++; return nil, nil }})
		if err == nil || calls != 0 {
			t.Fatal("invalid history reached decoder")
		}
	}
	_, err := DecodeHistorySyncPayload(context.Background(), valid, DecodeHistorySyncOptions{MaxInflatedBytes: 8})
	var typed *Error
	if !errors.As(err, &typed) || typed.Code != "media_too_large" {
		t.Fatal("inflated limit", err)
	}
	_, err = DownloadHistoryChunk(context.Background(), HistorySyncChunkInput{InlinePayload: valid}, DownloadHistoryChunkOptions{MaxBytes: 8})
	if !errors.As(err, &typed) || typed.Code != "media_too_large" {
		t.Fatal("compressed limit", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = DecodeHistorySyncPayload(ctx, valid, DecodeHistorySyncOptions{})
	if !errors.As(err, &typed) || typed.Kind != CancelledError {
		t.Fatal("history cancellation", err)
	}
	_, err = DecodeHistorySyncPayload(context.Background(), valid, DecodeHistorySyncOptions{Decoder: func(context.Context, []byte) (any, error) { return nil, errors.New("private history secret") }})
	if err == nil || strings.Contains(err.Error(), "private") {
		t.Fatal("decoder error leaked")
	}
}
func TestNativeHistoryDownloadVerifiesBeforeDecoder(t *testing.T) {
	v := historyGolden(t)
	for _, corrupt := range []bool{false, true} {
		var calls atomic.Int32
		sdk := uploadFixture(t, func(w http.ResponseWriter, r *http.Request) {
			assertCDNHeaders(t, r)
			if r.Method != "GET" || r.URL.Query().Get("mms-type") != "md-msg-hist" {
				t.Error("history CDN request")
			}
			cipher := historyBytes(t, v, "encrypted")
			if corrupt {
				cipher[0] ^= 1
			}
			w.Write(cipher)
		})
		length := int64(v["fileLength"].(float64))
		descriptor := HistorySyncChunkDescriptor{DirectPath: "/fixture/history", MediaKey: historyBytes(t, v, "mediaKey"), FileSHA256: historyBytes(t, v, "fileSha256"), FileEncSHA256: historyBytes(t, v, "fileEncSha256"), FileLength: &length}
		result, err := DownloadHistoryChunk(context.Background(), HistorySyncChunkInput{Descriptor: &descriptor}, DownloadHistoryChunkOptions{HTTPClient: sdk.t.config.HTTPClient, DecodeHistorySyncOptions: DecodeHistorySyncOptions{Decoder: func(context.Context, []byte) (any, error) { calls.Add(1); return nil, nil }}})
		if corrupt {
			if err == nil || calls.Load() != 0 {
				t.Fatal("unverified history parsed")
			}
		} else if err != nil || calls.Load() != 1 || !bytes.Equal(result.Protobuf, historyBytes(t, v, "protobuf")) {
			t.Fatal("native history download", err)
		}
	}
}
func TestNativeHistoryDownloadStalledBodyCancellation(t *testing.T) {
	v := historyGolden(t)
	sdk := uploadFixture(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(200)
		w.(http.Flusher).Flush()
		<-r.Context().Done()
	})
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()
	_, err := DownloadHistoryChunk(ctx, HistorySyncChunkInput{Descriptor: &HistorySyncChunkDescriptor{DirectPath: "/fixture/history", MediaKey: historyBytes(t, v, "mediaKey"), FileSHA256: historyBytes(t, v, "fileSha256"), FileEncSHA256: historyBytes(t, v, "fileEncSha256")}}, DownloadHistoryChunkOptions{HTTPClient: sdk.t.config.HTTPClient})
	if err == nil {
		t.Fatal("stalled history body ignored cancellation")
	}
}

func TestHistoryLargeChunkAndDeepUnknownGroupBounds(t *testing.T) {
	v := historyGolden(t)
	golden, err := DecodeHistorySyncPayload(context.Background(), historyBytes(t, v, "zlib"), DecodeHistorySyncOptions{})
	if err != nil {
		t.Fatal(err)
	}
	message := golden.Conversations[0].Messages[0].Protobuf
	conversation := []byte{0x0a, 8}
	conversation = append(conversation, []byte("user@lid")...)
	for i := 0; i < 2000; i++ {
		conversation = append(conversation, 0x12)
		conversation = binary.AppendUvarint(conversation, uint64(len(message)))
		conversation = append(conversation, message...)
	}
	raw := []byte{0x08, 3, 0x12}
	raw = binary.AppendUvarint(raw, uint64(len(conversation)))
	raw = append(raw, conversation...)
	decoded, err := DecodeHistorySyncPayload(context.Background(), compressedHistory(raw), DecodeHistorySyncOptions{})
	if err != nil || len(decoded.Conversations[0].Messages) != 2000 || !bytes.Equal(decoded.Protobuf, raw) {
		t.Fatal("large history chunk", err)
	}
	groups := []byte{0x08, 3}
	groups = append(groups, bytes.Repeat([]byte{0x2b}, 66)...)
	groups = append(groups, bytes.Repeat([]byte{0x2c}, 66)...)
	if _, err := DecodeHistorySyncPayload(context.Background(), compressedHistory(groups), DecodeHistorySyncOptions{}); err == nil {
		t.Fatal("unknown group depth limit")
	}
}
