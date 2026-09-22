import { organization } from "../../../../lib/polymorfa.js";
import { env } from "../../../../lib/env.js";
import {
  action,
  idempotencyKey,
  route,
  text,
  unknownAction,
  type Body,
} from "../../../../lib/route.js";

// Management campaigns. Their payloads are open objects in the contract.
export const GET = route("admin", () =>
  organization().campaigns.list({
    projectId: env.projectId(),
    projectSlug: env.projectSlug(),
  }),
);

export const POST = route("admin", async ({ body, request }) => {
  const campaigns = organization().campaigns;
  const payload = (body.payload ?? {}) as Body;
  const name = action(body);
  if (name === "create") {
    return campaigns.create(payload, {
      idempotencyKey: idempotencyKey(request),
    });
  }
  const id = text(body, "campaignId");
  const scope = { projectId: env.projectId() };
  switch (name) {
    case "retrieve":
      return campaigns.retrieve(id, scope);
    case "update":
      return campaigns.update(id, payload, scope);
    case "delete":
      return campaigns.delete(id, scope);
    case "launch":
      return campaigns.launch(id, payload, {
        idempotencyKey: idempotencyKey(request),
      });
    case "pause":
      return campaigns.pause(id);
    case "resume":
      return campaigns.resume(id);
    case "stop":
      return campaigns.stop(id);
    case "archive":
      return campaigns.archive(id);
    case "duplicate":
      return campaigns.duplicate(id, payload);
    case "requeue":
      return campaigns.requeue(id, payload);
    case "analytics":
      return campaigns.analytics(id, scope);
    case "events":
      return campaigns.events(id, scope);
    case "recipients":
      return campaigns.recipients(id, scope);
    default:
      return unknownAction(name);
  }
});
