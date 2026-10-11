package polymorfa

import "context"

var accountFixtures = []operationFixture{
	{"OrganizationClient.Organizations.Retrieve", "GET", "/platform/team", "", "", `{"data":{"id":"team","name":"Team","creditBalanceCents":12,"plan":"free","isActive":true}}`, "data.creditBalanceCents", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Organizations().Retrieve(ctx))
	}},
	{"OrganizationClient.Members.List", "GET", "/platform/members", "", "", `{"data":[{"_id":"member","orgId":"team","userId":"u","email":"u@example.com","role":"owner","status":"active","name":null,"invitedAt":null,"joinedAt":42}]}`, "data.0.role", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Members().List(ctx))
	}},
	{"OrganizationClient.APIKeys.List", "GET", "/platform/keys", "", "", `{"data":[{"id":"k","keyId":"key","scopes":3,"isActive":false,"expiresAt":null}]}`, "data.0.scopes", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.APIKeys().List(ctx))
	}},
	{"OrganizationClient.APIKeys.Deactivate", "DELETE", "/platform/keys/k", "", "", `{"data":{"ok":true,"keyId":"k"}}`, "data.ok", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.APIKeys().Deactivate(ctx, "k"))
	}},
	{"OrganizationClient.ProjectTokens.List", "GET", "/platform/tokens", "projectId=p", "", `{"data":[{"id":"token","start":"pmfa_pt_","last4":"abcd","label":null,"scopes":2,"createdAt":42,"lastUsedAt":null,"revokedAt":null}]}`, "data.0.last4", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.ProjectTokens().List(ctx, "p"))
	}},
	{"OrganizationClient.CallRetention.Retrieve", "GET", "/platform/call-retention", "", "", `{"data":{"policy":"extended","retentionDays":90,"appliesTo":["call_records"],"revision":0,"updatedAt":null}}`, "retentionDays", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.CallRetention().Retrieve(ctx))
	}},
	{"OrganizationClient.CallRetention.Update", "PUT", "/platform/call-retention", "", `{"policy":"custom","retentionDays":7,"expectedRevision":0}`, `{"data":{"policy":"custom","retentionDays":7,"appliesTo":["call_records"],"revision":1,"updatedAt":"today"}}`, "revision", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		days := 7
		rev := int64(0)
		return wireData(o.CallRetention().Update(ctx, UpdateCallRetentionRequest{RetentionCustom, &days, &rev}))
	}},
	{"OrganizationClient.CallPolicy.Retrieve", "GET", "/platform/call-policy", "", "", `{"data":{"blockedCountryCodes":["44"],"optOutCount":2,"revision":1,"updatedAt":"today"}}`, "optOutCount", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.CallPolicy().Retrieve(ctx))
	}},
	{"OrganizationClient.CallPolicy.Update", "PUT", "/platform/call-policy", "", `{"blockedCountryCodes":[],"expectedRevision":0}`, `{"data":{"blockedCountryCodes":[],"optOutCount":2,"revision":1,"updatedAt":"today"}}`, "revision", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		rev := int64(0)
		return wireData(o.CallPolicy().Update(ctx, UpdateCallPolicyRequest{[]string{}, &rev}))
	}},
	{"OrganizationClient.CallOptOuts.List", "GET", "/platform/call-opt-outs", "bsuid=bsuid", "", `{"data":[{"id":"x","phoneNumber":null,"bsuid":"bsuid","note":null,"source":"api","createdAt":"today"}],"page":{"nextCursor":null}}`, "0.bsuid", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v, err := o.CallOptOuts().List(ctx, ListCallOptOutsParams{BSUID: "bsuid"})
		if err != nil {
			return nil, err
		}
		return v.Items, nil
	}},
	{"OrganizationClient.CallOptOuts.Create", "POST", "/platform/call-opt-outs", "", `{"phoneNumber":"+15551234567","note":"request"}`, `{"data":{"id":"x","phoneNumber":"+15551234567","bsuid":null,"note":"request","source":"api","createdAt":"today"}}`, "note", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.CallOptOuts().Create(ctx, CreateCallOptOutRequest{PhoneNumber: "+15551234567", Note: "request"}))
	}},
	{"OrganizationClient.CallOptOuts.Import", "POST", "/platform/call-opt-outs/import", "", `{"entries":[{"bsuid":"bsuid"},{"phoneNumber":"bad"}]}`, `{"data":{"added":1,"existing":0,"rejected":[{"index":1,"reason":"invalid_phone_number"}]}}`, "rejected.0.reason", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.CallOptOuts().Import(ctx, ImportCallOptOutsRequest{[]CreateCallOptOutRequest{{BSUID: "bsuid"}, {PhoneNumber: "bad"}}}))
	}},
	{"OrganizationClient.CallOptOuts.Delete", "DELETE", "/platform/call-opt-outs/x", "", "", `{"data":{"id":"x","deleted":true}}`, "deleted", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.CallOptOuts().Delete(ctx, "x"))
	}},
}
