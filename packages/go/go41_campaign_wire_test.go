package polymorfa_test

import (
	"context"
	"encoding/json"
	"fmt"
	sdk "github.com/polymorfa/sdks/packages/go"
	"io"
	"net/http"
	"strings"
	"testing"
)

const go41Project = "11111111-1111-4111-8111-111111111111"
const go41Campaign = `{"id":"18446744073709551615","name":"Draft","status":"draft","templateId":null,"recipientListId":null,"recipientCount":0,"sentCount":0,"deliveredCount":0,"readCount":0,"failedCount":0,"skippedCount":0,"scheduledAt":null,"launchedAt":null,"completedAt":null,"createdAt":0,"updatedAt":0,"sendWindow":null,"experimentOutcome":null,"followUp":{"message":{"type":"text","text":"follow"}},"trackedLinks":[],"variableMapping":{"0":{},"__proto__":{"fallback":"value"}},"future":{"ok":false}}`
const go41Report = `{"campaignId":"18446744073709551615","recipientCount":0,"sentCount":0,"deliveredCount":0,"readCount":0,"failedCount":0,"skippedCount":0,"respondedCount":0,"responseRate":0,"averageResponseTimeMs":null,"minResponseTimeMs":0,"maxResponseTimeMs":null,"experiment":null,"followUps":{"total":0,"waiting":0,"scheduled":0,"sending":0,"sent":0,"delivered":0,"read":0,"replied":0,"cancelled":0,"expired":0,"failed":0,"unknown":0,"nextDueAt":null}}`
const go41Recipient = `{"id":"18446744073709551615","phone":"+15550000002","variables":{},"variantKey":null,"status":"failed","attempts":0,"lastError":"missing_variable","failureReason":"missing_variable","externalMessageId":null,"queuedAt":0,"sentAt":null,"deliveredAt":null,"readAt":null,"failedAt":null,"respondedAt":null,"messagesSent":0,"nextMessageAt":123.5,"sequenceError":null,"followUp":null}`

