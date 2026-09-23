import { CallsExampleSetupError } from "./mint-client-token-core.mjs";

const LOCAL_ORIGIN = "http://127.0.0.1:5273";
const E164 = /^\+[1-9]\d{6,14}$/;

/** Install narrow Calls rules only when this Number has no rules yet. */
export async function configureCallsExampleRules(
  messaging,
  session,
  testCallee,
) {
  if (!E164.test(testCallee))
    throw new CallsExampleSetupError(
      "Set POLYMORFA_TEST_CALLEE to a test E.164 number, such as +12025550123.",
    );

  let existing = false;
  try {
    await messaging.clientTokens.retrieveRules(session);
    existing = true;
  } catch (cause) {
    if (cause?.status !== 404) throw cause;
  }
  // A successful GET means any existing rules belong to the operator. Do not
  // widen or replace them just to make this example run.
  if (existing) {
    throw new CallsExampleSetupError(
      "Client rules already exist for this Number. Review them instead of replacing them with example settings.",
    );
  }

  // The public 404 does not say whether rules are absent or the Number is
  // outside this credential's project. A readable Number resolves it; when
  // sessions:read is missing, the PUT still checks the project on the server.
  try {
    await messaging.sessions.retrieve(session);
  } catch (cause) {
    if (cause?.status === 404)
      throw new CallsExampleSetupError(
        "Number unavailable to this credential. Check the Number ID and project-token project.",
      );
    if (cause?.status !== 403) throw cause;
  }

  try {
    await messaging.clientTokens.updateRules(session, {
      recipientMode: "none",
      allowedActions: "voip_place,voip_answer,voip_signal",
      rateLimit: 60,
      maxDaily: 0,
      allowedOrigins: LOCAL_ORIGIN,
      enabled: true,
      conversationTtlSeconds: 86400,
      maxConcurrency: 1,
      maxSetupsPerMinute: 2,
      allowedNumber: testCallee,
    });
  } catch (cause) {
    if (cause?.status === 503)
      throw new CallsExampleSetupError(
        "The rules may have been saved but not applied yet. Read the rules and check the Calls result before retrying or editing them.",
      );
    throw cause;
  }
}
