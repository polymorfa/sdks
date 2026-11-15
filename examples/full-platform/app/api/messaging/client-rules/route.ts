import { messaging } from "../../../../lib/polymorfa.js";
import { env } from "../../../../lib/env.js";
import { action, route, unknownAction } from "../../../../lib/route.js";

export const GET = route("admin", ({ body, connectionOf }) =>
  messaging().clientTokens.retrieveRules(connectionOf(body)),
);

export const POST = route("admin", async ({ body, connectionOf }) => {
  const clientTokens = messaging().clientTokens;
  const connection = connectionOf(body);
  switch (action(body)) {
    case "apply":
      // What browser tokens for this connection may do: chat in existing
      // conversations and handle calls from this origin only.
      return clientTokens.updateRules(connection, {
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
      return clientTokens.deleteRules(connection);
    default:
      return unknownAction(action(body));
  }
});
