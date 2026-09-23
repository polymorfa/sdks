import { messaging } from "../../../../lib/polymorfa.js";
import { env } from "../../../../lib/env.js";
import { action, route, unknownAction } from "../../../../lib/route.js";

export const GET = route("admin", ({ body, sessionOf }) =>
  messaging().clientTokens.retrieveRules(sessionOf(body)),
);

export const POST = route("admin", async ({ body, sessionOf }) => {
  const clientTokens = messaging().clientTokens;
  const session = sessionOf(body);
  switch (action(body)) {
    case "apply":
      // What browser tokens for this session may do: chat in existing
      // conversations and handle calls from this origin only.
      return clientTokens.updateRules(session, {
        enabled: true,
        recipientMode: "conversation",
        allowedActions: [
          "send_message",
          "send_reaction",
          "send_typing",
          "send_seen",
          "read_contact",
          "voip_place",
          "voip_answer",
          "voip_signal",
        ].join(","),
        allowedOrigins: env.appOrigin(),
        rateLimit: 60,
        maxDaily: 1000,
        maxConcurrency: 1,
      });
    case "delete":
      return clientTokens.deleteRules(session);
    default:
      return unknownAction(action(body));
  }
});
