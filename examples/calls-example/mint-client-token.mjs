import { MessagingClient } from "@polymorfa/sdk";
import {
  CallsExampleSetupError,
  mintCallsExampleToken,
} from "./mint-client-token-core.mjs";

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
    const token = await mintCallsExampleToken(messaging, session, ephemeralId);
    process.stdout.write(`${token}\n`);
  } catch (cause) {
    const detail =
      cause instanceof CallsExampleSetupError
        ? cause.message
        : "Token mint failed.";
    process.stderr.write(
      `${detail}\nCheck the staging API, key scopes, session and client rules.\n`,
    );
    process.exitCode = 1;
  }
}
