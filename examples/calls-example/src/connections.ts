import {
  createBrowserCalls,
  type BrowserCalls,
  type BrowserCallsOptions,
} from "@polymorfa/ui-kit";

export interface CallingConnection {
  readonly id: string;
  readonly label: string;
  readonly calls: BrowserCalls;
  dispose(): Promise<void>;
}

/** The example accepts only a token already authorized for this exact Connection. */
export function createCallingConnection(
  input: {
    readonly connection: string;
    readonly label: string;
    readonly token: string;
    readonly baseUrl: string;
  },
  callbacks: Pick<BrowserCallsOptions, "onError" | "onDiagnostic"> = {},
  create = createBrowserCalls,
): CallingConnection {
  const connection = input.connection.trim();
  if (!connection || !input.token.trim().startsWith("pmfa_ct_"))
    throw new Error(
      "Enter a Connection ID and its pmfa_ct_ browser client token.",
    );
  let token = input.token.trim();
  let disposed = false;
  const calls = create({
    ...callbacks,
    connection,
    baseUrl: input.baseUrl,
    // Each closure belongs to one Connection. Selection never changes its token.
    getClientToken: () =>
      disposed
        ? Promise.reject(new Error("Connection disconnected."))
        : Promise.resolve(token),
  });
  return {
    id: connection,
    label: input.label.trim() || connection,
    calls,
    dispose: () => {
      disposed = true;
      token = "";
      return calls.dispose();
    },
  };
}

export function hasActiveCall(
  connections: readonly CallingConnection[],
): boolean {
  return connections.some(({ calls }) => {
    const snapshot = calls.controller.getSnapshot();
    return (
      snapshot.placing === true ||
      snapshot.answering === true ||
      [
        "ringing",
        "accepted",
        "connecting",
        "connected",
        "reconnecting",
      ].includes(snapshot.status)
    );
  });
}
