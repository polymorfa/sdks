package polymorfa

import "context"

var observationFixtures = []operationFixture{
	{"MessagingClient.Labels.List", "GET", "/messaging/s/labels", "includeObservation=false", "", `{"success":true,"data":[{"id":"l","name":"Lead","color":4}]}`, "data.0.color", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := false
		return wireData(m.Labels().List(ctx, "s", ListLabelsParams{&v}))
	}},
	{"MessagingClient.Labels.Create", "POST", "/messaging/s/labels", "", `{"name":"Lead","color":0}`, `{"success":true,"data":{"id":"l","name":"Lead","color":0}}`, "data.name", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := 0
		return wireData(m.Labels().Create(ctx, "s", CreateLabelRequest{"Lead", &v}))
	}},
	{"MessagingClient.Labels.Update", "PUT", "/messaging/s/labels/l", "", `{"color":3}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := 3
		return wireData(m.Labels().Update(ctx, "s", "l", UpdateLabelRequest{Color: &v}))
	}},
	{"MessagingClient.Labels.Delete", "DELETE", "/messaging/s/labels/l", "", "", `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Labels().Delete(ctx, "s", "l"))
	}},
	{"MessagingClient.Labels.ListForChat", "GET", "/messaging/s/labels/chats/c", "includeObservation=true", "", `{"success":true,"data":{"policy":"cache","status":"fresh","labels":[{"id":"l","name":"Lead","color":5}],"observedAt":"2026-10-11T00:00:00Z"}}`, "data.labels.0.color", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := true
		return wireData(m.Labels().ListForChat(ctx, "s", "c", ListLabelsParams{&v}))
	}},
	{"MessagingClient.Labels.ReplaceForChat", "PUT", "/messaging/s/labels/chats/c", "", `{"labels":[]}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Labels().ReplaceForChat(ctx, "s", "c", ReplaceChatLabelsRequest{Labels: []string{}}))
	}},
	{"MessagingClient.QuickReplies.List", "GET", "/messaging/s/business/quick-replies", "", "", `{"success":true,"data":{"policy":"cache","status":"fresh","quickReplies":[{"id":"r","shortcut":"hi","message":"Hello","associatedLabelIds":["l"],"observedAt":"today"}]}}`, "data.quickReplies.0.message", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.QuickReplies().List(ctx, "s"))
	}},
	{"MessagingClient.QuickReplies.Create", "POST", "/messaging/s/business/quick-replies", "", `{"shortcut":"hi","message":"Hello","keywords":["greet"]}`, `{"success":true,"data":{"id":"r","shortcut":"hi","message":"Hello","keywords":["greet"]}}`, "data.keywords.0", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.QuickReplies().Create(ctx, "s", QuickReplyMutation{Shortcut: "hi", Message: "Hello", Keywords: []string{"greet"}}))
	}},
	{"MessagingClient.QuickReplies.Replace", "PUT", "/messaging/s/business/quick-replies/r", "", `{"shortcut":"bye","message":"Goodbye","count":0}`, `{"success":true,"data":{"id":"r","shortcut":"bye","message":"Goodbye","count":0}}`, "data.count", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := 0
		return wireData(m.QuickReplies().Replace(ctx, "s", "r", QuickReplyMutation{Shortcut: "bye", Message: "Goodbye", Count: &v}))
	}},
	{"MessagingClient.QuickReplies.Delete", "DELETE", "/messaging/s/business/quick-replies/r", "", "", `{"success":true,"data":{"id":"r","status":"DELETED"}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.QuickReplies().Delete(ctx, "s", "r"))
	}},
	{"MessagingClient.ObservationPolicies.RetrieveForProject", "GET", "/messaging/projects/p/observation-policy", "", "", `{"success":true,"data":{"projectId":"p","presenceMode":"off","typingMode":"cache","labelMode":"live","quickReplyMode":"off"}}`, "data.typingMode", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.ObservationPolicies().RetrieveForProject(ctx, "p"))
	}},
	{"MessagingClient.ObservationPolicies.RetrieveForSession", "GET", "/messaging/s/observation-policy", "", "", `{"success":true,"data":{"sessionName":"s","projectId":"p","project":{"presenceMode":"off","typingMode":"cache","labelMode":"live"},"override":{"presenceMode":"inherit","typingMode":"inherit","labelMode":"inherit"},"effective":{"presenceMode":"off","typingMode":"cache","labelMode":"live"}}}`, "data.override.presenceMode", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.ObservationPolicies().RetrieveForSession(ctx, "s"))
	}},
	{"MessagingClient.HybridLink.GetPolicy", "GET", "/messaging/routing/hybrid", "projectId=p&scope=session&session=s", "", `{"success":true,"data":{"scope":"session","revision":"rev","prefer":null,"allowedTransports":["linked_devices","official_api"]}}`, "data.allowedTransports.0", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.HybridLink().GetPolicy(ctx, HybridScope{"session", "p", "s"}))
	}},
	{"MessagingClient.HybridLink.SetPolicy", "PUT", "/messaging/routing/hybrid", "scope=team", `{"expectedRevision":"rev","prefer":null,"allowedTransports":["linked_devices"]}`, `{"success":true,"data":{"scope":"team","revision":"rev2","prefer":null,"allowedTransports":["linked_devices"]}}`, "data.revision", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.HybridLink().SetPolicy(ctx, HybridScope{Scope: "team"}, SetHybridRoutingPolicyRequest{ExpectedRevision: "rev", AllowedTransports: []string{"linked_devices"}}))
	}},
	{"MessagingClient.HybridLink.State", "GET", "/messaging/s/hybrid-link", "", "", `{"success":true,"data":{"revision":"rev","paused":false,"connections":[{"kind":"linked_devices","status":"connected","enabled":true}]}}`, "data.connections.0.enabled", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.HybridLink().State(ctx, "s"))
	}},
	{"MessagingClient.HybridLink.SetPaused", "PUT", "/messaging/s/hybrid-link", "", `{"expectedRevision":"rev","paused":false}`, `{"success":true,"data":{"revision":"rev2","paused":false}}`, "data.paused", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.HybridLink().SetPaused(ctx, "s", SetHybridPausedRequest{"rev", false}))
	}},
}
