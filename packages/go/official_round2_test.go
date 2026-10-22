package polymorfa

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"image/jpeg"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"sync/atomic"
	"testing"
)

func TestOfficialRound2Wire(t *testing.T) {
	var paths []string
	picture, err := os.ReadFile("../../contracts/fixtures/official-group-picture.jpg")
	if err != nil {
		t.Fatal(err)
	}
	config, err := jpeg.DecodeConfig(bytes.NewReader(picture))
	if err != nil || config.Width != 192 || config.Height != 192 {
		t.Fatal(config, err)
	}
	jpeg := picture
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		paths = append(paths, r.Method+" "+r.URL.EscapedPath())
		w.Header().Set("Content-Type", "application/json")
		if r.Method == "PUT" {
			m, e := r.MultipartReader()
			if e != nil {
				t.Error(e)
				return
			}
			p, e := m.NextPart()
			if e != nil {
				t.Error(e)
				return
			}
			b, _ := io.ReadAll(p)
			if p.FormName() != "file" || p.Header.Get("Content-Type") != "image/jpeg" || !bytes.Equal(b, jpeg) {
				t.Error("multipart bytes", p.Header, b)
			}
			io.WriteString(w, `{"success":true,"data":{"accepted":true}}`)
			return
		}
		if r.URL.Query().Get("cursor") != "" && r.URL.Query().Get("cursor") != "next_-" {
			t.Error(r.URL.RawQuery)
		}
		io.WriteString(w, `{"success":true,"data":{"catalogId":"123","syncedAt":null,"stale":true,"productCount":1,"lastAttempt":{"startedAt":"now","finishedAt":null,"outcome":"future"},"catalogs":[],"products":[{"id":"p","price":"0.10"}],"nextCursor":"next_-","wabaId":"w","onboarding":{"status":"unknown","metaStatus":null},"terms":{"status":"unknown","metaStatus":null,"date":null},"cloudApiMarketingDisabled":false}}`)
	}))
	defer s.Close()
	c := mustMessaging(t, s.URL)
	ctx := context.Background()
	if _, e := c.Catalogs().List(ctx, "n /x"); e != nil {
		t.Fatal(e)
	}
	v, e := c.Catalogs().Retrieve(ctx, "n /x", "123")
	if e != nil || v.Data.Data.SyncedAt != nil || v.Data.Data.LastAttempt.Outcome != "future" {
		t.Fatal(v, e)
	}
	if _, e = c.Catalogs().Sync(ctx, "n /x", "123"); e != nil {
		t.Fatal(e)
	}
	n := 100
	p, e := c.Catalogs().ListProducts(ctx, "n /x", "123", CatalogProductsParams{&n, "next_-"})
	if e != nil || p.Data.Data.Products[0].Price != "0.10" {
		t.Fatal(p, e)
	}
	m, e := c.CloudMarketing().GetStatus(ctx, "n /x")
	if e != nil || m.Data.Data.CloudAPIMarketingDisabled == nil || *m.Data.Data.CloudAPIMarketingDisabled {
		t.Fatal(m, e)
	}
	if _, e = c.OfficialGroups().SetPicture(ctx, "n /x", "g/x", jpeg); e != nil {
		t.Fatal(e)
	}
	if len(paths) != 6 || paths[0] != "GET /messaging/n%20%2Fx/catalogs" || paths[5] != "PUT /messaging/n%20%2Fx/official-groups/g%2Fx/picture" {
		t.Fatal(paths)
	}
	if _, e = c.Catalogs().Retrieve(ctx, "n", "../"); e == nil {
		t.Fatal("catalog bounds")
	}
	n = 0
	if _, e = c.Catalogs().ListProducts(ctx, "n", "123", CatalogProductsParams{Limit: &n}); e == nil {
		t.Fatal("page bounds")
	}
	cancelled, cancel := context.WithCancel(ctx)
	cancel()
	if _, e = c.OfficialGroups().SetPicture(cancelled, "n", "g", jpeg); e == nil {
		t.Fatal("cancellation")
	}
	if len(paths) != 6 {
		t.Fatal(paths)
	}
}
func TestOfficialRound2WholeBody(t *testing.T) {
	event := json.RawMessage(`{"id":"e","session":"","timestamp":"now","event":"future.event","payload":{"parentBsuid":"new"}}`)
	batch := map[string]any{"object": "event_batch", "version": 1, "id": "00000000-0000-4000-8000-000000000001", "events": []json.RawMessage{event, event}}
	signed := func(raw []byte) (VerifiedWebhookDelivery, error) {
		m := hmac.New(sha256.New, []byte("s"))
		m.Write(raw)
		return ConstructWebhookDelivery(raw, hex.EncodeToString(m.Sum(nil)), "s")
	}
	raw, _ := json.Marshal(batch)
	v, e := signed(raw)
	if e != nil || len(v.Batch.Events) != 2 || v.Batch.Events[0].ID != "e" {
		t.Fatal(v, e)
	}
	one := map[string]any{"object": "event_batch", "version": 1, "id": "00000000-0000-4000-8000-000000000001", "events": []json.RawMessage{event}}
	oneRaw, _ := json.Marshal(one)
	oneDelivery, oneErr := signed(oneRaw)
	if oneErr != nil || len(oneDelivery.Batch.Events) != 1 {
		t.Fatal(oneDelivery, oneErr)
	}
	if _, e = ConstructWebhookDelivery(append(raw, ' '), "bad", "s"); e == nil {
		t.Fatal("tamper")
	}
	for _, events := range [][]json.RawMessage{{}, {raw}, {json.RawMessage(`{"id":"e"}`)}} {
		batch["events"] = events
		raw, _ = json.Marshal(batch)
		if _, e = signed(raw); e == nil {
			t.Fatal("invalid batch")
		}
	}
	batch["events"] = []json.RawMessage{event}
	batch["version"] = 2
	raw, _ = json.Marshal(batch)
	if _, e = signed(raw); e == nil {
		t.Fatal("version")
	}
	if v, e = signed(event); e != nil || v.Event == nil {
		t.Fatal("single", e)
	}
	var contact ContactUpdatePayload
	if e = json.Unmarshal([]byte(`{"id":"new","bsuid":"new-b","parentBsuid":"new-p","identityChange":{"reason":"user_id_changed","messageId":"m","previous":{"id":"old","parentBsuid":"old-p"}}}`), &contact); e != nil || *contact.IdentityChange.Previous.ID != "old" || contact.ParentBSUID != "new-p" {
		t.Fatal(contact, e)
	}
	var msg CloudMessagePayload
	if e = json.Unmarshal([]byte(`{"order":{"catalogId":"123","items":[{"productRetailerId":"p","quantity":2,"itemPrice":0.1,"currency":"USD"}]}}`), &msg); e != nil || msg.Order.Items[0].Quantity != 2 {
		t.Fatal(msg, e)
	}
	for _, name := range []string{"marketing.onboarding_updated", "contact.marketing_preference_updated"} {
		e := WebhookEvent{Event: name, Payload: json.RawMessage(`{}`)}
		if !e.Known() {
			t.Fatal(name)
		}
		if _, _, err := e.TypedPayload(); err != nil {
			t.Fatal(err)
		}
	}
}
func TestOfficialRound2SyncOnceAndBatching(t *testing.T) {
	attempts := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Retry-After", "120")
		w.WriteHeader(429)
		io.WriteString(w, `{"error":{"code":"catalog_sync_cooldown","message":"Wait"}}`)
	}))
	defer s.Close()
	retries := 3
	_, e := mustMessaging(t, s.URL).Catalogs().Sync(context.Background(), "n", "123", RequestOptions{IdempotencyKey: "key", MaxNetworkRetries: &retries})
	err, ok := e.(*Error)
	if !ok || err.Code != "catalog_sync_cooldown" || attempts != 1 {
		t.Fatal(e, attempts)
	}
	n := 1
	if validateWebhookBatching(&WebhookBatchingInput{MaxEvents: &n}, "") == nil || validateWebhookBatching(&WebhookBatchingInput{Enabled: true}, "meta") == nil {
		t.Fatal("bounds")
	}
	b, _ := json.Marshal(UpdateWebhookRequest{Batching: &WebhookBatchingInput{Enabled: false}})
	if !bytes.Contains(b, []byte(`"batching":{"enabled":false}`)) {
		t.Fatal(string(b))
	}
}

