import { MessagingClient } from "@polymorfa/sdk";
import { CallsExampleSetupError } from "./mint-client-token-core.mjs";
import { configureCallsExampleRules } from "./configure-client-rules-core.mjs";

const key = process.env.POLYMORFA_SERVER_KEY;
const session = process.env.POLYMORFA_SESSION;
const testCallee = process.env.POLYMORFA_TEST_CALLEE;
const credentialType = key?.startsWith("pmfa_pt_")
  ? "projectToken"
  : /^pmfa_[A-Za-z0-9_-]{72}$/.test(key ?? "")
    ? "apiKey"
    : null;

if (!key || !session || !testCallee) {
  process.stderr.write(
    "Set POLYMORFA_SERVER_KEY, POLYMORFA_SESSION and POLYMORFA_TEST_CALLEE.\n",
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
    await configureCallsExampleRules(messaging, session, testCallee);
    process.stdout.write(
      "Configured bounded Calls client rules for this Number.\n",
    );
  } catch (cause) {
    process.stderr.write(
      `${cause instanceof CallsExampleSetupError ? cause.message : "Could not configure Calls client rules. Check the Number, project, key scopes and staging API."}\n`,
    );
    process.exitCode = 1;
  }
}
