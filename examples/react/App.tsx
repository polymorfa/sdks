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
  type CallEndReason,
  type CallReceivedWebhookPayload,
} from "@polymorfa/browser";
import { CallSurface, DialPad } from "@polymorfa/react";

const callTransport = new BrowserTransport({
  getClientToken: createClientTokenProvider(),
});
const callSignaling = new CallsSignalingClient(callTransport);
// Webhook-only integration: the application relays BOTH `call.received` and
// `call.ended` from its own realtime channel. (With `CallsSocket` as the
// backend's `incoming` source neither handler is needed — the socket pushes
// the lifecycle itself.)
export const incomingCalls = new IncomingCallRelay();
const calls = new CallsController(
  createSignalingCallsBackend({
    signaling: callSignaling,
    incoming: incomingCalls,
    // Outbound calls start on the server: the client token cannot dial a
    // destination. This route places the call with the server SDK and answers
    // with the platform's call id, which is what media then attaches to.
    place: async ({ to, video, line }, signal) => {
      const response = await fetch("/api/calls/place", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to, video, line }),
        signal,
      });
      if (!response.ok) throw new Error("The call could not be placed.");
      const { callId } = (await response.json()) as { callId: string };
      return callId;
    },
  }),
  new WebRtcMediaFactory({ signaling: callSignaling }),
);
calls.initialize();

/** Wire this to your realtime channel that forwards the `call.received` webhook payload. */
export function onCallReceivedWebhook(
  payload: CallReceivedWebhookPayload,
): void {
  incomingCalls.receive(incomingCallFromWebhook(payload));
}

/** Wire this to the same channel for `call.ended`, so a remote hang-up ends the UI promptly. */
export function onCallEndedWebhook(payload: {
  callId: string;
  reason?: CallEndReason;
}): void {
  incomingCalls.ended(payload.callId, payload.reason);
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
