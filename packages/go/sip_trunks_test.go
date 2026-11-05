package polymorfa

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

var sipFixtures = []operationFixture{
	{"OrganizationClient.SIPTrunks.List", "GET", "/platform/sip-trunks", "projectId=p", "", `{"data":[{"id":"t","projectId":"p","name":"PBX","enabled":true,"direction":"outbound","outbound":{"targetUri":"sip:pbx.example","transport":"tls","authUsername":null,"hasPassword":false,"fromUser":null},"inbound":null,"codecs":["opus"],"maxConcurrentCalls":2,"revision":1,"createdAt":"today","updatedAt":"today"}]}`, "0.outbound.transport", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.SIPTrunks().List(ctx, "p"))
	}},
	{"ProjectClient.SIPTrunks.List", "GET", "/platform/sip-trunks", "projectId=p", "", `{"data":[{"id":"t","projectId":"p","name":"PBX","enabled":true,"direction":"outbound","outbound":null,"inbound":null,"codecs":["opus"],"maxConcurrentCalls":2,"revision":1}]}`, "0.projectId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.SIPTrunks().List(ctx))
	}},
	{"OrganizationClient.SIPTrunks.Create", "POST", "/platform/sip-trunks", "", `{"name":"PBX","direction":"inbound","inbound":{"session":null,"allowedAddresses":[]},"projectId":"p"}`, `{"data":{"trunk":{"id":"t","projectId":"p","name":"PBX","enabled":true,"direction":"inbound","outbound":null,"inbound":{"username":"user","realm":"realm","session":null,"allowedAddresses":[],"allowedDestinations":[]},"codecs":["opus"],"maxConcurrentCalls":2,"revision":1},"inboundCredentials":{"username":"user","password":"fixture-password","realm":"realm"}}}`, "inboundCredentials.password", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.SIPTrunks().Create(ctx, "p", CreateSIPTrunkRequest{Name: "PBX", Direction: "inbound", Inbound: &SIPInboundInput{Session: &Nullable[string]{}, AllowedAddresses: []string{}}}))
	}},
	{"ProjectClient.SIPTrunks.Create", "POST", "/platform/sip-trunks", "", `{"name":"PBX","enabled":false,"direction":"outbound","outbound":{"targetUri":"sip:pbx.example","transport":"tls"},"projectId":"p"}`, `{"data":{"trunk":{"id":"t","projectId":"p","name":"PBX","enabled":false,"direction":"outbound","outbound":{"targetUri":"sip:pbx.example","transport":"tls","authUsername":null,"hasPassword":false,"fromUser":null},"inbound":null,"codecs":["opus"],"maxConcurrentCalls":2,"revision":1}}}`, "trunk.enabled", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := false
		return wireData(p.SIPTrunks().Create(ctx, CreateSIPTrunkRequest{Name: "PBX", Enabled: &v, Direction: "outbound", Outbound: &SIPOutboundInput{TargetURI: "sip:pbx.example", Transport: "tls"}}))
	}},
	{"OrganizationClient.SIPTrunks.Retrieve", "GET", "/platform/sip-trunks/t", "", "", `{"data":{"id":"t","projectId":"p","name":"PBX","enabled":true,"direction":"inbound","outbound":null,"inbound":{"username":"user","realm":"realm","session":null,"allowedAddresses":[],"allowedDestinations":[]},"codecs":["opus"],"maxConcurrentCalls":2,"revision":1}}`, "inbound.username", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.SIPTrunks().Retrieve(ctx, "t"))
	}},
	{"OrganizationClient.SIPTrunks.Update", "PATCH", "/platform/sip-trunks/t", "", `{"expectedRevision":1,"enabled":false,"outbound":{"authUsername":null,"fromUser":null}}`, `{"data":{"id":"t","projectId":"p","name":"PBX","enabled":false,"direction":"outbound","outbound":{"targetUri":"sip:pbx.example","transport":"tls","authUsername":null,"hasPassword":false,"fromUser":null},"inbound":null,"codecs":["opus"],"maxConcurrentCalls":2,"revision":2}}`, "revision", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := false
		revision := int64(1)
		return wireData(o.SIPTrunks().Update(ctx, "t", UpdateSIPTrunkRequest{ExpectedRevision: &revision, Enabled: &v, Outbound: &SIPOutboundPatch{AuthUsername: &Nullable[string]{}, FromUser: &Nullable[string]{}}}))
	}},
	{"OrganizationClient.SIPTrunks.Delete", "DELETE", "/platform/sip-trunks/t", "", "", `{"data":{"id":"t","deleted":true}}`, "deleted", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.SIPTrunks().Delete(ctx, "t"))
	}},
	{"OrganizationClient.SIPTrunks.RotateCredentials", "POST", "/platform/sip-trunks/t/credentials", "", "", `{"data":{"username":"user","password":"fixture-password","realm":"realm"}}`, "password", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.SIPTrunks().RotateCredentials(ctx, "t"))
	}},
	{"OrganizationClient.SIPTrunks.Endpoint", "GET", "/platform/sip/endpoint", "", "", `{"data":{"status":"hosted","host":"sip.example","transports":[{"transport":"tls","port":5061,"srtp":"required"}],"rtp":{"protocol":"udp","portMin":10000,"portMax":20000}}}`, "transports.0.srtp", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.SIPTrunks().Endpoint(ctx))
	}},
}

func TestSIPProjectConfinement(t *testing.T) {
	for _, mismatch := range []bool{false, true} {
		t.Run(map[bool]string{false: "owned", true: "foreign"}[mismatch], func(t *testing.T) {
			requests := []string{}
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests = append(requests, r.Method)
				w.Header().Set("Content-Type", "application/json")
				if r.Method == "GET" {
					if r.Header.Get("Idempotency-Key") != "" {
						t.Error("write identity on ownership read")
					}
					id := "p"
					if mismatch {
						id = "other"
					}
					io.WriteString(w, `{"data":{"id":"t","projectId":"`+id+`","revision":1}}`)
					return
				}
				if r.Method != "PATCH" || r.Header.Get("Idempotency-Key") != "stable" {
					t.Error("mutation", r.Method, r.Header)
				}
				io.WriteString(w, `{"data":{"id":"t","projectId":"p","revision":2}}`)
			}))
			defer s.Close()
			org, _ := NewOrganizationClient(orgConfig(s.URL))
			project, _ := org.Project("p")
			v := false
			_, err := project.SIPTrunks().Update(context.Background(), "t", UpdateSIPTrunkRequest{Enabled: &v}, RequestOptions{IdempotencyKey: "stable"})
			if mismatch {
				e, ok := err.(*Error)
				if !ok || e.Kind != NotFoundError || strings.Join(requests, ",") != "GET" {
					t.Fatal(err, requests)
				}
			} else if err != nil || strings.Join(requests, ",") != "GET,PATCH" {
				t.Fatal(err, requests)
			}
		})
	}
	credentials := SIPTrunkCredentials{Password: "fixture-password"}
	if strings.Contains(credentials.String(), credentials.Password) {
		t.Fatal("credentials formatting")
	}
}