func TestOfficialRound2PlatformBatchingWire(t *testing.T) {
	requests := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.Header().Set("Content-Type", "application/json")
		var body map[string]json.RawMessage
		if r.Method != "GET" {
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Error(err)
			}
			if !bytes.Contains(body["batching"], []byte(`"enabled":false`)) {
				t.Error(string(body["batching"]))
			}
		}
		hook := `{"id":"w","batching":{"enabled":false,"maxEvents":100,"windowMs":1000}}`
		if r.Method == "GET" {
			io.WriteString(w, `{"data":`+hook+`}`)
		} else {
			io.WriteString(w, `{"data":{"webhook":`+hook+`}}`)
		}
	}))
	defer s.Close()
	m := mustMessaging(t, s.URL)
	o, e := NewOrganizationClient(m.t.config)
	if e != nil {
		t.Fatal(e)
	}
	p, _ := o.Project("p/x")
	for _, r := range []*Webhooks{o.Webhooks(), p.Webhooks()} {
		v, e := r.Create(context.Background(), CreateWebhookRequest{URL: "https://example.test", EventTypes: []string{}, Batching: &WebhookBatchingInput{Enabled: false}})
		if e != nil || v.Data.Webhook.Batching.Enabled {
			t.Fatal(v, e)
		}
		if _, e = r.Update(context.Background(), "w", UpdateWebhookRequest{Batching: &WebhookBatchingInput{Enabled: false}}); e != nil {
			t.Fatal(e)
		}
		v2, e := r.Retrieve(context.Background(), "w")
		if e != nil || v2.Data.Batching.MaxEvents != 100 {
			t.Fatal(v2, e)
		}
	}
	if requests != 6 {
		t.Fatal(requests)
	}
	ct, e := NewMessagingClient(Config{Credential: Credential{Kind: ClientToken, Value: "pmfa_ct_bG9jYWw"}})
	if e != nil {
		t.Fatal(e)
	}
	if _, e = ct.Catalogs().List(context.Background(), "n"); e == nil {
		t.Fatal("credential bypass")
	}
}

