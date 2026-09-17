"use client";

import {
  BrowserCallsApi,
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
import { useEffect, useState } from "react";

import { listen } from "../../lib/browser/realtime.js";

function createCalls(session: string) {
  const transport = new BrowserTransport({
    getClientToken: createClientTokenProvider({
      path: "/api/messaging/calls/token",
    }),
  });
  const signaling = new CallsSignalingClient(transport);
  const api = new BrowserCallsApi(transport);
  // Inbound calls arrive as webhooks on the server and are relayed here.
  const relay = new IncomingCallRelay();
  const controller = new CallsController(
    createSignalingCallsBackend({
      signaling,
      incoming: relay,
      // The client token places the call; the controller supplies the key.
      place: ({ to, video, idempotencyKey }, signal) =>
        api.place({ session, to, video, idempotencyKey }, signal),
    }),
    new WebRtcMediaFactory({ signaling }),
  );
  controller.initialize();

  const unsubscribe = listen({
    "call.received": (event) =>
      relay.receive(
        incomingCallFromWebhook({ callId: event.callId, from: event.from }),
      ),
    "call.ended": (event) => relay.ended(event.callId, event.reason),
  });

  return {
    controller,
    dispose: () => {
      unsubscribe();
      controller.dispose();
    },
  };
}

export function Calls({ session }: { session: string }) {
  const [controller, setController] = useState<CallsController>();

  useEffect(() => {
    const calls = createCalls(session);
    setController(calls.controller);
    return calls.dispose;
  }, [session]);

  if (controller === undefined) return <p>Connecting…</p>;
  return (
    <>
      <DialPad controller={controller} />
      <CallSurface
        controller={controller}
        resolveName={(peer) =>
          peer === "+15550100" ? "Casey Rivera" : undefined
        }
      />
    </>
  );
}
