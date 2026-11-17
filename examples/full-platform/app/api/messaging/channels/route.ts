import { messaging } from "../../../../lib/polymorfa.js";
import {
  action,
  optionalInteger,
  optionalText,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

export const GET = route("agent", ({ body, connectionOf }) =>
  messaging().channels.list(connectionOf(body)),
);

export const POST = route("admin", async ({ body, connectionOf }) => {
  const channels = messaging().channels;
  const connection = connectionOf(body);
  const name = action(body);
  if (name === "create") {
    const description = optionalText(body, "description");
    return channels.create(connection, {
      name: text(body, "name"),
      ...(description === undefined ? {} : { description }),
    });
  }
  const channelId = text(body, "channelId");
  switch (name) {
    case "retrieve":
      return channels.retrieve(connection, channelId);
    case "delete":
      return channels.delete(connection, channelId);
    case "messages": {
      // Page older history with the smallest `position` you have seen.
      const before = optionalInteger(body, "before");
      return channels.listMessages(connection, channelId, {
        count: 50,
        ...(before === undefined ? {} : { before }),
      });
    }
    case "updates": {
      const since = optionalInteger(body, "since");
      return channels.listMessageUpdates(connection, channelId, {
        count: 50,
        ...(since === undefined ? {} : { since }),
      });
    }
    case "markViewed":
      return channels.markMessageViewed(
        connection,
        channelId,
        text(body, "messageId"),
      );
    case "react":
      return channels.reactToMessage(
        connection,
        channelId,
        text(body, "messageId"),
        { reaction: typeof body.reaction === "string" ? body.reaction : "" },
      );
    case "liveUpdates":
      return channels.subscribeToLiveUpdates(connection, channelId);
    case "follow":
      return channels.follow(connection, channelId);
    case "unfollow":
      return channels.unfollow(connection, channelId);
    case "mute":
      return channels.mute(connection, channelId);
    case "unmute":
      return channels.unmute(connection, channelId);
    default:
      return unknownAction(name);
  }
});
