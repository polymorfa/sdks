import { Calls } from "./calls.js";

// Read POLYMORFA_SESSION per request, not at build time.
export const dynamic = "force-dynamic";

export default function CallsPage() {
  // The session name is not a secret; the token route binds the real session.
  return (
    <>
      <h1>Calls</h1>
      <Calls session={process.env.POLYMORFA_SESSION ?? "support"} />
    </>
  );
}
