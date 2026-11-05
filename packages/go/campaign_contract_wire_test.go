package polymorfa

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"reflect"
	"strings"
	"testing"
)

const contractProject = "11111111-1111-4111-8111-111111111111"
const contractID = "22222222-2222-4222-8222-222222222222"
const contractCustomer = "33333333-3333-4333-8333-333333333333"

func cptr[T any](v T) *T { return &v }
func contractGraph() CreateCampaignReplyFlowRequest {
	return CreateCampaignReplyFlowRequest{Name: "Reply", Definition: CampaignReplyFlowDefinition{EntryNodeID: "entry", Nodes: []CampaignReplyFlowNode{{ID: "entry", Edges: []CampaignReplyFlowEdge{{Match: CampaignReplyKeyword{Value: "yes"}, To: "done"}}}, {ID: "done", Send: CampaignReplyText{Text: "Hello"}, Edges: []CampaignReplyFlowEdge{}}}}}
}
func contractProfile() PutAudienceProfileRequest {
	return PutAudienceProfileRequest{Tags: []string{}, Attributes: map[string]AudienceProfileAttribute{}, Consent: &AudienceProfileConsentInput{AudienceProfileProvenance: AudienceProfileProvenance{Source: AudienceProfileAPI, Reference: "form"}, Purpose: "campaigns", Allowed: false, AssertedAt: 0}}
}
func contractImport() CreateAudienceProfileImportRequest {
	return CreateAudienceProfileImportRequest{ReplayKey: "original:1", CSVBase64: base64.StdEncoding.EncodeToString([]byte("phone,tags,attributes\n+15551234567,[],{}\n"))}
}

const profileJSON = `{"id":"` + contractID + `","phone":"+15551234567","revision":1,"tags":[],"attributes":{"none":null,"flag":false,"number":0},"provenance":null,"createdAt":0,"updatedAt":0}`
const importJSON = `{"id":"` + contractID + `","state":"queued","totalValid":1,"invalidCount":0,"invalidSamples":[],"conflictSamples":[],"processedValid":0,"createdCount":0,"updatedCount":0,"conflictCount":0,"createdAt":0,"updatedAt":0,"completedAt":null}`
const custodyJSON = `{"signalModeDefault":null,"effectiveSignalMode":"standard","revision":0}`
const sendJSON = `{"id":"` + contractID + `","campaignId":"` + contractID + `","status":"sent","from":{"sessionId":"` + contractID + `","phone":"+15551234567"},"to":"+15551234567","messageId":null,"variables":{},"createdAt":0}`
const assignmentJSON = `{"campaignId":"` + contractID + `","replyFlowId":null}`
const linksJSON = `[{"key":"a","url":"https://example.com/","uniqueOpens":0,"totalOpens":1}]`
const approvalJSON = `[{"id":"` + contractID + `","campaignId":"` + contractID + `","action":"launch","status":"pending","reasons":["agent_request"],"recipientCount":0,"scheduledAt":null,"requestedBy":{"type":"api_key","id":"issuer"},"requestedAt":0,"expiresAt":1,"decidedBy":null,"decidedAt":null,"operationId":null}]`
const confirmationJSON = `{"teamId":"` + contractProject + `","enabled":false,"locale":null,"revision":0,"textRevision":1,"acknowledgement":null,"updatedAt":null}`
const retargetJSON = `{"id":"` + contractID + `","name":"Retarget","source":"campaign","recipientCount":0,"fileId":null,"columns":null,"sampleRow":null,"mapping":null,"createdAt":0,"updatedAt":0,"sourceCampaignId":"` + contractID + `","outcome":"read","matchedCount":0,"optedOutCount":0}`

func flowJSON() string {
	b, _ := json.Marshal(contractGraph().Definition)
	return `{"id":"` + contractID + `","flowKey":"` + contractID + `","revision":1,"name":"Reply","definition":` + string(b) + `,"createdAt":0}`
}

