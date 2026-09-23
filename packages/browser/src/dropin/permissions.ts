/**
 * What a drop-in grant can allow. The API enforces the client-token actions
 * (`send_*`, `read_*`, `subscribe_presence`, `voip_*`); your handler enforces
 * the rest on its own routes (`read_messages`, `subscribe_events`,
 * `connect_whatsapp`, `manage_templates`).
 */
export type PolymorfaPermission =
  | "read_messages"
  | "subscribe_events"
  | "send_message"
  | "send_reaction"
  | "send_typing"
  | "send_seen"
  | "read_presence"
  | "subscribe_presence"
  | "read_contact"
  | "voip_place"
  | "voip_answer"
  | "voip_signal"
  | "connect_whatsapp"
  | "manage_templates";

export const POLYMORFA_PERMISSIONS: readonly PolymorfaPermission[] =
  Object.freeze([
    "read_messages",
    "subscribe_events",
    "send_message",
    "send_reaction",
    "send_typing",
    "send_seen",
    "read_presence",
    "subscribe_presence",
    "read_contact",
    "voip_place",
    "voip_answer",
    "voip_signal",
    "connect_whatsapp",
    "manage_templates",
  ]);

/**
 * The grant your server's `mint()` returned, as the token route reports it.
 * The browser reads it only to decide what to render.
 */
export interface PolymorfaGrant {
  readonly session?: string;
  readonly customer?: string;
  /** Conversation IDs the user may read, or `"all"`. */
  readonly conversations: "all" | readonly string[];
  readonly allow: readonly PolymorfaPermission[];
}

const warned = new Set<string>();

function isDevelopment(): boolean {
  const env = (
    globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env?.NODE_ENV;
  return env !== "production";
}

/**
 * Logs one development warning per component and permission, naming the
 * control that was hidden and where to grant it. Production builds log
 * nothing.
 */
export function warnMissingPermission(
  component: string,
  control: string,
  permission: PolymorfaPermission,
): void {
  if (!isDevelopment()) return;
  const key = `${component}:${permission}`;
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(
    `<${component}/>: ${control} hidden; the token lacks "${permission}". Add it to allow in mint().`,
  );
}

/** @internal Resets the once-per-key warning memory for tests. */
export function resetPermissionWarnings(): void {
  warned.clear();
}

export function isPolymorfaGrant(value: unknown): value is PolymorfaGrant {
  if (typeof value !== "object" || value === null) return false;
  const grant = value as Partial<Record<keyof PolymorfaGrant, unknown>>;
  const conversationsValid =
    grant.conversations === "all" ||
    (Array.isArray(grant.conversations) &&
      grant.conversations.every((id) => typeof id === "string"));
  return (
    conversationsValid &&
    Array.isArray(grant.allow) &&
    grant.allow.every((permission) => typeof permission === "string") &&
    (grant.session === undefined || typeof grant.session === "string") &&
    (grant.customer === undefined || typeof grant.customer === "string")
  );
}
