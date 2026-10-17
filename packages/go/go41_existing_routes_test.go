package polymorfa_test

import (
	"context"
	"encoding/json"
	sdk "github.com/polymorfa/sdks/packages/go"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestGo41ThirteenCampaignRoutes(t *testing.T) {
	rows := []struct {
		name, method, path string
		call               func(context.Context, *sdk.MessagingClient, *sdk.OrganizationClient) error
	}{
		{"listCampaigns", "GET", "/messaging/projects/p%20%2Fx/campaigns", func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient) error {
			r, e := m.Campaigns().List(c, "p /x")
			if e == nil && (len(r.Data.Data) != 1 || r.Data.Data[0].TrackedLinks == nil) {
				t.Error("campaign list fields")
			}
			return e
		}},
		{"getCampaign", "GET", "/messaging/projects/p%20%2Fx/campaigns/c%20%2Fx", func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient) error {
			_, e := m.Campaigns().Retrieve(c, "p /x", "c /x")
			return e
		}},
		{"createCampaign", "POST", "/messaging/projects/p%20%2Fx/campaigns", func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient) error {
			_, e := m.Campaigns().Create(c, "p /x", sdk.CreateCampaignRequest{Name: "Draft"})
			return e
		}},
		{"updateProjectCampaign", "PATCH", "/messaging/projects/p%20%2Fx/campaigns/c%20%2Fx", func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient) error {
			_, e := m.Campaigns().Update(c, "p /x", "c /x", sdk.UpdateCampaignRequest{TrackedLinks: &sdk.Nullable[sdk.CampaignTrackedLinks]{}})
			return e
		}},
		{"launchCampaign", "POST", "/messaging/projects/p%20%2Fx/campaigns/c%20%2Fx/launch", func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient) error {
			_, e := m.Campaigns().Launch(c, "p /x", "c /x", sdk.LaunchCampaignRequest{})
			return e
		}},
		{"pauseCampaign", "POST", "/messaging/projects/p%20%2Fx/campaigns/c%20%2Fx/pause", func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient) error {
			_, e := m.Campaigns().Pause(c, "p /x", "c /x")
			return e
		}},
		{"rescheduleCampaign", "POST", "/messaging/projects/p%20%2Fx/campaigns/c%20%2Fx/reschedule", func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient) error {
			_, e := m.Campaigns().Reschedule(c, "p /x", "c /x", sdk.RescheduleCampaignRequest{})
			return e
		}},
		{"resumeCampaign", "POST", "/messaging/projects/p%20%2Fx/campaigns/c%20%2Fx/resume", func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient) error {
			_, e := m.Campaigns().Resume(c, "p /x", "c /x")
			return e
		}},
		{"stopCampaign", "POST", "/messaging/projects/p%20%2Fx/campaigns/c%20%2Fx/stop", func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient) error {
			r, e := m.Campaigns().Stop(c, "p /x", "c /x")
			if e == nil && r.Data.Data.OperationID != nil {
				t.Error("nullable operation ID")
			}
			return e
		}},
		{"listPlatformCampaigns", "GET", "/platform/campaigns", func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient) error {
			_, e := o.Campaigns().List(c, sdk.ListCampaignsParams{ProjectID: go41Project})
			return e
		}},
		{"getPlatformCampaign", "GET", "/platform/campaigns/c%20%2Fx", func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient) error {
			r, e := o.Campaigns().Retrieve(c, "c /x", sdk.PlatformCampaignParams{ProjectID: go41Project})
			if e == nil && r.Data.Data != nil {
				t.Error("nullable Platform retrieval")
			}
			return e
		}},
		{"updateCampaign", "PATCH", "/platform/campaigns/c%20%2Fx", func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient) error {
			_, e := o.Campaigns().Update(c, "c /x", &sdk.UpdatePlatformCampaignRequest{Extra: sdk.PlatformPayload{"future": json.RawMessage(`false`)}}, sdk.PlatformCampaignParams{ProjectID: go41Project})
			return e
		}},
		{"createPlatformCampaign", "POST", "/platform/campaigns", func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient) error {
			_, e := o.Campaigns().Create(c, sdk.CreatePlatformCampaignRequest{ProjectID: go41Project, Name: "Draft"})
			return e
		}},
	}
	for _, r := range rows {
		t.Run(r.name, func(t *testing.T) {
			calls := 0
			m, o := go41Client(t, func(w http.ResponseWriter, q *http.Request) {
				calls++
				if q.Method != r.method || q.URL.EscapedPath() != r.path || q.Header.Get("Polymorfa-Version") != sdk.APIVersion {
					t.Error("route/method/version")
				}
				if strings.HasPrefix(r.path, "/platform/") && r.method == "GET" && q.URL.Query().Get("projectId") != go41Project {
					t.Error("project query")
				}
				data := go41Campaign
				if r.name == "listCampaigns" || r.name == "listPlatformCampaigns" {
					data = "[" + data + "]"
				}
				if r.name == "getPlatformCampaign" {
					data = "null"
				}
				if strings.HasSuffix(r.path, "/stop") {
					data = strings.TrimSuffix(data, "}") + `,"operationId":null}`
				} else if strings.HasSuffix(r.path, "/launch") || strings.HasSuffix(r.path, "/pause") || strings.HasSuffix(r.path, "/resume") || strings.HasSuffix(r.path, "/reschedule") {
					data = strings.TrimSuffix(data, "}") + `,"operationId":"op"}`
				}
				w.Header().Set("Content-Type", "application/json")
				io.WriteString(w, `{"success":true,"data":`+data+`}`)
			})
			if e := r.call(context.Background(), m, o); e != nil || calls != 1 {
				t.Fatalf("route %v", e)
			}
		})
	}
}
func TestGo41AnalyticsCompletenessRoutes(t *testing.T) {
	const metrics = `"deviceAnalytics":{"detector":"v1","measured":false,"complete":false,"observedBuckets":0,"customerMessages":null,"accountMessages":0,"customerPlatforms":[],"accountPlatforms":[],"inventory":{"listObserved":false,"listCurrent":false,"observedAt":null,"deviceCount":null,"truncated":true,"devices":[]}},"recipientActivity":{"measured":true,"complete":false,"observedBuckets":0,"droppedSignals":3,"truncated":true,"rows":[]},"conversationBreakdown":{"measured":true,"complete":false,"observedBuckets":0,"droppedConversations":2,"truncated":true,"buckets":[],"rows":[]}`
	for _, project := range []bool{false, true} {
		t.Run(map[bool]string{false: "organization", true: "project"}[project], func(t *testing.T) {
			_, o := go41Client(t, func(w http.ResponseWriter, r *http.Request) {
				want := "/platform/analytics"
				if project {
					want = "/platform/projects/" + go41Project + "/analytics"
				}
				if r.URL.Path != want {
					t.Error("analytics route")
				}
				w.Header().Set("Content-Type", "application/json")
				io.WriteString(w, `{"data":{"enabled":true,"period":{"start":0,"end":1},"requestVitals":{"requests":0,"failures":0,"errorRate":null},"summary":{`+metrics+`},"numbers":[],"series":[],"callSeries":[]}}`)
			})
			a := o.Analytics()
			if project {
				p, _ := o.Project(go41Project)
				a = p.Analytics()
			}
			r, e := a.Get(context.Background(), sdk.AnalyticsParams{})
			if e != nil {
				t.Fatal(e)
			}
			s := r.Data.Summary
			if s.DeviceAnalytics.CustomerMessages != nil || *s.DeviceAnalytics.AccountMessages != 0 || !s.DeviceAnalytics.Inventory.Truncated || s.DeviceAnalytics.Complete || s.RecipientActivity.DroppedSignals != 3 || s.ConversationBreakdown.DroppedConversations != 2 {
				t.Fatal("completeness/nulls lost")
			}
		})
	}
}
