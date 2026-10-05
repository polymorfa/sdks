import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  KNOWN_WEBHOOK_EVENT_TYPES,
  MessagingClient,
  PolymorfaConflictError,
  type OrderDetailsMessageContent,
  type OrderPaymentUpdatedPayload,
  type OrderStatusMessageContent,
  type SendMessageRequest,
  type WebhookPayloadMap,
} from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import messaging from "../../../contracts/openapi.messaging.json" with { type: "json" };

function client(fetch: typeof globalThis.fetch) {
  return new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl: "https://api.example.com",
    maxNetworkRetries: 0,
    fetch,
  });
}

const order: SendMessageRequest = {
  conversation: { phoneNumber: "+5511987654321" },
  content: {
    orderDetails: {
      referenceId: "order-1522",
      type: "physical-goods",
      body: "Your order",
      currency: "BRL",
      totalAmount: { value: 5500, offset: 100 },
      paymentSettings: {
        paymentLink: { uri: "https://pay.example.com/c/1522" },
      },
      order: {
        items: [
          {
            retailerId: "cake-1",
            name: "Cake",
            amount: { value: 2500, offset: 100 },
            quantity: 2,
          },
        ],
        subtotal: { value: 5000, offset: 100 },
        tax: { value: 0, offset: 100 },
        shipping: { value: 500, offset: 100 },
      },
    },
  },
};

describe("Brazil payment orders (beta)", () => {
  it("sends order details unchanged to the native send route", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        success: true,
        data: { id: "1", type: "order_details", status: "sent" },
      }),
    );
    await client(fetch).messages.send("store", order);
    const [url, init] = fetch.mock.calls[0]!;
    expect(new URL(String(url)).pathname).toBe(
      "/messaging/store/messages/send",
    );
    expect(JSON.parse(String(init?.body))).toEqual(order);
  });

  it("requires a payment setting, and an itemized order for a header image", () => {
    type Details = OrderDetailsMessageContent;
    const base = {
      referenceId: "r",
      type: "digital-goods",
      body: "b",
      currency: "BRL",
      totalAmount: { value: 1, offset: 100 },
    } as const;
    expectTypeOf({
      ...base,
      paymentSettings: { boleto: { digitableLine: "1" } },
    }).toMatchTypeOf<Details>();
    expectTypeOf({ ...base, paymentSettings: {} }).not.toMatchTypeOf<Details>();
    expectTypeOf({
      ...base,
      paymentSettings: { boleto: { digitableLine: "1" } },
      headerImageUrl: "https://x",
    }).not.toMatchTypeOf<Details>();
  });

  it("types order status updates that need order, payment, or both", () => {
    expectTypeOf<{
      referenceId: "r";
      body: "b";
      payment: { status: "captured" };
    }>().toMatchTypeOf<OrderStatusMessageContent>();
    expectTypeOf<{
      referenceId: "r";
      body: "b";
    }>().not.toMatchTypeOf<OrderStatusMessageContent>();
  });

  it("surfaces WhatsApp's order status transition refusal", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        {
          error: {
            type: "conflict_error",
            code: "order_status_transition_invalid",
            message: "No.",
            param: null,
            request_id: "5f0c2a8e-3b1d-4c6f-9e2a-7d4b1c8f6a30",
          },
          data: null,
        },
        { status: 409 },
      ),
    );
    const failure = await client(fetch)
      .messages.send("store", {
        conversation: { phoneNumber: "+5511987654321" },
        content: {
          orderStatus: {
            referenceId: "order-1522",
            body: "Shipped",
            order: { status: "shipped" },
          },
        },
      })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(PolymorfaConflictError);
    expect((failure as PolymorfaConflictError).code).toBe(
      "order_status_transition_invalid",
    );
  });

  it("types order.payment_updated from the pinned contract", () => {
    expect(KNOWN_WEBHOOK_EVENT_TYPES).toContain("order.payment_updated");
    expectTypeOf<
      WebhookPayloadMap["order.payment_updated"]
    >().toEqualTypeOf<OrderPaymentUpdatedPayload>();
    const schema = (
      messaging.components.schemas as Record<
        string,
        { properties?: Record<string, unknown>; required?: string[] }
      >
    ).OrderPaymentUpdatedPayload!;
    type AnyKey<T> = T extends T ? keyof T : never;
    const typed: Record<AnyKey<OrderPaymentUpdatedPayload>, true> = {
      kind: true,
      reportedBy: true,
      providerEventId: true,
      referenceId: true,
      conversation: true,
      status: true,
      amount: true,
      currency: true,
      transaction: true,
      messageId: true,
      paymentMethod: true,
      lastFourDigits: true,
      credentialId: true,
      paymentTimestamp: true,
    };
    expect(Object.keys(schema.properties!).sort()).toEqual(
      Object.keys(typed).sort(),
    );
    // Fields the contract requires are required on every variant.
    expect([...schema.required!].sort()).toEqual([
      "conversation",
      "kind",
      "providerEventId",
      "referenceId",
      "reportedBy",
    ]);
    expectTypeOf<
      Extract<OrderPaymentUpdatedPayload, { kind: "payment_status" }>["status"]
    >().toEqualTypeOf<string>();
    expectTypeOf<
      Extract<OrderPaymentUpdatedPayload, { kind: "payment_status" }>["amount"]
    >().toEqualTypeOf<
      { readonly value: number; readonly offset: number } | undefined
    >();
  });
});
