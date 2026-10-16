package polymorfa

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestAudienceProfileFilterFixture(t *testing.T) {
	raw, err := os.ReadFile("../../contracts/fixtures/audience-profile-list.v1.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Valid   []map[string]string `json:"validFilters"`
		Invalid []map[string]string `json:"invalidFilters"`
		Cursors []string            `json:"invalidCursors"`
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	params := func(v map[string]string) ListAudienceProfilesParams {
		var p ListAudienceProfilesParams
		if s, ok := v["tag"]; ok {
			p.Tag = &s
		}
		if s, ok := v["phonePrefix"]; ok {
			p.PhonePrefix = &s
		}
		return p
	}
	for _, v := range fixture.Valid {
		q, err := profileListQuery(params(v))
		if err != nil {
			t.Fatal(v, err)
		}
		for k, s := range v {
			if q.Get(k) != s {
				t.Fatal(q, v)
			}
		}
	}
	for _, v := range fixture.Invalid {
		if _, err := profileListQuery(params(v)); err == nil {
			t.Fatal("accepted", v)
		}
	}
	for _, s := range fixture.Cursors {
		if _, err := profileListQuery(ListAudienceProfilesParams{Cursor: &s}); err == nil {
			t.Fatal("accepted cursor", s)
		}
	}
	tag, prefix := "null", "+44"
	q, err := profileListQuery(ListAudienceProfilesParams{Tag: &tag, PhonePrefix: &prefix})
	if err != nil || q.Encode() != "phonePrefix=%2B44&tag=null" {
		t.Fatal(q, err)
	}
	if _, err := profilePageQuery(ListAudienceProfilesParams{Tag: &tag}); err == nil {
		t.Fatal("consent accepted filters")
	}
}

func TestAudienceProfileFilterPublicWire(t *testing.T) {
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		if r.URL.Path != "/platform/audience-profiles" || r.URL.Query().Get("tag") != "é vip" || r.URL.Query().Get("phonePrefix") != "+44" || !strings.Contains(r.URL.RawQuery, "%2B44") {
			t.Error(r.URL.String())
		}
		if r.Header.Get("Authorization") != "Bearer pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k" {
			t.Error("credential changed")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[],"page":{"nextCursor":null,"hasMore":false}}`))
	}))
	defer server.Close()
	client, err := NewOrganizationClient(Config{Credential: Credential{Kind: OrganizationAPIKey, Value: "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"}, BaseURL: server.URL})
	if err != nil {
		t.Fatal(err)
	}
	tag, prefix := "é vip", "+44"
	result, err := client.AudienceProfiles().List(context.Background(), ListAudienceProfilesParams{Tag: &tag, PhonePrefix: &prefix})
	if err != nil {
		t.Fatal(err)
	}
	if result.Data.Page.HasMore || result.Data.Page.NextCursor != nil || requests != 1 {
		t.Fatal(result, requests)
	}
}
