import { desk } from "../../../../lib/desk/data.js";
import {
  InputError,
  action,
  optionalText,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

export const GET = route(
  "agent",
  async () => (await desk()).listQuickReplies(),
  { demo: "handler" },
);

export const POST = route(
  "agent",
  async ({ body }) => {
    const data = await desk();
    switch (action(body)) {
      case "save": {
        const id = optionalText(body, "id");
        const shortcut = text(body, "shortcut").replace(/^\//, "").trim();
        if (!/^[\w-]{1,25}$/.test(shortcut)) {
          throw new InputError(
            "Shortcuts use up to 25 letters, numbers, dashes or underscores.",
          );
        }
        return data.saveQuickReply({
          ...(id === undefined ? {} : { id }),
          shortcut,
          message: text(body, "message").slice(0, 1024),
        });
      }
      case "delete":
        await data.deleteQuickReply(text(body, "id"));
        return { deleted: true };
      default:
        return unknownAction(action(body));
    }
  },
  { demo: "handler" },
);
