import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  constructWebhookDelivery,
  isWebhookEventBatch,
  WebhookSignatureError,
} from "../src/webhooks/index.js";
import type {
  CampaignPausedPayload,
  CampaignRecipientSkippedPayload,
} from "../src/index.js";
const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../contracts/fixtures/campaign-webhook-metadata.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const signed = (value: unknown) => {
  const raw = JSON.stringify(value);
  return constructWebhookDelivery(
    raw,
    createHmac("sha256", fixture.secret).update(raw).digest("hex"),
    fixture.secret,
  );
};
describe("accepted campaign webhook metadata", () => {
  it("retains exact typed single and mixed-batch values and omission", async () => {
    expectTypeOf<CampaignPausedPayload["reason"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<CampaignPausedPayload["code"]>().toEqualTypeOf<
      string | undefined
    >();
    expectTypeOf<
      CampaignRecipientSkippedPayload["messageIndex"]
    >().toEqualTypeOf<number | undefined>();
    expectTypeOf<CampaignRecipientSkippedPayload["followUpId"]>().toEqualTypeOf<
      string | undefined
    >();
    for (const event of fixture.events)
      expect(await signed(event)).toEqual(event);
    const batch = await signed({
      object: "event_batch",
      version: 1,
      id: fixture.batchId,
      events: fixture.events,
    });
    expect(isWebhookEventBatch(batch)).toBe(true);
    if (!isWebhookEventBatch(batch)) throw new Error("expected mixed batch");
    expect(batch.events).toEqual(fixture.events);
    const automatic = batch.events[0];
    const manual = batch.events[1];
    const zero = batch.events[2];
    const follow = batch.events[3];
    if (
      automatic?.event !== "campaign.paused" ||
      manual?.event !== "campaign.paused" ||
      zero?.event !== "campaign.recipient_skipped" ||
      follow?.event !== "campaign.recipient_skipped"
    )
      throw new Error("order changed");
    expect(automatic.payload.code).toBe("future_automatic_pause");
    expect(automatic.payload.pausedAt).toBe(1757161200);
    expect(manual.payload).not.toHaveProperty("reason");
    expect(manual.payload).not.toHaveProperty("code");
    expect(zero.payload.messageIndex).toBe(0);
    expect(zero.payload.skippedAt).toBe(1757161200000);
    expect(follow.payload.followUpId).toBe(
      "0198a2cb-0000-7000-8000-0000000000f1",
    );
    expect(batch.events[4]?.payload).not.toHaveProperty("messageIndex");
  });
  it("preserves the existing envelope-only malformed-payload policy and verifies signatures first", async () => {
    const bad = {
      ...fixture.events[0],
      payload: { ...fixture.events[0].payload, code: [] },
    };
    expect(await signed(bad)).toEqual(bad);
    await expect(
      constructWebhookDelivery("not JSON", "bad", fixture.secret),
    ).rejects.toBeInstanceOf(WebhookSignatureError);
    const raw = JSON.stringify(fixture.events[0]);
    const sig = createHmac("sha256", fixture.secret).update(raw).digest("hex");
    await expect(
      constructWebhookDelivery(raw + " ", sig, fixture.secret),
    ).rejects.toBeInstanceOf(WebhookSignatureError);
  });
});
