package polymorfa

import (
	"context"
)

var voipFixtures = []operationFixture{
	{"MessagingClient.VoIP.Place", "POST", "/messaging/voip/calls", "", `{"to":"+15551234567","session":"s"}`, `{"success":true,"data":{"callId":"call","session":"s","video":false}}`, "data.callId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.VoIP().Place(ctx, PlaceCallRequest{To: "+15551234567", Session: "s"}))
	}},
	{"MessagingClient.VoIP.Accept", "POST", "/messaging/voip/calls/x/accept", "", `{}`, `{"success":true,"data":{"answered":true,"answeredBy":"server:default","exclusive":false}}`, "data.answeredBy", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.VoIP().Accept(ctx, "x", AcceptCallRequest{}))
	}},
	{"MessagingClient.VoIP.Reject", "POST", "/messaging/voip/calls/x/reject", "", "", `{"success":true,"message":"Rejected"}`, "message", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.VoIP().Reject(ctx, "x", RejectCallRequest{}))
	}},
	{"MessagingClient.VoIP.Leave", "POST", "/messaging/voip/calls/x/leave", "", `{"connectionId":"connection"}`, `{"success":true,"message":"Left"}`, "message", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.VoIP().Leave(ctx, "x", LeaveCallRequest{ConnectionID: "connection"}))
	}},
	{"MessagingClient.VoIP.End", "DELETE", "/messaging/voip/calls/x", "", "", `{"success":true,"message":"Ended"}`, "message", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.VoIP().End(ctx, "x"))
	}},
	{"MessagingClient.VoIP.AddParticipant", "POST", "/messaging/voip/calls/x/participants", "", `{"to":"+15551234567"}`, `{"success":true,"data":{"id":"42","state":"invited","audioMuted":false,"video":false}}`, "data.state", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.VoIP().AddParticipant(ctx, "x", AddCallParticipantRequest{To: "+15551234567"}))
	}},
	{"MessagingClient.VoIP.RingParticipant", "POST", "/messaging/voip/calls/x/participants/ring", "", `{"to":"+15551234567"}`, `{"success":true,"message":"Ringing"}`, "message", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.VoIP().RingParticipant(ctx, "x", AddCallParticipantRequest{To: "+15551234567"}))
	}},
	{"MessagingClient.VoIP.SendReaction", "POST", "/messaging/voip/calls/x/reaction", "", `{"connectionId":"connection","emoji":""}`, `{"success":true,"message":"Reaction cleared"}`, "message", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.VoIP().SendReaction(ctx, "x", CallReactionRequest{ConnectionID: "connection"}))
	}},
	{"MessagingClient.VoIP.SetHandRaised", "POST", "/messaging/voip/calls/x/hand", "", `{"connectionId":"connection","raised":false}`, `{"success":true,"message":"Hand lowered"}`, "message", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.VoIP().SetHandRaised(ctx, "x", HandRaisedRequest{ConnectionID: "connection"}))
	}},
	{"MessagingClient.VoIP.RetrieveCallSettings", "GET", "/platform/sessions/s/call-settings", "", "", `{"success":true,"data":{"callsEnabled":false,"conferenceMode":true,"inboundRoute":"clients","sipTrunkId":null,"sipClaim":true,"hostCloudApiCalls":false,"revision":3,"updatedAt":null}}`, "data.revision", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.VoIP().RetrieveCallSettings(ctx, "s"))
	}},
	{"MessagingClient.VoIP.UpdateCallSettings", "PUT", "/platform/sessions/s/call-settings", "", `{"callsEnabled":false,"sipTrunkId":null}`, `{"success":true,"data":{"callsEnabled":false,"conferenceMode":true,"inboundRoute":"clients","sipTrunkId":null,"sipClaim":true,"hostCloudApiCalls":false,"revision":4,"updatedAt":null}}`, "data.revision", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := false
		return wireData(m.VoIP().UpdateCallSettings(ctx, "s", UpdateCallSettingsRequest{CallsEnabled: &v, SIPTrunkID: &NullableString{}}))
	}},
	{"MessagingClient.VoIP.RetrieveCallPermission", "GET", "/messaging/s/call-permissions/42", "", "", `{"success":true,"data":{"status":"permanent","fresh":true,"conversation":{"id":"42"},"expiresAt":null,"source":"sync","updatedAt":null,"checkedAt":null,"actions":{"requestPermission":null,"startCall":{"allowed":true,"limits":[]}}}}`, "data.actions.startCall.allowed", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.VoIP().RetrieveCallPermission(ctx, "s", "42"))
	}},
	{"MessagingClient.VoIP.Check", "POST", "/messaging/voip/calls/check", "", `{"session":"s","to":"42"}`, `{"success":true,"data":{"allowed":false,"refusal":"calls_disabled","permission":null}}`, "data.refusal", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.VoIP().Check(ctx, CheckCallRequest{Session: "s", To: "42"}))
	}},
	{"MessagingClient.VoIP.Report", "POST", "/messaging/voip/calls/x/reports", "", `{"kind":"quality","connectionId":"connection","quality":{"reconnects":0}}`, `{"success":true,"message":"Recorded"}`, "message", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := 0
		return wireData(m.VoIP().Report(ctx, "x", CallReportRequest{Kind: "quality", ConnectionID: "connection", Quality: &CallQuality{Reconnects: &v}}))
	}},
	{"MessagingClient.VoIP.CreateCallLink", "POST", "/messaging/voip/call-links", "", `{"session":"s"}`, `{"success":true,"data":{"session":"s","token":"link","url":"https://call.whatsapp.com/video/link","video":false}}`, "data.token", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.VoIP().CreateCallLink(ctx, CreateCallLinkRequest{Session: "s"}))
	}},
	{"MessagingClient.VoIP.PreviewCallLink", "POST", "/messaging/voip/call-links/preview", "", `{"session":"s","token":"link"}`, `{"success":true,"data":{"session":"s","video":false,"creator":{"id":"42"},"approvalRequired":true,"isAdmin":false}}`, "data.approvalRequired", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.VoIP().PreviewCallLink(ctx, PreviewCallLinkRequest{CreateCallLinkRequest: CreateCallLinkRequest{Session: "s"}, Token: "link"}))
	}},
}
