package polymorfa

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

const functionProjectID = "11111111-1111-1111-1111-111111111111"
const functionID = "22222222-2222-2222-2222-222222222222"
const functionDeploymentID = "33333333-3333-3333-3333-333333333333"
const functionInvocationID = "44444444-4444-4444-4444-444444444444"
const functionSecretID = "55555555-5555-5555-5555-555555555555"

func fixtureFunctions(p *ProjectClient) *Functions {
	view, _ := p.Project(functionProjectID)
	return view.Functions()
}

var functionFixtures = []operationFixture{
	{"ProjectClient.Functions.List", "GET", "/platform/functions", "before=next&limit=2&projectId=11111111-1111-1111-1111-111111111111", "", `{"data":{"items":[{"id":"22222222-2222-2222-2222-222222222222","projectId":"11111111-1111-1111-1111-111111111111","name":"Handler","enabled":true,"revision":1,"activeDeploymentId":null,"createdAt":"today","updatedAt":"today"}],"nextCursor":null}}`, "items.0.enabled", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(fixtureFunctions(p).List(ctx, ListFunctionsParams{2, "next"}))
	}},
	{"ProjectClient.Functions.Create", "POST", "/platform/functions", "", `{"projectId":"11111111-1111-1111-1111-111111111111","functionId":"22222222-2222-2222-2222-222222222222","name":"Handler"}`, `{"data":{"id":"22222222-2222-2222-2222-222222222222","projectId":"11111111-1111-1111-1111-111111111111","name":"Handler","enabled":true,"revision":1,"activeDeploymentId":null,"createdAt":"today","updatedAt":"today"}}`, "name", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(fixtureFunctions(p).Create(ctx, CreateFunctionRequest{functionID, "Handler"}))
	}},
	{"ProjectClient.Functions.Retrieve", "GET", "/platform/functions/22222222-2222-2222-2222-222222222222", "projectId=11111111-1111-1111-1111-111111111111", "", `{"data":{"id":"22222222-2222-2222-2222-222222222222","projectId":"11111111-1111-1111-1111-111111111111","name":"Handler","enabled":true,"revision":1,"activeDeploymentId":null}}`, "revision", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(fixtureFunctions(p).Retrieve(ctx, functionID))
	}},
	{"ProjectClient.Functions.Update", "PATCH", "/platform/functions/22222222-2222-2222-2222-222222222222", "", `{"projectId":"11111111-1111-1111-1111-111111111111","expectedRevision":1,"enabled":false}`, `{"data":{"id":"22222222-2222-2222-2222-222222222222","projectId":"11111111-1111-1111-1111-111111111111","name":"Handler","enabled":false,"revision":2,"activeDeploymentId":null}}`, "enabled", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := false
		return wireData(fixtureFunctions(p).Update(ctx, functionID, UpdateFunctionRequest{ExpectedRevision: 1, Enabled: &v}))
	}},
	{"ProjectClient.Functions.Delete", "DELETE", "/platform/functions/22222222-2222-2222-2222-222222222222", "expectedRevision=2&projectId=11111111-1111-1111-1111-111111111111", "", `{"data":{"ok":true}}`, "ok", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(fixtureFunctions(p).Delete(ctx, functionID, 2))
	}},
	{"ProjectClient.Functions.Deployments.List", "GET", "/platform/functions/22222222-2222-2222-2222-222222222222/deployments", "projectId=11111111-1111-1111-1111-111111111111", "", `{"data":{"items":[{"id":"33333333-3333-3333-3333-333333333333","functionId":"22222222-2222-2222-2222-222222222222","language":"javascript","region":"US","compatibilityDate":"2026-10-11","sha256":"hash","secretVersionIds":[],"egressOrigins":[],"createdAt":"today"}],"nextCursor":null}}`, "items.0.sha256", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(fixtureFunctions(p).Deployments().List(ctx, functionID, ListFunctionsParams{}))
	}},
	{"ProjectClient.Functions.Deployments.Create", "POST", "/platform/functions/22222222-2222-2222-2222-222222222222/deployments", "", `{"projectId":"11111111-1111-1111-1111-111111111111","deploymentId":"33333333-3333-3333-3333-333333333333","source":"export default {}","language":"javascript","region":"US","compatibilityDate":"2026-10-11"}`, `{"data":{"id":"33333333-3333-3333-3333-333333333333","functionId":"22222222-2222-2222-2222-222222222222","source":"export default {}","language":"javascript","region":"US","compatibilityDate":"2026-10-11","sha256":"hash","secretVersionIds":[],"egressOrigins":[],"createdAt":"today"}}`, "source", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(fixtureFunctions(p).Deployments().Create(ctx, functionID, CreateFunctionDeploymentRequest{DeploymentID: functionDeploymentID, Source: "export default {}", Language: "javascript", Region: "US", CompatibilityDate: "2026-10-11"}))
	}},
	{"ProjectClient.Functions.Deployments.Retrieve", "GET", "/platform/functions/22222222-2222-2222-2222-222222222222/deployments/33333333-3333-3333-3333-333333333333", "projectId=11111111-1111-1111-1111-111111111111", "", `{"data":{"id":"33333333-3333-3333-3333-333333333333","functionId":"22222222-2222-2222-2222-222222222222","source":"export default {}","language":"javascript","region":"US","compatibilityDate":"2026-10-11","sha256":"hash","secretVersionIds":[],"egressOrigins":[],"createdAt":"today"}}`, "source", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(fixtureFunctions(p).Deployments().Retrieve(ctx, functionID, functionDeploymentID))
	}},
	{"ProjectClient.Functions.Deployments.Promote", "PUT", "/platform/functions/22222222-2222-2222-2222-222222222222/promotion", "", `{"projectId":"11111111-1111-1111-1111-111111111111","deploymentId":"33333333-3333-3333-3333-333333333333","expectedRevision":1}`, `{"data":{"id":"22222222-2222-2222-2222-222222222222","projectId":"11111111-1111-1111-1111-111111111111","name":"Handler","enabled":true,"revision":2,"activeDeploymentId":"33333333-3333-3333-3333-333333333333"}}`, "activeDeploymentId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(fixtureFunctions(p).Deployments().Promote(ctx, functionID, PromoteFunctionDeploymentRequest{functionDeploymentID, 1}))
	}},
	{"ProjectClient.Functions.Secrets.List", "GET", "/platform/functions/22222222-2222-2222-2222-222222222222/secrets", "projectId=11111111-1111-1111-1111-111111111111", "", `{"data":{"items":[{"id":"55555555-5555-5555-5555-555555555555","name":"TOKEN","createdAt":"today","revokedAt":null}],"nextCursor":null}}`, "items.0.name", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(fixtureFunctions(p).Secrets().List(ctx, functionID, ListFunctionsParams{}))
	}},
	{"ProjectClient.Functions.Secrets.Create", "POST", "/platform/functions/22222222-2222-2222-2222-222222222222/secrets", "", `{"projectId":"11111111-1111-1111-1111-111111111111","name":"TOKEN","value":"fixture-secret"}`, `{"data":{"id":"55555555-5555-5555-5555-555555555555","name":"TOKEN","createdAt":"today","revokedAt":null}}`, "name", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(fixtureFunctions(p).Secrets().Create(ctx, functionID, CreateFunctionSecretRequest{"TOKEN", "fixture-secret"}))
	}},
	{"ProjectClient.Functions.Secrets.Revoke", "DELETE", "/platform/functions/22222222-2222-2222-2222-222222222222/secrets/55555555-5555-5555-5555-555555555555", "projectId=11111111-1111-1111-1111-111111111111", "", `{"data":{"ok":true}}`, "ok", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(fixtureFunctions(p).Secrets().Revoke(ctx, functionID, functionSecretID))
	}},
	{"ProjectClient.Functions.Invocations.List", "GET", "/platform/functions/22222222-2222-2222-2222-222222222222/invocations", "projectId=11111111-1111-1111-1111-111111111111", "", `{"data":{"items":[{"id":"44444444-4444-4444-4444-444444444444","functionId":"22222222-2222-2222-2222-222222222222","deploymentId":"33333333-3333-3333-3333-333333333333","outcome":"unknown","trigger":"test","errorCode":"executor_lost","durationMs":null,"responseBytes":null,"attempt":1,"createdAt":"today","completedAt":null}],"nextCursor":null}}`, "items.0.errorCode", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(fixtureFunctions(p).Invocations().List(ctx, functionID, ListFunctionsParams{}))
	}},
	{"ProjectClient.Functions.Invocations.Retrieve", "GET", "/platform/functions/22222222-2222-2222-2222-222222222222/invocations/44444444-4444-4444-4444-444444444444", "projectId=11111111-1111-1111-1111-111111111111", "", `{"data":{"id":"44444444-4444-4444-4444-444444444444","functionId":"22222222-2222-2222-2222-222222222222","deploymentId":"33333333-3333-3333-3333-333333333333","outcome":"succeeded","trigger":"test","errorCode":null,"durationMs":2,"responseBytes":3,"attempt":1,"createdAt":"today","completedAt":"today"}}`, "durationMs", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(fixtureFunctions(p).Invocations().Retrieve(ctx, functionID, functionInvocationID))
	}},
	{"ProjectClient.Functions.Invocations.Create", "POST", "/platform/functions/22222222-2222-2222-2222-222222222222/invocations", "", `{"projectId":"11111111-1111-1111-1111-111111111111","request":{"method":"GET","url":"https://function.polymorfa.invalid/test","headers":{},"bodyBase64":""},"trigger":"test"}`, `{"data":{"receipt":{"id":"44444444-4444-4444-4444-444444444444","functionId":"22222222-2222-2222-2222-222222222222","deploymentId":"33333333-3333-3333-3333-333333333333","outcome":"succeeded","trigger":"test","errorCode":null,"durationMs":2,"responseBytes":3,"attempt":1,"createdAt":"today","completedAt":"today"},"response":{"status":200,"headers":{"content-type":"text/plain"},"bodyBase64":"YWJj"},"replayed":false,"responseRetained":false,"retryable":false}}`, "response.bodyBase64", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(fixtureFunctions(p).Invocations().Create(ctx, functionID, CreateFunctionInvocationRequest{Request: FunctionRequest{Method: "GET", URL: "https://function.polymorfa.invalid/test", Headers: map[string]string{}}, Trigger: "test"}, RequestOptions{IdempotencyKey: "invocation-fixture"}))
	}},
}

