package polymorfa

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

const flowDraftFixture = `{"data":{"id":"flow","name":"Flow","status":"draft","version":"1","screenCount":1,"metaLinks":[],"createdAt":123,"updatedAt":123,"definition":{"version":"1","screens":[]}}}`
const flowProviderFixture = `{"data":{"operation":{"id":"op","requestId":"request","flowId":"flow","flowName":"Flow","sessionId":"s","session":"s","action":"upload","state":"uncertain","resolution":null,"wabaId":null,"metaFlowId":null,"definitionDigest":null,"providerStatus":null,"errorCode":"timeout","providerCode":null,"providerSubcode":null,"createdAt":123,"updatedAt":123,"completedAt":null},"flow":{"id":"flow","name":"Flow","status":"draft","version":"1","screenCount":1,"metaLinks":[],"createdAt":123,"updatedAt":123,"definition":{"version":"1","screens":[]}}}}`

var flowFixtures = []operationFixture{
	{"ProjectClient.Flows.List", "GET", "/platform/flows", "projectId=p", "", `{"data":[{"id":"flow","name":"Flow","status":"draft","version":"1","screenCount":1,"metaLinks":[],"createdAt":123,"updatedAt":123}]}`, "0.screenCount", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Flows().List(ctx))
	}},
	{"ProjectClient.Flows.Create", "POST", "/platform/flows", "", `{"projectId":"p","name":"Flow","definition":{"version":"1","screens":[]}}`, flowDraftFixture, "definition.version", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Flows().Create(ctx, CreateFlowRequest{Name: "Flow", Definition: map[string]json.RawMessage{"version": json.RawMessage(`"1"`), "screens": json.RawMessage(`[]`)}}))
	}},
	{"ProjectClient.Flows.Retrieve", "GET", "/platform/flows/12345678-1234-1234-1234-123456789abc", "projectId=p", "", flowDraftFixture, "status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Flows().Retrieve(ctx, billingFixtureID))
	}},
	{"ProjectClient.Flows.Update", "PATCH", "/platform/flows/flow", "", `{"projectId":"p","expectedUpdatedAt":123,"name":"Updated"}`, flowDraftFixture, "updatedAt", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := "Updated"
		return wireData(p.Flows().Update(ctx, "flow", UpdateFlowRequest{ExpectedUpdatedAt: 123, Name: &v}))
	}},
	{"ProjectClient.Flows.Delete", "DELETE", "/platform/flows/flow", "projectId=p", "", `{"data":{"ok":true}}`, "ok", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Flows().Delete(ctx, "flow"))
	}},
	{"ProjectClient.Flows.Upload", "POST", "/platform/flows/flow/upload", "", `{"projectId":"p","sessionId":"s","categories":["OTHER"],"requestId":"request"}`, flowProviderFixture, "operation.state", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Flows().Upload(ctx, "flow", FlowProviderRequest{SessionID: "s", Categories: []string{"OTHER"}, RequestID: "request"}))
	}},
	{"ProjectClient.Flows.Publish", "POST", "/platform/flows/flow/publish", "", `{"projectId":"p","sessionId":"s"}`, flowProviderFixture, "operation.errorCode", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Flows().Publish(ctx, "flow", FlowProviderRequest{SessionID: "s"}))
	}},
	{"ProjectClient.Flows.Deprecate", "POST", "/platform/flows/flow/deprecate", "", `{"projectId":"p","sessionId":"s"}`, flowProviderFixture, "flow.name", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Flows().Deprecate(ctx, "flow", FlowProviderRequest{SessionID: "s"}))
	}},
	{"ProjectClient.Flows.Discard", "POST", "/platform/flows/flow/discard", "", `{"projectId":"p","sessionId":"s"}`, flowProviderFixture, "flow.id", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Flows().Discard(ctx, "flow", FlowProviderRequest{SessionID: "s"}))
	}},
	{"ProjectClient.Flows.Sync", "POST", "/platform/flows/flow/sync", "", `{"projectId":"p","sessionId":"s"}`, flowProviderFixture, "operation.requestId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Flows().Sync(ctx, "flow", FlowProviderRequest{SessionID: "s"}))
	}},
	{"ProjectClient.Flows.Receipts", "GET", "/platform/flows/flow/receipts", "projectId=p", "", `{"data":[{"id":"op","requestId":null,"flowId":"flow","flowName":"Flow","sessionId":"s","session":"s","action":"upload","state":"pending","resolution":null,"wabaId":null,"metaFlowId":null,"definitionDigest":null,"providerStatus":null,"errorCode":null,"providerCode":null,"providerSubcode":null,"createdAt":123,"updatedAt":123,"completedAt":null}]}`, "0.state", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Flows().Receipts(ctx, "flow"))
	}},
	{"ProjectClient.Flows.Endpoint", "GET", "/platform/flows/flow/endpoint", "projectId=p&sessionId=s", "", `{"data":{"endpoint":null,"encryption":{"custody":"customer","activeKeyId":null,"keys":[]}}}`, "encryption.custody", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Flows().Endpoint(ctx, "flow", FlowNumberRequest{SessionID: "s"}))
	}},
	{"ProjectClient.Flows.SetEndpoint", "PUT", "/platform/flows/flow/endpoint", "", `{"projectId":"p","sessionId":"s","enabled":false,"expectedRevision":1,"mode":"function","functionId":"function","deploymentId":null}`, `{"data":{"endpoint":{"id":"endpoint","orgId":"org","projectId":"p","flowId":"flow","sessionId":"s","mode":"function","url":null,"functionId":"function","deploymentId":null,"enabled":false,"revision":2,"endpointUri":"https://endpoint.example","createdAt":123,"updatedAt":123},"encryption":{"custody":"managed","activeKeyId":"key","keys":[]}}}`, "endpoint.revision", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := false
		n := int64(1)
		return wireData(p.Flows().SetEndpoint(ctx, "flow", SetFlowEndpointRequest{SessionID: "s", Enabled: &v, ExpectedRevision: &n, Mode: "function", FunctionID: "function", DeploymentID: &Nullable[string]{}}))
	}},
	{"ProjectClient.Flows.DeleteEndpoint", "DELETE", "/platform/flows/flow/endpoint", "projectId=p&sessionId=s", "", `{"data":{"ok":true}}`, "ok", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Flows().DeleteEndpoint(ctx, "flow", FlowNumberRequest{SessionID: "s"}))
	}},
	{"ProjectClient.Flows.EndpointReceipts", "GET", "/platform/flows/flow/endpoint/receipts", "limit=2&projectId=p&sessionId=s", "", `{"data":[{"id":"receipt","flowId":"flow","endpointId":"endpoint","sessionId":"s","mode":"forward","action":"INIT","outcome":"succeeded","httpStatus":200,"errorCode":null,"keyId":"key","functionInvocationId":null,"durationMs":12.5,"createdAt":123,"completedAt":123}]}`, "0.durationMs", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Flows().EndpointReceipts(ctx, "flow", ListFlowEndpointReceiptsParams{SessionID: "s", Limit: 2}))
	}},
	{"ProjectClient.Flows.EncryptionKey", "GET", "/platform/flow-encryption-keys", "projectId=p&sessionId=s", "", `{"data":{"custody":"customer","activeKeyId":null,"keys":[]}}`, "custody", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Flows().EncryptionKey(ctx, FlowNumberRequest{SessionID: "s"}))
	}},
	{"ProjectClient.Flows.RotateEncryptionKey", "POST", "/platform/flow-encryption-keys/rotate", "", `{"projectId":"p","sessionId":"s"}`, `{"data":{"custody":"managed","activeKeyId":"key","keys":[],"key":{"id":"key","state":"active","fingerprint":"sha","publicKey":"fixture-public-key","errorCode":null,"createdAt":123,"activatedAt":123,"retireAfter":null}}}`, "key.publicKey", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Flows().RotateEncryptionKey(ctx, FlowNumberRequest{SessionID: "s"}))
	}},
}

func TestFlowWritesNeverRetry(t *testing.T) {
	count := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count++
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(503)
		io.WriteString(w, `{"error":{"message":"Down"}}`)
	}))
	defer s.Close()
	o, _ := NewOrganizationClient(orgConfig(s.URL))
	p, _ := o.Project("p")
	_, err := p.Flows().Publish(context.Background(), "flow", FlowProviderRequest{SessionID: "s"}, RequestOptions{IdempotencyKey: "stable"})
	if err == nil || count != 1 {
		t.Fatal(err, count)
	}
}

func TestFlowRetrieveNullableDraft(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"data":null}`)
	}))
	defer s.Close()
	o, _ := NewOrganizationClient(orgConfig(s.URL))
	p, _ := o.Project("p")
	r, err := p.Flows().Retrieve(context.Background(), billingFixtureID)
	if err != nil || r.Data != nil {
		t.Fatal(r, err)
	}
}
