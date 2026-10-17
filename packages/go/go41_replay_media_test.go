package polymorfa_test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	sdk "github.com/polymorfa/sdks/packages/go"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGo41FourReplayContracts(t *testing.T) {
	for _, route := range []string{"messaging-append", "platform-append", "audience-create", "audience-append"} {
		for _, key := range []string{"", "caller-key"} {
			t.Run(route+"/"+key, func(t *testing.T) {
				var bodies [][]byte
				var paths []string
				m, o := go41Client(t, func(w http.ResponseWriter, r *http.Request) {
					b, _ := io.ReadAll(r.Body)
					bodies = append(bodies, b)
					paths = append(paths, r.URL.RequestURI())
					if r.Header.Get("Idempotency-Key") != key {
						t.Error("key changed/generated")
					}
					w.Header().Set("Content-Type", "application/json")
					w.Header().Set("Idempotent-Replayed", "false")
					w.Header().Set("X-Trace-Id", "trace")
					if len(bodies) == 1 {
						w.Header().Set("Retry-After", "0")
						w.WriteHeader(503)
						io.WriteString(w, `{"error":{"code":"future_retryable","message":"unknown outcome"}}`)
						return
					}
					w.Header().Set("Idempotent-Replayed", "true")
					io.WriteString(w, `{"success":true,"data":{"added":0,"recipientCount":0,"duplicateCount":0,"invalidCount":0,"invalidRows":[]}}`)
				})
				one := 1
				p := sdk.RequestOptions{IdempotencyKey: key, MaxNetworkRetries: &one}
				ctx := context.Background()
				name := "Ada"
				members := []sdk.CampaignRecipientInput{{Phone: "+15550000002", Variables: map[string]sdk.CampaignVariable{"name": {String: &name}}}}
				var e error
				var md sdk.Metadata
				switch route {
				case "messaging-append":
					var r sdk.Response[sdk.Envelope[sdk.AddCampaignRecipientsResult]]
					r, e = m.Campaigns().AddRecipients(ctx, "owner /x", "c /x", sdk.AddCampaignRecipientsRequest{Recipients: members}, p)
					md = r.Metadata
				case "platform-append":
					var r sdk.Response[sdk.Envelope[sdk.AddCampaignRecipientsResult]]
					r, e = o.Campaigns().AddRecipients(ctx, "c /x", sdk.AddPlatformCampaignRecipientsRequest{ProjectID: go41Project, Recipients: members}, p)
					md = r.Metadata
				case "audience-create":
					var r sdk.Response[sdk.Envelope[sdk.AudienceImportResult]]
					r, e = o.Audiences().Create(ctx, sdk.CreateAudienceRequest{Name: "Audience", Members: &members}, p)
					md = r.Metadata
				case "audience-append":
					var r sdk.Response[sdk.Envelope[sdk.AddAudienceMembersResult]]
					r, e = o.Audiences().AddMembers(ctx, "a /x", sdk.AddAudienceMembersRequest{Members: members}, p)
					md = r.Metadata
				}
				if key == "" {
					if e == nil || len(bodies) != 1 {
						t.Fatal("unsafe effect retried")
					}
				} else {
					if e != nil || len(bodies) != 2 || !bytes.Equal(bodies[0], bodies[1]) || paths[0] != paths[1] || md.Headers.Get("Idempotent-Replayed") != "true" || md.Headers.Get("X-Trace-Id") != "trace" {
						t.Fatalf("stable replay %v", e)
					}
				}
			})
		}
	}
}

type go41CustomTransport struct {
	read func(context.Context, *sdk.WhatsAppEncryptedUploadBody) error
}