type contractWireRow struct{ id, method, path, query, model string }

func contractRows() []contractWireRow {
	return []contractWireRow{
		{"getCampaignReplyFlow", "GET", "/messaging/projects/slug/campaign-reply-flows/" + contractID, "", flowJSON()},
		{"getProjectCampaignLinks", "GET", "/messaging/projects/slug/campaigns/" + contractID + "/links", "", linksJSON},
		{"exportProjectCampaignRecipients", "GET", "/messaging/projects/slug/campaigns/" + contractID + "/recipients/export", "", "csv"},
		{"createCampaignReplyFlow", "POST", "/messaging/projects/slug/campaign-reply-flows", "", flowJSON()},
		{"testSendCampaign", "POST", "/messaging/projects/slug/campaigns/" + contractID + "/test-send", "", sendJSON},
		{"setCampaignReplyFlow", "PUT", "/messaging/projects/slug/campaigns/" + contractID + "/reply-flow", "", assignmentJSON},
		{"cancelAudienceProfileImport", "DELETE", "/platform/audience-profile-imports/" + contractID, "", importJSON},
		{"deleteAudienceProfile", "DELETE", "/platform/audience-profiles/%2B15551234567", "expectedRevision=1", `{"deleted":true,"phone":"+15551234567","revision":2}`},
		{"getAudienceProfileImport", "GET", "/platform/audience-profile-imports/" + contractID, "", importJSON},
		{"listAudienceProfiles", "GET", "/platform/audience-profiles", "", "page:" + profileJSON},
		{"getAudienceProfile", "GET", "/platform/audience-profiles/%2B15551234567", "", profileJSON},
		{"listAudienceProfileConsent", "GET", "/platform/audience-profiles/%2B15551234567/consent", "", "page:" + `{"source":"api","reference":"form","purpose":"campaigns","allowed":false,"assertedAt":0,"id":"` + contractID + `","profileRevision":1,"createdAt":0}`},
		{"getPlatformCampaignReplyFlow", "GET", "/platform/campaign-reply-flows/" + contractID, "projectId=" + contractProject, flowJSON()},
		{"getCampaignSettings", "GET", "/platform/campaign-settings", "", `{"launchApproval":{"recipientThreshold":null}}`},
		{"listCampaignLaunchApprovals", "GET", "/platform/campaigns/" + contractID + "/approvals", "projectId=" + contractProject, approvalJSON},
		{"getCampaignLinks", "GET", "/platform/campaigns/" + contractID + "/links", "projectId=" + contractProject, linksJSON},
		{"exportCampaignRecipients", "GET", "/platform/campaigns/" + contractID + "/recipients/export", "projectId=" + contractProject, "csv"},
		{"getStopConfirmationSettings", "GET", "/platform/optouts/confirmation-settings", "", confirmationJSON},
		{"getStopConfirmationSummary", "GET", "/platform/optouts/confirmation-summary", "", `{"enabled":false,"counts":{"queued":0,"admitted":0,"completed":0,"failed":0,"unknown":0}}`},
		{"getCustomerSignalCustody", "GET", "/platform/projects/" + contractProject + "/customers/" + contractCustomer + "/signal-custody", "", custodyJSON},
		{"getProjectSignalCustody", "GET", "/platform/projects/" + contractProject + "/signal-custody", "", custodyJSON},
		{"createAudienceProfileImport", "POST", "/platform/audience-profile-imports", "", importJSON},
		{"createAudienceFromCampaign", "POST", "/platform/audiences/from-campaign", "", retargetJSON},
		{"createPlatformCampaignReplyFlow", "POST", "/platform/campaign-reply-flows", "", flowJSON()},
		{"testSendPlatformCampaign", "POST", "/platform/campaigns/" + contractID + "/test-send", "", sendJSON},
		{"putAudienceProfile", "PUT", "/platform/audience-profiles/%2B15551234567", "", profileJSON},
		{"setPlatformCampaignReplyFlow", "PUT", "/platform/campaigns/" + contractID + "/reply-flow", "", assignmentJSON},
		{"updateStopConfirmationSettings", "PUT", "/platform/optouts/confirmation-settings", "", confirmationJSON},
		{"updateCustomerSignalCustody", "PUT", "/platform/projects/" + contractProject + "/customers/" + contractCustomer + "/signal-custody", "", custodyJSON},
		{"updateProjectSignalCustody", "PUT", "/platform/projects/" + contractProject + "/signal-custody", "", custodyJSON},
	}
}
func callContract(ctx context.Context, id string, m *MessagingClient, c *OrganizationClient, p *ProjectClient, bound bool, o RequestOptions) (any, error) {
	test := CampaignTestSendRequest{SessionID: contractID, To: "+15551234567", Variables: cptr(map[string]CampaignVariable{})}
	selection := CampaignProjectParams{contractProject}
	switch id {
	case "getCampaignReplyFlow":
		return wireData(m.Campaigns().GetReplyFlow(ctx, "slug", contractID, o))
	case "getProjectCampaignLinks":
		return wireData(m.Campaigns().Links(ctx, "slug", contractID, o))
	case "exportProjectCampaignRecipients":
		return wireData(m.Campaigns().ExportRecipients(ctx, "slug", contractID, CampaignRecipientExportParams{}, o))
	case "createCampaignReplyFlow":
		return wireData(m.Campaigns().CreateReplyFlow(ctx, "slug", contractGraph(), o))
	case "testSendCampaign":
		return wireData(m.Campaigns().TestSend(ctx, "slug", contractID, test, o))
	case "setCampaignReplyFlow":
		return wireData(m.Campaigns().SetReplyFlow(ctx, "slug", contractID, SetCampaignReplyFlowRequest{}, o))
	case "cancelAudienceProfileImport":
		return wireData(c.AudienceProfiles().Imports().Cancel(ctx, contractID, o))
	case "deleteAudienceProfile":
		return wireData(c.AudienceProfiles().Delete(ctx, "+15551234567", 1, o))
	case "getAudienceProfileImport":
		return wireData(c.AudienceProfiles().Imports().Retrieve(ctx, contractID, o))
	case "listAudienceProfiles":
		return wireData(c.AudienceProfiles().List(ctx, ListAudienceProfilesParams{}, o))
	case "getAudienceProfile":
		return wireData(c.AudienceProfiles().Retrieve(ctx, "+15551234567", o))
	case "listAudienceProfileConsent":
		return wireData(c.AudienceProfiles().ListConsent(ctx, "+15551234567", ListAudienceProfilesParams{}, o))
	case "getPlatformCampaignReplyFlow":
		if bound {
			return wireData(p.Campaigns().GetReplyFlow(ctx, contractID, o))
		}
		return wireData(c.Campaigns().GetReplyFlow(ctx, contractID, selection, o))
	case "getCampaignSettings":
		return wireData(c.Campaigns().GetSettings(ctx, o))
	case "listCampaignLaunchApprovals":
		if bound {
			return wireData(p.Campaigns().ListLaunchApprovals(ctx, contractID, o))
		}
		return wireData(c.Campaigns().ListLaunchApprovals(ctx, contractID, selection, o))
	case "getCampaignLinks":
		if bound {
			return wireData(p.Campaigns().Links(ctx, contractID, o))
		}
		return wireData(c.Campaigns().Links(ctx, contractID, selection, o))
	case "exportCampaignRecipients":
		if bound {
			return wireData(p.Campaigns().ExportRecipients(ctx, contractID, CampaignRecipientExportParams{}, o))
		}
		return wireData(c.Campaigns().ExportRecipients(ctx, contractID, PlatformCampaignRecipientExportParams{ProjectID: contractProject}, o))
	case "getStopConfirmationSettings":
		return wireData(c.OptOuts().GetConfirmationSettings(ctx, o))
	case "getStopConfirmationSummary":
		return wireData(c.OptOuts().GetConfirmationSummary(ctx, o))
	case "getCustomerSignalCustody":
		if bound {
			return wireData(p.SignalCustody().RetrieveCustomer(ctx, contractCustomer, o))
		}
		return wireData(c.Customers().GetSignalCustody(ctx, contractProject, contractCustomer, o))
	case "getProjectSignalCustody":
		if bound {
			return wireData(p.SignalCustody().Retrieve(ctx, o))
		}
		return wireData(c.Projects().GetSignalCustody(ctx, contractProject, o))
	case "createAudienceProfileImport":
		return wireData(c.AudienceProfiles().Imports().Create(ctx, contractImport(), o))
	case "createAudienceFromCampaign":
		return wireData(c.Audiences().CreateFromCampaign(ctx, CreateAudienceFromCampaignRequest{Name: "Retarget", CampaignID: contractID, Outcome: CampaignOutcomeRead}, o))
	case "createPlatformCampaignReplyFlow":
		if bound {
			return wireData(p.Campaigns().CreateReplyFlow(ctx, contractGraph(), o))
		}
		return wireData(c.Campaigns().CreateReplyFlow(ctx, CreatePlatformCampaignReplyFlowRequest{contractGraph(), contractProject}, o))
	case "testSendPlatformCampaign":
		if bound {
			return wireData(p.Campaigns().TestSend(ctx, contractID, test, o))
		}
		return wireData(c.Campaigns().TestSend(ctx, contractID, PlatformCampaignTestSendRequest{test, contractProject}, o))
	case "putAudienceProfile":
		return wireData(c.AudienceProfiles().Put(ctx, "+15551234567", contractProfile(), o))
	case "setPlatformCampaignReplyFlow":
		if bound {
			return wireData(p.Campaigns().SetReplyFlow(ctx, contractID, SetCampaignReplyFlowRequest{}, o))
		}
		return wireData(c.Campaigns().SetReplyFlow(ctx, contractID, SetPlatformCampaignReplyFlowRequest{ProjectID: contractProject}, o))
	case "updateStopConfirmationSettings":
		return wireData(c.OptOuts().UpdateConfirmationSettings(ctx, UpdateStopConfirmationSettingsRequest{TeamID: contractProject}, o))
	case "updateCustomerSignalCustody":
		if bound {
			return wireData(p.SignalCustody().UpdateCustomer(ctx, contractCustomer, CustomerSignalCustodyUpdate{}, o))
		}
		return wireData(c.Customers().UpdateSignalCustody(ctx, contractProject, contractCustomer, CustomerSignalCustodyUpdate{}, o))
	case "updateProjectSignalCustody":
		b := ProjectSignalCustodyUpdate{SignalModeDefault: SignalCustodyStandard}
		if bound {
			return wireData(p.SignalCustody().Update(ctx, b, o))
		}
		return wireData(c.Projects().UpdateSignalCustody(ctx, contractProject, b, o))
	}
	return nil, fmt.Errorf("unknown fixture")
}
func writeContractFixture(w http.ResponseWriter, row contractWireRow) {
	w.Header().Set("X-Request-ID", "req-30")
	w.Header().Set("X-Trace-ID", "trace-30")
	w.Header().Set("Idempotent-Replayed", "false")
	if row.model == "csv" {
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename*=UTF-8''caf%C3%A9.csv`)
		w.Header().Set("Polymorfa-Next-Cursor", "next")
		_, _ = io.WriteString(w, "phone,status\r\n'+15551234567,read\r\n")
		return
	}
	w.Header().Set("Content-Type", "application/json")
	if strings.HasPrefix(row.model, "page:") {
		_, _ = io.WriteString(w, `{"data":[`+strings.TrimPrefix(row.model, "page:")+`],"page":{"nextCursor":null,"hasMore":false}}`)
		return
	}
	prefix := `{"data":`
	if strings.HasPrefix(row.path, "/messaging/") {
		prefix = `{"success":true,"data":`
	}
	_, _ = io.WriteString(w, prefix+row.model+`}`)
}
func expectedContractBody(id string) string {
	switch id {
	case "createCampaignReplyFlow":
		return `{"name":"Reply","definition":{"entryNodeId":"entry","nodes":[{"id":"entry","edges":[{"match":{"kind":"keyword","value":"yes"},"to":"done"}]},{"id":"done","send":{"kind":"text","text":"Hello"},"edges":[]}]}}`
	case "createPlatformCampaignReplyFlow":
		return strings.TrimSuffix(expectedContractBody("createCampaignReplyFlow"), "}") + `,"projectId":"` + contractProject + `"}`
	case "testSendCampaign":
		return `{"sessionId":"` + contractID + `","to":"+15551234567","variables":{}}`
	case "testSendPlatformCampaign":
		return strings.TrimSuffix(expectedContractBody("testSendCampaign"), "}") + `,"projectId":"` + contractProject + `"}`
	case "setCampaignReplyFlow":
		return `{"replyFlowId":null}`
	case "setPlatformCampaignReplyFlow":
		return `{"replyFlowId":null,"projectId":"` + contractProject + `"}`
	case "createAudienceProfileImport":
		return `{"replayKey":"original:1","csvBase64":"cGhvbmUsdGFncyxhdHRyaWJ1dGVzCisxNTU1MTIzNDU2NyxbXSx7fQo="}`
	case "createAudienceFromCampaign":
		return `{"name":"Retarget","campaignId":"` + contractID + `","outcome":"read"}`
	case "putAudienceProfile":
		return `{"tags":[],"attributes":{},"consent":{"source":"api","reference":"form","purpose":"campaigns","allowed":false,"assertedAt":0}}`
	case "updateStopConfirmationSettings":
		return `{"teamId":"` + contractProject + `","enabled":false,"locale":null,"revision":0}`
	case "updateCustomerSignalCustody":
		return `{"expectedRevision":0,"signalModeDefault":null}`
	case "updateProjectSignalCustody":
		return `{"expectedRevision":0,"signalModeDefault":"standard"}`
	}
	return ""
}

func TestCampaignContractThirtyWire(t *testing.T) {
	rows := contractRows()
	if len(rows) != 30 {
		t.Fatal(len(rows))
	}
	source, err := os.ReadFile("../../contracts/campaign-custody-20261014.json")
	if err != nil {
		t.Fatal(err)
	}
	var supplement struct {
		Commit    string `json:"commit"`
		Published bool   `json:"published"`
		Sources   map[string]struct {
			Paths map[string]map[string]struct {
				ID string `json:"operationId"`
			} `json:"paths"`
		} `json:"sources"`
	}
	if err = json.Unmarshal(source, &supplement); err != nil {
		t.Fatal(err)
	}
	ids := map[string]bool{}
	for _, s := range supplement.Sources {
		for _, methods := range s.Paths {
			for _, op := range methods {
				ids[op.ID] = true
			}
		}
	}
	if len(ids) != 30 || supplement.Published || supplement.Commit != "f97ad78b172e80788c33bdc0fcf28f75db9283ec" {
		t.Fatal("supplement pin changed")
	}
	for _, row := range rows {
		if !ids[row.id] {
			t.Fatal(row.id)
		}
		t.Run(row.id, func(t *testing.T) {
			for _, override := range []string{"", "2026-10-15"} {
				expectedVersion := override
				if override == "" {
					expectedVersion = campaignContractVersion
				}
				calls := 0
				s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					calls++
					if r.Method != row.method || r.URL.EscapedPath() != row.path || r.URL.RawQuery != row.query {
						t.Errorf("wire %s %s?%s", r.Method, r.URL.EscapedPath(), r.URL.RawQuery)
					}
					if r.Header.Get("Polymorfa-Version") != expectedVersion || r.Header.Get("Authorization") != "Bearer "+orgConfig("").Credential.Value {
						t.Errorf("authority/version")
					}
					body, _ := io.ReadAll(r.Body)
					expectedBody := expectedContractBody(row.id)
					if expectedBody != "" {
						var got, want any
						if json.Unmarshal(body, &got) != nil || json.Unmarshal([]byte(expectedBody), &want) != nil || !reflect.DeepEqual(got, want) {
							t.Errorf("body differs from contract: %s", body)
						}
						if r.Header.Get("Content-Type") != "application/json" {
							t.Error("wrong request content type")
						}
					}
					if row.model == "csv" {
						if r.Header.Get("Accept") != "text/csv" {
							t.Error("wrong CSV accept")
						}
					} else if r.Header.Get("Accept") != "application/json" {
						t.Error("wrong JSON accept")
					}
					if row.method != "GET" && row.method != "DELETE" && !strings.HasPrefix(row.id, "testSend") && r.Header.Get("Idempotency-Key") != "" {
						t.Error("invented write replay identity")
					}

					if row.method == "GET" || row.method == "DELETE" {
						if len(body) != 0 {
							t.Errorf("unexpected body %s", body)
						}
					} else {
						var b map[string]json.RawMessage
						if json.Unmarshal(body, &b) != nil {
							t.Errorf("invalid body")
						}
						if strings.Contains(row.id, "Platform") || row.id == "setPlatformCampaignReplyFlow" {
							if string(b["projectId"]) != `"`+contractProject+`"` {
								t.Error("missing body project")
							}
						}
						if row.id == "updateCustomerSignalCustody" {
							if string(b["signalModeDefault"]) != "null" || string(b["expectedRevision"]) != "0" {
								t.Error("null/zero lost")
							}
						}
						if row.id == "updateStopConfirmationSettings" {
							if string(b["enabled"]) != "false" || string(b["locale"]) != "null" || string(b["revision"]) != "0" {
								t.Error("false/null/zero lost")
							}
						}
						if strings.Contains(row.id, "testSend") {
							if string(b["variables"]) != "{}" || r.Header.Get("Idempotency-Key") == "" {
								t.Error("empty variables/key lost")
							}
						}
					}
					writeContractFixture(w, row)
				}))
				m := mustMessaging(t, s.URL)
				c, e := NewOrganizationClient(orgConfig(s.URL))
				if e != nil {
					t.Fatal(e)
				}
				p, e := c.Project(contractProject)
				if e != nil {
					t.Fatal(e)
				}
				data, e := callContract(context.Background(), row.id, m, c, p, false, RequestOptions{APIVersion: override})
				s.Close()
				if e != nil {
					t.Fatal(e)
				}
				if calls != 1 {
					t.Fatal(calls)
				}
				if row.model == "csv" {
					v := data.(CampaignRecipientExportPage)
					if v.Filename == nil || *v.Filename != "café.csv" || v.NextCursor == nil || !strings.Contains(v.CSV, "\r\n") {
						t.Fatal(v)
					}
				} else {
					encoded, marshalErr := json.Marshal(data)
					if marshalErr != nil {
						t.Fatal(marshalErr)
					}
					var actual map[string]json.RawMessage
					if json.Unmarshal(encoded, &actual) != nil {
						t.Fatal("invalid decoded model")
					}
					var got, want any
					if strings.HasPrefix(row.model, "page:") {
						json.Unmarshal(encoded, &got)
						json.Unmarshal([]byte(`{"data":[`+strings.TrimPrefix(row.model, "page:")+`],"page":{"nextCursor":null,"hasMore":false}}`), &want)
					} else {
						json.Unmarshal(actual["data"], &got)
						json.Unmarshal([]byte(row.model), &want)
					}
					if !reflect.DeepEqual(got, want) {
						t.Fatalf("decoded model mismatch: %s", encoded)
					}
				}
			}
		})
	}
}
