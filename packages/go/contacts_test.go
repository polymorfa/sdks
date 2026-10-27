package polymorfa

import "context"

var contactFixtures = []operationFixture{
	{"MessagingClient.Contacts.List", "GET", "/messaging/s/contacts", "", "", `{"success":true,"data":[{"id":"u","name":"User","pushName":"Push","businessName":"Biz"}]}`, "data.0.businessName", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Contacts().List(ctx, "s"))
	}},
	{"MessagingClient.Contacts.Check", "GET", "/messaging/s/contacts/check", "phone=%2B15551234567%2C%2B15551234568", "", `{"success":true,"data":[{"id":"u","phoneNumber":"+15551234567","exists":true}]}`, "data.0.exists", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Contacts().Check(ctx, "s", []string{"+15551234567", "+15551234568"}))
	}},
	{"MessagingClient.Contacts.Blocklist", "GET", "/messaging/s/contacts/blocked", "", "", `{"success":true,"data":{"hash":"hash","contacts":[{"id":"u"}]}}`, "data.contacts.0.id", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Contacts().Blocklist(ctx, "s"))
	}},
	{"MessagingClient.Contacts.Retrieve", "GET", "/messaging/s/contacts/u", "", "", `{"success":true,"data":{"id":"u","name":"User","pushName":"Push"}}`, "data.pushName", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Contacts().Retrieve(ctx, "s", "u"))
	}},
	{"MessagingClient.Contacts.Picture", "GET", "/messaging/s/contacts/u/picture", "", "", `{"success":true,"data":{"url":"https://example.com/picture"}}`, "data.url", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Contacts().Picture(ctx, "s", "u"))
	}},
	{"MessagingClient.Contacts.Info", "GET", "/messaging/s/contacts/u/info", "", "", `{"success":true,"data":{"id":"u","status":"Available","pictureId":"pic","verifiedName":"Biz","devices":[{"id":"u","device":2}]}}`, "data.devices.0.device", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Contacts().Info(ctx, "s", "u"))
	}},
	{"MessagingClient.Contacts.Devices", "GET", "/messaging/s/contacts/u/devices", "", "", `{"success":true,"data":["u:2@s.whatsapp.net"]}`, "data.0", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Contacts().Devices(ctx, "s", "u"))
	}},
	{"MessagingClient.Contacts.BusinessProfile", "GET", "/messaging/s/contacts/u/business-profile", "", "", `{"success":true,"data":{"id":"u","address":"Street","websites":["https://example.com"],"categories":[{"id":"cat","name":"Shop"}],"hoursTimeZone":"UTC","hours":[{"dayOfWeek":"monday","mode":"open_24h","openTime":"","closeTime":""}],"options":{"option":"value"}}}`, "data.categories.0.name", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Contacts().BusinessProfile(ctx, "s", "u"))
	}},
	{"MessagingClient.Contacts.Block", "POST", "/messaging/s/contacts/u/block", "", "", `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Contacts().Block(ctx, "s", "u"))
	}},
	{"MessagingClient.Contacts.Unblock", "POST", "/messaging/s/contacts/u/unblock", "", "", `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Contacts().Unblock(ctx, "s", "u"))
	}},
	{"MessagingClient.Profile.Get", "GET", "/messaging/s/profile", "", "", `{"success":true,"data":{"name":"Name","status":"Status","profilePicUrl":"https://example.com/pic","accountType":"business"}}`, "data.accountType", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Profile().Get(ctx, "s"))
	}},
	{"MessagingClient.Profile.SetName", "PUT", "/messaging/s/profile/name", "", `{"name":"New"}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Profile().SetName(ctx, "s", "New"))
	}},
	{"MessagingClient.Profile.SetStatus", "PUT", "/messaging/s/profile/status", "", `{"status":"Available"}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Profile().SetStatus(ctx, "s", "Available"))
	}},
	{"MessagingClient.Profile.SetPicture", "PUT", "/messaging/s/profile/picture", "", `{"base64":"AQID"}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Profile().SetPicture(ctx, "s", PictureRequest{Base64: "AQID"}))
	}},
	{"MessagingClient.Profile.DeletePicture", "DELETE", "/messaging/s/profile/picture", "", "", `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Profile().DeletePicture(ctx, "s"))
	}},
	{"MessagingClient.Identities.Resolve", "GET", "/messaging/s/identities/resolve", "username=person&usernameKey=key", "", `{"success":true,"data":{"id":"u","username":"person","keyRequired":false}}`, "data.keyRequired", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Identities().Resolve(ctx, "s", IdentityParams{Username: "person", UsernameKey: "key"}))
	}},
	{"MessagingClient.Users.GetSecurityCode", "GET", "/messaging/s/users/u/security-code", "", "", `{"success":true,"data":{"id":"u","numericCode":"123456","qrCode":"AQID"}}`, "data.numericCode", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Users().GetSecurityCode(ctx, "s", "u"))
	}},
}
