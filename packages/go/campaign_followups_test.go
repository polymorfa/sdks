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
	"testing"
)

func TestCampaignFollowUpNativeWrites(t *testing.T) {
	delay, expiry := 60, 86400
	minimal := CampaignFollowUp{Message: CampaignFollowUpMessage{Type: "text", Text: "Hi {{first_name}}"}}
	explicit := CampaignFollowUp{DelaySeconds: &delay, ExpirySeconds: &expiry, Message: CampaignFollowUpMessage{Type: "template", TemplateID: "template"}}
	for _, surface := range []string{"messaging", "platform"} {
		for _, action := range []string{"create", "update", "clear", "omitted"} {
			t.Run(surface+"/"+action, func(t *testing.T) {
				follow := &Nullable[CampaignFollowUp]{Value: &minimal}
				wire := `{"message":{"type":"text","text":"Hi {{first_name}}"}}`
				if action == "update" {
					follow = &Nullable[CampaignFollowUp]{Value: &explicit}
					wire = `{"delaySeconds":60,"expirySeconds":86400,"message":{"type":"template","templateId":"template"}}`
				}
				if action == "clear" {
					follow = &Nullable[CampaignFollowUp]{}
					wire = "null"
				}
				if action == "omitted" {
					follow = nil
				}
				create := action == "create" || action == "omitted"
				path := "/platform/campaigns"
				if surface == "messaging" {
					path = "/messaging/projects/project/campaigns"
				}
				if !create {
					path += "/campaign"
				}
				want := map[string]any{}
				if create {
					want["name"] = "Campaign"
					if surface == "platform" {
						want["projectId"] = "p"
					}
				}
				if follow != nil {
					var v any
					_ = json.Unmarshal([]byte(wire), &v)
					want["followUp"] = v
				}
				s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					b, _ := io.ReadAll(r.Body)
					var got map[string]any
					_ = json.Unmarshal(b, &got)
					method := "PATCH"
					if create {
						method = "POST"
					}
					if r.Method != method || r.URL.Path != path || !reflect.DeepEqual(got, want) {
						t.Errorf("wire %s %s %s", r.Method, r.URL.Path, b)
					}
					if r.Header.Get("Authorization") != "Bearer "+orgConfig("").Credential.Value || r.Header.Get("Polymorfa-Version") != APIVersion {
						t.Error("auth/version")
					}
					if !create && surface == "platform" && r.URL.Query().Get("projectId") != "p" {
						t.Error("project binding")
					}
					w.Header().Set("Content-Type", "application/json")
					io.WriteString(w, `{"data":{"id":"campaign","followUp":{"message":{"type":"text","text":"Hi {{first_name}}"}}}}`)
				}))
				defer s.Close()
				ctx := context.Background()
				if surface == "messaging" {
					m := mustMessaging(t, s.URL)
					var r Response[Envelope[Campaign]]
					var e error
					if create {
						r, e = m.Campaigns().Create(ctx, "project", CreateCampaignRequest{Name: "Campaign", FollowUp: follow})
					} else {
						r, e = m.Campaigns().Update(ctx, "project", "campaign", UpdateCampaignRequest{FollowUp: follow})
					}
					if e != nil {
						t.Fatal(e)
					}
					if r.Data.Data.FollowUp == nil || r.Data.Data.FollowUp.DelaySeconds != nil || r.Data.Data.FollowUp.ExpirySeconds != nil || r.Data.Data.FollowUp.Message.Text != minimal.Message.Text {
						t.Error("minimal response timing changed")
					}
				} else {
					o, e := NewOrganizationClient(orgConfig(s.URL))
					if e != nil {
						t.Fatal(e)
					}
					if create {
						r, e := o.Campaigns().Create(ctx, CreatePlatformCampaignRequest{ProjectID: "p", Name: "Campaign", FollowUp: follow})
						if e != nil {
							t.Fatal(e)
						}
						if r.Data.Data.FollowUp == nil || r.Data.Data.FollowUp.DelaySeconds != nil {
							t.Error("platform minimal response")
						}
						if _, ok := r.Data.Data.Extra["followUp"]; ok {
							t.Error("typed field in extras")
						}
					} else {
						_, e := o.Campaigns().Update(ctx, "campaign", &UpdatePlatformCampaignRequest{UpdateCampaignRequest: UpdateCampaignRequest{FollowUp: follow}}, PlatformCampaignParams{ProjectID: "p"})
						if e != nil {
							t.Fatal(e)
						}
					}
				}
			})
		}
	}
}