func TestFunctionValidationAndOneShotWrites(t *testing.T) {
	requests := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Retry-After", "0")
		w.WriteHeader(503)
		io.WriteString(w, `{"error":{"code":"unknown_outcome","message":"Unknown outcome"}}`)
	}))
	defer s.Close()
	org, _ := NewOrganizationClient(orgConfig(s.URL))
	p, _ := org.Project(functionProjectID)
	resource := p.Functions()
	ctx := context.Background()
	for _, call := range []func() error{func() error { _, err := resource.Retrieve(ctx, "UPPER-invalid"); return err }, func() error { _, err := resource.Update(ctx, functionID, UpdateFunctionRequest{}); return err }, func() error {
		_, err := resource.Invocations().Create(ctx, functionID, CreateFunctionInvocationRequest{}, RequestOptions{})
		return err
	}, func() error {
		_, err := resource.Invocations().Create(ctx, functionID, CreateFunctionInvocationRequest{}, RequestOptions{IdempotencyKey: "key with spaces"})
		return err
	}} {
		e, ok := call().(*Error)
		if !ok || e.Code != "invalid_function_input" {
			t.Fatal(e)
		}
	}
	if requests != 0 {
		t.Fatal("validation reached network")
	}
	retries := 3
	_, err := resource.Create(ctx, CreateFunctionRequest{Name: "Handler"}, RequestOptions{IdempotencyKey: "stable", MaxNetworkRetries: &retries})
	if err == nil || requests != 1 {
		t.Fatal(err, requests)
	}
}
