import { bridge, system } from "../../../../lib/polymorfa.js";
import { route } from "../../../../lib/route.js";

// Platform status plus the regional Bridge route for this project.
export const GET = route("admin", async () => {
  const status = system();
  const [health, version, bridgeRoute] = await Promise.all([
    status.health(),
    status.version(),
    bridge().routes.resolve(),
  ]);
  return {
    health: health.data,
    version: version.data,
    // The URL is a short-lived connection target; do not cache it past expiresAt.
    bridge: {
      wsUrl: bridgeRoute.data.wsUrl,
      region: bridgeRoute.data.region,
      kind: bridgeRoute.data.kind,
      expiresAt: bridgeRoute.data.expiresAt,
    },
  };
});
