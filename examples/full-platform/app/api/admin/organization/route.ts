import { organization } from "../../../../lib/polymorfa.js";
import { env } from "../../../../lib/env.js";
import { action, route, text, unknownAction } from "../../../../lib/route.js";

export const GET = route("admin", async () => {
  const client = organization();
  const [org, members, apiKeys, projectTokens] = await Promise.all([
    client.organizations.retrieve(),
    client.members.list(),
    client.apiKeys.list(),
    client.projectTokens.list(env.projectId()),
  ]);
  return {
    organization: org.data.data,
    members: members.data.data,
    // Key and token metadata only; secrets are never returned.
    apiKeys: apiKeys.data.data,
    projectTokens: projectTokens.data.data,
  };
});

export const POST = route("admin", async ({ body }) => {
  switch (action(body)) {
    case "deactivateApiKey":
      return organization().apiKeys.deactivate(text(body, "keyId"));
    default:
      return unknownAction(action(body));
  }
});
