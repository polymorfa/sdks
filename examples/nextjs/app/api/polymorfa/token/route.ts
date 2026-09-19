import { MessagingClient } from "@polymorfa/sdk";
import {
  createClientTokenRoute,
  createMessagingClientTokenMint,
} from "@polymorfa/nextjs";

// Served at /api/polymorfa/token, the default path of
// createClientTokenProvider. Browser messaging and Calls components use the
// same token; Calls also need the session's client rules to grant
// voip_place, voip_answer, and voip_signal.
const messaging = new MessagingClient({
  credential: {
    type: "apiKey",
    value: process.env.POLYMORFA_API_KEY ?? "",
  },
});

export const POST = createClientTokenRoute({
  authorize: async (request) => {
    // Replace with your application's session check.
    const userId = request.headers.get("x-example-authenticated-user");
    return userId ? { userId } : null;
  },
  mint: createMessagingClientTokenMint({
    clientTokens: messaging.clientTokens,
    resolve: (subject) => ({
      session: "support",
      ephemeralId: subject.userId,
      ttlSeconds: 600,
    }),
  }),
});
