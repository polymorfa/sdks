package polymorfa

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"sort"
	"strings"
	"sync"
	"testing"
)

// Wire expectations are derived from contracts/campaign-frequency-cap.json,
// contracts/campaign-segments-drip.json and the pinned TypeScript producer tests.

type recordedRequest struct {
	method, path, rawPath, query, body string
	header                             http.Header
}

type recordingServer struct {
	*httptest.Server
	mu       sync.Mutex
	requests []recordedRequest
}

func newRecordingServer(t *testing.T, respond func(i int, r recordedRequest) (int, string)) *recordingServer {
	t.Helper()
	s := &recordingServer{}
	s.Server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		req := recordedRequest{r.Method, r.URL.Path, r.URL.EscapedPath(), r.URL.RawQuery, string(b), r.Header.Clone()}
		s.mu.Lock()
		i := len(s.requests)
		s.requests = append(s.requests, req)
		s.mu.Unlock()
		status, body := respond(i, req)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Request-Id", "req_segment")
		w.WriteHeader(status)
		io.WriteString(w, body)
	}))
	t.Cleanup(s.Close)
	return s
}
func (s *recordingServer) all() []recordedRequest {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]recordedRequest(nil), s.requests...)
}
func retryingOrg(t *testing.T, base string) *OrganizationClient {
	t.Helper()
	c := orgConfig(base)
	retries := 2
	c.MaxNetworkRetries = &retries
	o, err := NewOrganizationClient(c)
	if err != nil {
		t.Fatal(err)
	}
	return o
}
func retryingMessaging(t *testing.T, base string) *MessagingClient {
	t.Helper()
	c := orgConfig(base)
	retries := 2
	c.MaxNetworkRetries = &retries
	m, err := NewMessagingClient(c)
	if err != nil {
		t.Fatal(err)
	}
	return m
}
func jsonEqual(t *testing.T, label, got, want string) {
	t.Helper()
	var a, b any
	if err := json.Unmarshal([]byte(got), &a); err != nil {
		t.Fatalf("%s: invalid JSON %q", label, got)
	}
	_ = json.Unmarshal([]byte(want), &b)
	if !reflect.DeepEqual(a, b) {
		t.Fatalf("%s: got %s want %s", label, got, want)
	}
}

var segmentRules = AudienceSegmentRules{Match: AudienceSegmentMatchAll, Groups: []AudienceSegmentGroup{{Match: AudienceSegmentMatchAny, Conditions: []AudienceSegmentCondition{
	AudienceSegmentTagContains{Value: "vip"},
	AudienceSegmentAttributeCompare{Name: "spend", Operator: AudienceSegmentGreaterThan, Value: 100},
	AudienceSegmentConsentEquals{Value: true},
}}}}

const segmentRulesJSON = `{"match":"all","groups":[{"match":"any","conditions":[{"field":"tag","operator":"contains","value":"vip"},{"field":"attribute","name":"spend","operator":"greater_than","value":100},{"field":"consent","operator":"equals","value":true}]}]}`
const segmentJSON = `{"id":"` + contractID + `","name":"VIP","revision":2,"rules":` + segmentRulesJSON + `,"createdAt":1,"updatedAt":2}`
const previewJSON = `{"matchedCount":4,"optedOutCount":1,"consentWithheldCount":1,"eligibleCount":2,"sample":[{"phone":"+49*******12","tags":["vip"]}],"evaluatedAt":3}`

func TestFrequencyCapReadReplaceAndRemoveWithObservedRevision(t *testing.T) {
	s := newRecordingServer(t, func(i int, r recordedRequest) (int, string) {
		limits := `"maxPer24Hours":2,"maxPer7Days":5`
		if strings.Contains(r.body, "null") {
			limits = `"maxPer24Hours":null,"maxPer7Days":null`
		}
		return 200, `{"data":{"teamId":"` + contractProject + `",` + limits + `,"revision":` + string(rune('1'+i)) + `,"updatedAt":` + map[bool]string{true: "null", false: "1800000000000"}[i == 0] + `}}`
	})
	o := retryingOrg(t, s.URL)
	ctx := context.Background()
	read, err := o.Campaigns().GetFrequencyCap(ctx)
	if err != nil || read.Data.Data.Revision != 1 || read.Data.Data.UpdatedAt != nil || *read.Data.Data.MaxPer24Hours != 2 || read.Data.Data.TeamID != contractProject {
		t.Fatal("frequency cap read", err, read.Data.Data)
	}
	two, five := 2, 5
	saved, err := o.Campaigns().UpdateFrequencyCap(ctx, UpdateCampaignFrequencyCapInput{CampaignFrequencyCap: CampaignFrequencyCap{MaxPer24Hours: &two, MaxPer7Days: &five}, Revision: read.Data.Data.Revision})
	if err != nil || saved.Data.Data.Revision != 2 || saved.Data.Data.UpdatedAt == nil || *saved.Data.Data.UpdatedAt != 1800000000000 {
		t.Fatal("frequency cap replace", err)
	}
	if _, err = o.Campaigns().UpdateFrequencyCap(ctx, UpdateCampaignFrequencyCapInput{Revision: saved.Data.Data.Revision}); err != nil {
		t.Fatal("frequency cap removal", err)
	}
	got := s.all()
	want := [][2]string{{"GET", "/platform/campaign-settings/frequency-cap"}, {"PUT", "/platform/campaign-settings/frequency-cap"}, {"PUT", "/platform/campaign-settings/frequency-cap"}}
	for i, r := range got {
		if [2]string{r.method, r.path} != want[i] || r.query != "" {
			t.Fatalf("request %d: %s %s?%s", i, r.method, r.path, r.query)
		}
		if r.header.Get("Authorization") != "Bearer "+orgConfig("").Credential.Value || r.header.Get("Polymorfa-Version") != APIVersion {
			t.Fatal("credential or absent-only API version changed")
		}
	}
	jsonEqual(t, "replace", got[1].body, `{"maxPer24Hours":2,"maxPer7Days":5,"revision":1}`)
	jsonEqual(t, "remove", got[2].body, `{"maxPer24Hours":null,"maxPer7Days":null,"revision":2}`)
}

