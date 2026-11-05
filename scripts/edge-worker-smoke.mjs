import { runEdgeRuntimeSmoke } from "./edge-runtime-smoke.mjs";

export default {
  async fetch() {
    try {
      return new Response(await runEdgeRuntimeSmoke());
    } catch (error) {
      return new Response(String(error), { status: 500 });
    }
  },
};