func (go41CustomTransport) Name() string { return "customer" }
func (v go41CustomTransport) Upload(ctx context.Context, s string, b *sdk.WhatsAppEncryptedUploadBody) (sdk.WhatsAppUploadLocation, error) {
	e := v.read(ctx, b)
	return sdk.WhatsAppUploadLocation{DirectPath: "/custom", URL: "https://example.com/custom"}, e
}
func TestGo41ClientRelayAndDirectPreIOGuard(t *testing.T) {
	for _, kind := range []sdk.UploadMediaType{sdk.UploadImage, sdk.UploadVideo, sdk.UploadAudio, sdk.UploadVoiceNote, sdk.UploadDocument, sdk.UploadSticker} {
		t.Run(string(kind), func(t *testing.T) {
			plain := []byte("independent Go41 media body")
			key := bytes.Repeat([]byte{7}, 32)
			encrypted, e := sdk.EncryptWhatsAppMedia(context.Background(), plain, sdk.EncryptMediaOptions{MediaType: kind, MediaKey: key})
			if e != nil {
				t.Fatal(e)
			}
			calls := 0
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				b, _ := io.ReadAll(r.Body)
				sum := sha256.Sum256(b)
				wantType := string(kind)
				ptt := ""
				if kind == sdk.UploadAudio || kind == sdk.UploadVoiceNote {
					wantType = "voice"
					ptt = fmt.Sprint(kind == sdk.UploadVoiceNote)
				}
				if kind == sdk.UploadDocument {
					wantType = "file"
				}
				if !bytes.Equal(b, encrypted.Ciphertext) || r.ContentLength != int64(len(b)) || r.URL.Query().Get("type") != wantType || r.URL.Query().Get("ptt") != ptt || r.URL.Query().Get("fileEncSha256") != base64.RawURLEncoding.EncodeToString(sum[:]) {
					t.Error("ciphertext/query/hash")
				}
				w.Header().Set("Content-Type", "application/json")
				io.WriteString(w, go41Relay)
			}))
			defer s.Close()
			m, e := sdk.NewMessagingClient(sdk.Config{BaseURL: s.URL, Credential: sdk.Credential{Kind: sdk.ClientToken, Value: "pmfa_ct_scoped"}})
			if e != nil {
				t.Fatal(e)
			}
			opts := sdk.UploadWhatsAppMediaOptions{EncryptMediaOptions: sdk.EncryptMediaOptions{MediaType: kind, MediaKey: key}}
			if _, e := m.WhatsAppMedia().UploadBytes(context.Background(), "session /x", plain, opts); e != nil || calls != 1 {
				t.Fatalf("Client relay refused %v", e)
			}
			reads := 0
			source := func(context.Context) (io.ReadCloser, error) {
				reads++
				return io.NopCloser(bytes.NewReader(plain)), nil
			}
			opts.Egress = "direct"
			if _, e := m.WhatsAppMedia().Upload(context.Background(), "s", source, opts); e == nil || reads != 0 {
				t.Fatal("direct read before guard")
			}
			if _, e := m.WhatsAppMedia().UploadTransport("direct", sdk.UploadWhatsAppMediaOptions{}); e == nil {
				t.Fatal("direct wrapper bypass")
			}
			opts.Egress = ""
			opts.UploadTransport = go41CustomTransport{read: func(c context.Context, b *sdk.WhatsAppEncryptedUploadBody) error {
				r, e := b.Open(c, 0)
				if e != nil {
					return e
				}
				defer r.Close()
				raw, e := io.ReadAll(r)
				if !bytes.Equal(raw, encrypted.Ciphertext) {
					t.Error("custom bytes")
				}
				return e
			}}
			if _, e := m.WhatsAppMedia().Upload(context.Background(), "s", source, opts); e != nil || calls != 1 || reads != 2 {
				t.Fatalf("pure custom inherited API guard %v reads %d", e, reads)
			}
		})
	}
}
func TestGo41RequestLogOwnersAndMissingCustomerSelectors(t *testing.T) {
	var paths []string
	m, o := go41Client(t, func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.URL.EscapedPath())
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, go41Logs)
	})
	_ = m
	first, _ := o.Project("owner A")
	second, _ := o.Project("owner B")
	a := first.RequestLogs()
	b := second.RequestLogs()
	for _, r := range []*sdk.RequestLogs{a, b, a} {
		if _, e := r.List(context.Background(), sdk.ListRequestLogsParams{}); e != nil {
			t.Fatal(e)
		}
	}
	if strings.Join(paths, ",") != "/platform/projects/owner%20A/request-logs,/platform/projects/owner%20B/request-logs,/platform/projects/owner%20A/request-logs" {
		t.Fatal("resource retargeted")
	}
	if _, e := a.List(context.Background(), sdk.ListRequestLogsParams{ProjectID: "owner B"}); e == nil {
		t.Fatal("foreign owner")
	}
	if _, e := o.RequestLogs().List(context.Background(), sdk.ListRequestLogsParams{}); e == nil {
		t.Fatal("missing project")
	}
	custody, _ := o.Project(go41Project)
	if _, e := custody.SignalCustody().RetrieveCustomer(context.Background(), ""); e == nil {
		t.Fatal("missing Customer selected Project defaults")
	}
	if len(paths) != 3 {
		t.Fatal("invalid selector reached HTTP")
	}
}
func TestGo41StickerIndependentWireAndRetrySnapshot(t *testing.T) {
	key := bytes.Repeat([]byte{9}, 32)
	hash := bytes.Repeat([]byte{8}, 32)
	width, height := int64(512), int64(512)
	animated := false
	d := sdk.WhatsAppMediaSendDescriptor{MediaType: sdk.UploadSticker, DirectPath: "/mms/sticker/path", URL: "https://mmg.whatsapp.net/mms/sticker/path", MediaKey: key, FileSHA256: hash, FileEncSHA256: hash, FileLength: 19, MimeType: "image/webp", WhatsAppMediaSendMetadata: sdk.WhatsAppMediaSendMetadata{Width: &width, Height: &height, IsAnimated: &animated}}
	var bodies [][]byte
	m, _ := go41Client(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		bodies = append(bodies, b)
		if r.Header.Get("Polymorfa-Version") != sdk.CustomerOwnedAPIVersion || r.Header.Get("Idempotency-Key") != "sticker-key" {
			t.Error("version/key")
		}
		var body map[string]any
		json.Unmarshal(b, &body)
		s := body["content"].(map[string]any)["sticker"].(map[string]any)["descriptor"].(map[string]any)
		if s["isAnimated"] != false || s["width"] != float64(512) || s["fileLength"] != float64(19) {
			t.Error("sticker metadata")
		}
		w.Header().Set("Content-Type", "application/json")
		if len(bodies) == 1 {
			width = 1
			animated = true
			key[0] = 0
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(503)
			io.WriteString(w, `{"error":{"code":"future","message":"retry"}}`)
			return
		}
		io.WriteString(w, `{"success":true,"data":{"id":"18446744073709551615","type":"sticker","whatsapp_ids":{"linked_devices":"message-19"},"conversation":{"id":"chat"},"timestamp":"2026-10-16T00:00:00Z","status":"sent","content":{"sticker":{"descriptor":{"directPath":"/mms/sticker/path","url":"https://mmg.whatsapp.net/mms/sticker/path","mediaKey":"CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk=","fileSha256":"CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg=","fileEncSha256":"CAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg=","fileLength":19,"mimeType":"image/webp","width":512,"height":512,"isAnimated":false}}}}}`)
	})
	one := 1
	r, e := m.Messages().Send(context.Background(), "session /x", sdk.SendMessageRequest{Conversation: sdk.ConversationReference{ID: "chat"}, Content: sdk.MessageContent{Sticker: &sdk.StickerContent{Descriptor: &d}}}, sdk.RequestOptions{IdempotencyKey: "sticker-key", MaxNetworkRetries: &one})
	if e != nil || len(bodies) != 2 || !bytes.Equal(bodies[0], bodies[1]) || r.Data.Data.ID != "18446744073709551615" || r.Data.Data.Type != "sticker" {
		t.Fatalf("sticker retry/response %v", e)
	}
}

func TestGo41RelayExplicitRetryCapturesEncryptedBody(t *testing.T) {
	var bodies [][]byte
	m, _ := go41Client(t, func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		bodies = append(bodies, b)
		if r.Header.Get("Idempotency-Key") != "relay-key" {
			t.Error("caller key")
		}
		w.Header().Set("Content-Type", "application/json")
		if len(bodies) == 1 {
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(503)
			io.WriteString(w, `{"error":{"code":"transient","message":"retry"}}`)
			return
		}
		io.WriteString(w, go41Relay)
	})
	one := 1
	_, e := m.WhatsAppMedia().UploadBytes(context.Background(), "session /x", []byte("retry body"), sdk.UploadWhatsAppMediaOptions{EncryptMediaOptions: sdk.EncryptMediaOptions{MediaType: sdk.UploadImage, MediaKey: bytes.Repeat([]byte{4}, 32)}, RequestOptions: sdk.RequestOptions{IdempotencyKey: "relay-key", MaxNetworkRetries: &one}})
	if e != nil || len(bodies) != 2 || !bytes.Equal(bodies[0], bodies[1]) {
		t.Fatalf("explicit encrypted relay retry %v attempts=%d", e, len(bodies))
	}
}
