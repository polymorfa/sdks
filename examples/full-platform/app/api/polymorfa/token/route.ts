import {
  createClientTokenRoute,
  createMessagingClientTokenMint,
} from "@polymorfa/nextjs";

import { authenticate } from "../../../../lib/auth.js";
import { env, isDemoMode } from "../../../../lib/env.js";
import { messaging } from "../../../../lib/polymorfa.js";

// Browser messaging token. The session's client rules decide what it can do
// (see /api/messaging/client-rules).
export const POST = createClientTokenRoute({
  authorize: async (request) => {
    // Demo sign-in cookies are forgeable, so never mint real tokens for them.
    if (isDemoMode()) return null;
    const operator = await authenticate(request);
    return operator === null ? null : { userId: operator.userId };
  },
  mint: (subject, request) =>
    createMessagingClientTokenMint({
      clientTokens: messaging().clientTokens,
      resolve: () => ({
        session: env.session(),
        // One ephemeral id per operator keeps rate limits per person.
        ephemeralId: subject.userId,
        ttlSeconds: 300,
      }),
    })(subject, request),
});