func TestFrequencyCapWriteErrorsAreSentOnceWithSafeMetadata(t *testing.T) {
	for _, tc := range []struct {
		status int
		code   string
		kind   ErrorKind
	}{{409, "conflict", ConflictError}, {403, "feature_unavailable", AuthorizationError}, {503, "unavailable", ServerError}} {
		s := newRecordingServer(t, func(int, recordedRequest) (int, string) {
			return tc.status, `{"error":{"code":"` + tc.code + `","message":"Cap unavailable or stale"}}`
		})
		_, err := retryingOrg(t, s.URL).Campaigns().UpdateFrequencyCap(context.Background(), UpdateCampaignFrequencyCapInput{Revision: 0}, RequestOptions{Headers: http.Header{"X-Caller": {"kept"}}})
		var e *Error
		if !errors.As(err, &e) || e.Kind != tc.kind || e.Code != tc.code || e.Status != tc.status || e.RequestID != "req_segment" {
			t.Fatalf("%d: %#v", tc.status, err)
		}
		if got := s.all(); len(got) != 1 || got[0].header.Get("X-Caller") != "kept" {
			t.Fatalf("%d: write was replayed or caller metadata lost: %d", tc.status, len(got))
		}
	}
	s := newRecordingServer(t, func(int, recordedRequest) (int, string) { return 200, `{}` })
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := retryingOrg(t, s.URL).Campaigns().UpdateFrequencyCap(ctx, UpdateCampaignFrequencyCapInput{})
	var e *Error
	if !errors.As(err, &e) || e.Kind != CancelledError || len(s.all()) != 0 {
		t.Fatal("caller cancellation was not preserved", err)
	}
}

func TestFrequencyCapFieldsReasonsAndAnalyticsOnBothSurfaces(t *testing.T) {
	s := newRecordingServer(t, func(_ int, r recordedRequest) (int, string) {
		switch {
		case strings.HasSuffix(r.path, "/analytics"):
			return 200, `{"success":true,"data":{"campaignId":"c","frequencyCap":{"skippedRecipientCount":3},"followUps":{}}}`
		case strings.HasSuffix(r.path, "/recipients"):
			return 200, `{"success":true,"data":[{"failureReason":"frequency_cap","lastError":"frequency_cap_exceeded"}],"page":{"hasMore":false,"nextCursor":null}}`
		}
		return 200, `{"success":true,"data":{"id":"c","frequencyCap":{"maxPer24Hours":2,"maxPer7Days":null}}}`
	})
	ctx := context.Background()
	o, m := retryingOrg(t, s.URL), retryingMessaging(t, s.URL)
	two, five := 2, 5
	limits := CampaignFrequencyCap{MaxPer24Hours: &two, MaxPer7Days: &five}
	set, clear := &Nullable[CampaignFrequencyCap]{Value: &limits}, &Nullable[CampaignFrequencyCap]{}
	p := PlatformCampaignParams{ProjectID: contractProject}
	if _, err := o.Campaigns().Create(ctx, CreatePlatformCampaignRequest{ProjectID: contractProject, Name: "cap", FrequencyCap: set}); err != nil {
		t.Fatal(err)
	}
	if _, err := o.Campaigns().Update(ctx, "c", &UpdatePlatformCampaignRequest{UpdateCampaignRequest: UpdateCampaignRequest{FrequencyCap: clear}}, p); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Campaigns().Create(ctx, contractProject, CreateCampaignRequest{Name: "cap", FrequencyCap: set}); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Campaigns().Update(ctx, contractProject, "c", UpdateCampaignRequest{FrequencyCap: clear}); err != nil {
		t.Fatal("frequency cap alone is a valid messaging PATCH", err)
	}
	reason := ListCampaignRecipientsParams{Status: "skipped", Reason: CampaignFailureFrequencyCap}
	pr, err := o.Campaigns().Recipients(ctx, "c", ListPlatformCampaignRecipientsParams{ListCampaignRecipientsParams: reason, ProjectID: contractProject})
	if err != nil || pr.Data.Data[0].FailureReason == nil || *pr.Data.Data[0].FailureReason != CampaignFailureFrequencyCap {
		t.Fatal("platform recipient failure reason", err)
	}
	mr, err := m.Campaigns().ListRecipients(ctx, contractProject, "c", reason)
	if err != nil || *mr.Data.Data[0].FailureReason != "frequency_cap" || *mr.Data.Data[0].LastError != "frequency_cap_exceeded" {
		t.Fatal("messaging recipient failure reason", err)
	}
	got := s.all()
	for i, want := range []string{`{"projectId":"` + contractProject + `","name":"cap","frequencyCap":{"maxPer24Hours":2,"maxPer7Days":5}}`, `{"frequencyCap":null}`, `{"name":"cap","frequencyCap":{"maxPer24Hours":2,"maxPer7Days":5}}`, `{"frequencyCap":null}`} {
		jsonEqual(t, "frequency cap write", got[i].body, want)
	}
	for _, r := range got[4:6] {
		if !strings.Contains(r.query, "reason=frequency_cap") || !strings.Contains(r.query, "status=skipped") {
			t.Fatal("reason filter", r.query)
		}
	}
	pc, err := o.Campaigns().Retrieve(ctx, "c", p)
	if err != nil || pc.Data.Data.FrequencyCap == nil || *pc.Data.Data.FrequencyCap.MaxPer24Hours != 2 || pc.Data.Data.FrequencyCap.MaxPer7Days != nil {
		t.Fatal("platform campaign cap read", err)
	}
	if _, extra := pc.Data.Data.Extra["frequencyCap"]; extra {
		t.Fatal("typed frequencyCap leaked into platform extras")
	}
	mc, err := m.Campaigns().Retrieve(ctx, contractProject, "c")
	if err != nil || *mc.Data.Data.FrequencyCap.MaxPer24Hours != 2 {
		t.Fatal("messaging campaign cap read", err)
	}
	pa, err := o.Campaigns().Analytics(ctx, "c", p)
	if err != nil || pa.Data.Data.FrequencyCap == nil || pa.Data.Data.FrequencyCap.SkippedRecipientCount != 3 {
		t.Fatal("platform skipped count", err)
	}
	ma, err := m.Campaigns().Analytics(ctx, contractProject, "c")
	if err != nil || ma.Data.Data.FrequencyCap.SkippedRecipientCount != 3 {
		t.Fatal("messaging skipped count", err)
	}
	if q, err := campaignExportQuery(CampaignRecipientExportParams{Reason: cptr(string(CampaignFailureFrequencyCap))}); err != nil || q.Get("reason") != "frequency_cap" {
		t.Fatal("recipient export rejects frequency_cap", err)
	}
}

