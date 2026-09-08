import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  MessagingClient,
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
      readonly messageId: string;
      readonly participant: string;
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
    expectTypeOf<ProductMessageContent>().toHaveProperty("businessOwnerJid");
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
        chatId: "15551234567@s.whatsapp.net",
        type: "text",
        text: "Hello",
        quotedMessage: {
          messageId: "quoted-1",
          participant: "15551234567@s.whatsapp.net",
          type: "text",
          text: "Earlier",
        },
      },
      {
        chatId: "15551234567@s.whatsapp.net",
        type: "image",
        url: "https://cdn.example.test/photo.jpg",
        caption: "Photo",
        isForwarded: true,
      },
      {
        chatId: "15551234567@s.whatsapp.net",
        type: "location",
        latitude: 33.8938,
        longitude: 35.5018,
        address: "Beirut",
      },
      {
        chatId: "15551234567@s.whatsapp.net",
        type: "contact",
        vcard: "BEGIN:VCARD\nFN:Ada\nEND:VCARD",
      },
      {
        chatId: "15551234567@s.whatsapp.net",
        type: "poll",
        pollTitle: "Choose",
        pollOptions: ["A", "B"],
        pollMultiSelect: false,
      },
      {
        chatId: "15551234567@s.whatsapp.net",
        type: "buttons",
        buttons: {
          body: "Choose an action",
          buttons: [{ type: "reply", text: "Continue", id: "continue" }],
        },
      },
      {
        chatId: "15551234567@s.whatsapp.net",
        type: "list",
        list: {
          title: "Topics",
          buttonText: "Open",
          sections: [{ rows: [{ id: "billing", title: "Billing" }] }],
        },
      },
      {
        chatId: "15551234567@s.whatsapp.net",
        type: "text",
        template: { name: "order_ready", language: "en_US" },
      },
    ];

    for (const body of sends) {
      await client.messages.send(session, body, {
        idempotencyKey: `send-${body.type}`,
        apiVersion: "next",
      });
    }

    expect(requests).toHaveLength(8);
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual(
      Array(8).fill("POST /api/support%2Feu/messages/send"),
    );
    expect(requests[0]?.body).toBe(JSON.stringify(sends[0]));
    expect(requests[1]?.body).toBe(JSON.stringify(sends[1]));
    expect(requests[0]?.headers["polymorfa-version"]).toBe("next");
    expect(requests[0]?.headers["idempotency-key"]).toBe("send-text");
  });

  it("keeps actions on their exact message and chat routes", async () => {
    const { client, requests } = await messagesServer();
    const options = { idempotencyKey: "message-action" } as const;

    await client.messages.markSeen(
      "support/eu",
      { chatId: "chat/1", messageId: "message/1" },
      options,
    );
    await client.messages.setTyping(
      "support/eu",
      { chatId: "chat/1", state: "typing" },
      options,
    );
    await client.messages.react(
      "support/eu",
      { chatId: "chat/1", messageId: "message/1", reaction: "👍" },
      options,
    );
    await client.messages.star(
      "support/eu",
      { chatId: "chat/1", messageId: "message/1", star: true },
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
      "POST /api/support%2Feu/messages/seen",
      "POST /api/support%2Feu/messages/typing",
      "POST /api/support%2Feu/messages/react",
      "POST /api/support%2Feu/messages/star",
      "PUT /api/support%2Feu/chats/chat%2F1/messages/message%2F1",
      "DELETE /api/support%2Feu/chats/chat%2F1/messages/message%2F1",
    ]);
    expect(requests.map(({ headers }) => headers["idempotency-key"])).toEqual(
      Array(6).fill("message-action"),
    );
  });
});
