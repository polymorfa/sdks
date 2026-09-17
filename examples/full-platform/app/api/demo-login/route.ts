import { DEMO_ROLE_COOKIE, DEMO_USER_COOKIE } from "../../../lib/auth.js";

// Development sign-in for the demo. Disabled in production builds.
export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return new Response(null, { status: 404 });
  }
  const form = await request.formData();
  const user = String(form.get("user") ?? "");
  if (!/^[\w.-]{1,64}$/.test(user)) {
    return new Response("Invalid user name.", { status: 400 });
  }
  const role = form.get("role") === "admin" ? "admin" : "agent";
  const cookie = "Path=/; HttpOnly; SameSite=Lax";
  const headers = new Headers({ Location: "/inbox" });
  headers.append("Set-Cookie", `${DEMO_USER_COOKIE}=${user}; ${cookie}`);
  headers.append("Set-Cookie", `${DEMO_ROLE_COOKIE}=${role}; ${cookie}`);
  return new Response(null, { status: 303, headers });
}