func TestAudienceSegmentsWireRevisionsPaginationAndPreviews(t *testing.T) {
	s := newRecordingServer(t, func(_ int, r recordedRequest) (int, string) {
		switch {
		case r.method == "GET" && r.path == "/platform/audience-segments":
			next := `"next"`
			if strings.Contains(r.query, "cursor=next") {
				next = "null"
			}
			return 200, `{"data":[` + segmentJSON + `],"page":{"hasMore":` + map[bool]string{true: "true", false: "false"}[next != "null"] + `,"nextCursor":` + next + `}}`
		case strings.HasSuffix(r.path, "/preview") && r.method == "GET":
			return 200, `{"data":` + strings.TrimSuffix(previewJSON, "}") + `,"revision":2}}`
		case strings.HasSuffix(r.path, "/preview"):
			return 200, `{"data":` + previewJSON + `}`
		case r.method == "DELETE":
			return 200, `{"data":{"deleted":true,"id":"` + contractID + `"}}`
		}
		return 200, `{"data":` + segmentJSON + `}`
	})
	ctx := context.Background()
	segments := retryingOrg(t, s.URL).AudienceSegments()
	page, err := segments.List(ctx, ListAudienceSegmentsParams{ListParams: ListParams{Limit: 10}})
	if err != nil || len(page.Items) != 1 || page.NextCursor != "next" {
		t.Fatal("segment list", err)
	}
	second, err := page.NextPage(ctx)
	if err != nil || second == nil || second.HasMore() {
		t.Fatal("segment next page", err)
	}
	got, err := segments.Retrieve(ctx, "s/1")
	if err != nil || got.Data.Data.Revision != 2 || len(got.Data.Data.Rules.Groups[0].Conditions) != 3 {
		t.Fatal("segment retrieve", err)
	}
	if c, ok := got.Data.Data.Rules.Groups[0].Conditions[1].(AudienceSegmentAttributeCompare); !ok || c.Name != "spend" || c.Value != 100 || c.Operator != AudienceSegmentGreaterThan {
		t.Fatalf("discriminated condition decode: %#v", got.Data.Data.Rules.Groups[0].Conditions[1])
	}
	if _, err = segments.Create(ctx, CreateAudienceSegmentRequest{Name: "VIP", Rules: segmentRules}); err != nil {
		t.Fatal(err)
	}
	if _, err = segments.Update(ctx, "s", UpdateAudienceSegmentRequest{ExpectedRevision: 1, Rules: &segmentRules}); err != nil {
		t.Fatal(err)
	}
	saved, err := segments.Preview(ctx, "s")
	if err != nil || saved.Data.Data.Revision != 2 || saved.Data.Data.EligibleCount != 2 || saved.Data.Data.Sample[0].Phone != "+49*******12" {
		t.Fatal("saved preview", err)
	}
	adHoc, err := segments.PreviewRules(ctx, segmentRules)
	if err != nil || adHoc.Data.Data.MatchedCount != 4 || adHoc.Data.Data.ConsentWithheldCount != 1 {
		t.Fatal("ad hoc preview", err)
	}
	deleted, err := segments.Delete(ctx, "s", 2)
	if err != nil || !deleted.Data.Data.Deleted || deleted.Data.Data.ID != contractID {
		t.Fatal("segment delete", err)
	}
	want := []struct{ method, path, query, body string }{
		{"GET", "/platform/audience-segments", "limit=10", ""},
		{"GET", "/platform/audience-segments", "cursor=next&limit=10", ""},
		{"GET", "/platform/audience-segments/s%2F1", "", ""},
		{"POST", "/platform/audience-segments", "", `{"name":"VIP","rules":` + segmentRulesJSON + `}`},
		{"PATCH", "/platform/audience-segments/s", "", `{"expectedRevision":1,"rules":` + segmentRulesJSON + `}`},
		{"GET", "/platform/audience-segments/s/preview", "", ""},
		{"POST", "/platform/audience-segments/preview", "", `{"rules":` + segmentRulesJSON + `}`},
		{"DELETE", "/platform/audience-segments/s", "expectedRevision=2", ""},
	}
	all := s.all()
	if len(all) != len(want) {
		t.Fatalf("requests: %d", len(all))
	}
	for i, w := range want {
		r := all[i]
		if r.method != w.method || r.rawPath != w.path || r.query != w.query {
			t.Fatalf("request %d: %s %s?%s", i, r.method, r.rawPath, r.query)
		}
		if w.body == "" && r.body != "" {
			t.Fatalf("request %d sent a body", i)
		}
		if w.body != "" {
			jsonEqual(t, w.path, r.body, w.body)
		}
	}
}

