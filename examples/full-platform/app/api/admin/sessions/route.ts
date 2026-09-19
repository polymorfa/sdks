import { organization } from "../../../../lib/polymorfa.js";
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
  organization().sessions.list({ projectId: env.projectId() }),
);

export const POST = route("admin", async ({ body, request }) => {
  const sessions = organization().sessions;
  const projectId = env.projectId();
  const name = action(body);
  switch (name) {
    case "stopMany":
      return sessions.stopMany({ projectId, sessionIds: texts(body, "ids") });
    case "deleteMany":
      return sessions.deleteMany({ projectId, sessionIds: texts(body, "ids") });
  }

  const sessionId = text(body, "sessionId");
  switch (name) {
    case "retrieve":
      return sessions.retrieve(sessionId);
    case "start":
      return sessions.start(sessionId, { projectId });
    case "stop":
      return sessions.stop(sessionId, { projectId });
    case "delete":
      return sessions.delete(sessionId);
    case "resetConfiguration": {
      const current = await sessions.retrieve(sessionId);
      const revision = current.data.data.configuration?.revisions.session ?? 0;
      return sessions.update(sessionId, {
        configuration: { reset: ["observation", "historySync"] },
        revision,
      });
    }
    case "quoteTier":
      // Review the quote with the customer, then confirm it with applyTier.
      return sessions.quoteTierChange(sessionId, {
        projectId,
        tierOverride: oneOf(body, "tier", ["free", "standard", "pro"]),
      });
    case "tierQuote":
      return sessions.retrieveTierChange(sessionId, text(body, "quoteId"));
    case "applyTier":
      return sessions.setTierOverride(
        sessionId,
        { projectId, quoteId: text(body, "quoteId") },
        { idempotencyKey: idempotencyKey(request) },
      );
    case "safeMode":
      return sessions.getSafeMode(sessionId);
    case "updateSafeMode":
      return sessions.updateSafeMode(sessionId, { pacing: "jittered" });
    default:
      return unknownAction(name);
  }
});
