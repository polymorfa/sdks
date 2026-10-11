package polymorfa

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const voiceAssetFixture = `{"data":{"id":"asset","projectId":"p","name":"Recording","source":"upload","status":"ready","failureReason":null,"originalFormat":"ogg","originalContentType":"audio/ogg","sizeBytes":3,"durationMs":123,"contentSha256":"sha","tts":null,"retentionDays":null,"expiresAt":null,"inUseCount":0,"revision":2,"createdAt":"today","updatedAt":"today","readyAt":"today"}}`
const voiceCredentialFixture = `{"data":{"id":"credential","projectId":"p","provider":"openai","label":"Voice","keyFingerprint":"1234abcd","status":"valid","verifiedAt":"today","lastError":null,"revision":1,"createdAt":"today","updatedAt":"today"}}`

var voiceFixtures = []operationFixture{
	{"OrganizationClient.Voice.Audio.List", "GET", "/platform/voice/audio", "limit=2&projectId=p&status=ready", "", `{"data":[{"id":"asset","projectId":"p","name":"Recording","source":"upload","status":"ready","failureReason":null,"originalFormat":"ogg","originalContentType":"audio/ogg","sizeBytes":3,"durationMs":123,"contentSha256":"sha","tts":null,"retentionDays":null,"expiresAt":null,"inUseCount":0,"revision":2,"createdAt":"today","updatedAt":"today","readyAt":"today"}],"page":{"nextCursor":null}}`, "data.0.contentSha256", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(o.Voice().Audio("p").List(ctx, ListVoiceAudioParams{ListParams: ListParams{Limit: 2}, Status: "ready"}))
	}},
	{"OrganizationClient.Voice.Audio.CreateUpload", "POST", "/platform/voice/audio", "", `{"projectId":"p","name":"Recording","contentType":"audio/ogg","sizeBytes":3}`, `{"data":{"asset":{"id":"asset","projectId":"p","name":"Recording","source":"upload","status":"pending_upload","failureReason":null,"originalFormat":"ogg","originalContentType":"audio/ogg","sizeBytes":3,"durationMs":null,"contentSha256":null,"tts":null,"retentionDays":null,"expiresAt":null,"inUseCount":0,"revision":1,"createdAt":"today","updatedAt":"today","readyAt":null},"upload":{"url":"https://storage.example/upload","method":"POST","headers":{"X-Upload":"fixture"},"maxBytes":16777216,"expiresAt":"tomorrow"}}}`, "upload.maxBytes", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Voice().Audio("p").CreateUpload(ctx, CreateVoiceAudioUploadRequest{Name: "Recording", ContentType: "audio/ogg", SizeBytes: 3}))
	}},
	{"OrganizationClient.Voice.Audio.Synthesize", "POST", "/platform/voice/audio/tts", "", `{"projectId":"p","name":"Greeting","text":"Hello","provider":"openai","voiceId":"alloy","model":"tts-1"}`, `{"data":{"id":"asset","projectId":"p","name":"Greeting","source":"tts","status":"transcoding","failureReason":null,"originalFormat":null,"originalContentType":null,"sizeBytes":null,"durationMs":null,"contentSha256":null,"tts":{"provider":"openai","voiceId":"alloy","model":"tts-1","text":"Hello","characters":5,"keySource":"managed","credentialId":null},"retentionDays":null,"expiresAt":null,"inUseCount":0,"revision":1,"createdAt":"today","updatedAt":"today","readyAt":null}}`, "tts.characters", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Voice().Audio("p").Synthesize(ctx, SynthesizeVoiceAudioRequest{Name: "Greeting", Text: "Hello", Provider: "openai", VoiceID: "alloy", Model: "tts-1"}))
	}},
	{"OrganizationClient.Voice.Audio.Retrieve", "GET", "/platform/voice/audio/asset", "", "", voiceAssetFixture, "durationMs", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Voice().Audio("p").Retrieve(ctx, "asset"))
	}},
	{"OrganizationClient.Voice.Audio.Update", "PATCH", "/platform/voice/audio/asset", "", `{"expectedRevision":1,"retentionDays":null}`, voiceAssetFixture, "revision", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := int64(1)
		return wireData(o.Voice().Audio("p").Update(ctx, "asset", UpdateVoiceAudioRequest{ExpectedRevision: &v, RetentionDays: &Nullable[int]{}}))
	}},
	{"OrganizationClient.Voice.Audio.Complete", "POST", "/platform/voice/audio/asset/complete", "", "", voiceAssetFixture, "status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Voice().Audio("p").Complete(ctx, "asset"))
	}},
	{"OrganizationClient.Voice.Audio.Delete", "DELETE", "/platform/voice/audio/asset", "", "", `{"data":{"id":"asset","deleted":true}}`, "deleted", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Voice().Audio("p").Delete(ctx, "asset"))
	}},
	{"OrganizationClient.Voice.Audio.PreviewURL", "GET", "/platform/voice/audio/asset/preview", "", "", `{"data":{"url":"https://storage.example/preview","contentType":"audio/ogg","expiresAt":"tomorrow"}}`, "contentType", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Voice().Audio("p").PreviewURL(ctx, "asset"))
	}},
	{"OrganizationClient.Voice.ProviderCredentials.List", "GET", "/platform/voice/provider-credentials", "projectId=p", "", `{"data":[{"id":"credential","projectId":null,"provider":"openai","label":"Voice","keyFingerprint":"1234abcd","status":"future_status","verifiedAt":"today","lastError":null,"revision":1,"createdAt":"today","updatedAt":"today"}]}`, "0.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Voice().ProviderCredentials("p").List(ctx))
	}},
	{"OrganizationClient.Voice.ProviderCredentials.Create", "POST", "/platform/voice/provider-credentials", "", `{"provider":"openai","label":"Voice","apiKey":"fixture-provider-key","projectId":null}`, voiceCredentialFixture, "keyFingerprint", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Voice().ProviderCredentials().Create(ctx, CreateVoiceProviderCredentialRequest{Provider: "openai", Label: "Voice", APIKey: "fixture-provider-key", ProjectID: &Nullable[string]{}}))
	}},
	{"OrganizationClient.Voice.ProviderCredentials.Retrieve", "GET", "/platform/voice/provider-credentials/credential", "", "", voiceCredentialFixture, "verifiedAt", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Voice().ProviderCredentials().Retrieve(ctx, "credential"))
	}},
	{"OrganizationClient.Voice.ProviderCredentials.Verify", "POST", "/platform/voice/provider-credentials/credential/verify", "", "", voiceCredentialFixture, "status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Voice().ProviderCredentials().Verify(ctx, "credential"))
	}},
	{"OrganizationClient.Voice.ProviderCredentials.Delete", "DELETE", "/platform/voice/provider-credentials/credential", "", "", `{"data":{"id":"credential","deleted":true}}`, "deleted", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Voice().ProviderCredentials().Delete(ctx, "credential"))
	}},
}

