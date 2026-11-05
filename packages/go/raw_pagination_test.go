package polymorfa

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"testing"
)

func TestRawPaginationNativeScopeDecoderAndCursor(t *testing.T) {
	count := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count++
		if r.Method != "POST" || r.URL.Path != "/platform/projects/p/search" || r.URL.Query().Get("filter") != "saved" || r.Header.Get("X-Test") != "kept" || r.Header.Get("Authorization") != "Bearer "+orgConfig("").Credential.Value {
			t.Errorf("request %s %s", r.Method, r.URL)
		}
		b, _ := io.ReadAll(r.Body)
		if string(b) != `{"term":"hello"}` {
			t.Error(string(b))
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Request-ID", "raw-page")
		if r.URL.Query().Get("after") == "" {
			io.WriteString(w, `{"rows":[1,2],"resume":"second"}`)
		} else {
			if r.URL.Query().Get("after") != "second" {
				t.Error("custom cursor")
			}
			io.WriteString(w, `{"rows":[3],"resume":null}`)
		}
	}))
	defer s.Close()
	org, _ := NewOrganizationClient(orgConfig(s.URL))
	client, _ := org.Project("p")
	request := RawRequest{Method: "POST", Path: "/search", Query: url.Values{"filter": {"saved"}}, Body: map[string]string{"term": "hello"}, Options: RequestOptions{Headers: http.Header{"X-Test": {"kept"}}}}
	decode := func(raw json.RawMessage, metadata Metadata) (PageResult[int], error) {
		if metadata.RequestID != "raw-page" {
			t.Error("decoder metadata")
		}
		var wire struct {
			Rows   []int
			Resume *string
		}
		if e := json.Unmarshal(raw, &wire); e != nil {
			return PageResult[int]{}, e
		}
		result := PageResult[int]{Items: wire.Rows}
		if wire.Resume != nil {
			result.NextCursor = *wire.Resume
		}
		return result, nil
	}
	page, e := PaginateRaw(context.Background(), client, request, decode, RawPaginationOptions{CursorParameter: "after"})
	if e != nil {
		t.Fatal(e)
	}
	if count != 1 || !page.HasMore() || !reflect.DeepEqual(page.Items, []int{1, 2}) {
		t.Fatal("first page not lazy")
	}
	request.Query.Set("filter", "changed")
	request.Options.Headers.Set("X-Test", "changed")
	var got []int
	for item, e := range page.All(context.Background()) {
		if e != nil {
			t.Fatal(e)
		}
		got = append(got, item)
	}
	if count != 2 || !reflect.DeepEqual(got, []int{1, 2, 3}) {
		t.Fatal(count, got)
	}
	next, e := page.NextPage(context.Background())
	if e != nil || next.HasMore() {
		t.Fatal(e)
	}
	if last, e := next.NextPage(context.Background()); e != nil || last != nil {
		t.Fatal("terminal page fetched")
	}
}

func TestRawPaginationNativeFailures(t *testing.T) {
	count := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count++
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `["a","b"]`)
	}))
	defer s.Close()
	m := mustMessaging(t, s.URL)
	sentinel := errors.New("decoder failed")
	_, e := PaginateRaw(context.Background(), m, RawRequest{Method: "GET", Path: "/custom"}, func(json.RawMessage, Metadata) (PageResult[string], error) { return PageResult[string]{}, sentinel })
	if !errors.Is(e, sentinel) {
		t.Fatal(e)
	}
	_, e = PaginateRaw(context.Background(), m, RawRequest{Method: "GET", Path: "/custom", Query: url.Values{"cursor": {"same"}}}, func(raw json.RawMessage, _ Metadata) (PageResult[string], error) {
		var items []string
		_ = json.Unmarshal(raw, &items)
		return PageResult[string]{Items: items, NextCursor: "same"}, nil
	})
	var apiError *Error
	if !errors.As(e, &apiError) || apiError.Code != "invalid_response" {
		t.Fatal(e)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, e = PaginateRaw(ctx, m, RawRequest{Method: "GET", Path: "/custom"}, func(json.RawMessage, Metadata) (PageResult[string], error) { return PageResult[string]{}, nil })
	if !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
	if count != 2 {
		t.Fatal("cancelled request sent", count)
	}
	org, _ := NewOrganizationClient(orgConfig(s.URL))
	project, _ := org.Project("p")
	for _, path := range []string{"/platform/projects/other/data", "//foreign", "/../other"} {
		_, e := PaginateRaw(context.Background(), project, RawRequest{Method: "GET", Path: path}, func(json.RawMessage, Metadata) (PageResult[string], error) { return PageResult[string]{}, nil })
		if e == nil {
			t.Fatal("foreign path admitted", path)
		}
	}
	if count != 2 {
		t.Fatal("guard sent request", count)
	}
}

func TestCampaignFollowUpMessageUnion(t *testing.T) {
	for _, config := range []CampaignFollowUp{{Message: CampaignFollowUpTextMessage{Text: "Hello"}}, {Message: CampaignFollowUpTemplateMessage{TemplateID: "template"}}, {Message: &CampaignFollowUpTextMessage{Text: "Hello"}}} {
		b, e := json.Marshal(config)
		if e != nil {
			t.Fatal(e)
		}
		var got CampaignFollowUp
		if e = json.Unmarshal(b, &got); e != nil {
			t.Fatal(e)
		}
		roundtrip, e := json.Marshal(got)
		if e != nil || string(b) != string(roundtrip) {
			t.Fatal(e, string(b), string(roundtrip))
		}
	}
	for _, message := range []CampaignFollowUpMessage{nil, (*CampaignFollowUpTextMessage)(nil), (*CampaignFollowUpTemplateMessage)(nil)} {
		if _, e := json.Marshal(CampaignFollowUp{Message: message}); e == nil {
			t.Fatal("nil message encoded")
		}
	}
	for _, wire := range []string{`{"message":{}}`, `{"message":{"type":"unknown","text":"x"}}`, `{"message":{"type":"text","templateId":"t"}}`, `{"message":{"type":"template","text":"x"}}`, `{"message":{"type":"text","text":"x","templateId":"t"}}`, `{"message":{"type":"text","text":null}}`, `{"message":{"type":"template","templateId":1}}`} {
		var got CampaignFollowUp
		if e := json.Unmarshal([]byte(wire), &got); e == nil {
			t.Fatal("invalid union decoded", wire)
		}
	}
	count := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count++
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{}`)
	}))
	defer s.Close()
	m := mustMessaging(t, s.URL)
	invalid := CampaignFollowUp{}
	if _, e := m.Campaigns().Update(context.Background(), "p", "c", UpdateCampaignRequest{FollowUp: &Nullable[CampaignFollowUp]{Value: &invalid}}); e == nil {
		t.Fatal("missing union variant accepted")
	}
	if count != 0 {
		t.Fatal("invalid request was sent")
	}
}
