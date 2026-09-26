import {
  createBrowserCalls,
  type BrowserCalls,
  type BrowserCallsOptions,
} from "@polymorfa/browser";

export interface NumberConnection {
  readonly id: string;
  readonly label: string;
  readonly calls: BrowserCalls;
  dispose(): Promise<void>;
}

/** The example accepts only a token already authorized for this exact Number. */
export function createNumberConnection(
  input: {
    readonly session: string;
    readonly label: string;
    readonly token: string;
    readonly baseUrl: string;
  },
  callbacks: Pick<BrowserCallsOptions, "onError" | "onDiagnostic"> = {},
  create = createBrowserCalls,
): NumberConnection {
  const session = input.session.trim();
  if (!session || !input.token.trim().startsWith("pmfa_ct_"))
    throw new Error(
      "Enter a Number's session and its pmfa_ct_ browser client token.",
    );
  let token = input.token.trim();
  let disposed = false;
  const calls = create({
    ...callbacks,
    session,
    baseUrl: input.baseUrl,
    // Each closure belongs to one Number. Selection never changes its token.
    getClientToken: () =>
      disposed
        ? Promise.reject(new Error("Number disconnected."))
        : Promise.resolve(token),
  });
  return {
    id: session,
    label: input.label.trim() || session,
    calls,
    dispose: () => {
      disposed = true;
      token = "";
      return calls.dispose();
    },
  };
}

export function hasActiveCall(numbers: readonly NumberConnection[]): boolean {
  return numbers.some(({ calls }) => {
    const snapshot = calls.controller.getSnapshot();
    return (
      snapshot.answering ||
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
