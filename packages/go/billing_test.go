package polymorfa

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

const billingFixtureID = "12345678-1234-1234-1234-123456789abc"

var billingFixtures = []operationFixture{
	{"OrganizationClient.Billing.Retrieve", "GET", "/platform/billing", "", "", `{"data":{"balanceCents":123,"preferredCurrency":"USD"}}`, "data.preferredCurrency", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Billing().Retrieve(ctx))
	}},
	{"OrganizationClient.Billing.Usage", "GET", "/platform/billing/usage", "", "", `{"data":{"activeNumbers":2,"totalChargedCents":123}}`, "data.totalChargedCents", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Billing().Usage(ctx))
	}},
	{"OrganizationClient.Billing.ListTransactions", "GET", "/platform/billing/transactions", "", "", `{"data":[{"id":"transaction","amountCents":123,"balanceAfterCents":456,"type":"charge","description":"Number","sessionId":null,"projectId":null,"tier":null,"currency":"USD","paymentStatus":"paid","createdAt":123}]}`, "data.0.paymentStatus", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Billing().ListTransactions(ctx))
	}},
	{"OrganizationClient.Billing.ListPricing", "GET", "/platform/billing/pricing", "", "", `{"data":[{"id":"price","tier":"sandbox","dailyRateCents":0,"label":"Test","description":"Test number","features":["messaging"]}]}`, "data.0.features.0", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Billing().ListPricing(ctx))
	}},
	{"OrganizationClient.Billing.GetResourceControls", "GET", "/platform/billing/controls/project/12345678-1234-1234-1234-123456789abc", "", "", `{"data":{"budget":{"scope":"project","resourceId":"project","projectId":"project","name":"Project","limitCredits":null,"spentCredits":1.25,"reservedCredits":0.25,"revision":2},"priority":0,"priorityRevision":3}}`, "data.budget.spentCredits", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Billing().GetResourceControls(ctx, BillingProject, billingFixtureID))
	}},
	{"OrganizationClient.Billing.SetResourceControls", "PUT", "/platform/billing/controls/project/12345678-1234-1234-1234-123456789abc", "", `{"limitCredits":null,"priority":0,"expectedBudgetRevision":2,"expectedPriorityRevision":3}`, `{"data":{"budget":{"scope":"project","resourceId":"project","projectId":"project","name":"Project","limitCredits":null,"spentCredits":1.25,"reservedCredits":0.25,"revision":3},"priority":0,"priorityRevision":4}}`, "data.priorityRevision", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Billing().SetResourceControls(ctx, BillingProject, billingFixtureID, SetResourceBillingControlsRequest{ExpectedBudgetRevision: 2, ExpectedPriorityRevision: 3}))
	}},
	{"OrganizationClient.Billing.GetLimits", "GET", "/platform/billing/limits", "projectId=12345678-1234-1234-1234-123456789abc&scope=project", "", `{"data":{"checkedAt":"today","periodStart":"start","periodEnd":"end","todayCredits":1.25,"monthCredits":10.5,"daily":[{"date":"today","credits":1.25}],"budgets":[]}}`, "data.daily.0.credits", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Billing().GetLimits(ctx, BillingReadParams{ProjectID: billingFixtureID, Scope: "project"}))
	}},
	{"OrganizationClient.Billing.SetLimit", "PUT", "/platform/billing/limits/number/12345678-1234-1234-1234-123456789abc", "", `{"limitCredits":1.25,"expectedRevision":2}`, `{"data":{"saved":true}}`, "data.saved", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := 1.25
		return wireData(o.Billing().SetLimit(ctx, BillingNumber, billingFixtureID, SetBillingLimitRequest{LimitCredits: &v, ExpectedRevision: 2}))
	}},
	{"OrganizationClient.Billing.GetPriorities", "GET", "/platform/billing/priorities", "scope=project", "", `{"data":{"revision":2,"projects":[{"id":"project","name":"Project","priority":0}],"customers":[],"numbers":[]}}`, "data.projects.0.priority", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Billing().GetPriorities(ctx, BillingReadParams{Scope: "project"}))
	}},
	{"OrganizationClient.Billing.SetPriority", "PUT", "/platform/billing/priorities/customer/12345678-1234-1234-1234-123456789abc", "", `{"priority":2,"expectedRevision":3}`, `{"data":{"revision":4,"projects":[],"customers":[{"id":"customer","name":"Customer","priority":2,"projectId":"project"}],"numbers":[]}}`, "data.customers.0.projectId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Billing().SetPriority(ctx, BillingCustomer, billingFixtureID, SetBillingPriorityRequest{Priority: 2, ExpectedRevision: 3}))
	}},
	{"OrganizationClient.Billing.ReorderPriorities", "PUT", "/platform/billing/priorities", "", `{"scope":"resource","projectId":"12345678-1234-1234-1234-123456789abc","resources":[{"scope":"number","resourceId":"12345678-1234-1234-1234-123456789abc"}],"expectedRevision":2}`, `{"data":{"revision":3,"projects":[],"customers":[],"numbers":[{"id":"number","name":"Number","priority":1,"projectId":"project"}]}}`, "data.numbers.0.priority", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		rows := []BillingReorderResource{{Scope: BillingNumber, ResourceID: billingFixtureID}}
		return wireData(o.Billing().ReorderPriorities(ctx, ReorderBillingPrioritiesRequest{Scope: "resource", ProjectID: billingFixtureID, Resources: &rows, ExpectedRevision: 2}))
	}},
}

func TestBillingControlValidation(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Error("Invalid billing control reached service") }))
	defer s.Close()
	o, _ := NewOrganizationClient(orgConfig(s.URL))
	ctx := context.Background()
	v := 0.0000001
	if _, err := o.Billing().SetLimit(ctx, BillingProject, billingFixtureID, SetBillingLimitRequest{LimitCredits: &v}); err == nil {
		t.Error("Fractional precision accepted")
	}
	if _, err := o.Billing().GetResourceControls(ctx, BillingProject, "not-uuid"); err == nil {
		t.Error("Invalid resource accepted")
	}
	if _, err := o.Billing().SetPriority(ctx, BillingProject, billingFixtureID, SetBillingPriorityRequest{Priority: -1}); err == nil {
		t.Error("Negative priority accepted")
	}
	ids := []string{billingFixtureID, billingFixtureID}
	if _, err := o.Billing().ReorderPriorities(ctx, ReorderBillingPrioritiesRequest{Scope: "project", ResourceIDs: &ids}); err == nil {
		t.Error("Duplicate resources accepted")
	}
}
