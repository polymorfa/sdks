import { serverCredentialType } from "./server-credential.mjs";
import { MessagingClient } from "@polymorfa/sdk";
import {
  CallsExampleSetupError,
  mintCallsExampleToken,
} from "./mint-client-token-core.mjs";

const key = process.env.POLYMORFA_SERVER_KEY;
const connection = process.env.POLYMORFA_CONNECTION;
const ephemeralId = process.env.POLYMORFA_EPHEMERAL_ID;
const credentialType = serverCredentialType(key);
if (!key || !connection || !ephemeralId) {
  process.stderr.write(
    "Set POLYMORFA_SERVER_KEY, POLYMORFA_CONNECTION and POLYMORFA_EPHEMERAL_ID.\n",
  );
  process.exitCode = 1;
} else if (!credentialType) {
  process.stderr.write("Enter a canonical team key or project token.\n");
  process.exitCode = 1;
} else {
  try {
    const messaging = new MessagingClient({
      credential: { type: credentialType, value: key },
      baseUrl: "https://api.polymorfastaging.com",
    });
    const token = await mintCallsExampleToken(
      messaging,
      connection,
      ephemeralId,
    );
    process.stdout.write(`${token}\n`);
  } catch (cause) {
    const detail =
      cause instanceof CallsExampleSetupError
        ? cause.message
        : "Token mint failed.";
    process.stderr.write(
      `${detail}\nCheck the staging API, key scopes, connection and client rules.\n`,
    );
    process.exitCode = 1;
  }
}
