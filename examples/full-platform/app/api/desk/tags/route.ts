import { desk } from "../../../../lib/desk/data.js";
import {
  InputError,
  action,
  integer,
  optionalText,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

export const GET = route("agent", async () => (await desk()).listTags(), {
  demo: "handler",
});

export const POST = route(
  "agent",
  async ({ body }) => {
    const data = await desk();
    switch (action(body)) {
      case "save": {
        const id = optionalText(body, "id");
        const color = integer(body, "color");
        if (color < 0 || color > 19) {
          throw new InputError("color must be between 0 and 19.");
        }
        return data.saveTag({
          ...(id === undefined ? {} : { id }),
          name: text(body, "name").slice(0, 40),
          color,
        });
      }
      case "delete":
        await data.deleteTag(text(body, "id"));
        return { deleted: true };
      default:
        return unknownAction(action(body));
    }
  },
  { demo: "handler" },
);
