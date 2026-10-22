package polymorfa

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

var supplementFixtures = []operationFixture{
	{"MessagingClient.CloudCatalogs.List", "GET", "/graph/whatsapp/v26.0/waba/product_catalogs", "after=c&limit=2", "", `{"data":[{"id":"catalog","name":"Catalog"}],"paging":{"cursors":{"after":"next"}}}`, "paging.cursors.after", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.CloudCatalogs().List(ctx, "waba", ListCloudCatalogsParams{Version: "v26.0", Limit: 2, After: "c"}))
	}},
	{"MessagingClient.CloudCatalogs.ListProducts", "GET", "/graph/whatsapp/v26.0/waba/product_catalogs/42/products", "limit=2", "", `{"data":[{"id":"product","retailer_id":"sku","availability":"in stock"}]}`, "data.0.retailer_id", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.CloudCatalogs().ListProducts(ctx, "waba", "42", ListCloudCatalogProductsParams{Version: "v26.0", Limit: 2}))
	}},
	{"MessagingClient.CloudMarketing.Status", "GET", "/graph/whatsapp/v26.0/waba/marketing_messages/status", "", "", `{"id":"waba","marketing_messages_lite_api_status":"future_status"}`, "marketing_messages_lite_api_status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.CloudMarketing().Status(ctx, "waba", CloudGraphVersion{Version: "v26.0"}))
	}},
	{"MessagingClient.FlowEncryption.Retrieve", "GET", "/graph/whatsapp/v26.0/phone/whatsapp_business_encryption", "", "", `{"data":[{"business_public_key":"public-key","business_public_key_signature_status":"VALID"}]}`, "data.0.business_public_key_signature_status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.FlowEncryption().Retrieve(ctx, "phone", CloudGraphVersion{Version: "v26.0"}))
	}},
	{"MessagingClient.FlowEncryption.Register", "POST", "/graph/whatsapp/v26.0/phone/whatsapp_business_encryption", "", `{"business_public_key":"public-key"}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.FlowEncryption().Register(ctx, "phone", RegisterFlowEncryptionKeyRequest{BusinessPublicKey: "public-key"}, CloudGraphVersion{Version: "v26.0"}))
	}},
	{"MessagingClient.Testing.GetPhone", "GET", "/messaging/testing/project/numbers/support/phone", "", "", `{"session":"support","phone":"+15551234567","online":false,"devices":[{"deviceId":1}]}`, "devices.0.deviceId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Testing().GetPhone(ctx, "project", "support"))
	}},
	{"MessagingClient.Testing.SendPhoneMessage", "POST", "/messaging/testing/project/numbers/support/phone/messages", "", `{"to":"+15551234567","text":"Hello"}`, `{"session":"support","to":"+15551234567","messageId":null}`, "to", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Testing().SendPhoneMessage(ctx, "project", "support", SendTestingPhoneMessageRequest{To: "+15551234567", Text: "Hello"}))
	}},
	{"MessagingClient.Testing.UnlinkPhoneDevice", "POST", "/messaging/testing/project/numbers/support/phone/devices/1/unlink", "", "", `{"session":"support","deviceId":1,"unlinked":true}`, "unlinked", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Testing().UnlinkPhoneDevice(ctx, "project", "support", 1))
	}},
	{"MessagingClient.Campaigns.Update", "PATCH", "/messaging/projects/project/campaigns/campaign", "", `{"name":"New","scheduledAt":null,"sendWindow":null}`, campaignFixture, "data.name", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		name := "New"
		return wireData(m.Campaigns().Update(ctx, "project", "campaign", UpdateCampaignRequest{Name: &name, ScheduledAt: &Nullable[int64]{}, SendWindow: &Nullable[CampaignSendWindowRequest]{}}))
	}},
	{"MessagingClient.Campaigns.Reschedule", "POST", "/messaging/projects/project/campaigns/campaign/reschedule", "", `{"scheduledAt":null}`, campaignOperationFixture, "data.operationId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Campaigns().Reschedule(ctx, "project", "campaign", RescheduleCampaignRequest{}))
	}},
	{"OrganizationClient.Campaigns.Reschedule", "POST", "/platform/campaigns/campaign/reschedule", "", `{"projectId":"p","scheduledAt":42}`, `{"data":{"operationId":"op"}}`, "data.operationId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		at := int64(42)
		return wireData(o.Campaigns().Reschedule(ctx, "campaign", ReschedulePlatformCampaignRequest{ProjectID: "p", ScheduledAt: &at}))
	}},
}

func TestFlowEncryptionIsSingleAttempt(t *testing.T) {
	var count atomic.Int32
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(503)
		w.Write([]byte(`{"message":"unavailable"}`))
	}))
	defer s.Close()
	m, _ := NewMessagingClient(orgConfig(s.URL))
	retry := 2
	_, err := m.FlowEncryption().Register(context.Background(), "phone", RegisterFlowEncryptionKeyRequest{BusinessPublicKey: "key"}, CloudGraphVersion{Version: "v26.0"}, RequestOptions{MaxNetworkRetries: &retry, IdempotencyKey: "key"})
	if err == nil || count.Load() != 1 {
		t.Fatal("provider key write retried", count.Load(), err)
	}
}
