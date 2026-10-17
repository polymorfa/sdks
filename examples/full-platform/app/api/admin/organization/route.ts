import { organization } from "../../../../lib/polymorfa.js";
import { route } from "../../../../lib/route.js";

export const GET = route("admin", async () => {
  const client = organization();
  const [org, members] = await Promise.all([
    client.organizations.retrieve(),
    client.members.list(),
  ]);
  return {
    organization: org.data.data,
    members: members.data.data,
  };
});
