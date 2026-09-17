import { createClientTokenRoute } from "@polymorfa/nextjs";

import { authenticate } from "../../../../../lib/auth.js";
import { env, isDemoMode } from "../../../../../lib/env.js";
import { messaging } from "../../../../../lib/polymorfa.js";

// Calls token minted through `voip.token`. The session's client rules must
// grant voip_place, voip_answer and voip_signal.
export const POST = createClientTokenRoute({
  authorize: async (request) => {
    // Demo sign-in cookies are forgeable, so never mint real tokens for them.
    if (isDemoMode()) return null;
    const operator = await authenticate(request);
    return operator === null ? null : { userId: operator.userId };
  },
  mint: async (subject, request) => {
    const response = await messaging().voip.token(
      { session: env.session(), ephemeralId: subject.userId, ttlSeconds: 600 },
      { signal: request.signal },
    );
    return {
      value: response.data.data.token,
      audience: "browser",
      expiresAt: response.data.data.expiresAt,
    };
  },
});
