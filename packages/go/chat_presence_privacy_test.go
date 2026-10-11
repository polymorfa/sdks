package polymorfa

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

var chatPresencePrivacyFixtures = []operationFixture{
	{"MessagingClient.Chats.GetServiceWindow", "GET", "/messaging/s/chats/chat/service-window", "", "", `{"data":{"state":"unknown","reason":"not_tracked","openedAt":null,"expiresAt":null,"checkedAt":"today"}}`, "data.reason", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Chats().GetServiceWindow(ctx, "s", "chat"))
	}},
	{"MessagingClient.Chats.List", "GET", "/messaging/s/chats", "activeBefore=tomorrow&activeSince=today&cursor=cursor&kind=direct&limit=2", "", `{"success":true,"data":[{"conversation":{"id":"chat"},"kind":"direct","lastActivityAt":"today","lastMessage":{"id":"message","whatsapp_ids":{"official_api":"wa"},"direction":"inbound","type":"text","timestamp":"today"}}],"hasMore":true,"nextCursor":"next","previousCursor":null}`, "data.0.lastMessage.whatsapp_ids.official_api", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Chats().List(ctx, "s", ListHistoryChatsParams{ListParams: ListParams{Limit: 2, Cursor: "cursor"}, Kind: "direct", ActiveSince: "today", ActiveBefore: "tomorrow"}))
	}},
	{"MessagingClient.Chats.Retrieve", "GET", "/messaging/s/chats/chat", "", "", `{"data":{"conversation":{"id":"chat"},"kind":"direct","lastActivityAt":"today","lastMessage":{"id":"message","whatsapp_ids":{"official_api":"wa"},"direction":"inbound","type":"text","timestamp":"today"}}}`, "data.conversation.id", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Chats().Retrieve(ctx, "s", "chat"))
	}},
	{"MessagingClient.Chats.ListMessages", "GET", "/messaging/s/chats/chat/messages", "cursor=cursor&direction=inbound&limit=2&order=asc&since=today&types=text%2Cimage&until=tomorrow", "", `{"success":true,"data":[{"id":"message","whatsapp_ids":{"official_api":"wa"},"direction":"inbound","type":"image","timestamp":"today","conversation":{"id":"chat","sender":{"id":"sender"}},"fromMe":false,"mediaRetrieval":{"state":"stored"}}],"hasMore":false,"nextCursor":null,"previousCursor":null}`, "data.0.mediaRetrieval.state", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Chats().ListMessages(ctx, "s", "chat", ListHistoryMessagesParams{ListParams: ListParams{Limit: 2, Cursor: "cursor"}, Order: "asc", Since: "today", Until: "tomorrow", Direction: "inbound", Types: "text,image"}))
	}},
	{"MessagingClient.Chats.RetrieveMessage", "GET", "/messaging/s/chats/chat/messages/message", "", "", `{"data":{"id":"message","whatsapp_ids":{"official_api":"wa"},"direction":"inbound","type":"text","timestamp":"today","conversation":{"id":"chat"},"fromMe":false,"text":"hello"}}`, "data.text", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Chats().RetrieveMessage(ctx, "s", "chat", "message"))
	}},
	{"MessagingClient.Chats.EditMessage", "PUT", "/messaging/s/chats/chat/messages/message", "", `{"transport":"official_api","text":"Edited"}`, `{"success":true,"message":"Updated"}`, "message", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Chats().EditMessage(ctx, "s", "chat", "message", EditMessageRequest{Transport: "official_api", Text: "Edited"}))
	}},
	{"MessagingClient.Chats.DeleteMessage", "DELETE", "/messaging/s/chats/chat/messages/message", "transport=linked_devices", "", `{"success":true,"message":"Removed"}`, "message", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Chats().DeleteMessage(ctx, "s", "chat", "message", "linked_devices"))
	}},
	{"MessagingClient.Chats.Archive", "POST", "/messaging/s/chats/chat/archive", "", "", `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Chats().Archive(ctx, "s", "chat"))
	}},
	{"MessagingClient.Chats.Unarchive", "POST", "/messaging/s/chats/chat/unarchive", "", "", `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Chats().Unarchive(ctx, "s", "chat"))
	}},
	{"MessagingClient.Chats.SetDisappearingTimer", "PUT", "/messaging/s/chats/chat/disappearing", "", `{"durationSeconds":0}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Chats().SetDisappearingTimer(ctx, "s", "chat", DisappearingTimerRequest{}))
	}},
	{"MessagingClient.Presence.Get", "GET", "/messaging/s/presence", "", "", `{"data":{"desired":"available","desiredAt":"today","lastSent":"available","lastSentAt":"today","authoritative":true}}`, "data.authoritative", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Presence().Get(ctx, "s"))
	}},
	{"MessagingClient.Presence.Set", "POST", "/messaging/s/presence", "", `{"presence":"unavailable"}`, `{"success":true,"data":{"status":"OK"}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Presence().Set(ctx, "s", "unavailable"))
	}},
	{"MessagingClient.Presence.GetForChat", "GET", "/messaging/s/presence/chat", "", "", `{"data":{"policy":"observe","status":"observed","available":false,"stale":false,"typingPolicy":"observe","typingStatus":"observed","chatState":{"sender":"sender","state":"composing","observedAt":"today","stale":false}}}`, "data.available", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Presence().GetForChat(ctx, "s", "chat"))
	}},
	{"MessagingClient.Presence.Subscribe", "POST", "/messaging/s/presence/chat/subscribe", "", "", `{"success":true,"data":{"requestId":"admitted","expiresAt":"tomorrow"}}`, "data.expiresAt", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Presence().Subscribe(ctx, "s", "chat"))
	}},
	{"MessagingClient.Privacy.Get", "GET", "/messaging/s/privacy", "", "", `{"data":{"groupAdd":"contacts","lastSeen":"none","status":"all","profile":"none","readReceipts":"none","online":"match_last_seen","callAdd":"known","messages":"contacts","defense":"off","stickers":"contact_allowlist"}}`, "data.stickers", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Privacy().Get(ctx, "s"))
	}},
	{"MessagingClient.Privacy.Set", "PUT", "/messaging/s/privacy/online", "", `{"value":"match_last_seen"}`, `{"data":{"online":"match_last_seen"}}`, "data.online", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Privacy().Set(ctx, "s", "online", "match_last_seen"))
	}},
	{"MessagingClient.Privacy.SetDefaultDisappearingTimer", "PUT", "/messaging/s/privacy/disappearing/default", "", `{"durationSeconds":0}`, `{"success":true}`, "success", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Privacy().SetDefaultDisappearingTimer(ctx, "s", DisappearingTimerRequest{}))
	}},
}

func TestPrivacySettingBoundary(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { t.Fatal("Invalid mutation reached service") }))
	defer s.Close()
	m, _ := NewMessagingClient(orgConfig(s.URL))
	if _, err := m.Privacy().Set(context.Background(), "s", "readreceipts", "contacts"); err == nil {
		t.Fatal("Accepted invalid per-setting audience")
	}
}
