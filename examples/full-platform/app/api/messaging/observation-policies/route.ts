import { messaging } from "../../../../lib/polymorfa.js";
import { env } from "../../../../lib/env.js";
import { route } from "../../../../lib/route.js";

// Effective presence, typing and label observation for the project and connection.
export const GET = route("admin", async ({ url }) => {
  const policies = messaging().observationPolicies;
  const [projectPolicy, connectionPolicy] = await Promise.all([
    policies.retrieveForProject(env.projectId()),
    policies.retrieveForConnection(
      url.searchParams.get("connection") ?? env.connection(),
    ),
  ]);
  return { project: projectPolicy.data.data, connection: connectionPolicy.data.data };
});
