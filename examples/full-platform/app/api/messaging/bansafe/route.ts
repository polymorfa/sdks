import { messaging } from "../../../../lib/polymorfa.js";
import { env } from "../../../../lib/env.js";
import { action, flag, route, unknownAction } from "../../../../lib/route.js";

// BanSafe settings through the Messaging API.
export const GET = route("admin", async ({ body, sessionOf }) => {
  const banSafe = messaging().banSafe;
  const projectId = env.projectId();
  const [safeMode, warmup, insurance, health, session] = await Promise.all([
    banSafe.getProjectSafeMode(projectId),
    banSafe.getProjectWarmupPlan(projectId),
    banSafe.getProjectInsuranceEvidence(projectId),
    banSafe.getProjectHealthPolicy(projectId),
    banSafe.getSessionSafeMode(sessionOf(body)),
  ]);
  return {
    safeMode: safeMode.data.data,
    warmup: warmup.data.data,
    insurance: insurance.data.data,
    health: health.data.data,
    session: session.data.data,
  };
});

export const POST = route("admin", async ({ body, sessionOf }) => {
  const banSafe = messaging().banSafe;
  const projectId = env.projectId();
  switch (action(body)) {
    case "safeMode":
      return banSafe.updateProjectSafeMode(projectId, {
        presence: "online_while_sending",
        typing: "before_text",
        reads: "replied_chats",
        pacing: "conversation",
      });
    case "warmup":
      return banSafe.updateProjectWarmupPlan(projectId, {
        enabled: true,
        warmupDays: 14,
        dailyStart: 20,
      });
    case "insurance":
      return banSafe.updateProjectInsuranceEvidence(projectId, {
        enabled: flag(body, "enabled"),
      });
    case "healthPolicy": {
      // The policy update is versioned: read it, then write the whole policy.
      const current = await banSafe.getProjectHealthPolicy(projectId);
      const policy = current.data.data;
      return banSafe.updateProjectHealthPolicy(projectId, {
        version: policy.version,
        enabled: true,
        threshold: 40,
        sessionAction: "slow_down",
        slowDownMps: 1,
        emailNotification: policy.integrations.emailConfigured,
        webhookNotification: policy.integrations.webhookConfigured,
      });
    }
    case "sessionSafeMode":
      return banSafe.updateSessionSafeMode(sessionOf(body), {
        presence: "inherit",
        typing: "inherit",
        reads: "all_inbound",
        pacing: "inherit",
      });
    default:
      return unknownAction(action(body));
  }
});
