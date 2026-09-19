import {
  createBrowserCalls,
  type BrowserCalls,
  type PolymorfaClient,
} from "@polymorfa/browser";
import type { SlotClassNames } from "@polymorfa/ui";
import { useState, type ReactNode } from "react";
import { CallSurface } from "./calls.js";
import { Icon, text, useShell, useSlots } from "./components.js";
import { usePermission, usePolymorfa, usePolymorfaClient } from "./context.js";

const shared = new WeakMap<PolymorfaClient, Map<string, BrowserCalls>>();

/**
 * The provider's shared Calls client for a session, created on first use
 * with the provider's client token.
 */
export function browserCallsFor(
  client: PolymorfaClient,
  session: string,
): BrowserCalls {
  let bySession = shared.get(client);
  if (bySession === undefined) {
    bySession = new Map();
    shared.set(client, bySession);
  }
  let calls = bySession.get(session);
  if (calls === undefined) {
    calls = createBrowserCalls({
      session,
      getClientToken: client.getClientToken,
      ...(client.baseUrl === undefined ? {} : { baseUrl: client.baseUrl }),
    });
    bySession.set(session, calls);
  }
  return calls;
}

export interface CallButtonProps {
  /** Phone number in E.164 form or a WhatsApp user ID. */
  readonly to: string;
  readonly video?: boolean;
  /** Session that places the call. Defaults to the grant's session. */
  readonly session?: string;
  /** `icon` renders a round icon button, as in the inbox header. */
  readonly variant?: "button" | "icon";
  /** Render the call overlay after placing. Defaults to `true`. */
  readonly surface?: boolean;
  readonly children?: ReactNode;
  readonly onError?: (error: unknown) => void;
  readonly className?: string;
  readonly classNames?: SlotClassNames;
}

/**
 * Places a WhatsApp call with the Calls client. Hidden unless the token
 * allows `voip_place`.
 */
export function CallButton({
  to,
  video = false,
  session,
  variant = "button",
  surface = true,
  children,
  onError,
  className,
  classNames,
}: CallButtonProps) {
  const client = usePolymorfaClient();
  const configuration = usePolymorfa();
  const slots = useSlots(classNames);
  const root = useShell(
    slots,
    "callButton",
    variant === "icon" ? "pmfa-btn pmfa-btn-ghost pmfa-btn-icon" : "pmfa-btn",
    className,
  );
  const allowed = usePermission("CallButton", "button", "voip_place");
  const [calls, setCalls] = useState<BrowserCalls | undefined>();
  const [busy, setBusy] = useState(false);
  const resolvedSession = session ?? client.getSnapshot().grant?.session;
  if (!allowed || resolvedSession === undefined) return null;
  const label = text(configuration, video ? "calls.videoCall" : "calls.call");
  return (
    <>
      <button
        type="button"
        {...root}
        data-pmfa="call-button"
        aria-label={variant === "icon" ? label : undefined}
        title={variant === "icon" ? label : undefined}
        disabled={busy}
        onClick={() => {
          const instance = browserCallsFor(client, resolvedSession);
          setCalls(instance);
          setBusy(true);
          (instance.connected ? Promise.resolve() : instance.connect())
            .then(() => instance.controller.place(to, { video }))
            .catch((error: unknown) => onError?.(error))
            .finally(() => setBusy(false));
        }}
      >
        <Icon name={video ? "video" : "phone"} />
        {variant === "icon" ? null : (children ?? label)}
      </button>
      {surface && calls !== undefined && (
        <CallSurface controller={calls.controller} />
      )}
    </>
  );
}
