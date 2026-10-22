package polymorfa

import "context"

var groupFixtures = []operationFixture{
	{"MessagingClient.Groups.List", "GET", "/messaging/s/groups", "", "", `{"success":true,"data":[{"id":"g","name":"Team","participants":[{"id":"u","isAdmin":true,"isSuperAdmin":false}]}]}`, "data.0.participants.0.isAdmin", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().List(ctx, "s"))
	}},
	{"MessagingClient.Groups.Create", "POST", "/messaging/s/groups", "", `{"name":"Team","participants":["u"]}`, `{"success":true,"data":{"id":"g","name":"Team","participants":[]}}`, "data.name", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().Create(ctx, "s", CreateGroupRequest{"Team", []string{"u"}}))
	}},
	{"MessagingClient.Groups.GetJoinInfo", "GET", "/messaging/s/groups/join-info", "code=invite", "", `{"success":true,"data":{"id":"g","subject":"Team","size":12,"participants":[]}}`, "data.size", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().GetJoinInfo(ctx, "s", "invite"))
	}},
	{"MessagingClient.Groups.Join", "POST", "/messaging/s/groups/join", "", `{"code":"invite"}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().Join(ctx, "s", "invite"))
	}},
	{"MessagingClient.Groups.Retrieve", "GET", "/messaging/s/groups/g", "", "", `{"success":true,"data":{"id":"g","name":"Team","description":"Read this","ownerId":"u","participants":[]}}`, "data.description", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().Retrieve(ctx, "s", "g"))
	}},
	{"MessagingClient.Groups.GetCapabilities", "GET", "/messaging/s/groups/g/capabilities", "", "", `{"success":true,"data":{"status":"synced","syncedAt":null,"checkedAt":null,"capabilities":[{"key":"polls.endTime","kind":"feature","unit":null,"value":false,"source":"server"}]}}`, "data.capabilities.0.value", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().GetCapabilities(ctx, "s", "g"))
	}},
	{"MessagingClient.Groups.Delete", "DELETE", "/messaging/s/groups/g", "", "", `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().Delete(ctx, "s", "g"))
	}},
	{"MessagingClient.Groups.Leave", "POST", "/messaging/s/groups/g/leave", "", "", `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().Leave(ctx, "s", "g"))
	}},
	{"MessagingClient.Groups.SetSubject", "PUT", "/messaging/s/groups/g/subject", "", `{"value":"New"}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().SetSubject(ctx, "s", "g", "New"))
	}},
	{"MessagingClient.Groups.SetDescription", "PUT", "/messaging/s/groups/g/description", "", `{"value":"Read"}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().SetDescription(ctx, "s", "g", "Read"))
	}},
	{"MessagingClient.Groups.GetInviteCode", "GET", "/messaging/s/groups/g/invite-code", "", "", `{"success":true,"data":{"code":"invite"}}`, "data.code", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().GetInviteCode(ctx, "s", "g"))
	}},
	{"MessagingClient.Groups.RevokeInviteCode", "POST", "/messaging/s/groups/g/invite-code/revoke", "", "", `{"success":true,"data":{"code":"new"}}`, "data.code", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().RevokeInviteCode(ctx, "s", "g"))
	}},
	{"MessagingClient.Groups.ListParticipants", "GET", "/messaging/s/groups/g/participants", "", "", `{"success":true,"data":[{"id":"u","phoneNumber":"+15551234567","isAdmin":false,"isSuperAdmin":false}]}`, "data.0.phoneNumber", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().ListParticipants(ctx, "s", "g"))
	}},
	{"MessagingClient.Groups.AddParticipants", "POST", "/messaging/s/groups/g/participants/add", "", `{"participants":["u"]}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().AddParticipants(ctx, "s", "g", GroupParticipantsRequest{[]string{"u"}}))
	}},
	{"MessagingClient.Groups.RemoveParticipants", "POST", "/messaging/s/groups/g/participants/remove", "", `{"participants":["u"]}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().RemoveParticipants(ctx, "s", "g", GroupParticipantsRequest{[]string{"u"}}))
	}},
	{"MessagingClient.Groups.PromoteParticipants", "POST", "/messaging/s/groups/g/admin/promote", "", `{"participants":["u"]}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().PromoteParticipants(ctx, "s", "g", GroupParticipantsRequest{[]string{"u"}}))
	}},
	{"MessagingClient.Groups.DemoteParticipants", "POST", "/messaging/s/groups/g/admin/demote", "", `{"participants":["u"]}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().DemoteParticipants(ctx, "s", "g", GroupParticipantsRequest{[]string{"u"}}))
	}},
	{"MessagingClient.Groups.SetPicture", "PUT", "/messaging/s/groups/g/picture", "", `{"url":"https://example.com/picture"}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().SetPicture(ctx, "s", "g", PictureRequest{URL: "https://example.com/picture"}))
	}},
	{"MessagingClient.Groups.SetInfoEditing", "PUT", "/messaging/s/groups/g/settings/info-edit", "", `{"adminsOnly":false}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().SetInfoEditing(ctx, "s", "g", false))
	}},
	{"MessagingClient.Groups.SetMessaging", "PUT", "/messaging/s/groups/g/settings/messages", "", `{"adminsOnly":true}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().SetMessaging(ctx, "s", "g", true))
	}},
	{"MessagingClient.Groups.SetMemberAddMode", "PUT", "/messaging/s/groups/g/settings/member-add", "", `{"mode":"admin_add"}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().SetMemberAddMode(ctx, "s", "g", "admin_add"))
	}},
	{"MessagingClient.Groups.SetJoinApproval", "PUT", "/messaging/s/groups/g/settings/join-approval", "", `{"required":false}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Groups().SetJoinApproval(ctx, "s", "g", false))
	}},
}
