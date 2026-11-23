import type { BanSafeConnection } from "@polymorfa/sdk";

import { team } from "../../../../lib/polymorfa.js";
import { env } from "../../../../lib/env.js";
import {
  action,
  idempotencyKey,
  optionalText,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

// Team-wide BanSafe reads. `listHealth` pages with `page.nextCursor`.
export const GET = route("admin", async () => {
  const banSafe = team().banSafe;
  const projectId = env.projectId();
  const numbers: BanSafeConnection[] = [];
  let cursor: string | undefined;
  // At most 20 pages (2,000 numbers); stop if the cursor does not advance.
  for (let pages = 0; pages < 20; pages += 1) {
    const page = await banSafe.listHealth({
      projectId,
      limit: 100,
      ...(cursor === undefined ? {} : { cursor }),
    });
    numbers.push(...page.data.data);
    const next = page.data.page.nextCursor ?? undefined;
    if (next === undefined || next === cursor) break;
    cursor = next;
  }

  const [
    signals,
    collection,
    findings,
    enforcement,
    incidents,
    claims,
    actions,
  ] = await Promise.all([
    banSafe.listSignals(),
    banSafe.listCollection({ projectId }),
    banSafe.listFindings({ projectId, status: "open", severity: "critical" }),
    banSafe.listEnforcement({ projectId }),
    banSafe.listIncidents({ projectId }),
    banSafe.listClaims({ projectId }),
    banSafe.listHealthActions({ projectId }),
  ]);
  return {
    numbers,
    signals: signals.data.data,
    collection: collection.data.data,
    findings: findings.data.data,
    enforcement: enforcement.data.data,
    incidents: incidents.data.data,
    claims: claims.data.data,
    healthActions: actions.data.data,
  };
});

export const POST = route("admin", async ({ body, request }) => {
  const banSafe = team().banSafe;
  switch (action(body)) {
    case "number": {
      const connection = text(body, "connection");
      const [health, history, telemetry, telemetryHistory] = await Promise.all([
        banSafe.getHealth(connection),
        banSafe.listHealthHistory(connection, { limit: 30 }),
        banSafe.getTelemetry(connection),
        banSafe.listTelemetryHistory(connection, { limit: 24 }),
      ]);
      return {
        health: health.data.data,
        history: history.data.data,
        telemetry: telemetry.data.data,
        telemetryHistory: telemetryHistory.data.data,
      };
    }
    case "reportIncident": {
      const note = optionalText(body, "note");
      return banSafe.createIncident(
        {
          connection: text(body, "connection"),
          ...(note === undefined ? {} : { note }),
        },
        { idempotencyKey: idempotencyKey(request) },
      );
    }
    case "retractIncident":
      return banSafe.retractIncident(text(body, "incidentId"));
    case "claim":
      return banSafe.getClaim(text(body, "claimId"));
    default:
      return unknownAction(action(body));
  }
});
