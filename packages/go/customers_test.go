package polymorfa

import "context"

const customerFixtureResponse = `{"data":{"id":"customer","orgId":"org","projectId":"p","name":"Customer","externalCustomerId":null,"status":"active","isDefault":false,"archivedAt":null,"createdAt":123,"updatedAt":123}}`
const pairingFixtureResponse = `{"data":{"id":"link","orgId":"org","projectId":"p","customerId":"customer","expectedPhoneMasked":"***4567","methods":["qr"],"locale":"en","theme":"system","expiresAt":123,"status":"active","attemptCount":0,"maxAttempts":3,"pendingSessionId":null,"createdBy":null,"reservedAt":null,"openedAt":null,"connectingAt":null,"connectedAt":null,"failedAt":null,"expiredAt":null,"revokedAt":null,"lastErrorCode":null,"failedExchangeCount":0,"phoneMismatchCount":0,"createdAt":123,"updatedAt":123,"url":"https://connect.example/link"}}`

var customerFixtures = []operationFixture{
	{"OrganizationClient.Customers.Status", "GET", "/platform/projects/p/customers/status", "", "", `{"data":{"enabled":false,"enabledAt":null,"enabledBy":null,"defaultCustomer":null}}`, "data.enabled", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Customers().Status(ctx, "p"))
	}},
	{"OrganizationClient.Customers.Enable", "POST", "/platform/projects/p/customers/enable", "", "", `{"data":{"enabled":true,"enabledAt":123,"enabledBy":"user","defaultCustomer":null,"migratedNumberCount":2}}`, "data.migratedNumberCount", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Customers().Enable(ctx, "p"))
	}},
	{"OrganizationClient.Customers.List", "GET", "/platform/customers", "hasNumbers=false&isDefault=false&limit=2&needsAttention=false&projectId=p&search=Customer&status=all", "", `{"data":[{"id":"customer","orgId":"org","projectId":"p","name":"Customer","externalCustomerId":null,"status":"active","isDefault":false,"archivedAt":null,"createdAt":123,"updatedAt":123,"numberCount":2,"connectedNumberCount":1,"activePairingLinkState":null,"lastActivityAt":123,"needsAttention":false}],"page":{"nextCursor":null,"hasMore":false}}`, "data.0.connectedNumberCount", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := false
		return wireData(o.Customers().List(ctx, ListCustomersParams{ProjectID: "p", ListParams: ListParams{Limit: 2}, Search: "Customer", Status: "all", HasNumbers: &v, IsDefault: &v, NeedsAttention: &v}))
	}},
	{"OrganizationClient.Customers.Create", "POST", "/platform/customers", "", `{"projectId":"p","name":"Customer","externalCustomerId":null}`, customerFixtureResponse, "data.name", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := "Customer"
		return wireData(o.Customers().Create(ctx, CreateCustomerRequest{ProjectID: "p", Name: &Nullable[string]{Value: &v}, ExternalCustomerID: &Nullable[string]{}}))
	}},
	{"OrganizationClient.Customers.Retrieve", "GET", "/platform/customers/customer", "projectId=p", "", customerFixtureResponse, "data.id", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Customers().Retrieve(ctx, "customer", "p"))
	}},
	{"OrganizationClient.Customers.Update", "PATCH", "/platform/customers/customer", "", `{"projectId":"p","name":null}`, customerFixtureResponse, "data.updatedAt", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Customers().Update(ctx, "customer", UpdateCustomerRequest{ProjectID: "p", Name: &Nullable[string]{}}))
	}},
	{"OrganizationClient.Customers.Archive", "POST", "/platform/customers/customer/archive", "", `{"projectId":"p"}`, customerFixtureResponse, "data.projectId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Customers().Archive(ctx, "customer", CustomerProjectRequest{ProjectID: "p"}))
	}},
	{"OrganizationClient.Customers.Restore", "POST", "/platform/customers/customer/restore", "", `{"projectId":"p"}`, customerFixtureResponse, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Customers().Restore(ctx, "customer", CustomerProjectRequest{ProjectID: "p"}))
	}},
	{"OrganizationClient.Customers.ListNumbers", "GET", "/platform/customers/customer/numbers", "projectId=p", "", `{"data":[{"id":"number","customerId":"customer","sessionId":"s","name":null,"phoneMasked":"***4567","status":"connected","backend":"whatsmeow","createdAt":123}]}`, "data.0.phoneMasked", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Customers().ListNumbers(ctx, "customer", "p"))
	}},
	{"OrganizationClient.Customers.ListEvents", "GET", "/platform/customers/customer/events", "limit=2&projectId=p", "", `{"data":[{"id":"event","action":"updated","fromStatus":null,"toStatus":null,"sessionId":null,"pairingLinkId":null,"metadata":{"fields":["name"]},"occurredAt":123}]}`, "data.0.metadata.fields.0", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Customers().ListEvents(ctx, "customer", ListCustomerEventsParams{ProjectID: "p", Limit: 2}))
	}},
	{"OrganizationClient.Customers.CreatePairingLink", "POST", "/platform/customers/customer/pairing-links", "", `{"projectId":"p","expectedPhone":null,"methods":["qr"],"expiresInSeconds":60}`, pairingFixtureResponse, "data.url", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := []string{"qr"}
		n := 60
		return wireData(o.Customers().CreatePairingLink(ctx, "customer", CreateCustomerPairingLinkRequest{ProjectID: "p", ExpectedPhone: &Nullable[string]{}, Methods: &v, ExpiresInSeconds: &n}))
	}},
	{"OrganizationClient.Customers.ListPairingLinks", "GET", "/platform/customers/customer/pairing-links", "projectId=p", "", `{"data":[{"id":"link","orgId":"org","projectId":"p","customerId":"customer","expectedPhoneMasked":"***4567","methods":["qr"],"locale":"en","theme":"system","expiresAt":123,"status":"active","attemptCount":0,"maxAttempts":3,"pendingSessionId":null,"createdBy":null,"reservedAt":null,"openedAt":null,"connectingAt":null,"connectedAt":null,"failedAt":null,"expiredAt":null,"revokedAt":null,"lastErrorCode":null,"failedExchangeCount":0,"phoneMismatchCount":0,"createdAt":123,"updatedAt":123}]}`, "data.0.maxAttempts", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Customers().ListPairingLinks(ctx, "customer", "p"))
	}},
	{"OrganizationClient.Customers.RevokePairingLink", "DELETE", "/platform/customers/customer/pairing-links/link", "projectId=p", "", pairingFixtureResponse, "data.expectedPhoneMasked", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Customers().RevokePairingLink(ctx, "customer", "link", "p"))
	}},
	{"OrganizationClient.Customers.TransferNumber", "POST", "/platform/customers/customer/numbers/s/transfer", "", `{"projectId":"p","sourceCustomerId":"source","confirm":true}`, `{"data":{"id":"number","customerId":"customer","sessionId":"s","name":null,"phoneMasked":"***4567","status":"connected","backend":"whatsmeow","createdAt":123}}`, "data.customerId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Customers().TransferNumber(ctx, "customer", "s", TransferCustomerNumberRequest{ProjectID: "p", SourceCustomerID: "source", Confirm: true}))
	}},
}
