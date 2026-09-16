// ── Calls ─────────────────────────────────────────────────────────────
//
// The browser uses a client token minted by your server with
// `POST /platform/client-tokens` (see the Next.js token route example). The
// token needs the voip_place, voip_answer, and voip_signal client-rule
// actions. `createBrowserCalls` receives incoming calls, places calls, and
// connects media; the components render its controller.
import {
  createBrowserCalls,
  createClientTokenProvider,
} from "@polymorfa/browser";
import { CallSurface, DialPad, PolymorfaProvider } from "@polymorfa/react";

const calls = createBrowserCalls({
  session: "support",
  getClientToken: createClientTokenProvider(),
  onError: (error) => {
    // "unauthorized": the token was revoked or expired; the next reconnect
    // asks createClientTokenProvider for a new one.
    console.warn("Calls:", error.code);
  },
});

/** Start receiving calls once the application is ready. */
export function startCalls(): Promise<void> {
  return calls.connect();
}

/** Release media and connections when the application unloads. */
export function stopCalls(): Promise<void> {
  return calls.dispose();
}

export function CallsApp() {
  return (
    <PolymorfaProvider appearance={{ theme: "system" }}>
      <DialPad controller={calls.controller} />
      {/* exclusive={false}: other participants keep ringing and can join. */}
      <CallSurface
        controller={calls.controller}
        exclusive={false}
        resolveName={(peer) =>
          peer === "+12025550123" ? "Casey Rivera" : undefined
        }
      />
    </PolymorfaProvider>
  );
}
