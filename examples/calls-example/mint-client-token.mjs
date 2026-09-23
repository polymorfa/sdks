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
    const result = await messaging.clientTokens.mint({
      session,
      ephemeralId,
      ttlSeconds: 900,
    });
    process.stdout.write(`${result.data.data.token}\n`);
  } catch {
    process.stderr.write(
      "Token mint failed. Check the staging API, key scopes, session and client rules.\n",
    );
    process.exitCode = 1;
  }
}
