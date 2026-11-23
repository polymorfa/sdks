import { team } from "../../../../lib/polymorfa.js";
import { action, route, text, unknownAction } from "../../../../lib/route.js";

// Audit trail, leaked-credential incidents and connection bans.
export const GET = route("admin", async ({ url }) => {
  const client = team();
  const auditAction = url.searchParams.get("action") ?? undefined;
  const [auditLogs, incidents, bans, activeBans] = await Promise.all([
    client.auditLogs.list({
      limit: 100,
      ...(auditAction === undefined ? {} : { action: auditAction }),
    }),
    client.securityIncidents.list(),
    client.connectionBans.list(),
    client.connectionBans.listActive(),
  ]);
  return {
    auditLogs: auditLogs.data.data,
    securityIncidents: incidents.data.data,
    connectionBans: bans.data.data,
    activeConnectionBans: activeBans.data.data,
  };
});

export const POST = route("admin", async ({ body }) => {
  switch (action(body)) {
    case "acknowledgeIncident":
      return team().securityIncidents.acknowledge(text(body, "incidentId"));
    default:
      return unknownAction(action(body));
  }
});
