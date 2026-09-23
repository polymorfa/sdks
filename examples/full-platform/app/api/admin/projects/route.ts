import { organization } from "../../../../lib/polymorfa.js";
import {
  action,
  flag,
  idempotencyKey,
  object,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

export const GET = route("admin", () => organization().projects.list());

export const POST = route("admin", async ({ body, request }) => {
  const projects = organization().projects;
  const name = action(body);
  if (name === "create") {
    return projects.create(
      { name: text(body, "name"), defaultTier: "standard" },
      { idempotencyKey: idempotencyKey(request) },
    );
  }
  const projectId = text(body, "projectId");
  switch (name) {
    case "settings": {
      const [safeMode, warmup, insurance, health] = await Promise.all([
        projects.getSafeMode(projectId),
        projects.getWarmupPlan(projectId),
        projects.getInsuranceEvidence(projectId),
        projects.getHealthPolicy(projectId),
      ]);
      return {
        safeMode: safeMode.data.data,
        warmup: warmup.data.data,
        insurance: insurance.data.data,
        health: health.data.data,
      };
    }
    case "updateSafeMode":
      return projects.updateSafeMode(projectId, {
        presence: "online_hours",
        onlineStart: 9,
        onlineEnd: 18,
      });
    case "updateWarmupPlan":
      return projects.updateWarmupPlan(projectId, { enabled: true });
    case "updateInsuranceEvidence":
      return projects.updateInsuranceEvidence(projectId, {
        enabled: flag(body, "enabled"),
      });
    case "disableHealthPolicy": {
      const current = (await projects.getHealthPolicy(projectId)).data.data;
      return projects.updateHealthPolicy(projectId, {
        version: current.version,
        enabled: false,
        threshold: current.threshold,
        sessionAction: current.sessionAction,
        slowDownMps: current.slowDownMps,
        emailNotification: current.emailNotification,
        webhookNotification: current.webhookNotification,
      });
    }
    case "requestProduction": {
      const business = object(body, "business");
      return projects.requestProductionEnrollment(
        projectId,
        {
          business: {
            name: text(business, "name"),
            website: text(business, "website"),
            supportEmail: text(business, "supportEmail"),
          },
        },
        { idempotencyKey: idempotencyKey(request) },
      );
    }
    case "approveProduction":
      return projects.approveProductionEnrollment(
        projectId,
        text(body, "operationId"),
      );
    case "cancelProduction":
      return projects.cancelProductionEnrollment(
        projectId,
        text(body, "operationId"),
      );
    default:
      return unknownAction(name);
  }
});
