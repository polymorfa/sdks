import { BrowserConfigurationError } from "../errors.js";
import type { PolymorfaClient } from "./client.js";

export interface ConnectWhatsAppResult {
  /** Hosted QuickLink URL. Polymorfa hosts the pairing UI. */
  readonly url: string;
  readonly id: string;
  readonly expiresAt: string | null;
}

export interface ConnectWhatsAppOptions {
  /**
   * `redirect` (default) navigates this tab, `popup` opens a new tab. Open
   * the popup in the click handler so browsers do not block it.
   */
  readonly target?: "redirect" | "popup";
  readonly signal?: AbortSignal;
  /** Replaces navigation, for tests and custom flows. */
  readonly open?: (url: string) => void;
}

/**
 * Asks your handler to create a QuickLink on the server, then opens the
 * hosted URL. The pairing UI is never embedded in your page.
 */
export async function connectWhatsApp(
  client: PolymorfaClient,
  options: ConnectWhatsAppOptions = {},
): Promise<ConnectWhatsAppResult> {
  // Open the popup synchronously so it counts as user-initiated.
  const popup =
    options.target === "popup" && options.open === undefined
      ? globalThis.open?.("about:blank", "_blank")
      : undefined;
  try {
    const result = await client.request<{
      data?: Partial<ConnectWhatsAppResult>;
    }>("connect", {
      method: "POST",
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    const link = result.data;
    if (
      link === undefined ||
      typeof link.url !== "string" ||
      !isQuickLinkUrl(link.url) ||
      typeof link.id !== "string"
    )
      throw new BrowserConfigurationError(
        "The connect route returned an invalid QuickLink.",
        "invalid_connect_response",
      );
    const value: ConnectWhatsAppResult = {
      url: link.url,
      id: link.id,
      expiresAt: typeof link.expiresAt === "string" ? link.expiresAt : null,
    };
    if (options.open !== undefined) options.open(value.url);
    else if (popup) {
      popup.opener = null;
      popup.location.href = value.url;
    } else globalThis.location?.assign(value.url);
    return value;
  } catch (cause) {
    popup?.close();
    throw cause;
  }
}

/**
 * Whether a QuickLink button may open `value`: an HTTPS URL, or HTTP on
 * `localhost`/`127.0.0.1` for local development against a sandbox API.
 */
export function isQuickLinkUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" ||
      // Local development against a sandbox API.
      (url.protocol === "http:" &&
        (url.hostname === "localhost" || url.hostname === "127.0.0.1"))
    );
  } catch {
    return false;
  }
}

const warnedQuickLink = new Set<string>();

/**
 * Warns once per component in development that a supplied QuickLink URL was
 * rejected. The URL itself is never logged: it is the recipient's credential.
 */
export function warnInvalidQuickLink(component: string): void {
  const env = (
    globalThis as { process?: { env?: Record<string, string | undefined> } }
  ).process?.env?.NODE_ENV;
  if (env === "production" || warnedQuickLink.has(component)) return;
  warnedQuickLink.add(component);
  console.warn(
    `<${component}/>: hidden; url must be an https QuickLink URL your server created.`,
  );
}
