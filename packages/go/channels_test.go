package polymorfa

import "context"

var channelFixtures = []operationFixture{
	{"MessagingClient.Channels.List", "GET", "/messaging/s/channels", "", "", `{"success":true,"data":[{"id":"c","name":"Updates","muted":false,"followers":12}]}`, "data.0.followers", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Channels().List(ctx, "s"))
	}},
	{"MessagingClient.Channels.Create", "POST", "/messaging/s/channels", "", `{"name":"Updates","description":"Our updates"}`, `{"success":true,"data":{"id":"c","name":"Updates","muted":false}}`, "data.name", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Channels().Create(ctx, "s", CreateChannelRequest{Name: "Updates", Description: "Our updates"}))
	}},
	{"MessagingClient.Channels.Retrieve", "GET", "/messaging/s/channels/c", "", "", `{"success":true,"data":{"id":"c","name":"Updates","preview":true}}`, "data.preview", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Channels().Retrieve(ctx, "s", "c"))
	}},
	{"MessagingClient.Channels.Delete", "DELETE", "/messaging/s/channels/c", "", "", `{"success":true,"data":{"status":"DELETED"}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Channels().Delete(ctx, "s", "c"))
	}},
	{"MessagingClient.Channels.ListMessages", "GET", "/messaging/s/channels/c/messages", "before=9&count=2", "", `{"success":true,"data":[{"id":"m","position":8,"whatsapp_ids":{"linked_devices":"provider"},"conversation":{"id":"c"},"type":"text","timestamp":"today","views":10,"reactionCounts":{"heart":2},"text":"Hello"}]}`, "data.0.reactionCounts.heart", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := int64(9)
		return wireData(m.Channels().ListMessages(ctx, "s", "c", ChannelMessagesParams{2, &v}))
	}},
	{"MessagingClient.Channels.ListMessageUpdates", "GET", "/messaging/s/channels/c/message-updates", "after=8&count=2&since=0", "", `{"success":true,"data":[{"id":"m","position":9,"whatsapp_ids":{"linked_devices":"provider"},"conversation":{"id":"c"},"type":"text","timestamp":"today","views":12,"reactionCounts":{}}]}`, "data.0.views", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		since, after := int64(0), int64(8)
		return wireData(m.Channels().ListMessageUpdates(ctx, "s", "c", ChannelMessageUpdatesParams{2, &since, &after}))
	}},
	{"MessagingClient.Channels.MarkMessageViewed", "POST", "/messaging/s/channels/c/messages/m/viewed", "", "", `{"success":true,"data":{"status":"VIEWED"}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Channels().MarkMessageViewed(ctx, "s", "c", "m"))
	}},
	{"MessagingClient.Channels.ReactToMessage", "POST", "/messaging/s/channels/c/messages/m/reaction", "", `{"reaction":""}`, `{"success":true,"data":{"status":"UPDATED"}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Channels().ReactToMessage(ctx, "s", "c", "m", ChannelReactionRequest{Reaction: ""}))
	}},
	{"MessagingClient.Channels.SubscribeToLiveUpdates", "POST", "/messaging/s/channels/c/live-updates", "", "", `{"success":true,"data":{"durationSeconds":60}}`, "data.durationSeconds", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Channels().SubscribeToLiveUpdates(ctx, "s", "c"))
	}},
	{"MessagingClient.Channels.Follow", "POST", "/messaging/s/channels/c/follow", "", "", `{"success":true,"data":{"status":"FOLLOWED"}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Channels().Follow(ctx, "s", "c"))
	}},
	{"MessagingClient.Channels.Unfollow", "POST", "/messaging/s/channels/c/unfollow", "", "", `{"success":true,"data":{"status":"UNFOLLOWED"}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Channels().Unfollow(ctx, "s", "c"))
	}},
	{"MessagingClient.Channels.Mute", "POST", "/messaging/s/channels/c/mute", "", "", `{"success":true,"data":{"requestId":"admission"}}`, "data.requestId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Channels().Mute(ctx, "s", "c"))
	}},
	{"MessagingClient.Channels.Unmute", "POST", "/messaging/s/channels/c/unmute", "", "", `{"success":true,"data":{"status":"UNMUTED"}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Channels().Unmute(ctx, "s", "c"))
	}},
}
