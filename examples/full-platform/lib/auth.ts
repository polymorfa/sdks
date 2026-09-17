export type Role = "agent" | "admin";

export interface Operator {
  readonly userId: string;
  readonly role: Role;
}

export const DEMO_USER_COOKIE = "acme_demo_user";
export const DEMO_ROLE_COOKIE = "acme_demo_role";

/**
 * Demo-only authentication backed by unsigned cookies from /api/demo-login.
 * Replace it with your real session lookup; these cookies prove nothing.
 */
export async function authenticate(request: Request): Promise<Operator | null> {
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
