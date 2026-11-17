import { messaging } from "../../../../lib/polymorfa.js";
import {
  InputError,
  action,
  optionalInteger,
  optionalText,
  route,
  text,
  texts,
  unknownAction,
} from "../../../../lib/route.js";

export const GET = route("agent", ({ body, connectionOf, url }) =>
  messaging().labels.list(connectionOf(body), {
    includeObservation: url.searchParams.get("observation") === "true",
  }),
);

export const POST = route("agent", async ({ body, connectionOf }) => {
  const labels = messaging().labels;
  const connection = connectionOf(body);
  switch (action(body)) {
    case "create": {
      const color = optionalInteger(body, "color");
      return labels.create(connection, {
        name: text(body, "name"),
        ...(color === undefined ? {} : { color }),
      });
    }
    case "update": {
      const name = optionalText(body, "name");
      const color = optionalInteger(body, "color");
      const labelId = text(body, "labelId");
      if (name !== undefined) {
        return labels.update(connection, labelId, {
          name,
          ...(color === undefined ? {} : { color }),
        });
      }
      if (color !== undefined) {
        return labels.update(connection, labelId, { color });
      }
      throw new InputError("Provide a name or color.");
    }
    case "delete":
      return labels.delete(connection, text(body, "labelId"));
    case "forChat":
      return labels.listForChat(connection, text(body, "chatId"));
    case "replaceForChat":
      // Replaces the chat's complete label set.
      return labels.replaceForChat(connection, text(body, "chatId"), {
        labels: texts(body, "labels"),
      });
    default:
      return unknownAction(action(body));
  }
});
