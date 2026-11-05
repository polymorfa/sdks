package polymorfa_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	sdk "github.com/polymorfa/sdks/packages/go"
	"os"
	"testing"
)

type strictStream struct{ Input, Plain, Format string }
type strictRecipe struct {
	Name, Base, Hex, Append, TailHex string
	Cut                              *int
	Flip                             *int
	Mask                             byte
}
type strictPlain struct {
	Base64         string
	ZeroFieldBytes int
}
type strictCorpus struct {
	Streams map[string]strictStream
	Plain   map[string]strictPlain
	Invalid []strictRecipe
}

func strictJSON(t *testing.T, name string, v any) {
	t.Helper()
	b, e := os.ReadFile("testdata/strict-history/" + name)
	if e != nil {
		t.Fatal(e)
	}
	if e = json.Unmarshal(b, v); e != nil {
		t.Fatal(e)
	}
}
func strictB64(s string) []byte {
	b, e := base64.StdEncoding.DecodeString(s)
	if e != nil {
		panic(e)
	}
	return b
}
func strictHex(s string) []byte {
	b, e := hex.DecodeString(s)
	if e != nil {
		panic(e)
	}
	return b
}
func strictRaw(c strictCorpus, name string) []byte {
	p := c.Plain[name]
	if p.ZeroFieldBytes == 0 {
		return strictB64(p.Base64)
	}
	b := []byte{8, 3, 162, 6}
	n := p.ZeroFieldBytes
	for n > 127 {
		b = append(b, byte(n&127)|128)
		n >>= 7
	}
	b = append(b, byte(n))
	return append(b, make([]byte, p.ZeroFieldBytes)...)
}
func strictInput(c strictCorpus, r strictRecipe) []byte {
	if r.Hex != "" {
		return strictHex(r.Hex)
	}
	b := strictB64(c.Streams[r.Base].Input)
	if r.Cut != nil {
		b = b[:*r.Cut]
	}
	if r.Flip != nil {
		i := *r.Flip
		if i < 0 {
			i += len(b)
		}
		mask := r.Mask
		if mask == 0 {
			mask = 1
		}
		b[i] ^= mask
	}
	if r.Append != "" {
		b = append(b, strictB64(c.Streams[r.Append].Input)...)
	}
	return append(b, strictHex(r.TailHex)...)
}
func strictCode(e error) string {
	var v *sdk.Error
	if errors.As(e, &v) {
		return v.Code
	}
	if e == nil {
		return ""
	}
	return e.Error()
}
func strictDecode(path int, b []byte, maximum int64) (sdk.HistorySyncData, error) {
	if path == 0 {
		return sdk.DecodeHistorySyncPayload(context.Background(), b, sdk.DecodeHistorySyncOptions{MaxInflatedBytes: maximum})
	}
	return sdk.DownloadHistoryChunk(context.Background(), sdk.HistorySyncChunkInput{InlinePayload: b}, sdk.DownloadHistoryChunkOptions{DecodeHistorySyncOptions: sdk.DecodeHistorySyncOptions{MaxInflatedBytes: maximum}})
}
func TestStrictHistoryIndependentCorpus(t *testing.T) {
	var c strictCorpus
	strictJSON(t, "strict-history.json", &c)
	complete, refused, protobuf := 0, 0, 0
	for name, s := range c.Streams {
		for path := 0; path < 2; path++ {
			d, e := strictDecode(path, strictB64(s.Input), 0)
			if s.Plain == "invalid-protobuf" || s.Plain == "empty" {
				if strictCode(e) != "media_invalid_ciphertext" {
					t.Fatalf("%s protobuf policy: %v", name, e)
				}
				protobuf++
				continue
			}
			if e != nil || !bytes.Equal(d.Protobuf, strictRaw(c, s.Plain)) {
				t.Fatalf("%s path%d: %v", name, path, e)
			}
			if s.Plain == "provider" {
				if d.SyncType != 3 || *d.ChunkOrder != 7 || *d.Progress != 92 || len(d.Conversations) != 1 {
					t.Fatal("provider fields")
				}
				var full bool
				for _, f := range d.Conversations[0].Fields {
					if f.Number == 5 && f.Integer == ^uint64(0) {
						full = true
					}
				}
				if !full {
					t.Fatal("uint64 lost")
				}
			}
			complete++
		}
	}
	for _, r := range c.Invalid {
		b := strictInput(c, r)
		for path := 0; path < 2; path++ {
			_, e := strictDecode(path, b, 0)
			if strictCode(e) != "media_invalid_ciphertext" {
				t.Fatalf("%s path%d: %v", r.Name, path, e)
			}
			plain := c.Streams[r.Base].Plain
			if plain == "invalid-protobuf" || plain == "empty" {
				protobuf++
			} else {
				refused++
			}
		}
	}
	if complete != 64 || refused != 5728 || protobuf != 268 {
		t.Fatal(complete, refused, protobuf)
	}
	t.Logf("public corpus complete=%d compressedRefusals=%d protobufPolicyOnly=%d", complete, refused, protobuf)
}

type strictHeader struct {
	Name, Sha256, Plain, Compression string
	Segments                         []struct {
		Base64      string
		Byte, Count int
	}
}

