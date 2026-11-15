import { team } from "../../../../lib/polymorfa.js";
import { env } from "../../../../lib/env.js";
import {
  action,
  idempotencyKey,
  oneOf,
  route,
  text,
  texts,
  unknownAction,
} from "../../../../lib/route.js";

export const GET = route("admin", () =>
  team().connections.list({ projectId: env.projectId() }),
);

export const POST = route("admin", async ({ body, request }) => {
  const connections = team().connections;
  const projectId = env.projectId();
  const name = action(body);
  switch (name) {
    case "stopMany":
      return connections.stopMany({ projectId, connectionIds: texts(body, "ids") });
    case "deleteMany":
      return connections.deleteMany({ projectId, connectionIds: texts(body, "ids") });
  }

  const connectionId = text(body, "connectionId");
  switch (name) {
    case "retrieve":
      return connections.retrieve(connectionId);
    case "start":
      return connections.start(connectionId, { projectId });
    case "stop":
      return connections.stop(connectionId, { projectId });
    case "delete":
      return connections.delete(connectionId);
    case "resetConfiguration": {
      const current = await connections.retrieve(connectionId);
      const revision = current.data.data.configuration?.revisions.connection ?? 0;
      return connections.update(connectionId, {
        configuration: { reset: ["observation", "historySync"] },
        revision,
      });
    }
    case "quoteTier":
      // Review the quote with the customer, then confirm it with applyTier.
      return connections.quoteTierChange(connectionId, {
        projectId,
        tierOverride: oneOf(body, "tier", ["free", "standard", "pro"]),
      });
    case "tierQuote":
      return connections.retrieveTierChange(connectionId, text(body, "quoteId"));
    case "applyTier":
      return connections.setTierOverride(
        connectionId,
        { projectId, quoteId: text(body, "quoteId") },
        { idempotencyKey: idempotencyKey(request) },
      );
    case "capabilities":
      // Beta: returns 403 until the team enrolls in number capabilities.
      return connections.getCapabilities(connectionId);
    case "safeMode":
      return connections.getSafeMode(connectionId);
    case "updateSafeMode":
      return connections.updateSafeMode(connectionId, { pacing: "jittered" });
    default:
      return unknownAction(name);
  }
});