func TestGo41CampaignMappingsAndNulls(t *testing.T) {
	calls := 0
	mapping := sdk.CampaignVariableMapping{"0": {}, "__proto__": {}}
	links := sdk.CampaignTrackedLinks{{Key: "a", URL: "https://EXAMPLE.com"}, {Key: "b", URL: "https://EXAMPLE.com"}}
	m, o := go41Client(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		b, _ := io.ReadAll(r.Body)
		var x map[string]any
		if json.Unmarshal(b, &x) != nil {
			t.Fatal("json")
		}
		if r.Header.Get("Polymorfa-Version") != sdk.APIVersion {
			t.Error("campaign version changed")
		}
		switch calls {
		case 1, 2:
			if len(x["variableMapping"].(map[string]any)) != 2 || len(x["trackedLinks"].([]any)) != 2 {
				t.Error("map/list lost")
			}
		case 3, 4, 5:
			if len(x) != 1 {
				t.Error("null-only patch")
			}
			for _, v := range x {
				if v != nil {
					t.Error("null lost")
				}
			}
		}
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"success":true,"data":`+go41Campaign+`}`)
	})
	a, e := m.Campaigns().Create(context.Background(), "p /x", sdk.CreateCampaignRequest{Name: "Draft", VariableMapping: &mapping, TrackedLinks: &sdk.Nullable[sdk.CampaignTrackedLinks]{Value: &links}})
	if e != nil {
		t.Fatal(e)
	}
	if a.Data.Data.ID != "18446744073709551615" || a.Data.Data.FollowUp.DelaySeconds != nil || a.Data.Data.ExperimentOutcome != nil || len(a.Data.Data.TrackedLinks) != 0 {
		t.Fatal("returned nullable model")
	}
	b, e := o.Campaigns().Create(context.Background(), sdk.CreatePlatformCampaignRequest{ProjectID: go41Project, Name: "Draft", VariableMapping: &mapping, TrackedLinks: &sdk.Nullable[sdk.CampaignTrackedLinks]{Value: &links}})
	if e != nil || string(b.Data.Data.Extra["future"]) != `{"ok":false}` {
		t.Fatalf("open result %v", e)
	}
	for _, patch := range []sdk.UpdateCampaignRequest{{TemplateID: &sdk.Nullable[string]{}}, {VariableMapping: &sdk.Nullable[sdk.CampaignVariableMapping]{}}, {TrackedLinks: &sdk.Nullable[sdk.CampaignTrackedLinks]{}}} {
		if _, e := m.Campaigns().Update(context.Background(), "p", "c", patch); e != nil {
			t.Fatal(e)
		}
	}
}
func TestGo41CampaignGuardBoundaries(t *testing.T) {
	calls := 0
	m, o := go41Client(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"data":`+go41Campaign+`}`)
	})
	for _, s := range []string{"\ufeff", "\u00a0", strings.Repeat("😀", 513)} {
		v := sdk.CampaignVariableMapping{"0": {Fallback: &s}}
		if _, e := m.Campaigns().Create(context.Background(), "p", sdk.CreateCampaignRequest{Name: "x", VariableMapping: &v}); e == nil {
			t.Fatal("fallback boundary")
		}
	}
	for _, key := range []string{"bad key", "-x"} {
		v := sdk.CampaignVariableMapping{key: {}}
		if _, e := m.Campaigns().Create(context.Background(), "p", sdk.CreateCampaignRequest{Name: "x", VariableMapping: &v}); e == nil {
			t.Fatal("mapping key")
		}
	}
	mapping := sdk.CampaignVariableMapping{}
	for i := 0; i < 51; i++ {
		mapping[fmt.Sprint(i)] = sdk.CampaignVariableBinding{}
	}
	if _, e := m.Campaigns().Create(context.Background(), "p", sdk.CreateCampaignRequest{Name: "x", VariableMapping: &mapping}); e == nil {
		t.Fatal("51 mapping entries")
	}
	for _, raw := range []string{"http://example.com", "https://localhost", "https://a.local", "https://127.0.0.1", "https://user:pw@example.com", "https://example.com/\ufeff", "https://example.com/" + strings.Repeat("😀", 512)} {
		v := sdk.CampaignTrackedLinks{{Key: "a", URL: raw}}
		if _, e := m.Campaigns().Create(context.Background(), "p", sdk.CreateCampaignRequest{Name: "x", TrackedLinks: &sdk.Nullable[sdk.CampaignTrackedLinks]{Value: &v}}); e == nil {
			t.Fatalf("invalid tracked URL %q", raw)
		}
	}
	for _, text := range []string{"{{ LiNk:a}}", strings.Repeat("😀", 8193)} {
		v := sdk.CampaignFollowUp{Message: sdk.CampaignFollowUpTextMessage{Text: text}}
		if _, e := m.Campaigns().Create(context.Background(), "p", sdk.CreateCampaignRequest{Name: "x", FollowUp: &sdk.Nullable[sdk.CampaignFollowUp]{Value: &v}}); e == nil {
			t.Fatal("follow-up text")
		}
	}
	n := 86401
	messages := []sdk.CampaignComposedMessage{{DelayAfterSec: &n}}
	if _, e := o.Campaigns().Create(context.Background(), sdk.CreatePlatformCampaignRequest{Name: "x", ProjectID: go41Project, MessagesArray: &messages}); e == nil {
		t.Fatal("delay bound")
	}
	if calls != 0 {
		t.Fatal("invalid requests reached HTTP")
	}
	// U+0085 is not ECMAScript whitespace; U+FEFF is. 1024 UTF16 units allowed.
	fallback := "\u0085" + strings.Repeat("😀", 511) + "x"
	v := sdk.CampaignVariableMapping{"0": {Fallback: &fallback}}
	if _, e := m.Campaigns().Create(context.Background(), "p", sdk.CreateCampaignRequest{Name: "x", VariableMapping: &v}); e != nil {
		t.Fatal(e)
	}
}
func TestGo41OpenComposedAndTypedLaunch(t *testing.T) {
	calls := 0
	m, o := go41Client(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		b, _ := io.ReadAll(r.Body)
		var x map[string]any
		json.Unmarshal(b, &x)
		if strings.HasSuffix(r.URL.Path, "/launch") {
			if x["skipMissingVariables"] != false || x["scheduledAt"] != float64(0) {
				t.Error("false/zero launch lost")
			}
			if strings.HasPrefix(r.URL.Path, "/platform/") && x["projectId"] != go41Project {
				t.Error("launch owner")
			}
		} else if a, ok := x["messagesArray"].([]any); ok {
			if len(a) != 2 || a[1].(map[string]any)["future"] != false || len(a[1].(map[string]any)["source"].(string)) != 5000 {
				t.Error("open composed shape")
			}
		}
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"success":true,"data":`+strings.TrimSuffix(go41Campaign, "}")+`,"operationId":"op"}}`)
	})
	text := strings.Repeat("x", 5000)
	messages := []sdk.CampaignComposedMessage{{}, {Source: &text, Extra: sdk.PlatformPayload{"future": json.RawMessage(`false`)}}}
	if _, e := o.Campaigns().Create(context.Background(), sdk.CreatePlatformCampaignRequest{ProjectID: go41Project, Name: "x", MessagesArray: &messages}); e != nil {
		t.Fatal(e)
	}
	flag := false
	at := 0.
	b := sdk.LaunchCampaignRequest{SkipMissingVariables: &flag, ScheduledAt: &at}
	if _, e := m.Campaigns().Launch(context.Background(), "p /x", "campaign /x", b); e != nil {
		t.Fatal(e)
	}
	r, e := o.Campaigns().Launch(context.Background(), "campaign /x", sdk.LaunchPlatformCampaignRequest{ProjectID: go41Project, LaunchCampaignRequest: b})
	if e != nil || r.Data.Data.OperationID != "op" || r.Data.Data.ID != "18446744073709551615" || len(r.Data.Data.Extra["future"]) == 0 {
		t.Fatalf("launch result %v", e)
	}
}
func TestGo41RecipientAndAnalyticsRoutes(t *testing.T) {
	m, o := go41Client(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasSuffix(r.URL.Path, "/analytics") {
			io.WriteString(w, `{"success":true,"data":`+go41Report+`}`)
		} else {
			q := r.URL.Query()
			if q.Get("reason") != "missing_variable" || q.Get("status") != "failed" || q.Get("cursor") != "initial" || q.Get("limit") != "100" {
				t.Error("recipient filters")
			}
			io.WriteString(w, `{"success":true,"data":[`+go41Recipient+`],"page":{"nextCursor":null,"hasMore":false}}`)
		}
	})
	p := sdk.ListCampaignRecipientsParams{ListParams: sdk.ListParams{Cursor: "initial", Limit: 100}, Status: "failed", Reason: sdk.CampaignFailureMissingVariable}
	a, e := m.Campaigns().ListRecipients(context.Background(), "p", "c", p)
	if e != nil || *a.Data.Data[0].NextMessageAt != 123.5 || a.Data.Data[0].MessagesSent != 0 || *a.Data.Data[0].FailureReason != sdk.CampaignFailureMissingVariable {
		t.Fatalf("recipient fields %v", e)
	}
	if _, e := o.Campaigns().Recipients(context.Background(), "c", sdk.ListPlatformCampaignRecipientsParams{ProjectID: go41Project, ListCampaignRecipientsParams: p}); e != nil {
		t.Fatal(e)
	}
	a1, e := m.Campaigns().Analytics(context.Background(), "p", "c")
	if e != nil || a1.Data.Data.AverageResponseTimeMS != nil || *a1.Data.Data.MinResponseTimeMS != 0 || a1.Data.Data.FollowUps.NextDueAt != nil {
		t.Fatalf("nullable analytics %v", e)
	}
	a2, e := o.Campaigns().Analytics(context.Background(), "c", sdk.PlatformCampaignParams{ProjectID: go41Project})
	if e != nil || a2.Data.Data.Experiment != nil || a2.Data.Data.FollowUps.Total != 0 {
		t.Fatal(e)
	}
}

func TestGo41ResponseValidationDoesNotReuseRequestQuotas(t *testing.T) {
	tags := make([]string, 21)
	for i := range tags {
		tags[i] = fmt.Sprint(i)
	}
	payload := map[string]any{"id": "opaque-id", "phone": "returned-value", "revision": 1, "tags": tags, "attributes": map[string]any{}, "provenance": nil, "createdAt": 0, "updatedAt": 0, "extension": false}
	m, o := go41Client(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"data": payload})
	})
	_ = m
	r, e := o.AudienceProfiles().Retrieve(context.Background(), "+15550000002")
	if e != nil || len(r.Data.Data.Tags) != 21 {
		t.Fatalf("response rejected request-only quota %v", e)
	}
}

func TestGo41RequestDecodeNullAndOpenFields(t *testing.T) {
	for _, raw := range []string{`{"name":"x","variableMapping":null}`, `{"name":"x","variableMapping":{"a":{"source":null}}}`, `{"name":"x","variableMapping":{"a":{"fallback":null}}}`} {
		var v sdk.CreateCampaignRequest
		if json.Unmarshal([]byte(raw), &v) == nil {
			t.Fatal("create mapping null accepted")
		}
	}
	for _, raw := range []string{`{"messagesArray":[{"source":null}]}`, `{"messagesArray":[{"media":null}]}`, `{"messagesArray":[{"buttons":null}]}`, `{"variants":null}`} {
		var v sdk.CreatePlatformCampaignRequest
		if json.Unmarshal([]byte(raw), &v) == nil {
			t.Fatal("Platform create null accepted")
		}
	}
	var patch sdk.UpdatePlatformCampaignRequest
	if e := json.Unmarshal([]byte(`{"trackedLinks":null,"messagesArray":[{}, {"future":false}],"future":false}`), &patch); e != nil {
		t.Fatal(e)
	}
	b, e := json.Marshal(patch)
	if e != nil || !strings.Contains(string(b), `"future":false`) || !strings.Contains(string(b), `"trackedLinks":null`) {
		t.Fatal("open patch lost extension/null")
	}
	var launch sdk.LaunchPlatformCampaignRequest
	if json.Unmarshal([]byte(`{"projectId":"`+go41Project+`","skipMissingVariables":false,"extra":true}`), &launch) == nil {
		t.Fatal("closed launch extension accepted")
	}
}

func TestGo41AlternativesAndFollowUpBounds(t *testing.T) {
	calls := 0
	m, o := go41Client(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"success":true,"data":`+go41Campaign+`}`)
	})
	valid := []sdk.CampaignVariant{{Key: "a", Label: "A", Weight: 50, Blueprint: sdk.CampaignBlueprint{Version: 2, Source: "hello"}}, {Key: "b", Label: "B", Weight: 50, Blueprint: sdk.CampaignBlueprint{Version: 2, Source: "hello"}}}
	for _, mode := range []string{"count", "weight", "duplicate", "blueprint", "label"} {
		v := append([]sdk.CampaignVariant{}, valid...)
		switch mode {
		case "count":
			v = v[:1]
		case "weight":
			v[0].Weight = 49
		case "duplicate":
			v[1].Key = "a"
		case "blueprint":
			v[1].Blueprint.Version = 3
		case "label":
			v[1].Label = strings.Repeat("x", 101)
		}
		if _, e := m.Campaigns().Create(context.Background(), "p", sdk.CreateCampaignRequest{Name: "x", Variants: &sdk.Nullable[[]sdk.CampaignVariant]{Value: &v}}); e == nil {
			t.Fatal("invalid variants", mode)
		}
	}
	for _, delay := range []int{59, 604801, 604800} {
		v := sdk.CampaignFollowUp{DelaySeconds: &delay, Message: sdk.CampaignFollowUpTextMessage{Text: "x"}}
		if _, e := m.Campaigns().Create(context.Background(), "p", sdk.CreateCampaignRequest{Name: "x", FollowUp: &sdk.Nullable[sdk.CampaignFollowUp]{Value: &v}}); e == nil {
			t.Fatal("follow-up bounds/default relation")
		}
	}
	if calls != 0 {
		t.Fatal("invalid request reached HTTP")
	}
	if _, e := m.Campaigns().Create(context.Background(), "p", sdk.CreateCampaignRequest{Name: "x", Variants: &sdk.Nullable[[]sdk.CampaignVariant]{Value: &valid}}); e != nil {
		t.Fatal(e)
	}
	if _, e := o.Campaigns().Create(context.Background(), sdk.CreatePlatformCampaignRequest{ProjectID: go41Project, Name: "x", Variants: valid}); e != nil {
		t.Fatal(e)
	}
}

func TestGo41OpenPatchCannotReplaceOwnerOrPathIdentity(t *testing.T) {
	calls := 0
	_, o := go41Client(t, func(w http.ResponseWriter, r *http.Request) { calls++ })
	for _, key := range []string{"projectId", "id"} {
		_, e := o.Campaigns().Update(context.Background(), "campaign", &sdk.UpdatePlatformCampaignRequest{Extra: sdk.PlatformPayload{key: json.RawMessage(`"foreign"`)}}, sdk.PlatformCampaignParams{ProjectID: go41Project})
		if e == nil || calls != 0 {
			t.Fatal("open patch replaced selected identity")
		}
	}
}
