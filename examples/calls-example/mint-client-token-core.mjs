/** Safe, actionable failures from the Calls example's read-only preflight. */
export class CallsExampleSetupError extends Error {}

/** Check the Number and its client rules before minting the browser token. */
export async function mintCallsExampleToken(messaging, session, ephemeralId) {
  let rules;
  try {
    rules = (await messaging.clientTokens.retrieveRules(session)).data.data;
  } catch (cause) {
    if (cause?.status !== 404) throw cause;
    // Public 404s conceal whether rules are absent or the Number is outside
    // this credential's project. Check Number visibility only on that path.
    try {
      await messaging.sessions.retrieve(session);
      throw new CallsExampleSetupError(
        "No client rules are configured for this Number. Configure the Calls actions before minting.",
      );
    } catch (sessionCause) {
      if (sessionCause instanceof CallsExampleSetupError) throw sessionCause;
      if (sessionCause?.status === 404)
        throw new CallsExampleSetupError(
          "Number unavailable to this credential. Check the Number ID and project-token project.",
        );
      // Reading a Number needs sessions:read; minting only needs sessions:manage.
      if (sessionCause?.status === 403)
        throw new CallsExampleSetupError(
          "Client rules are unavailable. Check the Number ID, project-token project, and whether client rules are configured.",
        );
      throw sessionCause;
    }
  }

  const actions = new Set(
    rules.allowedActions.split(",").map((action) => action.trim()),
  );
  const origins = new Set(
    rules.allowedOrigins
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
  const missing = ["voip_place", "voip_answer", "voip_signal"].filter(
    (action) => !actions.has(action),
  );
  const originAllowed =
    origins.size === 0 || origins.has("http://127.0.0.1:5273");
  if (!rules.enabled || missing.length > 0 || !originAllowed)
    throw new CallsExampleSetupError(
      `Client rules do not authorize this Calls example: enabled=${rules.enabled}, missing actions=${missing.join(",") || "none"}, local origin allowed=${originAllowed}.`,
    );

  const result = await messaging.clientTokens.mint({
    session,
    ephemeralId,
    ttlSeconds: 900,
  });
  return result.data.data.token;
}
