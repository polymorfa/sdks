import { messaging } from "../../../../lib/polymorfa.js";
import { env } from "../../../../lib/env.js";
import { route } from "../../../../lib/route.js";

// Effective presence, typing and label observation for the project and session.
export const GET = route("admin", async ({ url }) => {
  const policies = messaging().observationPolicies;
  const [projectPolicy, sessionPolicy] = await Promise.all([
    policies.retrieveForProject(env.projectId()),
    policies.retrieveForSession(
      url.searchParams.get("session") ?? env.session(),
    ),
  ]);
  return { project: projectPolicy.data.data, session: sessionPolicy.data.data };
});
