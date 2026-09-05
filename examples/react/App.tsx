import { QuickLinkController } from "@polymorfa/browser";
import { PolymorfaProvider, QuickLink } from "@polymorfa/react";

const quickLink = new QuickLinkController({
  create: async () => ({
    id: "quicklink_1",
    link: "https://example.test/connect",
    expiresAt: Date.now() + 60_000,
  }),
  recover: async () => ({
    id: "quicklink_1",
    link: "https://example.test/connect",
    expiresAt: Date.now() + 60_000,
  }),
  cancel: async () => undefined,
  subscribe: () => () => undefined,
});

export function App() {
  return (
    <PolymorfaProvider
      appearance={{ theme: "system", variables: { colorPrimary: "#5b4bf7" } }}
    >
      <QuickLink controller={quickLink} />
    </PolymorfaProvider>
  );
}

// ── Calls ─────────────────────────────────────────────────────────────
//
// The browser signs into the signaling surface with a client token minted by
// your server (`MessagingClient.voip.token`). Inbound calls reach your server
// as the `call.received` webhook; relay them to the browser and hand them to
// the relay below.
import {
  BrowserTransport,
  CallsController,
  CallsSignalingClient,
  IncomingCallRelay,
  WebRtcMediaFactory,
  createClientTokenProvider,
  createSignalingCallsBackend,
  incomingCallFromWebhook,
} from "@polymorfa/browser";
import { CallSurface, DialPad } from "@polymorfa/react";

const callTransport = new BrowserTransport({
  getClientToken: createClientTokenProvider(),
});
const callSignaling = new CallsSignalingClient(callTransport);
export const incomingCalls = new IncomingCallRelay();
const calls = new CallsController(
  createSignalingCallsBackend({
    signaling: callSignaling,
    incoming: incomingCalls,
  }),
  new WebRtcMediaFactory({ signaling: callSignaling }),
);
calls.initialize();

/** Wire this to your realtime channel that forwards the webhook payload. */
export function onCallReceivedWebhook(payload: {
  callId: string;
  from: { id?: string; phoneNumber?: string; lid?: string };
  hasVideo?: boolean;
}): void {
  incomingCalls.receive(incomingCallFromWebhook(payload));
}

export function CallsApp() {
  return (
    <PolymorfaProvider appearance={{ theme: "system" }}>
      <DialPad controller={calls} />
      <CallSurface
        controller={calls}
        resolveName={(peer) =>
          peer === "+12025550123" ? "Casey Rivera" : undefined
        }
      />
    </PolymorfaProvider>
  );
}
