import assert from "node:assert/strict";
import { test } from "node:test";
import { configureCallsExampleRules } from "./configure-client-rules-core.mjs";
import { mintCallsExampleToken } from "./mint-client-token-core.mjs";

const missing = { status: 404 };
const forbidden = { status: 403 };
const rules = {
  enabled: true,
  allowedActions: "voip_place,voip_answer,voip_signal",
  allowedOrigins: "http://127.0.0.1:5273",
};

function fakeMessaging({
  sessionError,
  rulesError,
  updateError,
  configuredRules = rules,
} = {}) {
  const calls = [];
  return {
    calls,
    sessions: {
      retrieve: async () => {
        calls.push("retrieve-session");
        if (sessionError) throw sessionError;
      },
    },
    clientTokens: {
      retrieveRules: async () => {
        calls.push("retrieve-rules");
        if (rulesError) throw rulesError;
        return { data: { data: configuredRules } };
      },
      mint: async (input) => {
        calls.push(["mint", input]);
        return { data: { data: { token: "pmfa_ct_example" } } };
      },
      updateRules: async (_session, input) => {
        calls.push(["update-rules", input]);
        if (updateError) throw updateError;
      },
    },
  };
}

test("mint helper identifies missing rules after a visible Number and never mints", async () => {
  const messaging = fakeMessaging({ rulesError: missing });
  await assert.rejects(
    mintCallsExampleToken(messaging, "support", "local-1"),
    /No client rules are configured/,
  );
  assert.deepEqual(messaging.calls, ["retrieve-rules", "retrieve-session"]);
});

test("mint helper reports a generic rules 404 when sessions:read is unavailable", async () => {
  const messaging = fakeMessaging({
    sessionError: forbidden,
    rulesError: missing,
  });
  await assert.rejects(
    mintCallsExampleToken(messaging, "support", "local-1"),
    /Check the Number ID, project-token project, and whether client rules are configured/,
  );
  assert.deepEqual(messaging.calls, ["retrieve-rules", "retrieve-session"]);
});

test("mint helper rejects missing Calls actions before minting", async () => {
  const messaging = fakeMessaging({
    configuredRules: { ...rules, allowedActions: "voip_place" },
  });
  await assert.rejects(
    mintCallsExampleToken(messaging, "support", "local-1"),
    /voip_answer,voip_signal/,
  );
  assert.deepEqual(messaging.calls, ["retrieve-rules"]);
});

test("mint helper uses existing rules without requiring sessions:read", async () => {
  const messaging = fakeMessaging({ sessionError: forbidden });
  const token = await mintCallsExampleToken(messaging, "support", "local-1");
  assert.equal(token, "pmfa_ct_example");
  assert.deepEqual(messaging.calls, [
    "retrieve-rules",
    ["mint", { session: "support", ephemeralId: "local-1", ttlSeconds: 900 }],
  ]);
});

test("configure helper refuses to replace existing rules", async () => {
  const messaging = fakeMessaging();
  await assert.rejects(
    configureCallsExampleRules(messaging, "support", "+12025550123"),
    /rules already exist/,
  );
  assert.deepEqual(messaging.calls, ["retrieve-rules"]);
});

test("configure helper uses bounded Calls-only rules when GET returns 404", async () => {
  const messaging = fakeMessaging({
    rulesError: missing,
    sessionError: forbidden,
  });
  await configureCallsExampleRules(messaging, "support", "+12025550123");
  assert.deepEqual(messaging.calls.slice(0, 2), [
    "retrieve-rules",
    "retrieve-session",
  ]);
  const write = messaging.calls[2];
  assert.equal(write[0], "update-rules");
  assert.deepEqual(write[1], {
    recipientMode: "none",
    allowedActions: "voip_place,voip_answer,voip_signal",
    rateLimit: 60,
    maxDaily: 0,
    allowedOrigins: "http://127.0.0.1:5273",
    enabled: true,
    conversationTtlSeconds: 86400,
    maxConcurrency: 1,
    maxSetupsPerMinute: 2,
    allowedNumber: "+12025550123",
  });
});

test("configure helper validates the callee and project before writing", async () => {
  const invalid = fakeMessaging({ rulesError: missing });
  await assert.rejects(
    configureCallsExampleRules(invalid, "support", "555"),
    /POLYMORFA_TEST_CALLEE/,
  );
  assert.deepEqual(invalid.calls, []);

  const hidden = fakeMessaging({ rulesError: missing, sessionError: missing });
  await assert.rejects(
    configureCallsExampleRules(hidden, "support", "+12025550123"),
    /Number unavailable/,
  );
  assert.deepEqual(hidden.calls, ["retrieve-rules", "retrieve-session"]);
});

test("configure helper treats a 503 after the write as an uncertain outcome", async () => {
  const messaging = fakeMessaging({
    rulesError: missing,
    updateError: { status: 503 },
  });
  await assert.rejects(
    configureCallsExampleRules(messaging, "support", "+12025550123"),
    /may have been saved but not applied yet/,
  );
  assert.equal(
    messaging.calls.filter(
      (call) => Array.isArray(call) && call[0] === "update-rules",
    ).length,
    1,
  );
});
