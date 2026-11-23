import {
  createBrowserCalls,
  type BrowserCalls,
  type PolymorfaClient,
} from "../browser/index.js";
import type { SlotClassNames } from "../appearance/index.js";
import { useState, type ReactNode } from "react";
import { CallSurface } from "./calls.js";
import { Icon, text, useShell, useSlots } from "./components.js";
import { usePermission, usePolymorfa, usePolymorfaClient } from "./context.js";

const shared = new WeakMap<PolymorfaClient, Map<string, BrowserCalls>>();

/**
 * The provider's shared Calls client for a connection, created on first use
 * with the provider's client token.
 */
export function browserCallsFor(
  client: PolymorfaClient,
  connection: string,
): BrowserCalls {
  let byConnection = shared.get(client);
  if (byConnection === undefined) {
    byConnection = new Map();
    shared.set(client, byConnection);
  }
  let calls = byConnection.get(connection);
  if (calls === undefined) {
    calls = createBrowserCalls({
      connection,
      getClientToken: client.getClientToken,
      ...(client.baseUrl === undefined ? {} : { baseUrl: client.baseUrl }),
    });
    byConnection.set(connection, calls);
  }
  return calls;
}

export interface CallButtonProps {
  /** Phone number in E.164 form or a WhatsApp user ID. */
  readonly to: string;
  readonly video?: boolean;
  /** Connection that places the call. Defaults to the grant's connection. */
  readonly connection?: string;
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
  connection,
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
  const resolvedConnection =
    connection ?? client.getSnapshot().grant?.connection;
  if (!allowed || resolvedConnection === undefined) return null;
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
          const instance = browserCallsFor(client, resolvedConnection);
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
