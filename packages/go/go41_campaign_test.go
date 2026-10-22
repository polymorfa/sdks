package polymorfa_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	sdk "github.com/polymorfa/sdks/packages/go"
)

func go41Client(t *testing.T, handler http.HandlerFunc) (*sdk.MessagingClient, *sdk.OrganizationClient) {
	t.Helper()
	s := httptest.NewServer(handler)
	t.Cleanup(s.Close)
	cfg := sdk.Config{BaseURL: s.URL, Credential: sdk.Credential{Kind: sdk.OrganizationAPIKey, Value: "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"}}
	m, e := sdk.NewMessagingClient(cfg)
	if e != nil {
		t.Fatal(e)
	}
	o, e := sdk.NewOrganizationClient(cfg)
	if e != nil {
		t.Fatal(e)
	}
	return m, o
}
func TestGo41FollowUpDefaultRelationshipBeforeHTTP(t *testing.T) {
	calls := 0
	m, _ := go41Client(t, func(w http.ResponseWriter, r *http.Request) { calls++; io.WriteString(w, `{"success":true,"data":{}}`) })
	expiry := 86400
	_, e := m.Campaigns().Create(context.Background(), "p", sdk.CreateCampaignRequest{Name: "x", FollowUp: &sdk.Nullable[sdk.CampaignFollowUp]{Value: &sdk.CampaignFollowUp{ExpirySeconds: &expiry, Message: sdk.CampaignFollowUpTextMessage{Text: "x"}}}})
	if e == nil || calls != 0 {
		t.Fatalf("default delay must be less than expiry: error=%v calls=%d", e, calls)
	}
}
