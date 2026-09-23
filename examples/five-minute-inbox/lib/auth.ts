/**
 * Stand-in for your own auth (NextAuth, Clerk, Lucia, a session cookie…).
 * Return the signed-in user, or null to answer 401.
 */
export async function currentUser(
  request: Request,
): Promise<{ readonly id: string } | null> {
  const match = /(?:^|;\s*)demo_user=([\w-]{1,64})/.exec(
    request.headers.get("cookie") ?? "",
  );
  return match?.[1] === undefined ? null : { id: match[1] };
}
