import { MessagingClient } from "@polymorfa/sdk";

const key = process.env.POLYMORFA_SERVER_KEY;
const session = process.env.POLYMORFA_SESSION;
const ephemeralId = process.env.POLYMORFA_EPHEMERAL_ID;
const credentialType = key?.startsWith("pmfa_pt_")
  ? "projectToken"
  : /^pmfa_[A-Za-z0-9_-]{72}$/.test(key ?? "")
    ? "apiKey"
    : null;
if (!key || !session || !ephemeralId) {
  process.stderr.write(
    "Set POLYMORFA_SERVER_KEY, POLYMORFA_SESSION and POLYMORFA_EPHEMERAL_ID.\n",
  );
  process.exitCode = 1;
} else if (!credentialType) {
  process.stderr.write(
    "Enter a canonical organization key or project token.\n",
  );
  process.exitCode = 1;
} else {
  try {
    const messaging = new MessagingClient({
      credential: { type: credentialType, value: key },
      baseUrl: "https://api.polymorfastaging.com",
    });
    let sessionVisible = false;
    try {
      await messaging.sessions.retrieve(session);
      sessionVisible = true;
    } catch (cause) {
      if (cause?.status === 404)
        throw new Error(
          "Session not found for this credential. Check the Number ID and project-token project.",
        );
      // Reading a session needs sessions:read; ticket minting only needs
      // sessions:manage, so continue when that optional check is forbidden.
      if (cause?.status !== 403) throw cause;
    }
    let rules;
    try {
      rules = (await messaging.clientTokens.retrieveRules(session)).data.data;
    } catch (cause) {
      if (cause?.status === 404 && sessionVisible)
        throw new Error(
          "No client rules are configured for this session. Configure the Calls actions before minting.",
        );
      throw cause;
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
    if (
      !rules.enabled ||
      missing.length > 0 ||
      (origins.size > 0 && !origins.has("http://127.0.0.1:5273"))
    ) {
      throw new Error(
        `Client rules do not authorize this Calls example: enabled=${rules.enabled}, missing actions=${missing.join(",") || "none"}, local origin allowed=${origins.size === 0 || origins.has("http://127.0.0.1:5273")}.`,
      );
    }
    const result = await messaging.clientTokens.mint({
      session,
      ephemeralId,
      ttlSeconds: 900,
    });
    process.stdout.write(`${result.data.data.token}\n`);
  } catch (cause) {
    const detail =
      cause instanceof Error &&
      cause.message.startsWith("Client rules do not authorize")
        ? cause.message
        : cause instanceof Error &&
            (cause.message.startsWith("No client rules are configured") ||
              cause.message.startsWith("Session not found for this credential"))
          ? cause.message
          : "Token mint failed.";
    process.stderr.write(
      `${detail}\nCheck the staging API, key scopes, session and client rules.\n`,
    );
    process.exitCode = 1;
  }
}
