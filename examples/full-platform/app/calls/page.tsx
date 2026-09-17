import { Calls } from "./calls.js";

export default function CallsPage() {
  // The session name is not a secret; the token route binds the real session.
  return (
    <>
      <h1>Calls</h1>
      <Calls session={process.env.POLYMORFA_SESSION ?? "support"} />
    </>
  );
}
