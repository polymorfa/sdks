package polymorfa

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

var officialGroupFixtures = []operationFixture{
	{"MessagingClient.OfficialGroups.List", "GET", "/messaging/s/official-groups", "after=a&limit=2", "", `{"success":true,"data":{"groups":[{"id":"g","subject":"Team"}],"cursors":{"after":"next"},"hasMore":true}}`, "data.cursors.after", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.OfficialGroups().List(ctx, "s", ListOfficialGroupsParams{Limit: 2, After: "a"}))
	}},
	{"MessagingClient.OfficialGroups.Create", "POST", "/messaging/s/official-groups", "", `{"subject":"Team","joinApprovalRequired":false}`, `{"success":true,"data":{"requestId":"req"}}`, "data.requestId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := false
		return wireData(m.OfficialGroups().Create(ctx, "s", CreateOfficialGroupRequest{Subject: "Team", JoinApprovalRequired: &v}))
	}},
	{"MessagingClient.OfficialGroups.Retrieve", "GET", "/messaging/s/official-groups/g", "", "", `{"success":true,"data":{"id":"g","subject":"Team","participantCount":2,"suspended":false,"participants":[{"id":"u","bsuid":"business-user"}]}}`, "data.participants.0.bsuid", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.OfficialGroups().Retrieve(ctx, "s", "g"))
	}},
	{"MessagingClient.OfficialGroups.Update", "PATCH", "/messaging/s/official-groups/g", "", `{"description":"New"}`, `{"success":true,"data":{"accepted":true}}`, "data.accepted", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := "New"
		return wireData(m.OfficialGroups().Update(ctx, "s", "g", UpdateOfficialGroupRequest{Description: &v}))
	}},
	{"MessagingClient.OfficialGroups.Delete", "DELETE", "/messaging/s/official-groups/g", "", "", `{"success":true,"data":{"accepted":true}}`, "data.accepted", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.OfficialGroups().Delete(ctx, "s", "g"))
	}},
	{"MessagingClient.OfficialGroups.GetInviteLink", "GET", "/messaging/s/official-groups/g/invite-link", "", "", `{"success":true,"data":{"inviteLink":"https://chat.whatsapp.com/invite"}}`, "data.inviteLink", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.OfficialGroups().GetInviteLink(ctx, "s", "g"))
	}},
	{"MessagingClient.OfficialGroups.ResetInviteLink", "POST", "/messaging/s/official-groups/g/invite-link/reset", "", "", `{"success":true,"data":{"inviteLink":"https://chat.whatsapp.com/new"}}`, "data.inviteLink", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.OfficialGroups().ResetInviteLink(ctx, "s", "g"))
	}},
	{"MessagingClient.OfficialGroups.RemoveParticipants", "POST", "/messaging/s/official-groups/g/participants/remove", "", `{"participants":["u"]}`, `{"success":true,"data":{"accepted":true}}`, "data.accepted", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.OfficialGroups().RemoveParticipants(ctx, "s", "g", []string{"u"}))
	}},
	{"MessagingClient.OfficialGroups.ListJoinRequests", "GET", "/messaging/s/official-groups/g/join-requests", "before=b", "", `{"success":true,"data":{"items":[{"joinRequestId":"r","user":{"id":"u"},"createdAt":"today"}],"cursors":{},"hasMore":false}}`, "data.items.0.user.id", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.OfficialGroups().ListJoinRequests(ctx, "s", "g", OfficialGroupCursorParams{Before: "b"}))
	}},
	{"MessagingClient.OfficialGroups.ApproveJoinRequests", "POST", "/messaging/s/official-groups/g/join-requests/approve", "", `{"joinRequestIds":["r"]}`, `{"success":true,"data":{"succeeded":["r"],"failed":[]}}`, "data.succeeded.0", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.OfficialGroups().ApproveJoinRequests(ctx, "s", "g", []string{"r"}))
	}},
	{"MessagingClient.OfficialGroups.RejectJoinRequests", "POST", "/messaging/s/official-groups/g/join-requests/reject", "", `{"joinRequestIds":["r"]}`, `{"success":true,"data":{"succeeded":[],"failed":[{"joinRequestId":"r","errors":[{"code":42,"title":"Refused"}]}]}}`, "data.failed.0.errors.0.code", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.OfficialGroups().RejectJoinRequests(ctx, "s", "g", []string{"r"}))
	}},
	{"MessagingClient.OfficialGroups.Pin", "POST", "/messaging/s/official-groups/g/pins", "", `{"operation":"pin","messageId":"m","expirationDays":7}`, `{"success":true,"data":{"accepted":true}}`, "data.accepted", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		days := 7
		return wireData(m.OfficialGroups().Pin(ctx, "s", "g", PinOfficialGroupMessageRequest{"pin", "m", &days}))
	}},
}

func TestOfficialGroupWritesOnce(t *testing.T) {
	attempts := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Retry-After", "0")
		w.WriteHeader(503)
		io.WriteString(w, `{"error":{"code":"unknown_outcome","message":"Unknown outcome"}}`)
	}))
	defer s.Close()
	retries := 3
	_, err := mustMessaging(t, s.URL).OfficialGroups().Create(context.Background(), "s", CreateOfficialGroupRequest{Subject: "Team"}, RequestOptions{IdempotencyKey: "stable", MaxNetworkRetries: &retries})
	if err == nil || attempts != 1 {
		t.Fatal(err, attempts)
	}
}