func TestStrictHistoryHeadersAndStoredBoundaries(t *testing.T) {
	var headers []strictHeader
	strictJSON(t, "strict-history-headers.json", &headers)
	unsupported, incomplete := 0, 0
	for _, h := range headers {
		var b []byte
		for _, s := range h.Segments {
			if s.Base64 != "" {
				b = append(b, strictB64(s.Base64)...)
			} else {
				b = append(b, bytes.Repeat([]byte{byte(s.Byte)}, s.Count)...)
			}
		}
		if fmt.Sprintf("%x", sha256.Sum256(b)) != h.Sha256 {
			t.Fatal("header hash", h.Name)
		}
		for path := 0; path < 2; path++ {
			_, e := strictDecode(path, b, 0)
			if strictCode(e) != "media_invalid_ciphertext" {
				t.Fatal(h.Name, e)
			}
			if h.Compression == "valid" {
				unsupported++
			} else {
				incomplete++
			}
		}
	}
	var supplemental []struct{ Name, Input, Plain string }
	strictJSON(t, "strict-history-dotnet.json", &supplemental)
	valid, policy, refused := 0, 0, 0
	for _, s := range supplemental {
		b, raw := strictB64(s.Input), strictB64(s.Plain)
		for path := 0; path < 2; path++ {
			d, e := strictDecode(path, b, int64(max(1, len(raw))))
			if len(raw) == 0 {
				if strictCode(e) != "media_invalid_ciphertext" {
					t.Fatal(s.Name, e)
				}
				policy++
			} else {
				if e != nil || !bytes.Equal(d.Protobuf, raw) {
					t.Fatal(s.Name, e)
				}
				valid++
			}
			for _, bad := range [][]byte{b[:len(b)-1], append(bytes.Clone(b), 0)} {
				_, e := strictDecode(path, bad, 0)
				if strictCode(e) != "media_invalid_ciphertext" {
					t.Fatal(s.Name, e)
				}
				if len(raw) == 0 {
					policy++
				} else {
					refused++
				}
			}
		}
	}
	// Independent stdlib producer, exact Go gzip filename/comment limit, FHCRC controls.
	var boundaries []struct {
		Name, Input string
		Supported   bool
	}
	strictJSON(t, "go-header-boundaries.json", &boundaries)
	for _, s := range boundaries {
		for path := 0; path < 2; path++ {
			d, e := strictDecode(path, strictB64(s.Input), 0)
			if s.Supported {
				if e != nil || !bytes.Equal(d.Protobuf, []byte{8, 3}) {
					t.Fatal(s.Name, e)
				}
			} else if strictCode(e) != "media_invalid_ciphertext" {
				t.Fatal(s.Name, e)
			}
		}
	}
	t.Logf("headers validUnsupported=%d incomplete=%d; supplemental valid=%d compressedRefusals=%d protobufPolicyOnly=%d; Go boundaries=%d", unsupported, incomplete, valid, refused, policy, len(boundaries)*2)
}
func TestStrictHistoryCapsAndCancellation(t *testing.T) {
	var c strictCorpus
	strictJSON(t, "strict-history.json", &c)
	for _, format := range []string{"gzip", "zlib", "raw"} {
		b := strictB64(c.Streams["provider-"+format].Input)
		size := int64(len(strictRaw(c, "provider")))
		for path := 0; path < 2; path++ {
			if _, e := strictDecode(path, b, size); e != nil {
				t.Fatal(e)
			}
			if _, e := strictDecode(path, b, size-1); strictCode(e) != "media_too_large" {
				t.Fatal(e)
			}
		}
		_, e := sdk.DownloadHistoryChunk(context.Background(), sdk.HistorySyncChunkInput{InlinePayload: b}, sdk.DownloadHistoryChunkOptions{MaxBytes: int64(len(b))})
		if e != nil {
			t.Fatal(e)
		}
		_, e = sdk.DownloadHistoryChunk(context.Background(), sdk.HistorySyncChunkInput{InlinePayload: b}, sdk.DownloadHistoryChunkOptions{MaxBytes: int64(len(b) - 1)})
		if strictCode(e) != "media_too_large" {
			t.Fatal(e)
		}
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		for _, inline := range []bool{false, true} {
			var e error
			if inline {
				_, e = sdk.DownloadHistoryChunk(ctx, sdk.HistorySyncChunkInput{InlinePayload: b}, sdk.DownloadHistoryChunkOptions{})
			} else {
				_, e = sdk.DecodeHistorySyncPayload(ctx, b, sdk.DecodeHistorySyncOptions{})
			}
			var typed *sdk.Error
			if !errors.As(e, &typed) || typed.Kind != sdk.CancelledError {
				t.Fatal(e)
			}
		}
	}
	for _, flag := range []byte{0x20, 0x40, 0x80} {
		b := strictB64(c.Streams["provider-gzip"].Input)
		b[3] |= flag
		for path := 0; path < 2; path++ {
			if _, e := strictDecode(path, b, 0); strictCode(e) != "media_invalid_ciphertext" {
				t.Fatal("reserved gzip flag", flag, e)
			}
		}
	}
	for _, format := range []string{"gzip", "zlib"} {
		b := strictB64(c.Streams["large-"+format].Input)
		b[len(b)-1] ^= 1
		for path := 0; path < 2; path++ {
			if _, e := strictDecode(path, b, 8192); strictCode(e) != "media_too_large" {
				t.Fatal("quota before late corrupt trailer", e)
			}
		}
	}
	t.Log("caps/cancellation/reserved flags: 34 public checks")
}