func TestVoiceUploadWithoutAPICredentials(t *testing.T) {
	storageCalls := 0
	storage := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		storageCalls++
		b, _ := io.ReadAll(r.Body)
		if r.Method != "POST" || string(b) != "ogg" || r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" || r.Header.Get("X-Caller") != "" || r.Header.Get("X-Upload") != "fixture" {
			t.Error("Storage request", r.Method, r.Header, string(b))
		}
		w.WriteHeader(204)
	}))
	defer storage.Close()
	apiCalls := 0
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		apiCalls++
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/platform/voice/audio" {
			if r.Header.Get("Idempotency-Key") != "create" {
				t.Error("Missing creation identity")
			}
			payload := map[string]any{"data": map[string]any{"asset": map[string]any{"id": "asset", "projectId": "p"}, "upload": map[string]any{"url": storage.URL, "method": "POST", "headers": map[string]string{"X-Upload": "fixture"}, "maxBytes": VoiceAudioMaxUploadBytes}}}
			json.NewEncoder(w).Encode(payload)
		} else {
			if r.URL.Path != "/platform/voice/audio/asset/complete" || r.Header.Get("Idempotency-Key") != "" {
				t.Error("Completion", r.URL, r.Header)
			}
			io.WriteString(w, voiceAssetFixture)
		}
	}))
	defer api.Close()
	cfg := orgConfig(api.URL)
	cfg.HTTPClient = storage.Client()
	o, _ := NewOrganizationClient(cfg)
	v, err := o.Voice().Audio("p").Upload(context.Background(), UploadVoiceAudioRequest{Name: "Recording", ContentType: "audio/ogg", Body: strings.NewReader("ogg"), SizeBytes: 3}, RequestOptions{IdempotencyKey: "create", Headers: http.Header{"X-Caller": {"private"}}})
	if err != nil || v.Data.ID != "asset" || apiCalls != 2 || storageCalls != 1 {
		t.Fatal(v, err, apiCalls, storageCalls)
	}
}
func TestVoiceProjectOwnership(t *testing.T) {
	for _, kind := range []string{"foreign", "team"} {
		t.Run(kind, func(t *testing.T) {
			count := 0
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				count++
				if r.Method != "GET" || r.Header.Get("Idempotency-Key") != "" {
					t.Error("Unsafe ownership read")
				}
				w.Header().Set("Content-Type", "application/json")
				if kind == "foreign" {
					io.WriteString(w, `{"data":{"id":"asset","projectId":"other"}}`)
				} else {
					io.WriteString(w, `{"data":{"id":"credential","projectId":null}}`)
				}
			}))
			defer s.Close()
			o, _ := NewOrganizationClient(orgConfig(s.URL))
			p, _ := o.Project("p")
			var err error
			if kind == "foreign" {
				_, err = p.Voice().Audio().Delete(context.Background(), "asset", RequestOptions{IdempotencyKey: "mutation"})
			} else {
				_, err = p.Voice().ProviderCredentials().Delete(context.Background(), "credential", RequestOptions{IdempotencyKey: "mutation"})
			}
			e, ok := err.(*Error)
			expected := NotFoundError
			if kind == "team" {
				expected = AuthorizationError
			}
			if !ok || e.Kind != expected || count != 1 {
				t.Fatal(err, count)
			}
		})
	}
}
func TestVoiceWaitHonorsOverallDeadline(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
			return
		case <-time.After(100 * time.Millisecond):
			w.Header().Set("Content-Type", "application/json")
			io.WriteString(w, voiceAssetFixture)
		}
	}))
	defer s.Close()
	o, _ := NewOrganizationClient(orgConfig(s.URL))
	started := time.Now()
	_, err := o.Voice().Audio("p").WaitUntilReady(context.Background(), "asset", WaitForVoiceAudioOptions{Timeout: 10 * time.Millisecond, Interval: time.Millisecond})
	e, ok := err.(*Error)
	if !ok || e.Kind != TimeoutError || time.Since(started) > 80*time.Millisecond {
		t.Fatal(err, time.Since(started))
	}
}