func TestOfficialRound2ReadinessOpenValues(t *testing.T) {
	codes := []string{ReadinessCredentialsInvalid, ReadinessPhoneNotRegistered, ReadinessWebhookNotSubscribed, ReadinessPaymentMethodMissing, ReadinessQualityFlagged, ReadinessUnknown, "future_readiness"}
	for _, code := range codes {
		raw, _ := json.Marshal(map[string]any{"errorCode": code, "onboarding": map[string]any{"errorCode": code}})
		var v QuickLinkStatus
		if json.Unmarshal(raw, &v) != nil || *v.ErrorCode != code || *v.Onboarding.ErrorCode != code {
			t.Fatal(v)
		}
		if IsKnownErrorCode(code) {
			t.Fatal("readiness is not PublicError", code)
		}
	}
}

func TestOfficialRound2GraphAndHistoryDTOs(t *testing.T) {
	var v CloudMarketingStatus
	if err := json.Unmarshal([]byte(`{"id":"w","marketing_messages_onboarding_status":"future","owner_business_info":{"marketing_messages_onboarding_status":{"status":"future-terms","time":"now"}},"disable_marketing_messages_on_cloud_api":false}`), &v); err != nil || v.OwnerBusinessInfo.MarketingMessagesOnboardingStatus.Status != "future-terms" || v.DisableMarketingMessagesOnCloudAPI == nil || *v.DisableMarketingMessagesOnCloudAPI {
		t.Fatal(v, err)
	}
	var h HistoryMessage
	if err := json.Unmarshal([]byte(`{"order":{"catalogId":"123","items":[{"productRetailerId":"p","quantity":2,"itemPrice":0.1,"currency":"USD"}]},"conversation":{"id":"new","parentBsuid":"new-p","sender":{"id":"sender","parentBsuid":"sender-p"}}}`), &h); err != nil || h.Order.Items[0].ItemPrice != 0.1 || h.Conversation.Sender.ParentBSUID != "sender-p" {
		t.Fatal(h, err)
	}
}

func TestOfficialRound2BodylessSyncDoesNotReplay(t *testing.T) {
	var count atomic.Int32
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/messaging/n/profile" {
			w.Header().Set("Content-Type", "application/json")
			io.WriteString(w, `{"success":true,"data":{}}`)
			return
		}
		count.Add(1)
		body, _ := io.ReadAll(r.Body)
		if len(body) != 0 {
			t.Error("sync request must remain bodyless")
		}
		conn, _, err := w.(http.Hijacker).Hijack()
		if err != nil {
			t.Error(err)
			return
		}
		conn.Close()
	}))
	defer s.Close()
	c := mustMessaging(t, s.URL)
	if _, err := c.Profile().Get(context.Background(), "n"); err != nil {
		t.Fatal(err)
	}
	_, err := c.Catalogs().Sync(context.Background(), "n", "123", RequestOptions{IdempotencyKey: "caller-key"})
	if err == nil || count.Load() != 1 {
		t.Fatal("uncertain sync replayed", count.Load(), err)
	}
}
