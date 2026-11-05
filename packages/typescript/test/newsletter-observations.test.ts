import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import {
  constructWebhookDelivery,
  isWebhookEventBatch,
  isEvent,
  webhooks,
  type NewsletterMessageObservation,
  type NewsletterMilestone,
  type NewsletterViewCount,
  type ChannelMessage,
} from "../src/index.js";
const load = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL(
        `../../../contracts/fixtures/newsletter-observations/${name}.json`,
        import.meta.url,
      ),
      "utf8",
    ),
  );
const fixture = load("delivery");
const signed = (value: unknown) => {
  const raw = Buffer.from(JSON.stringify(value));
  return constructWebhookDelivery(
    raw,
    createHmac("sha256", fixture.secret).update(raw).digest("hex"),
    fixture.secret,
  );
};
describe("newsletter metadata", () => {
  it("retains native single and batch observations, including missing, zero and empty fields", async () => {
    const batch = await signed({
      object: "event_batch",
      version: 1,
      id: fixture.batchId,
      events: fixture.events,
    });
    if (!isWebhookEventBatch(batch)) throw new Error("Expected batch");
    for (const [index, expected] of fixture.events.entries()) {
      const event = await signed(expected);
      if (isWebhookEventBatch(event) || !isEvent(event, "newsletter.update"))
        throw new Error("Expected newsletter event");
      expect(event.payload).toEqual(expected.payload);
      expect(batch.events[index]).toEqual(event);
      expectTypeOf(event.payload.messages).toEqualTypeOf<
        readonly NewsletterMessageObservation[] | undefined
      >();
      expectTypeOf(event.payload.milestone).toEqualTypeOf<
        NewsletterMilestone | undefined
      >();
      const roundtrip = await webhooks.createFixture({
        event,
        secret: fixture.secret,
      });
      expect(
        await constructWebhookDelivery(
          roundtrip.body,
          roundtrip.signature,
          fixture.secret,
        ),
      ).toEqual(event);
    }
    const live = batch.events[0];
    if (!live || !isEvent(live, "newsletter.update"))
      throw new Error("Expected live update");
    expect(live.payload.messages?.[0]?.forwards).toBe(0);
    expect(live.payload.messages?.[0]?.reactionCounts).toEqual({});
    expect(live.payload.messages?.[1]).toEqual({ position: 124 });
    expectTypeOf<NewsletterViewCount["count"]>().toEqualTypeOf<number>();
    const channel: ChannelMessage = load("channel-message");
    expect(channel.forwards).toBe(0);
    expectTypeOf(channel.forwards).toEqualTypeOf<number | undefined>();
  });
});
