import { createHmac } from "node:crypto";

import { describe, expect, expectTypeOf, it } from "vitest";

import { WebhookSignatureError } from "../src/webhooks/verify.js";
import {
  KNOWN_WEBHOOK_EVENT_TYPES,
  type CallEndedPayload,
  type CallTelemetryPayload,
  constructWebhookEvent,
  isEvent,
  verifyWebhookSignature,
  type MessageReceivedEvent,
} from "../src/webhooks/index.js";

const raw = Buffer.from(
  '{"id":"evt_1","session":"support","timestamp":"2026-08-19T10:00:00Z","event":"message.received","payload":{"id":"m1","from":{"id":"chat"},"sender":{"id":"sender"},"fromMe":false,"timestamp":1787133600,"pushName":"Ada","isGroup":false,"type":"text","text":"Hello"}}',
);
const signature =
  "52c730509d65561d9394c024bfef1e3787821749b97d6b5664c39f467a16a5b2";

function sign(body: Uint8Array, secret = "fixture-secret"): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

describe("verifyWebhookSignature", () => {
  it("accepts the native hexadecimal signature over the exact raw bytes", async () => {
    await expect(
      verifyWebhookSignature(raw, signature, "fixture-secret"),
    ).resolves.toBe(true);
  });

  it("accepts the sha256-prefixed compatibility form", async () => {
    await expect(
      verifyWebhookSignature(raw, `sha256=${signature}`, "fixture-secret"),
    ).resolves.toBe(true);
  });

  it("rejects mutated bytes, the wrong secret, and malformed signatures", async () => {
    await expect(
      verifyWebhookSignature(
        Buffer.concat([raw, Buffer.from(" ")]),
        signature,
        "fixture-secret",
      ),
    ).resolves.toBe(false);
    await expect(
      verifyWebhookSignature(raw, signature, "wrong-secret"),
    ).resolves.toBe(false);
    await expect(
      verifyWebhookSignature(raw, "not-hex", "fixture-secret"),
    ).resolves.toBe(false);
  });
});

describe("constructWebhookEvent", () => {
  it("verifies before parsing and narrows a known event", async () => {
    const event = await constructWebhookEvent(raw, signature, "fixture-secret");
    expect(isEvent(event, "message.received")).toBe(true);
    if (isEvent(event, "message.received")) {
      expectTypeOf(event).toEqualTypeOf<MessageReceivedEvent>();
      expect(event.payload.id).toBe("m1");
    }
  });

  it.each([null, { id: "15550100@s.whatsapp.net" }])(
    "preserves terminal caller identity %j through signature verification",
    async (from) => {
      const payload: CallEndedPayload = {
        from,
        callId: "call-555",
        durationSeconds: 42,
        reason: from === null ? "pod_lost" : "user_hangup",
        direction: "outbound",
        hadVideo: false,
      };
      const body = Buffer.from(
        JSON.stringify({
          id: "event-555",
          session: "support",
          timestamp: "2026-09-07T00:00:00Z",
          event: "call.ended",
          payload,
        }),
      );
      const event = await constructWebhookEvent(
        body,
        sign(body),
        "fixture-secret",
      );
      expect(KNOWN_WEBHOOK_EVENT_TYPES).toContain("call.ended");
      expect(isEvent(event, "call.ended")).toBe(true);
      if (isEvent(event, "call.ended")) {
        expectTypeOf(event.payload).toEqualTypeOf<CallEndedPayload>();
        expect(event.payload).toEqual(payload);
        expect(event.payload.from?.id ?? null).toBe(from?.id ?? null);
      }
    },
  );

  it("exposes terminal telemetry without reinterpreting cumulative kilobits", async () => {
    const payload: CallTelemetryPayload = {
      callId: "call-555",
      setupMs: 300,
      ringMs: 2000,
      durationSeconds: 42,
      terminateReason: "user_hangup",
      codec: "opus",
      jitterMs: 4,
      packetsLost: 2,
      rttMs: 35,
      recvKbps: 450,
      sendKbps: 460,
    };
    const body = Buffer.from(
      JSON.stringify({
        id: "telemetry-555",
        session: "support",
        timestamp: "2026-09-07T00:00:00Z",
        event: "call.telemetry",
        payload,
      }),
    );
    const event = await constructWebhookEvent(
      body,
      sign(body),
      "fixture-secret",
    );
    expect(KNOWN_WEBHOOK_EVENT_TYPES).toContain("call.telemetry");
    expect(isEvent(event, "call.telemetry")).toBe(true);
    if (isEvent(event, "call.telemetry")) {
      expectTypeOf(event.payload).toEqualTypeOf<CallTelemetryPayload>();
      expect(event.payload).toEqual(payload);
    }
  });

  it("preserves unknown event names and payloads", async () => {
    const body = Buffer.from(
      '{"id":"evt_future","session":"support","timestamp":"2026-08-19T10:00:00Z","event":"future.ready","payload":{"capability":42}}',
    );
    const event = await constructWebhookEvent(
      body,
      sign(body),
      "fixture-secret",
    );
    expect(event).toMatchObject({
      event: "future.ready",
      payload: { capability: 42 },
    });
    expect(isEvent(event, "message.received")).toBe(false);
  });

  it("rejects an invalid signature before exposing parse failures", async () => {
    const invalidJson = Buffer.from("not json");
    await expect(
      constructWebhookEvent(invalidJson, signature, "fixture-secret"),
    ).rejects.toThrow(WebhookSignatureError);
  });

  it("rejects signed invalid JSON, invalid UTF-8, and incomplete envelopes", async () => {
    const invalidJson = Buffer.from("not json");
    await expect(
      constructWebhookEvent(invalidJson, sign(invalidJson), "fixture-secret"),
    ).rejects.toThrow(/valid JSON/);

    const invalidUtf8 = Buffer.from([0xff]);
    await expect(
      constructWebhookEvent(invalidUtf8, sign(invalidUtf8), "fixture-secret"),
    ).rejects.toThrow(/UTF-8/);

    const incomplete = Buffer.from('{"event":"message.received","payload":{}}');
    await expect(
      constructWebhookEvent(incomplete, sign(incomplete), "fixture-secret"),
    ).rejects.toThrow(/event envelope/);
  });
});
