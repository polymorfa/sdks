import { desk } from "../../../../lib/desk/data.js";
import { route } from "../../../../lib/route.js";

export const GET = route("agent", async () => (await desk()).dashboard(), {
  demo: "handler",
});
