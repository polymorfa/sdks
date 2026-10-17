package polymorfa

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func TestCampaignContractValidation(t *testing.T) {
	bad := []struct {
		name  string
		check func() error
	}{
		{"invalid utf8", func() error {
			return validateReplyCreate(CreateCampaignReplyFlowRequest{Name: string([]byte{255}), Definition: contractGraph().Definition})
		}},
		{"duplicate node", func() error { v := contractGraph(); v.Definition.Nodes[1].ID = "entry"; return validateReplyCreate(v) }},
		{"nil edges", func() error { v := contractGraph(); v.Definition.Nodes[1].Edges = nil; return validateReplyCreate(v) }},
		{"typed nil message", func() error {
			v := contractGraph()
			v.Definition.Nodes[1].Send = (*CampaignReplyText)(nil)
			return validateReplyCreate(v)
		}},
		{"typed nil match", func() error {
			v := contractGraph()
			v.Definition.Nodes[0].Edges[0].Match = (*CampaignReplyChoice)(nil)
			return validateReplyCreate(v)
		}},
		{"graph control", func() error { return validateReplySend(CampaignReplyText{Text: "text\u0085"}) }},
		{"blank multiline", func() error { return validateReplySend(CampaignReplyText{Text: " \n"}) }},
		{"button bytes", func() error {
			return validateReplySend(CampaignReplyButtons{Body: "body", Buttons: []CampaignReplyButton{{ID: "a", Text: strings.Repeat("é", 11)}}})
		}},
		{"null variables", func() error {
			v := CampaignTestSendRequest{SessionID: contractID, To: "123", Variables: cptr(map[string]CampaignVariable(nil))}
			return validateTestSend(v)
		}},
		{"ambiguous scalar", func() error { return validateCampaignScalar(CampaignVariable{String: cptr("x"), Bool: cptr(false)}) }},
		{"infinite scalar", func() error { return validateCampaignScalar(CampaignVariable{Number: cptr(math.Inf(1))}) }},
		{"UTF16 units", func() error {
			return validateTestSend(CampaignTestSendRequest{SessionID: contractID, To: "123", Variables: cptr(map[string]CampaignVariable{"a": {String: cptr(strings.Repeat("🙂", 513))}})})
		}},
		{"attribute object", func() error { var v AudienceProfileAttribute; return json.Unmarshal([]byte(`{"a":true}`), &v) }},
		{"nil attributes", func() error { v := contractProfile(); v.Attributes = nil; return validateProfilePut(v) }},
		{"nil tags", func() error { v := contractProfile(); v.Tags = nil; return validateProfilePut(v) }},
		{"duplicate tag", func() error { v := contractProfile(); v.Tags = []string{"a", "a"}; return validateProfilePut(v) }},
		{"attribute string bytes", func() error {
			v := contractProfile()
			v.Attributes["large"] = AudienceProfileAttribute{&CampaignVariable{String: cptr(strings.Repeat("é", 129))}}
			return validateProfilePut(v)
		}},
		{"zero replacement revision", func() error {
			v := contractProfile()
			v.ExpectedRevision = cptr(int64(0))
			return validateProfilePut(v)
		}},
		{"unsafe revision", func() error { return validateCustody(campaignSafeInteger+1, cptr(SignalCustodyStandard), false) }},
		{"negative revision", func() error { return validateCustody(-1, cptr(SignalCustodyStandard), false) }},
		{"project null", func() error { return validateCustody(0, nil, false) }},
		{"customer invalid enum", func() error { return validateCustody(0, cptr(SignalCustodyMode("inherit")), true) }},
		{"enabled null locale", func() error {
			return validateConfirmation(UpdateStopConfirmationSettingsRequest{TeamID: contractProject, Enabled: true})
		}},
		{"confirmation max revision", func() error {
			return validateConfirmation(UpdateStopConfirmationSettingsRequest{TeamID: contractProject, Revision: 2147483647})
		}},
		{"import URL alphabet", func() error { v := contractImport(); v.CSVBase64 = "_w=="; return validateProfileImport(v) }},
		{"import padbits", func() error { v := contractImport(); v.CSVBase64 = "Zh=="; return validateProfileImport(v) }},
		{"import omitted padding", func() error { v := contractImport(); v.CSVBase64 = "Zg"; return validateProfileImport(v) }},
		{"import whitespace", func() error { v := contractImport(); v.CSVBase64 = "Zg==\n"; return validateProfileImport(v) }},
		{"import invalidUTF8", func() error {
			v := contractImport()
			v.CSVBase64 = base64.StdEncoding.EncodeToString([]byte{255})
			return validateProfileImport(v)
		}},
		{"import NUL", func() error { v := contractImport(); v.CSVBase64 = "AA=="; return validateProfileImport(v) }},
		{"mapping C1", func() error {
			v := contractImport()
			v.Mapping = &AudienceProfileImportMapping{Phone: "phone", Tags: "tags", Attributes: "attrs\u0085"}
			return validateProfileImport(v)
		}},
		{"mapping duplicate", func() error {
			v := contractImport()
			v.Mapping = &AudienceProfileImportMapping{Phone: "p", Tags: "p", Attributes: "a"}
			return validateProfileImport(v)
		}},
		{"filtered cursor", func() error {
			_, e := campaignExportQuery(CampaignRecipientExportParams{Status: cptr("read"), Cursor: cptr("next")})
			return e
		}},
		{"filtered small limit", func() error {
			_, e := campaignExportQuery(CampaignRecipientExportParams{Reason: cptr("other"), Limit: cptr(999)})
			return e
		}},
		{"explicit zero page", func() error { _, e := profilePageQuery(ListAudienceProfilesParams{Limit: cptr(0)}); return e }},
		{"profile cursor uuid", func() error { _, e := profilePageQuery(ListAudienceProfilesParams{Cursor: cptr("opaque")}); return e }},
		{"bad retarget enum", func() error {
			return validateRetarget(CreateAudienceFromCampaignRequest{Name: "x", CampaignID: contractID, Outcome: "unknown"})
		}},
	}
	for _, tc := range bad {
		t.Run(tc.name, func(t *testing.T) {
			if tc.check() == nil {
				t.Fatal("accepted invalid input")
			}
		})
	}
	if err := validateReplySend(CampaignReplyButtons{Body: "Body", Buttons: []CampaignReplyButton{{ID: "a", Text: " "}}}); err != nil {
		t.Fatalf("single line whitespace is legal: %v", err)
	}
	for _, v := range []CampaignVariable{{String: cptr("")}, {Number: cptr(0.0)}, {Bool: cptr(false)}} {
		if err := validateCampaignScalar(v); err != nil {
			t.Fatal(err)
		}
	}
	v := CampaignTestSendRequest{SessionID: contractID, To: "123", Variables: cptr(map[string]CampaignVariable{"a": {String: cptr(strings.Repeat("🙂", 512))}})}
	if err := validateTestSend(v); err != nil {
		t.Fatal(err)
	}
	for _, n := range []struct {
		v    float64
		want string
	}{{math.Copysign(0, -1), "0"}, {1e-6, "0.000001"}, {1e21, "1e+21"}, {1e-7, "1e-7"}} {
		if got := campaignScalarText(CampaignVariable{Number: &n.v}); got != n.want {
			t.Fatalf("%s != %s", got, n.want)
		}
	}
	for _, s := range []string{"<>&", "\u2028\u2029", `\u2028`, "é"} {
		n, e := campaignJSONSize(s)
		if e != nil {
			t.Fatal(e)
		}
		if n != len(s)+2 {
			if s != `\u2028` || n != len(s)+3 {
				t.Fatalf("semantic bytes %q: %d", s, n)
			}
		}
	}
}
func TestCampaignContractByteAndRevisionBounds(t *testing.T) {
	graph := contractGraph()
	graph.Definition.Nodes = []CampaignReplyFlowNode{{ID: "entry", Edges: []CampaignReplyFlowEdge{}}}
	for i := 0; i < 6; i++ {
		graph.Definition.Nodes = append(graph.Definition.Nodes, CampaignReplyFlowNode{ID: fmt.Sprintf("n%d", i), Send: CampaignReplyText{Text: strings.Repeat("x", 4096)}, Edges: []CampaignReplyFlowEdge{}})
	}
	if e := validateReplyCreate(graph); e == nil {
		t.Fatal("graph above24KiB accepted")
	}
	graph.Definition.Nodes = graph.Definition.Nodes[:6]
	if e := validateReplyCreate(graph); e != nil {
		t.Fatal(e)
	}
	if e := validateCustody(campaignSafeInteger, cptr(SignalCustodyZeroKnowledge), false); e != nil {
		t.Fatal(e)
	}
	v := contractImport()
	v.CSVBase64 = base64.StdEncoding.EncodeToString([]byte(strings.Repeat("x", 10*1024*1024)))
	if e := validateProfileImport(v); e != nil {
		t.Fatal(e)
	}
	v.CSVBase64 = base64.StdEncoding.EncodeToString([]byte(strings.Repeat("x", 10*1024*1024+1)))
	if e := validateProfileImport(v); e == nil {
		t.Fatal("oversized decoded CSV accepted")
	}
}

