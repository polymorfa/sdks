package polymorfa_test

import (
	"bufio"
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	sdk "github.com/polymorfa/sdks/packages/go"
	store "github.com/polymorfa/sdks/packages/go/storage"
	"iter"
	"net"
	"net/http"
	"os"
	"os/exec"
	"strconv"
	"testing"
	"time"
)

func TestStrictHistoryAuthenticatedDownload(t *testing.T) {
	command := exec.Command("node", "testdata/strict-history/strict-history-server.mjs")
	command.Stderr = os.Stderr
	stdout, e := command.StdoutPipe()
	if e != nil {
		t.Fatal(e)
	}
	if e = command.Start(); e != nil {
		t.Fatal(e)
	}
	defer func() { command.Process.Kill(); command.Wait() }()
	scanner := bufio.NewScanner(stdout)
	if !scanner.Scan() {
		t.Fatal("peer failed")
	}
	var ready struct {
		Port        int
		Certificate string
		Descriptors map[string]struct {
			DirectPath, MediaKey, FileSha256, FileEncSha256 string
			FileLength                                      int64
		}
	}
	if e = json.Unmarshal(scanner.Bytes(), &ready); e != nil {
		t.Fatal(e)
	}
	roots := x509.NewCertPool()
	if !roots.AppendCertsFromPEM(strictB64(ready.Certificate)) {
		t.Fatal("certificate")
	}
	tr := &http.Transport{TLSClientConfig: &tls.Config{RootCAs: roots, MinVersion: tls.VersionTLS12}, DialContext: func(ctx context.Context, network, address string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "tcp", "127.0.0.1:"+strconv.Itoa(ready.Port))
	}}
	defer tr.CloseIdleConnections()
	client := &http.Client{Transport: tr}
	descriptor := func(name string) *sdk.HistorySyncChunkDescriptor {
		d := ready.Descriptors[name]
		return &sdk.HistorySyncChunkDescriptor{DirectPath: d.DirectPath, MediaKey: strictHex(d.MediaKey), FileSHA256: strictHex(d.FileSha256), FileEncSHA256: strictHex(d.FileEncSha256), FileLength: &d.FileLength}
	}
	calls := 0
	options := sdk.DownloadHistoryChunkOptions{HTTPClient: client, DecodeHistorySyncOptions: sdk.DecodeHistorySyncOptions{Decoder: func(context.Context, []byte) (any, error) { calls++; return "verified", nil }}}
	for _, name := range []string{"gzip", "zlib", "raw", "tail", "concat", "checksum", "tampered"} {
		d := descriptor(name)
		if name == "tampered" {
			d = descriptor("gzip")
			d.DirectPath = "/tampered.enc"
		}
		before := calls
		result, e := sdk.DownloadHistoryChunk(context.Background(), sdk.HistorySyncChunkInput{Descriptor: d}, options)
		if name == "gzip" || name == "zlib" || name == "raw" {
			if e != nil || calls != before+1 || result.SyncType != 3 {
				t.Fatal(name, e)
			}
		} else if (name == "tampered" && strictCode(e) != "media_enc_hash_mismatch") || (name != "tampered" && strictCode(e) != "media_invalid_ciphertext") || calls != before {
			t.Fatal(name, e, "unverified parse")
		}
	}
	options.MaxInflatedBytes = 8192
	if _, e := sdk.DownloadHistoryChunk(context.Background(), sdk.HistorySyncChunkInput{Descriptor: descriptor("large")}, options); strictCode(e) != "media_too_large" {
		t.Fatal(e)
	}
	options.MaxInflatedBytes = 0
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	if _, e := sdk.DownloadHistoryChunk(ctx, sdk.HistorySyncChunkInput{Descriptor: descriptor("gate")}, options); e == nil {
		t.Fatal("stalled body cancellation")
	}
	response, e := client.Get("https://mmg.whatsapp.net/state")
	if e != nil {
		t.Fatal(e)
	}
	defer response.Body.Close()
	var state struct {
		Requests []struct {
			Authorization, Cookie, Version bool
			Mms, Origin, Referer           string
		}
	}
	if e = json.NewDecoder(response.Body).Decode(&state); e != nil {
		t.Fatal(e)
	}
	if len(state.Requests) != 9 {
		t.Fatal("requests", len(state.Requests))
	}
	for _, r := range state.Requests {
		if r.Authorization || r.Cookie || r.Version || r.Mms != "md-msg-hist" || r.Origin != "https://web.whatsapp.com" || r.Referer != "https://web.whatsapp.com/" {
			t.Fatal("credential confinement")
		}
	}
	t.Log("authenticated download: 3 valid, 3 compressed refusals, 1 tamper, 1 quota, 1 stalled cancellation; 9 confined requests")
}