func TestAudienceSegmentRetryRulesAndErrors(t *testing.T) {
	ctx := context.Background()
	for _, tc := range []struct {
		status int
		code   string
		kind   ErrorKind
	}{{403, "feature_unavailable", AuthorizationError}, {403, "permission_denied", AuthorizationError}, {409, "state_conflict", ConflictError}, {503, "unavailable", ServerError}} {
		s := newRecordingServer(t, func(int, recordedRequest) (int, string) {
			return tc.status, `{"error":{"code":"` + tc.code + `","message":"Unavailable, deleted segment or evaluation timeout"}}`
		})
		segments := retryingOrg(t, s.URL).AudienceSegments()
		name := "new"
		calls := []func() error{
			func() error {
				_, e := segments.Update(ctx, "s", UpdateAudienceSegmentRequest{ExpectedRevision: 2, Name: &name})
				return e
			},
			func() error {
				_, e := segments.Create(ctx, CreateAudienceSegmentRequest{Name: "n", Rules: segmentRules})
				return e
			},
			func() error { _, e := segments.Delete(ctx, "s", 2); return e },
			func() error { _, e := segments.Preview(ctx, "s"); return e },
			func() error { _, e := segments.PreviewRules(ctx, segmentRules); return e },
		}
		for i, call := range calls {
			before := len(s.all())
			var e *Error
			if err := call(); !errors.As(err, &e) || e.Kind != tc.kind || e.Code != tc.code || e.Status != tc.status {
				t.Fatalf("%d/%d: %#v", tc.status, i, err)
			}
			if n := len(s.all()) - before; n != 1 {
				t.Fatalf("%d/%s call %d sent %d requests", tc.status, tc.code, i, n)
			}
		}
	}
	// Ordinary reads keep the client's retry policy.
	s := newRecordingServer(t, func(i int, _ recordedRequest) (int, string) {
		if i < 2 {
			return 503, `{"error":{"code":"unavailable","message":"retry"}}`
		}
		return 200, `{"data":` + segmentJSON + `}`
	})
	if _, err := retryingOrg(t, s.URL).AudienceSegments().Retrieve(ctx, "s"); err != nil || len(s.all()) != 3 {
		t.Fatal("segment read retry policy changed", err, len(s.all()))
	}
}

