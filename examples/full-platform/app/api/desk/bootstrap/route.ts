import { desk } from "../../../../lib/desk/data.js";
import { route } from "../../../../lib/route.js";

export const GET = route(
  "agent",
  async ({ operator }) => (await desk()).bootstrap(operator),
  { demo: "handler" },
);
