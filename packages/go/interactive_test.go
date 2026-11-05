package polymorfa

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"
)

func TestInteractiveMediaAndCarouselWire(t *testing.T) {
	url, preview, footer, id := "https://example.test/media", "c3ludGhldGlj", "Outer", "stable"
	source := InteractiveMediaSource{URL: &url}
	var bodies []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Idempotency-Key") == "" {
			t.Error("missing idempotency key")
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
		}
		bodies = append(bodies, body)
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"data":{"id":"fixture","type":"buttons"}}`))
	}))
	defer server.Close()
	client := mustMessaging(t, server.URL)
	buttons := []MessageButton{{Type: "reply", Text: "Choose", ID: id}, {Type: "url", Text: "Open", URL: url}}
	for _, kind := range []string{"image", "video", "document"} {
		media := &ButtonsMedia{InteractiveMediaSource: source, Type: kind}
		if kind == "video" {
			media.Thumbnail = &preview
		}
		content := MessageContent{Buttons: &ButtonsContent{Body: "Choose", Media: media, Buttons: buttons}}
		if _, err := client.Messages().Send(context.Background(), "session", SendMessageRequest{Conversation: ConversationReference{ID: "chat"}, Content: content}); err != nil {
			t.Fatal(err)
		}
	}
	cards := []CarouselCard{{Body: "Image", Image: &source, Buttons: []MessageButton{{Type: "reply", Text: "Choose", ID: "image"}}}, {Body: "Video", Video: &CarouselVideo{InteractiveMediaSource: source, Thumbnail: &preview}, Buttons: []MessageButton{{Type: "reply", Text: "Choose", ID: "video"}}}}
	if _, err := client.Messages().Send(context.Background(), "session", SendMessageRequest{Conversation: ConversationReference{ID: "chat"}, Content: MessageContent{Carousel: &CarouselContent{Body: "Offers", Footer: &footer, Cards: cards}}}); err != nil {
		t.Fatal(err)
	}
	if len(bodies) != 4 {
		t.Fatalf("one request per message: %d", len(bodies))
	}
	carousel := bodies[3]["content"].(map[string]any)["carousel"].(map[string]any)
	if carousel["footer"] != footer {
		t.Fatal("outer footer lost")
	}
	card := carousel["cards"].([]any)[1].(map[string]any)
	if card["video"].(map[string]any)["thumbnail"] != preview {
		t.Fatal("nested video preview lost")
	}
	raw, err := json.Marshal(CampaignComposedButton{Kind: "reply", Label: "Choose", ID: &id})
	if err != nil {
		t.Fatal(err)
	}
	var round CampaignComposedButton
	if err = json.Unmarshal(raw, &round); err != nil || round.ID == nil || *round.ID != id {
		t.Fatal("typed campaign stable ID lost", err)
	}
}
func TestInteractiveCampaignStableReplyIDWire(t *testing.T) {
	source, id, target := "Choose an offer", "offer-stable", "https://example.test/offer"
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Method != "POST" || r.URL.Path != "/platform/campaigns" {
			t.Error("unexpected campaign route")
		}
		var actual, expected map[string]any
		if err := json.NewDecoder(r.Body).Decode(&actual); err != nil {
			t.Error(err)
		}
		if err := json.Unmarshal([]byte(`{"projectId":"11111111-1111-4111-8111-111111111111","name":"Interactive","messagesArray":[{"version":2,"source":"Choose an offer","media":{"kind":"image","url":"https://example.test/offer"},"buttons":[{"kind":"reply","label":"Choose","id":"offer-stable"},{"kind":"link","label":"Open","url":"https://example.test/offer"}]}]}`), &expected); err != nil {
			t.Error(err)
			return
		}
		if !reflect.DeepEqual(actual, expected) {
			t.Errorf("campaign body lost typed interactive fields: %#v", actual)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(campaignFixture))
	}))
	defer server.Close()
	client, err := NewOrganizationClient(orgConfig(server.URL))
	if err != nil {
		t.Fatal(err)
	}
	version := 2
	rawID := json.RawMessage(`"offer-stable"`)
	legacy := CampaignComposedButton{Kind: "reply", Label: "Choose", Extra: PlatformPayload{"id": rawID}}
	for _, reply := range []CampaignComposedButton{
		{Kind: "reply", Label: "Choose", ID: &id},
		legacy,
		{Kind: "reply", Label: "Choose", ID: &id, Extra: PlatformPayload{"id": rawID}},
	} {
		buttons := []CampaignComposedButton{reply, {Kind: "link", Label: "Open", URL: &target}}
		messages := []CampaignComposedMessage{{Version: &version, Source: &source, Media: &CampaignComposedMedia{Kind: "image", URL: target}, Buttons: &buttons}}
		_, err = client.Campaigns().Create(context.Background(), CreatePlatformCampaignRequest{ProjectID: "11111111-1111-4111-8111-111111111111", Name: "Interactive", MessagesArray: &messages})
		if err != nil {
			t.Fatal(err)
		}
	}
	if calls != 3 || legacy.ID != nil || string(legacy.Extra["id"]) != string(rawID) {
		t.Fatalf("legacy ID changed or wire request missing: calls=%d, legacy=%#v", calls, legacy)
	}
}
func TestInteractiveCampaignExtensionIDConflictsNoHTTP(t *testing.T) {
	id, source := "typed", "Choose"
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls++ }))
	defer server.Close()
	client, err := NewOrganizationClient(orgConfig(server.URL))
	if err != nil {
		t.Fatal(err)
	}
	for _, button := range []CampaignComposedButton{
		{Kind: "reply", Label: "Choose", ID: &id, Extra: PlatformPayload{"id": json.RawMessage(`"different"`)}},
		{Kind: "reply", Label: "Choose", Extra: PlatformPayload{"id": json.RawMessage(`123`)}},
		{Kind: "reply", Label: "Choose", Extra: PlatformPayload{"id": nil}},
	} {
		buttons := []CampaignComposedButton{button}
		messages := []CampaignComposedMessage{{Source: &source, Buttons: &buttons}}
		if _, err := client.Campaigns().Create(context.Background(), CreatePlatformCampaignRequest{ProjectID: "11111111-1111-4111-8111-111111111111", Name: "Invalid", MessagesArray: &messages}); err == nil {
			t.Fatal("accepted a conflicting or nonstring extension ID")
		}
	}
	if calls != 0 {
		t.Fatalf("invalid IDs reached HTTP: %d", calls)
	}
}
func TestInteractiveMediaRejectsAmbiguousSources(t *testing.T) {
	value := "fixture"
	invalid := []MessageContent{
		{Buttons: &ButtonsContent{Title: "Title", Media: &ButtonsMedia{Type: "image", InteractiveMediaSource: InteractiveMediaSource{URL: &value}}}},
		{Buttons: &ButtonsContent{Media: &ButtonsMedia{Type: "image", InteractiveMediaSource: InteractiveMediaSource{URL: &value, Base64: &value}}}},
		{Carousel: &CarouselContent{Cards: []CarouselCard{{}, {}}}},
	}
	for _, content := range invalid {
		if validateInteractiveContent(content) == nil {
			t.Fatal("accepted invalid interactive union")
		}
	}
}