func TestCampaignContractECMAScriptTrim(t *testing.T) {
	if campaignTrimSpace("\uFEFF name \uFEFF") != "name" || campaignTrimSpace("\u0085") != "\u0085" {
		t.Fatal("trim must match JavaScript")
	}
	if e := validateRetarget(CreateAudienceFromCampaignRequest{Name: "\uFEFF", CampaignID: contractID, Outcome: CampaignOutcomeRead}); e == nil {
		t.Fatal("blank BOM name accepted")
	}
}

func TestCampaignContractSemanticProfileBudget(t *testing.T) {
	v := contractProfile()
	for i := 0; i < 20; i++ {
		v.Attributes[fmt.Sprintf("attr_%d", i)] = AudienceProfileAttribute{Value: &CampaignVariable{String: cptr(strings.Repeat("<", 256))}}
	}
	if err := validateProfilePut(v); err != nil {
		t.Fatalf("HTML escaping must not tighten semantic limit: %v", err)
	}
	for k := range v.Attributes {
		v.Attributes[k] = AudienceProfileAttribute{Value: &CampaignVariable{String: cptr(strings.Repeat("\x01", 256))}}
	}
	if err := validateProfilePut(v); err == nil {
		t.Fatal("escaped controls exceed semantic JSON budget")
	}
}

