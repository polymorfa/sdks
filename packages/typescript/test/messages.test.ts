import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  MessagingClient,
  graphTransportHeaders,
  type AddressMessageContent,
  type ButtonsMessageContent,
  type FlowMessageContent,
  type ListMessageContent,
  type MessageButton,
  type MessageTemplateSend,
  type OrderMessageContent,
  type ProductListMessageContent,
  type ProductMessageContent,
  type QuotedMessage,
  type SendAddressMessageRequest,
  type SendButtonsMessageRequest,
  type SendContactMessageRequest,
  type SendFlowMessageRequest,
  type SendListMessageRequest,
  type SendLocationMessageRequest,
  type SendMediaMessageRequest,
  type SendMessageRequest,
  type SendOrderMessageRequest,
  type SendPhoneNumberRequest,
  type SendPollMessageRequest,
  type SendProductListMessageRequest,
  type SendProductMessageRequest,
  type SendTemplateMessageRequest,
  type SendTextMessageRequest,
} from "../src/index.js";
import {
  startTestServer,
  type RecordedRequest,
  type TestServer,
} from "./support/http-server.js";

const servers: TestServer[] = [];

it("restricts media fields to their documented kind", () => {
  const conversation = { id: "739182640518203" };
  const file: SendMediaMessageRequest = {
    conversation,
    content: {
      file: { url: "https://example.test/file", filename: "report.pdf" },
    },
  };
  const voice: SendMediaMessageRequest = {
    conversation,
    content: { voice: { base64: "YQ==", ptt: true } },
  };
  const image: SendMediaMessageRequest = {
    conversation,
    content: {
      // @ts-expect-error Only files accept filename.
      image: { url: "https://example.test/image", filename: "image.png" },
    },
  };
  const video: SendMediaMessageRequest = {
    conversation,
    // @ts-expect-error Only voice messages accept ptt.
    content: { video: { url: "https://example.test/video", ptt: true } },
  };
  expect([file, voice, image, video]).toHaveLength(4);
});

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function messagesServer(): Promise<{
  client: MessagingClient;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer(() => ({
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_messages",
    },
    body: '{"success":true,"data":{"id":"message-1","timestamp":"2026-08-19T19:00:00.000Z","status":"sent","senderLid":"sender@lid","fromLid":"sender@lid"}}',
  }));
  servers.push(server);
  return {
    requests: server.requests,
    client: new MessagingClient({
      credential: {
        type: "apiKey",
        value: ORGANIZATION_API_KEY,
      },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
  };
}

describe("MessagingClient message types", () => {
  it("exports exact quoted-message and structured-send payloads", () => {
    expectTypeOf<QuotedMessage>().toEqualTypeOf<{
      readonly id: string;
      readonly type?: string;
      readonly text?: string;
    }>();
    expectTypeOf<MessageButton>().toEqualTypeOf<
      | { readonly type: "url"; readonly text: string; readonly url: string }
      | {
          readonly type: "call";
          readonly text: string;
          readonly phoneNumber: string;
        }
      | { readonly type: "reply"; readonly text: string; readonly id: string }
      | {
          readonly type: "copy";
          readonly text: string;
          readonly copyCode: string;
        }
      | {
          readonly type: "catalog";
          readonly text: string;
          readonly businessPhoneNumber: string;
          readonly catalogProductId?: string;
        }
    >();
    expectTypeOf<ButtonsMessageContent>().toEqualTypeOf<{
      readonly title?: string;
      readonly body: string;
      readonly footer?: string;
      readonly buttons: readonly MessageButton[];
    }>();
    expectTypeOf<ListMessageContent>().toHaveProperty("sections");
    expectTypeOf<ProductMessageContent>().toHaveProperty("businessOwnerId");
    expectTypeOf<ProductListMessageContent>().toHaveProperty("sections");
    expectTypeOf<OrderMessageContent>().toHaveProperty("totalAmount1000");
    expectTypeOf<AddressMessageContent>().toHaveProperty("body");
    expectTypeOf<FlowMessageContent>().toHaveProperty("action");
    expectTypeOf<MessageTemplateSend>().toEqualTypeOf<{
      readonly name: string;
      readonly language: string;
      readonly components?: readonly unknown[];
    }>();
  });

  it("exports focused requests that remain assignable to the canonical send contract", () => {
    expectTypeOf<SendTextMessageRequest>().toMatchTypeOf<SendMessageRequest>();
    expectTypeOf<SendMediaMessageRequest>().toMatchTypeOf<SendMessageRequest>();
    expectTypeOf<SendPollMessageRequest>().toMatchTypeOf<SendMessageRequest>();
    expectTypeOf<SendLocationMessageRequest>().toMatchTypeOf<SendMessageRequest>();
    expectTypeOf<SendContactMessageRequest>().toMatchTypeOf<SendMessageRequest>();
    expectTypeOf<SendProductMessageRequest>().toMatchTypeOf<SendMessageRequest>();
    expectTypeOf<SendProductListMessageRequest>().toMatchTypeOf<SendMessageRequest>();
    expectTypeOf<SendOrderMessageRequest>().toMatchTypeOf<SendMessageRequest>();
    expectTypeOf<SendPhoneNumberRequest>().toMatchTypeOf<SendMessageRequest>();
    expectTypeOf<SendListMessageRequest>().toMatchTypeOf<SendMessageRequest>();
    expectTypeOf<SendButtonsMessageRequest>().toMatchTypeOf<SendMessageRequest>();
    expectTypeOf<SendAddressMessageRequest>().toMatchTypeOf<SendMessageRequest>();
    expectTypeOf<SendFlowMessageRequest>().toMatchTypeOf<SendMessageRequest>();
    expectTypeOf<SendTemplateMessageRequest>().toMatchTypeOf<SendMessageRequest>();
  });
});

describe("MessagingClient message routes", () => {
  it("sends typed text, media, location, contact, poll, buttons, list, and template bodies through the one source route", async () => {
    const { client, requests } = await messagesServer();
    const session = "support/eu";

    const sends: readonly SendMessageRequest[] = [
      {
        conversation: { phoneNumber: "+15551234567" },
        content: { text: "Hello" },
        quotedMessage: {
          id: "739182640518204",
          type: "text",
          text: "Earlier",
        },
      },
      {
        conversation: { phoneNumber: "+15551234567" },
        content: {
          image: {
            url: "https://cdn.example.test/photo.jpg",
            caption: "Photo",
          },
        },
        isForwarded: true,
      },
      {
        conversation: { phoneNumber: "+15551234567" },
        content: {
          location: { lat: 33.8938, long: 35.5018, address: "Beirut" },
        },
      },
      {
        conversation: { phoneNumber: "+15551234567" },
        content: { contact: { vcard: "BEGIN:VCARD\nFN:Ada\nEND:VCARD" } },
      },
      {
        conversation: { phoneNumber: "+15551234567" },
        content: {
          poll: { title: "Choose", options: ["A", "B"], multiSelect: false },
        },
      },
      {
        conversation: { phoneNumber: "+15551234567" },
        content: {
          buttons: {
            body: "Choose an action",
            buttons: [{ type: "reply", text: "Continue", id: "continue" }],
          },
        },
      },
      {
        conversation: { phoneNumber: "+15551234567" },
        content: {
          list: {
            title: "Topics",
            buttonText: "Open",
            sections: [{ rows: [{ id: "billing", title: "Billing" }] }],
          },
        },
      },
      {
        conversation: { phoneNumber: "+15551234567" },
        content: { template: { name: "order_ready", language: "en_US" } },
      },
    ];

    for (const body of sends) {
      await client.messages.send(session, body, {
        idempotencyKey: `send-${Object.keys(body.content)[0]}`,
        apiVersion: "next",
      });
    }

    expect(requests).toHaveLength(8);
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual(
      Array(8).fill("POST /messaging/support%2Feu/messages/send"),
    );
    expect(requests[0]?.body).toBe(JSON.stringify(sends[0]));
    expect(requests[1]?.body).toBe(JSON.stringify(sends[1]));
    expect(requests[0]?.headers["polymorfa-version"]).toBe("next");
    expect(requests[0]?.headers["idempotency-key"]).toBe("send-text");
  });

  it("forwards the Official typing inbound message ID without dropping it", async () => {
    const { client, requests } = await messagesServer();
    const body = {
      conversation: { id: "739182640518203" },
      id: "739182640518204",
      state: "typing" as const,
    };
    await client.messages.setTyping("support", body);
    expect(requests).toHaveLength(1);
    expect(JSON.parse(requests[0]!.body)).toEqual(body);
    expect(requests[0]!.path).toBe("/messaging/support/messages/typing");
  });

  it("keeps actions on their exact message and chat routes", async () => {
    const { client, requests } = await messagesServer();
    const options = { idempotencyKey: "message-action" } as const;

    await client.messages.markSeen(
      "support/eu",
      { conversation: { id: "739182640518203" }, id: "739182640518204" },
      options,
    );
    await client.messages.setTyping(
      "support/eu",
      { conversation: { id: "739182640518203" }, state: "typing" },
      options,
    );
    await client.messages.react(
      "support/eu",
      {
        conversation: { id: "739182640518203" },
        id: "739182640518204",
        reaction: "👍",
      },
      options,
    );
    await client.messages.star(
      "support/eu",
      {
        conversation: { id: "739182640518203" },
        id: "739182640518204",
        star: true,
      },
      options,
    );
    await client.chats.editMessage(
      "support/eu",
      "chat/1",
      "message/1",
      { text: "Corrected" },
      options,
    );
    await client.chats.deleteMessage(
      "support/eu",
      "chat/1",
      "message/1",
      options,
    );

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /messaging/support%2Feu/messages/seen",
      "POST /messaging/support%2Feu/messages/typing",
      "POST /messaging/support%2Feu/messages/react",
      "POST /messaging/support%2Feu/messages/star",
      "PUT /messaging/support%2Feu/chats/chat%2F1/messages/message%2F1",
      "DELETE /messaging/support%2Feu/chats/chat%2F1/messages/message%2F1",
    ]);
    expect(requests.map(({ headers }) => headers["idempotency-key"])).toEqual(
      Array(6).fill("message-action"),
    );
  });
});

