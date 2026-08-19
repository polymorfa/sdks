import { createClientTokenRoute } from "@polymorfa/nextjs";

export const POST = createClientTokenRoute({
  authorize: async (request) => {
    const userId = request.headers.get("x-example-authenticated-user");
    return userId ? { userId } : null;
  },
  mint: async (subject) => {
    // Replace with your server-side Polymorfa client-token minting call.
    return {
      value: `pmfa_ct_example_for_${subject.userId}`,
      audience: "browser",
      expiresAt: Date.now() + 60_000,
    };
  },
});
