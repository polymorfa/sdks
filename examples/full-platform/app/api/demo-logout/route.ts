import {
  DEMO_ROLE_COOKIE,
  DEMO_USER_COOKIE,
  demoSignInEnabled,
} from "../../../lib/auth.js";

// Clears the demo sign-in cookies.
export async function POST(): Promise<Response> {
  if (!demoSignInEnabled()) {
    return new Response(null, { status: 404 });
  }
  const expired = "Path=/; HttpOnly; SameSite=Lax; Max-Age=0";
  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", `${DEMO_USER_COOKIE}=; ${expired}`);
  headers.append("Set-Cookie", `${DEMO_ROLE_COOKIE}=; ${expired}`);
  return new Response(null, { status: 303, headers });
}