it("preserves explicit transport for send, reaction, edit, deletion and raw Graph requests", async () => {
  const server = await startTestServer(() => ({
    headers: {
      "content-type": "application/json",
      "x-polymorfa-transport": "official_api",
      "x-polymorfa-routing-reason": "explicit_transport",
      "x-polymorfa-operation-id": "operation-1",
    },
    body: JSON.stringify({ success: true, data: {} }),
  }));
  servers.push(server);
  const client = new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const result = await client.messages.send("number", {
    conversation: { phoneNumber: "+14155550123" },
    content: { text: "Hello" },
    transport: "official_api",
  });
  await client.messages.react("number", {
    conversation: { phoneNumber: "+14155550123" },
    id: "message-1",
    reaction: "👍",
    transport: "linked_devices",
  });
  await client.chats.editMessage("number", "chat", "message", {
    text: "Edited",
    transport: "linked_devices",
  });
  await client.chats.deleteMessage("number", "chat", "message", {
    transport: "linked_devices",
  });
  await client.raw.request({
    method: "POST",
    path: "/graph/v23.0/phone/messages",
    body: { type: "text" },
    headers: graphTransportHeaders("official_api"),
  });
  expect(
    server.requests
      .slice(0, 3)
      .map((request) => JSON.parse(request.body).transport),
  ).toEqual(["official_api", "linked_devices", "linked_devices"]);
  expect(server.requests[3]!.path).toBe(
    "/messaging/number/chats/chat/messages/message?transport=linked_devices",
  );
  expect(server.requests[4]!.headers["x-polymorfa-transport"]).toBe(
    "official_api",
  );
  expect(result.metadata).toMatchObject({
    transport: "official_api",
    routingReason: "explicit_transport",
    operationId: "operation-1",
  });
});

it("surfaces an uncertain accepted operation once and reads its status without another send", async () => {
  const server = await startTestServer((request) =>
    request.method === "POST"
      ? {
          status: 409,
          headers: {
            "content-type": "application/json",
            "x-polymorfa-operation-id": "operation-1",
          },
          body: JSON.stringify({
            error: {
              code: "send_outcome_unknown",
              message: "Outcome unknown",
              type: "conflict_error",
            },
          }),
        }
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            success: true,
            data: { operationId: "operation-1", status: "unknown" },
          }),
        },
  );
  servers.push(server);
  const client = new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
    maxNetworkRetries: 2,
  });
  await expect(
    client.messages.send("number", {
      conversation: { phoneNumber: "+14155550123" },
      content: { text: "Hello" },
      transport: "official_api",
    }),
  ).rejects.toMatchObject({
    code: "send_outcome_unknown",
    metadata: { operationId: "operation-1", attempts: 1 },
  });
  expect(
    (await client.messages.operationStatus("number", "operation-1")).data.data
      .status,
  ).toBe("unknown");
  expect(server.requests.map((value) => value.method)).toEqual(["POST", "GET"]);
});