type strictSource struct {
	item  sdk.EventStreamItem
	acked int
}

func (s *strictSource) Stream(ctx context.Context, p sdk.EventStreamParams) (iter.Seq2[sdk.EventStreamItem, error], error) {
	if p.Ack != "manual" || p.Since != "" {
		return nil, fmt.Errorf("unexpected stream options")
	}
	return func(yield func(sdk.EventStreamItem, error) bool) { yield(s.item, nil) }, nil
}
func (s *strictSource) Acknowledge(context.Context, sdk.EventStreamItem, string) error {
	s.acked++
	return nil
}

type strictAdapter struct {
	*store.MemoryAdapter
	entities map[string]int
}

func (a *strictAdapter) Commit(ctx context.Context, w []store.Write) (store.CommitResult, error) {
	r, e := a.MemoryAdapter.Commit(ctx, w)
	if e == nil && r.OK {
		for _, v := range w {
			a.entities[v.Entity]++
		}
	}
	return r, e
}
func TestStrictHistorySignedArchiveStorage(t *testing.T) {
	var c strictCorpus
	strictJSON(t, "strict-history.json", &c)
	single := strictB64(c.Streams["provider-gzip"].Input)
	for _, bad := range []bool{false, true} {
		b := bytes.Clone(single)
		if bad {
			b = append(b, 0)
		}
		raw := []byte(fmt.Sprintf(`{"id":"signed-archive","session":"fixture-session","timestamp":"2026-10-17T00:00:00Z","event":"history.sync","payload":{"mode":"deliver","whatsapp_ids":{"linked_devices":"fixture-archive"},"messages":[],"syncType":"RECENT","chunkOrder":7,"progress":92,"fileLength":%d,"conversationCount":1,"messageCount":0,"pushNameCount":0,"statusMessageCount":0,"whatsapp":{"encoding":"gzip-base64-protobuf","data":%q}}}`, len(b), base64.StdEncoding.EncodeToString(b)))
		mac := hmac.New(sha256.New, []byte("synthetic-archive-secret"))
		mac.Write(raw)
		event, e := sdk.ConstructWebhookEvent(raw, hex.EncodeToString(mac.Sum(nil)), "synthetic-archive-secret")
		if e != nil {
			t.Fatal(e)
		}
		memory, e := store.NewMemoryAdapter(100)
		if e != nil {
			t.Fatal(e)
		}
		adapter := &strictAdapter{memory, map[string]int{}}
		engine, e := store.NewEngine(adapter, store.EngineOptions{})
		if e != nil {
			t.Fatal(e)
		}
		source := &strictSource{item: sdk.EventStreamItem{Webhook: &event, Cursor: "after-archive", StreamID: "fixture-stream", Sequence: 1}}
		e = store.SyncToStorage(context.Background(), source, engine, store.SyncOptions{Apply: store.ApplyEventOptions{DecodeHistory: func(ctx context.Context, p map[string]any, event sdk.WebhookEvent) (map[string]any, error) {
			encoded := p["whatsapp"].(map[string]any)["data"].(string)
			decoded, e := sdk.DownloadHistoryChunk(ctx, sdk.HistorySyncChunkInput{InlinePayload: strictB64(encoded)}, sdk.DownloadHistoryChunkOptions{})
			if e != nil {
				return nil, e
			}
			conversations := []any{}
			for _, v := range decoded.Conversations {
				conversations = append(conversations, map[string]any{"id": v.ID})
			}
			return map[string]any{"conversations": conversations, "chunkOrder": float64(*decoded.ChunkOrder), "progress": float64(*decoded.Progress)}, nil
		}}})
		has, _ := engine.HasEvent(context.Background(), event.Session, event.ID)
		checkpoint, _ := engine.GetCheckpoint(context.Background(), "*", "events")
		if bad {
			if strictCode(e) != "media_invalid_ciphertext" || has || checkpoint != nil || source.acked != 0 || len(adapter.entities) != 0 {
				t.Fatal("invalid archive changed storage", e, adapter.entities)
			}
		} else if e != nil || !has || checkpoint == nil || checkpoint.Cursor != "after-archive" || source.acked != 1 || adapter.entities["chats"] == 0 {
			t.Fatal("valid archive did not apply/ACK", e, adapter.entities)
		}
	}
	t.Log("signed archive: invalid compression prevents all commits/event/progress/checkpoint/ACK; valid projected archive applies and ACKs")
}