func TestAudienceSegmentConditionsRoundTripAndRejectMalformedValues(t *testing.T) {
	negate := true
	rules := AudienceSegmentRules{Match: AudienceSegmentMatchAny, Groups: []AudienceSegmentGroup{{Match: AudienceSegmentMatchAll, Negate: &negate, Conditions: []AudienceSegmentCondition{
		AudienceSegmentTagIn{Values: []string{"a", "b"}},
		AudienceSegmentTagExists{},
		AudienceSegmentAttributeEquals{Name: "flag", Value: false},
		AudienceSegmentAttributeEquals{Name: "zero", Value: 0},
		AudienceSegmentAttributeText{Name: "city", Operator: AudienceSegmentContains, Value: "São"},
		AudienceSegmentAttributeText{Name: "since", Operator: AudienceSegmentBefore, Value: "2026-01-01"},
		AudienceSegmentAttributeIn{Name: "tier", Values: []any{"gold", 2}},
		AudienceSegmentAttributeCompare{Name: "spend", Operator: AudienceSegmentLessThan, Value: 1.5},
		AudienceSegmentAttributeExists{Name: "email"},
		AudienceSegmentConsentEquals{Value: false},
		AudienceSegmentCampaignOutcome{CampaignID: contractID, Outcome: "not_replied"},
	}}}}
	b, err := json.Marshal(rules)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"match":"any","groups":[{"match":"all","negate":true,"conditions":[{"field":"tag","operator":"in","values":["a","b"]},{"field":"tag","operator":"exists"},{"field":"attribute","name":"flag","operator":"equals","value":false},{"field":"attribute","name":"zero","operator":"equals","value":0},{"field":"attribute","name":"city","operator":"contains","value":"São"},{"field":"attribute","name":"since","operator":"before","value":"2026-01-01"},{"field":"attribute","name":"tier","operator":"in","values":["gold",2]},{"field":"attribute","name":"spend","operator":"less_than","value":1.5},{"field":"attribute","name":"email","operator":"exists"},{"field":"consent","operator":"equals","value":false},{"field":"campaign","campaignId":"` + contractID + `","outcome":"not_replied"}]}]}`
	jsonEqual(t, "condition variants", string(b), want)
	var decoded AudienceSegmentRules
	if err = json.Unmarshal([]byte(want), &decoded); err != nil {
		t.Fatal(err)
	}
	again, _ := json.Marshal(decoded)
	jsonEqual(t, "condition round trip", string(again), want)
	future := `{"match":"all","groups":[{"match":"all","conditions":[{"field":"future","operator":"magic","value":1}]}]}`
	if err = json.Unmarshal([]byte(future), &decoded); err != nil {
		t.Fatal("future condition rejected", err)
	}
	if _, ok := decoded.Groups[0].Conditions[0].(AudienceSegmentUnknownCondition); !ok {
		t.Fatal("future condition not preserved")
	}
	again, _ = json.Marshal(decoded)
	jsonEqual(t, "future condition round trip", string(again), future)

	s := newRecordingServer(t, func(int, recordedRequest) (int, string) { return 200, `{}` })
	segments := retryingOrg(t, s.URL).AudienceSegments()
	for _, bad := range []AudienceSegmentCondition{
		AudienceSegmentAttributeEquals{Name: "x", Value: []int{1}},
		AudienceSegmentAttributeEquals{Name: "x", Value: nil},
		AudienceSegmentAttributeIn{Name: "x", Values: []any{true}},
		AudienceSegmentUnknownCondition{Raw: json.RawMessage(`{"field":"future"}`)},
		nil,
	} {
		bad := AudienceSegmentRules{Match: AudienceSegmentMatchAll, Groups: []AudienceSegmentGroup{{Match: AudienceSegmentMatchAll, Conditions: []AudienceSegmentCondition{bad}}}}
		var e *Error
		if _, err := segments.PreviewRules(context.Background(), bad); !errors.As(err, &e) || e.Kind != ConfigurationError {
			t.Fatalf("malformed condition accepted: %v", err)
		}
	}
	for _, id := range []string{"", " "} {
		if _, err := segments.Retrieve(context.Background(), id); err == nil {
			t.Fatal("blank segment id retargeted the collection")
		}
	}
	if len(s.all()) != 0 {
		t.Fatal("malformed segment input reached the network")
	}
}

func TestDripPartialPatchEnrollmentAndStoredReads(t *testing.T) {
	s := newRecordingServer(t, func(_ int, r recordedRequest) (int, string) {
		if strings.HasSuffix(r.path, "/enrollments") {
			return 200, `{"success":true,"data":{"campaignId":"` + contractID + `","recipientId":"` + contractProject + `","phone":"+5511999990000","created":false,"status":"skipped","enrolledAt":1800000000000}}`
		}
		return 200, `{"success":true,"data":{"id":"c","drip":{"enrollment":"audience","exitOnReply":false,"exitOnLinkClick":true},"enrollmentOpen":false,"pauseReason":null,"segmentId":null,"segmentSnapshot":{"revision":3,"evaluatedAt":1,"matchedCount":4}}}`
	})
	ctx := context.Background()
	o, m := retryingOrg(t, s.URL), retryingMessaging(t, s.URL)
	p := PlatformCampaignParams{ProjectID: contractProject}
	audience := CampaignDripPatch{Enrollment: CampaignDripAudience}
	thirtyDays, hi, later := 2592000, "hi", "later"
	days := CampaignDelayDays
	window := CampaignStepWindow{Days: []string{"monday"}, Hours: []CampaignSendWindowRange{{Start: "09:00", End: "17:00"}}}
	steps := []CampaignComposedMessage{{Source: &hi}, {Source: &later, DelayAfterSec: &thirtyDays, DelayUnit: &days, SendWindow: &Nullable[CampaignStepWindow]{Value: &window}}}
	if _, err := o.Campaigns().Create(ctx, CreatePlatformCampaignRequest{ProjectID: contractProject, Name: "VIP drip", SegmentID: "s", Drip: &Nullable[CampaignDripInput]{Value: &CampaignDripInput{Enrollment: CampaignDripContinuous}}, MessagesArray: &steps}); err != nil {
		t.Fatal(err)
	}
	if _, err := o.Campaigns().Update(ctx, "c", &UpdatePlatformCampaignRequest{UpdateCampaignRequest: UpdateCampaignRequest{Drip: &Nullable[CampaignDripPatch]{Value: &audience}}}, p); err != nil {
		t.Fatal(err)
	}
	if _, err := m.Campaigns().Update(ctx, contractProject, "c", UpdateCampaignRequest{Drip: &Nullable[CampaignDripPatch]{Value: &audience}}); err != nil {
		t.Fatal("drip alone is a valid messaging PATCH", err)
	}
	if _, err := o.Campaigns().Update(ctx, "c", &UpdatePlatformCampaignRequest{SegmentID: &Nullable[string]{}, UpdateCampaignRequest: UpdateCampaignRequest{Drip: &Nullable[CampaignDripPatch]{}}}, p); err != nil {
		t.Fatal(err)
	}
	enrolled, err := o.Campaigns().Enroll(ctx, "c/1", EnrollPlatformCampaignContactRequest{ProjectID: contractProject, EnrollCampaignContactRequest: EnrollCampaignContactRequest{Phone: "+5511999990000"}})
	if err != nil || enrolled.Data.Data.Created || enrolled.Data.Data.EnrolledAt != 1800000000000 || enrolled.Data.Data.RecipientID != contractProject {
		t.Fatal("platform enrollment", err)
	}
	menrolled, err := m.Campaigns().Enroll(ctx, contractProject, "c", EnrollCampaignContactRequest{Phone: "+5511999990000", Variables: map[string]CampaignVariable{"vip": {Bool: cptr(true)}}})
	if err != nil || menrolled.Data.Data.Status != "skipped" {
		t.Fatal("messaging enrollment", err)
	}
	all := s.all()
	jsonEqual(t, "drip create", all[0].body, `{"projectId":"`+contractProject+`","name":"VIP drip","segmentId":"s","drip":{"enrollment":"continuous"},"messagesArray":[{"source":"hi"},{"source":"later","delayAfterSec":2592000,"delayUnit":"days","sendWindow":{"days":["monday"],"hours":[{"start":"09:00","end":"17:00"}]}}]}`)
	jsonEqual(t, "platform drip patch", all[1].body, `{"drip":{"enrollment":"audience"}}`)
	jsonEqual(t, "messaging drip patch", all[2].body, `{"drip":{"enrollment":"audience"}}`)
	jsonEqual(t, "null drip and segment", all[3].body, `{"drip":null,"segmentId":null}`)
	jsonEqual(t, "platform enroll", all[4].body, `{"projectId":"`+contractProject+`","phone":"+5511999990000"}`)
	jsonEqual(t, "messaging enroll", all[5].body, `{"phone":"+5511999990000","variables":{"vip":true}}`)
	if all[4].method != "POST" || all[4].rawPath != "/platform/campaigns/c%2F1/enrollments" || all[4].query != "" {
		t.Fatal("platform enroll path", all[4].rawPath)
	}
	if all[5].rawPath != "/messaging/projects/"+contractProject+"/campaigns/c/enrollments" {
		t.Fatal("messaging enroll path", all[5].rawPath)
	}
	for _, i := range []int{1, 3} {
		if !strings.Contains(all[i].query, "projectId="+contractProject) {
			t.Fatal("platform PATCH project selection")
		}
	}
	campaign, err := m.Campaigns().Retrieve(ctx, contractProject, "c")
	if err != nil || campaign.Data.Data.EnrollmentOpen == nil || *campaign.Data.Data.EnrollmentOpen || campaign.Data.Data.SegmentSnapshot.Revision != 3 || campaign.Data.Data.Drip.ExitOnLinkClick != true || campaign.Data.Data.PauseReason != nil || campaign.Data.Data.SegmentID != nil {
		t.Fatal("messaging stored drip read", err)
	}
	pc, err := o.Campaigns().Retrieve(ctx, "c", p)
	if err != nil || pc.Data.Data.Drip.Enrollment != CampaignDripAudience || pc.Data.Data.SegmentSnapshot.MatchedCount != 4 {
		t.Fatal("platform stored drip read", err)
	}
	for _, key := range []string{"drip", "enrollmentOpen", "pauseReason", "segmentId", "segmentSnapshot"} {
		if _, ok := pc.Data.Data.Extra[key]; ok {
			t.Fatal("typed drip field in platform extras", key)
		}
	}
}

func TestDripEnrollmentIsNeverReplayedAndRequiresProjectContext(t *testing.T) {
	s := newRecordingServer(t, func(int, recordedRequest) (int, string) {
		return 503, `{"error":{"code":"unavailable","message":"ambiguous"}}`
	})
	ctx := context.Background()
	o, m := retryingOrg(t, s.URL), retryingMessaging(t, s.URL)
	body := EnrollCampaignContactRequest{Phone: "+5511999990000"}
	if _, err := o.Campaigns().Enroll(ctx, "c", EnrollPlatformCampaignContactRequest{ProjectID: contractProject, EnrollCampaignContactRequest: body}); err == nil {
		t.Fatal("ambiguous enrollment succeeded")
	}
	if _, err := m.Campaigns().Enroll(ctx, contractProject, "c", body, RequestOptions{IdempotencyKey: "caller-key"}); err == nil {
		t.Fatal("ambiguous enrollment succeeded")
	}
	all := s.all()
	if len(all) != 2 || all[1].header.Get("Idempotency-Key") != "caller-key" || all[0].header.Get("Idempotency-Key") != "" {
		t.Fatalf("enrollment write replayed or caller key changed: %d", len(all))
	}
	for _, bad := range []EnrollPlatformCampaignContactRequest{{EnrollCampaignContactRequest: body}, {ProjectID: "not-a-uuid", EnrollCampaignContactRequest: body}} {
		var e *Error
		if _, err := o.Campaigns().Enroll(ctx, "c", bad); !errors.As(err, &e) || e.Kind != ConfigurationError {
			t.Fatal("platform enrollment accepted a missing project", err)
		}
	}
	if len(s.all()) != 2 {
		t.Fatal("invalid enrollment reached the network")
	}
}

func TestDripStepBoundsAndPerStepAnalytics(t *testing.T) {
	s := newRecordingServer(t, func(_ int, r recordedRequest) (int, string) {
		if strings.HasSuffix(r.path, "/analytics") {
			return 200, `{"success":true,"data":{"campaignId":"c","followUps":{},"drip":{"enrollment":"continuous","enrolled":3,"enrolledByApi":1,"active":1,"completed":1,"exited":1,"steps":[{"step":0,"entered":3,"waiting":1,"sent":2,"delivered":2,"read":1,"replied":1,"exited":1,"failed":0}]}}}`
		}
		if strings.HasSuffix(r.path, "/recipients") {
			return 200, `{"success":true,"data":[{"messagesSent":1,"nextMessageAt":null,"sequenceError":"link_clicked"}],"page":{"hasMore":false,"nextCursor":null}}`
		}
		return 200, `{"success":true,"data":{}}`
	})
	ctx := context.Background()
	o, m := retryingOrg(t, s.URL), retryingMessaging(t, s.URL)
	p := PlatformCampaignParams{ProjectID: contractProject}
	later := "later"
	step := func(delay int) *[]CampaignComposedMessage {
		return &[]CampaignComposedMessage{{Source: &later, DelayAfterSec: &delay}}
	}
	var e *Error
	if _, err := o.Campaigns().Create(ctx, CreatePlatformCampaignRequest{ProjectID: contractProject, Name: "ordinary", MessagesArray: step(86401)}); !errors.As(err, &e) || e.Field != "delayAfterSec" {
		t.Fatal("ordinary create admitted a 30-day step", err)
	}
	if _, err := o.Campaigns().Create(ctx, CreatePlatformCampaignRequest{ProjectID: contractProject, Name: "ordinary", Drip: &Nullable[CampaignDripInput]{}, MessagesArray: step(86401)}); err == nil {
		t.Fatal("null drip create admitted a 30-day step")
	}
	if _, err := o.Campaigns().Create(ctx, CreatePlatformCampaignRequest{ProjectID: contractProject, Name: "drip", Drip: &Nullable[CampaignDripInput]{Value: &CampaignDripInput{}}, MessagesArray: step(2592000)}); err != nil {
		t.Fatal("drip create rejected a 30-day step", err)
	}
	if _, err := o.Campaigns().Update(ctx, "c", &UpdatePlatformCampaignRequest{MessagesArray: step(2592000)}, p); err != nil {
		t.Fatal("PATCH of a stored drip rejected a 30-day step", err)
	}
	if _, err := o.Campaigns().Update(ctx, "c", &UpdatePlatformCampaignRequest{MessagesArray: step(2592001)}, p); !errors.As(err, &e) || e.Field != "delayAfterSec" {
		t.Fatal("PATCH admitted a step over 30 days", err)
	}
	if len(s.all()) != 2 {
		t.Fatalf("invalid step bounds reached the network: %d", len(s.all()))
	}
	jsonEqual(t, "30-day PATCH", s.all()[1].body, `{"messagesArray":[{"source":"later","delayAfterSec":2592000}]}`)
	var decoded CreatePlatformCampaignRequest
	if err := json.Unmarshal([]byte(`{"projectId":"`+contractProject+`","name":"d","drip":{},"messagesArray":[{"delayAfterSec":2592000,"sendWindow":null}]}`), &decoded); err != nil {
		t.Fatal("decoded drip create rejected a 30-day step", err)
	}
	if steps := *decoded.MessagesArray; steps[0].SendWindow == nil || steps[0].SendWindow.Value != nil {
		t.Fatal("explicit null step sendWindow lost")
	}
	if err := json.Unmarshal([]byte(`{"projectId":"`+contractProject+`","name":"d","messagesArray":[{"delayAfterSec":86401}]}`), &decoded); err == nil {
		t.Fatal("decoded ordinary create admitted a 30-day step")
	}
	analytics, err := o.Campaigns().Analytics(ctx, "c", p)
	if err != nil || analytics.Data.Data.Drip == nil || analytics.Data.Data.Drip.EnrolledByAPI != 1 || analytics.Data.Data.Drip.Steps[0].Exited != 1 || analytics.Data.Data.Drip.Enrollment != CampaignDripContinuous {
		t.Fatal("platform drip analytics", err)
	}
	manalytics, err := m.Campaigns().Analytics(ctx, contractProject, "c")
	if err != nil || manalytics.Data.Data.Drip.Steps[0].Replied != 1 {
		t.Fatal("messaging drip analytics", err)
	}
	r, err := o.Campaigns().Recipients(ctx, "c", ListPlatformCampaignRecipientsParams{ProjectID: contractProject})
	if err != nil || *r.Data.Data[0].SequenceError != string(CampaignDripExitLinkClicked) || r.Data.Data[0].MessagesSent != 1 {
		t.Fatal("recipient sequence exit", err)
	}
}

func TestCampaignSegmentsDripContractSupplements(t *testing.T) {
	type schema struct {
		Required   []string                   `json:"required"`
		Properties map[string]json.RawMessage `json:"properties"`
		Enum       []string                   `json:"enum"`
	}
	type source struct {
		SourceSha256 string                     `json:"sourceSha256"`
		Schemas      map[string]schema          `json:"schemas"`
		Fields       map[string]json.RawMessage `json:"fields"`
		Paths        map[string]json.RawMessage `json:"paths"`
	}
	load := func(path string) (commit string, sources map[string]source) {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		var v struct {
			Commit  string            `json:"commit"`
			Sources map[string]source `json:"sources"`
		}
		if err = json.Unmarshal(raw, &v); err != nil {
			t.Fatal(err)
		}
		return v.Commit, v.Sources
	}
	keys := func(v any) []string {
		b, _ := json.Marshal(v)
		var m map[string]any
		_ = json.Unmarshal(b, &m)
		out := []string{}
		for k := range m {
			out = append(out, k)
		}
		sort.Strings(out)
		return out
	}
	props := func(s schema) []string {
		out := []string{}
		for k := range s.Properties {
			out = append(out, k)
		}
		sort.Strings(out)
		return out
	}
	commit, cap := load("../../contracts/campaign-frequency-cap.json")
	if commit != "9bb1e2ed92d8b4a07ff727f8e7ae185498f0868f" {
		t.Fatal("frequency cap source pin", commit)
	}
	one := 1
	for name, native := range map[string]any{
		"CampaignFrequencyCapSettings":    CampaignFrequencyCapSettings{},
		"UpdateCampaignFrequencyCapInput": UpdateCampaignFrequencyCapInput{CampaignFrequencyCap: CampaignFrequencyCap{MaxPer24Hours: &one}},
	} {
		if got, want := keys(native), props(cap["platform"].Schemas[name]); !reflect.DeepEqual(got, want) {
			t.Fatalf("%s fields %v want %v", name, got, want)
		}
	}
	if !reflect.DeepEqual(cap["platform"].Schemas["UpdateCampaignFrequencyCapInput"].Required, []string{"maxPer24Hours", "maxPer7Days", "revision"}) {
		t.Fatal("frequency cap PUT requirements")
	}
	reasons := cap["platform"].Schemas["CampaignRecipientFailureReason"].Enum
	for _, r := range reasons {
		if !validCampaignFailure(r) {
			t.Fatal("native reason enum rejects", r)
		}
	}
	commit, segments := load("../../contracts/campaign-segments-drip.json")
	if commit != "9bb1e2ed92d8b4a07ff727f8e7ae185498f0868f" {
		t.Fatal("segment and drip source pin", commit)
	}
	yes := true
	for name, native := range map[string]any{
		"AudienceSegment":              AudienceSegment{},
		"AudienceSegmentPreview":       AudienceSegmentPreview{},
		"CampaignDrip":                 CampaignDrip{},
		"CampaignDripInput":            CampaignDripInput{Enrollment: CampaignDripAudience, ExitOnReply: &yes, ExitOnLinkClick: &yes},
		"CampaignDripPatch":            CampaignDripPatch{Enrollment: CampaignDripAudience, ExitOnReply: &yes, ExitOnLinkClick: &yes},
		"CampaignDripStats":            CampaignDripStats{},
		"CampaignEnrollment":           CampaignEnrollment{},
		"EnrollCampaignContactRequest": EnrollPlatformCampaignContactRequest{ProjectID: "p", EnrollCampaignContactRequest: EnrollCampaignContactRequest{Variables: map[string]CampaignVariable{"a": {Bool: &yes}}}},
	} {
		if got, want := keys(native), props(segments["platform"].Schemas[name]); !reflect.DeepEqual(got, want) {
			t.Fatalf("%s fields %v want %v", name, got, want)
		}
	}
	if got, want := keys(CampaignDripStepStats{}), props(segments["messaging"].Schemas["CampaignDripStepStats"]); !reflect.DeepEqual(got, want) {
		t.Fatalf("step stats fields %v want %v", got, want)
	}
	for _, s := range []source{segments["platform"], segments["messaging"]} {
		if len(s.SourceSha256) != 64 || strings.Contains(string(s.Schemas["CampaignDripPatch"].Properties["enrollment"]), `"default"`) {
			t.Fatal("PATCH drip schema gained a default or lost its source hash")
		}
	}
	for _, field := range []string{"PlatformCampaign.drip", "PlatformCampaign.enrollmentOpen", "PlatformCampaign.pauseReason", "PlatformCampaign.segmentId", "PlatformCampaign.segmentSnapshot", "CreatePlatformCampaignRequest.segmentId", "UpdatePlatformCampaignRequest.segmentId", "CampaignMessage.delayUnit", "CampaignMessage.sendWindow"} {
		if _, ok := segments["platform"].Fields[field]; !ok {
			t.Fatal("contract field missing", field)
		}
	}
	var window struct {
		Properties struct {
			Hours struct {
				MaxItems int `json:"maxItems"`
			} `json:"hours"`
		} `json:"properties"`
	}
	_ = json.Unmarshal(segments["platform"].Fields["CampaignMessage.sendWindow"], &window)
	if window.Properties.Hours.MaxItems != 4 {
		t.Fatal("step window range limit")
	}
}