func TestCampaignFollowUpNativeReports(t *testing.T) {
	report := `{"total":12,"waiting":1,"scheduled":2,"sending":3,"sent":4,"delivered":5,"read":6,"replied":7,"cancelled":8,"expired":9,"failed":10,"unknown":11,"nextDueAt":1720000000001}`
	summary := `{"id":"followup","numberId":"sender","status":"scheduled","anchorKind":"read","firstDeliveredAt":1720000000001,"firstReadAt":1720000000002,"dueAt":1720000060002,"expiresAt":1720086400000,"sentAt":null,"deliveredAt":null,"readAt":null,"repliedAt":null,"reason":null,"commandId":null}`
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasSuffix(r.URL.Path, "/analytics") {
			io.WriteString(w, `{"data":{"sentCount":99,"followUps":`+report+`}}`)
		} else {
			io.WriteString(w, `{"data":[{"id":"recipient","followUp":`+summary+`}],"page":{"nextCursor":null,"hasMore":false}}`)
		}
	}))
	defer s.Close()
	m := mustMessaging(t, s.URL)
	o, _ := NewOrganizationClient(orgConfig(s.URL))
	ctx := context.Background()
	a, e := m.Campaigns().Analytics(ctx, "project", "campaign")
	if e != nil {
		t.Fatal(e)
	}
	b, e := o.Campaigns().Analytics(ctx, "campaign", PlatformCampaignParams{ProjectID: "p"})
	if e != nil {
		t.Fatal(e)
	}
	var expected CampaignFollowUpReport
	_ = json.Unmarshal([]byte(report), &expected)
	if a.Data.Data.FollowUps == nil || !reflect.DeepEqual(*a.Data.Data.FollowUps, expected) || !reflect.DeepEqual(b.Data.Data.FollowUps, expected) || a.Data.Data.SentCount != 99 {
		t.Fatal("follow-up counts lost or first-message counts changed")
	}
	r, e := m.Campaigns().ListRecipients(ctx, "project", "campaign", ListCampaignRecipientsParams{})
	if e != nil {
		t.Fatal(e)
	}
	p, e := o.Campaigns().Recipients(ctx, "campaign", ListPlatformCampaignRecipientsParams{ProjectID: "p"})
	if e != nil {
		t.Fatal(e)
	}
	var want CampaignFollowUpSummary
	_ = json.Unmarshal([]byte(summary), &want)
	if !reflect.DeepEqual(r.Data.Data[0].FollowUp, &want) || !reflect.DeepEqual(p.Data.Data[0].FollowUp, &want) {
		t.Fatal("nullable recipient summary changed")
	}
	for _, status := range []CampaignFollowUpStatus{CampaignFollowUpWaitingReceipt, CampaignFollowUpScheduled, CampaignFollowUpSending, CampaignFollowUpSent, CampaignFollowUpCancelled, CampaignFollowUpExpired, CampaignFollowUpFailed, CampaignFollowUpOutcomeUnknown} {
		var decoded CampaignRecipient
		b, _ := json.Marshal(CampaignRecipient{FollowUp: &CampaignFollowUpSummary{Status: status}})
		if json.Unmarshal(b, &decoded) != nil || decoded.FollowUp.Status != status {
			t.Fatal(status)
		}
	}
	for _, raw := range []string{`{}`, `{"followUp":null}`} {
		var empty Campaign
		_ = json.Unmarshal([]byte(raw), &empty)
		if empty.FollowUp != nil {
			t.Fatal("absent/null follow-up")
		}
	}
}

func TestCampaignFollowUpEnrollmentDenial(t *testing.T) {
	count := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusForbidden)
		io.WriteString(w, `{"error":{"code":"feature_unavailable","message":"Enrollment required."}}`)
	}))
	defer s.Close()
	followUp := CampaignFollowUp{Message: CampaignFollowUpMessage{Type: "text", Text: "Hi"}}
	_, err := mustMessaging(t, s.URL).Campaigns().Update(context.Background(), "project", "campaign", UpdateCampaignRequest{FollowUp: &Nullable[CampaignFollowUp]{Value: &followUp}})
	var apiError *Error
	if !errors.As(err, &apiError) || apiError.Code != "feature_unavailable" || apiError.Status != http.StatusForbidden || count != 1 {
		t.Fatalf("enrollment denial: %#v (%d requests)", err, count)
	}
}

func TestCampaignFollowUpContractSupplement(t *testing.T) {
	raw, err := os.ReadFile("../../contracts/campaign-follow-ups.json")
	if err != nil {
		t.Fatal(err)
	}
	var contract struct {
		Sources map[string]struct {
			Schemas map[string]struct {
				Properties map[string]struct {
					Enum []string `json:"enum"`
				} `json:"properties"`
			} `json:"schemas"`
		} `json:"sources"`
	}
	if err = json.Unmarshal(raw, &contract); err != nil {
		t.Fatal(err)
	}
	for name, value := range map[string]any{"CampaignFollowUpSummary": CampaignFollowUpSummary{}, "CampaignFollowUpReport": CampaignFollowUpReport{}} {
		native, _ := json.Marshal(value)
		var fields map[string]any
		_ = json.Unmarshal(native, &fields)
		got, want := []string{}, []string{}
		for key := range fields {
			got = append(got, key)
		}
		for key := range contract.Sources["platform"].Schemas[name].Properties {
			want = append(want, key)
		}
		sort.Strings(got)
		sort.Strings(want)
		if !reflect.DeepEqual(got, want) {
			t.Fatalf("%s fields: %v want %v", name, got, want)
		}
	}
	statuses := []string{string(CampaignFollowUpWaitingReceipt), string(CampaignFollowUpScheduled), string(CampaignFollowUpSending), string(CampaignFollowUpSent), string(CampaignFollowUpCancelled), string(CampaignFollowUpExpired), string(CampaignFollowUpFailed), string(CampaignFollowUpOutcomeUnknown)}
	if !reflect.DeepEqual(statuses, contract.Sources["platform"].Schemas["CampaignFollowUpSummary"].Properties["status"].Enum) {
		t.Fatal("follow-up statuses differ from merged contract")
	}
}
