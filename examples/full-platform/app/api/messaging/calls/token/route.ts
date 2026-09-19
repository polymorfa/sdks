import {
  createClientTokenRoute,
  createMessagingClientTokenMint,
} from "@polymorfa/nextjs";

import { authenticate } from "../../../../../lib/auth.js";
import { env, isDemoMode } from "../../../../../lib/env.js";
import { messaging } from "../../../../../lib/polymorfa.js";

// Calls token minted with `clientTokens.mint` (POST /platform/client-tokens).
// The session's client rules must grant voip_place, voip_answer and
// voip_signal.
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
        ephemeralId: subject.userId,
        ttlSeconds: 600,
      }),
    })(subject, request),
});