func TestCampaignContractUnionsAndRequiredModels(t *testing.T) {
	sends := []CampaignReplyFlowSend{CampaignReplyText{Text: "hi"}, CampaignReplyButtons{Body: "body", Buttons: []CampaignReplyButton{{ID: "a", Text: "A"}}}, CampaignReplyList{Body: "body", ButtonText: "Go", Rows: []CampaignReplyRow{{ID: "a", Title: "A"}}}, CampaignReplyFlowForm{Body: "body", ButtonText: "Go", FlowID: contractID, Screen: "START"}}
	for _, v := range sends {
		raw, e := json.Marshal(v)
		if e != nil {
			t.Fatal(e)
		}
		got, e := decodeReplySend(raw)
		if e != nil {
			t.Fatal(e)
		}
		again, _ := json.Marshal(got)
		if string(raw) != string(again) {
			t.Fatal(string(again))
		}
		if e = validateReplySend(got); e != nil {
			t.Fatal(e)
		}
	}
	for _, v := range []CampaignReplyFlowMatch{CampaignReplyChoice{ReplyKind: "button", ID: "a"}, CampaignReplyKeyword{Value: "yes"}, CampaignReplySubmission{}} {
		raw, _ := json.Marshal(v)
		got, e := decodeReplyMatch(raw)
		if e != nil {
			t.Fatal(e)
		}
		again, _ := json.Marshal(got)
		if string(raw) != string(again) {
			t.Fatal(string(again))
		}
	}
	for _, raw := range []string{`null`, `{}`, `{"kind":"unknown"}`, `{"kind":"buttons","body":"b","buttons":null}`, `{"kind":"flow_form","flowId":null,"body":"b","buttonText":"go","screen":"S"}`} {
		if _, e := decodeReplySend([]byte(raw)); e == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
	for _, raw := range []string{`null`, `{}`, `{"expectedRevision":0}`, `{"signalModeDefault":null,"effectiveSignalMode":"standard"}`} {
		var v SignalCustodyDefault
		if e := campaignDecode([]byte(raw), &v); e == nil {
			t.Fatalf("accepted model %s", raw)
		}
	}
	var good SignalCustodyDefault
	if e := campaignDecode([]byte(custodyJSON), &good); e != nil || good.SignalModeDefault != nil {
		t.Fatal(e)
	}
	// Nullable input value versus optional pointers: false/zero/null remain explicit.
	raw, _ := json.Marshal(CustomerSignalCustodyUpdate{})
	if string(raw) != `{"expectedRevision":0,"signalModeDefault":null}` {
		t.Fatal(string(raw))
	}
	raw, _ = json.Marshal(contractProfile())
	var obj map[string]json.RawMessage
	_ = json.Unmarshal(raw, &obj)
	if string(obj["tags"]) != "[]" || string(obj["attributes"]) != "{}" || obj["expectedRevision"] != nil {
		t.Fatal(string(raw))
	}
}
func TestCampaignContractInvalidInputsDoNotReachNetwork(t *testing.T) {
	calls := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls++ }))
	defer s.Close()
	c, _ := NewOrganizationClient(orgConfig(s.URL))
	ctx := context.Background()
	_, e := c.Projects().UpdateSignalCustody(ctx, contractProject, ProjectSignalCustodyUpdate{})
	if e == nil {
		t.Fatal("invalid mode")
	}
	_, e = c.AudienceProfiles().Put(ctx, "+15551234567", PutAudienceProfileRequest{})
	if e == nil {
		t.Fatal("nil collections")
	}
	_, e = c.Campaigns().TestSend(ctx, contractID, PlatformCampaignTestSendRequest{ProjectID: contractProject})
	if e == nil {
		t.Fatal("missing sender")
	}
	if calls != 0 {
		t.Fatal(calls)
	}
}
func TestCampaignContractPublicExposure(t *testing.T) {
	p := reflect.TypeFor[*ProjectClient]()
	for _, name := range []string{"AudienceProfiles", "OptOuts", "Audiences"} {
		if _, ok := p.MethodByName(name); ok {
			t.Fatal(name)
		}
	}
	r := reflect.TypeFor[*ProjectCampaigns]()
	if r.NumMethod() != 7 {
		t.Fatal(r.NumMethod())
	}
	for _, name := range []string{"GetSettings", "CreateFromCampaign"} {
		if _, ok := r.MethodByName(name); ok {
			t.Fatal(name)
		}
	}
	for _, v := range []any{CampaignTestSendRequest{}, CreateCampaignReplyFlowRequest{}, SetCampaignReplyFlowRequest{}, CampaignRecipientExportParams{}} {
		if _, ok := reflect.TypeOf(v).FieldByName("ProjectID"); ok {
			t.Fatal("bound input exposes project")
		}
	}
	c, e := NewProjectClient(Config{Credential: Credential{ProjectToken, "pmfa_pt_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}}, contractProject)
	if e != nil {
		t.Fatal(e)
	}
	if _, e = c.Project(contractCustomer); e == nil {
		t.Fatal("token retargeted")
	}
	var api *Error
	if !errors.As(e, &api) || api.Kind != ConfigurationError {
		t.Fatal(e)
	}
}
