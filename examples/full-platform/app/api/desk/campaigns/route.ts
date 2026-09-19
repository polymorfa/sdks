import { desk } from "../../../../lib/desk/data.js";
import {
  InputError,
  action,
  idempotencyKey,
  oneOf,
  optionalInteger,
  optionalText,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

export const GET = route("agent", async () => (await desk()).listCampaigns(), {
  demo: "handler",
});

export const POST = route(
  "admin",
  async ({ body, request }) => {
    const data = await desk();
    const key = idempotencyKey(request);
    switch (action(body)) {
      case "create": {
        const audience = oneOf(body, "audience", ["all", "tag"] as const);
        const tag = optionalText(body, "tag");
        const scheduledAt = optionalInteger(body, "scheduledAt");
        if (audience === "tag" && tag === undefined) {
          throw new InputError("Choose a tag for the audience.");
        }
        if (scheduledAt !== undefined && scheduledAt < Date.now() - 60_000) {
          throw new InputError("The schedule must be in the future.");
        }
        return data.createCampaign(
          {
            name: text(body, "name").slice(0, 80),
            templateId: text(body, "templateId"),
            audience,
            ...(tag === undefined ? {} : { tag }),
            ...(scheduledAt === undefined ? {} : { scheduledAt }),
          },
          key,
        );
      }
      case "control":
        return data.campaignAction(
          text(body, "campaignId"),
          oneOf(body, "operation", [
            "launch",
            "pause",
            "resume",
            "stop",
          ] as const),
          key,
        );
      default:
        return unknownAction(action(body));
    }
  },
  { demo: "handler" },
);
