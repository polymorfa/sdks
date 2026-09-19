import { messaging } from "../../../../lib/polymorfa.js";
import { env } from "../../../../lib/env.js";
import {
  action,
  idempotencyKey,
  optionalFlag,
  optionalInteger,
  optionalText,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

export const GET = route("agent", () =>
  messaging().campaigns.list(env.projectSlug()),
);

export const POST = route("admin", async ({ body, request }) => {
  const campaigns = messaging().campaigns;
  const slug = env.projectSlug();
  const name = action(body);
  if (name === "create") {
    const templateId = optionalText(body, "templateId");
    const recipientListId = optionalText(body, "recipientListId");
    return campaigns.create(
      slug,
      {
        name: text(body, "name"),
        ...(templateId === undefined ? {} : { templateId }),
        ...(recipientListId === undefined ? {} : { recipientListId }),
      },
      { idempotencyKey: idempotencyKey(request) },
    );
  }
  const campaignId = text(body, "campaignId");
  switch (name) {
    case "retrieve":
      return campaigns.retrieve(slug, campaignId);
    case "analytics":
      return campaigns.analytics(slug, campaignId);
    case "launch": {
      const scheduledAt = optionalInteger(body, "scheduledAt");
      return campaigns.launch(
        slug,
        campaignId,
        scheduledAt === undefined ? {} : { scheduledAt },
        { idempotencyKey: idempotencyKey(request) },
      );
    }
    case "pause":
      return campaigns.pause(slug, campaignId);
    case "resume":
      return campaigns.resume(slug, campaignId);
    case "stop":
      return campaigns.stop(slug, campaignId);
    case "requeue": {
      const includeSkippedError = optionalFlag(body, "includeSkippedError");
      return campaigns.requeue(
        slug,
        campaignId,
        includeSkippedError === undefined ? {} : { includeSkippedError },
      );
    }
    default:
      return unknownAction(name);
  }
});
