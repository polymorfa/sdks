import { isDemoMode } from "./env.js";

export type Role = "agent" | "admin";

export interface Operator {
  readonly userId: string;
  readonly role: Role;
}

export const DEMO_USER_COOKIE = "acme_demo_user";

/**
 * The demo sign-in is available in development, and in production only while
 * the app runs on built-in demo data (no Polymorfa credentials are used then).
 */
export function demoSignInEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || isDemoMode();
}
export const DEMO_ROLE_COOKIE = "acme_demo_role";

/**
 * DEMO ONLY. Anyone can set these unsigned cookies from /api/demo-login (or by
 * hand) and claim any user or the admin role. Replace this function with your
 * real session lookup before deploying this app anywhere. In production with
 * live credentials the cookies are ignored and every request is unauthenticated.
 */
export async function authenticate(request: Request): Promise<Operator | null> {
  // Where demo sign-in is off (production with live credentials), the demo
  // cookies are not honoured at all, so nobody is signed in.
  if (!demoSignInEnabled()) return null;
  const cookies = parseCookies(request.headers.get("cookie"));
  const userId = cookies.get(DEMO_USER_COOKIE);
  if (userId === undefined || !/^[\w.-]{1,64}$/.test(userId)) return null;
  const role = cookies.get(DEMO_ROLE_COOKIE) === "admin" ? "admin" : "agent";
  return { userId, role };
}

function parseCookies(header: string | null): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of header?.split(";") ?? []) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    cookies.set(
      part.slice(0, index).trim(),
      decodeURIComponent(part.slice(index + 1).trim()),
    );
  }
  return cookies;
}
