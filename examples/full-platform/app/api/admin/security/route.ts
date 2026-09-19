import { organization } from "../../../../lib/polymorfa.js";
import { action, route, text, unknownAction } from "../../../../lib/route.js";

// Audit trail, leaked-credential incidents and session bans.
export const GET = route("admin", async ({ url }) => {
  const client = organization();
  const auditAction = url.searchParams.get("action") ?? undefined;
  const [auditLogs, incidents, bans, activeBans] = await Promise.all([
    client.auditLogs.list({
      limit: 100,
      ...(auditAction === undefined ? {} : { action: auditAction }),
    }),
    client.securityIncidents.list(),
    client.sessionBans.list(),
    client.sessionBans.listActive(),
  ]);
  return {
    auditLogs: auditLogs.data.data,
    securityIncidents: incidents.data.data,
    sessionBans: bans.data.data,
    activeSessionBans: activeBans.data.data,
  };
});

export const POST = route("admin", async ({ body }) => {
  switch (action(body)) {
    case "acknowledgeIncident":
      return organization().securityIncidents.acknowledge(
        text(body, "incidentId"),
      );
    default:
      return unknownAction(action(body));
  }
});
