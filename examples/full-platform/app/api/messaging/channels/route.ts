import { messaging } from "../../../../lib/polymorfa.js";
import {
  action,
  optionalInteger,
  optionalText,
  route,
  sessionOf,
  text,
  unknownAction,
} from "../../../../lib/route.js";
import { env } from "../../../../lib/env.js";

export const GET = route("agent", () =>
  messaging().channels.list(env.session()),
);

export const POST = route("admin", async ({ body }) => {
  const channels = messaging().channels;
  const session = sessionOf(body);
  const name = action(body);
  if (name === "create") {
    const description = optionalText(body, "description");
    return channels.create(session, {
      name: text(body, "name"),
      ...(description === undefined ? {} : { description }),
    });
  }
  const channelId = text(body, "channelId");
  switch (name) {
    case "retrieve":
      return channels.retrieve(session, channelId);
    case "delete":
      return channels.delete(session, channelId);
    case "messages": {
      // Page older history with the smallest `position` you have seen.
      const before = optionalInteger(body, "before");
      return channels.listMessages(session, channelId, {
        count: 50,
        ...(before === undefined ? {} : { before }),
      });
    }
    case "updates": {
      const since = optionalInteger(body, "since");
      return channels.listMessageUpdates(session, channelId, {
        count: 50,
        ...(since === undefined ? {} : { since }),
      });
    }
    case "markViewed":
      return channels.markMessageViewed(
        session,
        channelId,
        text(body, "messageId"),
      );
    case "react":
      return channels.reactToMessage(
        session,
        channelId,
        text(body, "messageId"),
        { reaction: typeof body.reaction === "string" ? body.reaction : "" },
      );
    case "liveUpdates":
      return channels.subscribeToLiveUpdates(session, channelId);
    case "follow":
      return channels.follow(session, channelId);
    case "unfollow":
      return channels.unfollow(session, channelId);
    case "mute":
      return channels.mute(session, channelId);
    case "unmute":
      return channels.unmute(session, channelId);
    default:
      return unknownAction(name);
  }
});
