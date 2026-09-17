import type { MessageSendContext, SendMessageRequest } from "@polymorfa/sdk";

import { messaging } from "../../../../lib/polymorfa.js";
import {
  InputError,
  action,
  conversationOf,
  flag,
  idempotencyKey,
  integer,
  object,
  oneOf,
  optionalFlag,
  optionalText,
  route,
  sessionOf,
  text,
  texts,
  type Body,
} from "../../../../lib/route.js";

export const POST = route("agent", async ({ body, request }) => {
  const messages = messaging().messages;
  const session = sessionOf(body);
  const conversation = conversationOf(body);
  switch (action(body)) {
    case "send":
      return messages.send(session, buildMessage(body, { conversation }), {
        idempotencyKey: idempotencyKey(request),
      });
    case "seen":
      return messages.markSeen(session, { conversation, id: text(body, "id") });
    case "typing":
      return messages.setTyping(session, {
        conversation,
        state: oneOf(body, "state", ["typing", "recording", "paused"]),
      });
    case "react":
      return messages.react(
        session,
        {
          conversation,
          id: text(body, "id"),
          // An empty string removes the reaction.
          reaction: typeof body.reaction === "string" ? body.reaction : "",
        },
        { idempotencyKey: idempotencyKey(request) },
      );
    case "star":
      return messages.star(session, {
        conversation,
        id: text(body, "id"),
        star: flag(body, "star"),
      });
    default:
      throw new InputError("Unknown message action.");
  }
});

/** Maps `{ kind, ... }` to the send union. Every contract message kind is covered. */
function buildMessage(
  body: Body,
  context: MessageSendContext,
): SendMessageRequest {
  const replyTo = optionalText(body, "replyTo");
  const base: MessageSendContext = {
    ...context,
    ...(replyTo === undefined ? {} : { quotedMessage: { id: replyTo } }),
  };
  const kind = text(body, "kind");
  switch (kind) {
    case "text":
      return { ...base, content: { text: text(body, "text") } };
    case "image":
    case "video": {
      const caption = optionalText(body, "caption");
      const media = {
        url: text(body, "url"),
        ...(caption === undefined ? {} : { caption }),
      };
      return {
        ...base,
        content: kind === "image" ? { image: media } : { video: media },
      };
    }
    case "file": {
      const filename = optionalText(body, "filename");
      return {
        ...base,
        content: {
          file: {
            url: text(body, "url"),
            ...(filename === undefined ? {} : { filename }),
          },
        },
      };
    }
    case "voice":
      return {
        ...base,
        content: { voice: { url: text(body, "url"), ptt: true } },
      };
    case "template":
      return {
        ...base,
        content: {
          template: {
            name: text(body, "name"),
            language: text(body, "language"),
          },
        },
      };
    case "poll": {
      const multiSelect = optionalFlag(body, "multiSelect");
      return {
        ...base,
        content: {
          poll: {
            title: text(body, "title"),
            options: texts(body, "options"),
            ...(multiSelect === undefined ? {} : { multiSelect }),
          },
        },
      };
    }
    case "location": {
      const location = object(body, "location");
      if (
        typeof location.lat !== "number" ||
        typeof location.long !== "number"
      ) {
        throw new InputError("location needs numeric lat and long.");
      }
      return {
        ...base,
        content: { location: { lat: location.lat, long: location.long } },
      };
    }
    case "contact":
      return { ...base, content: { contact: { vcard: text(body, "vcard") } } };
    case "requestPhoneNumber":
      return { ...base, content: { requestPhoneNumber: {} } };
    case "buttons":
      return {
        ...base,
        content: {
          buttons: {
            body: text(body, "text"),
            buttons: [
              { type: "reply", id: "yes", text: "Yes" },
              { type: "reply", id: "no", text: "No" },
              {
                type: "url",
                text: "Help center",
                url: "https://acme.test/help",
              },
            ],
          },
        },
      };
    case "list":
      return {
        ...base,
        content: {
          list: {
            title: "Acme Support",
            buttonText: "Choose a topic",
            sections: [
              {
                title: "Orders",
                rows: [
                  { id: "track", title: "Track an order" },
                  { id: "return", title: "Start a return" },
                ],
              },
            ],
          },
        },
      };
    case "address":
      return {
        ...base,
        content: {
          addressMessage: { body: "Where should we ship it?", country: "US" },
        },
      };
    case "flow":
      return {
        ...base,
        content: {
          flow: {
            action: "navigate",
            body: "Tell us about your issue.",
            buttonText: "Open form",
            id: text(body, "flowId"),
            token: text(body, "flowToken"),
            screen: "ISSUE",
          },
        },
      };
    case "product":
      return {
        ...base,
        content: {
          product: {
            businessOwnerId: text(body, "businessOwnerId"),
            id: text(body, "productId"),
            title: text(body, "title"),
            currencyCode: "USD",
            priceAmount1000: integer(body, "priceAmount1000"),
          },
        },
      };
    case "productList":
      return {
        ...base,
        content: {
          productList: {
            businessOwnerId: text(body, "businessOwnerId"),
            title: "Recommended",
            buttonText: "View products",
            sections: [{ productIds: texts(body, "productIds") }],
          },
        },
      };
    case "order":
      return {
        ...base,
        content: {
          order: {
            id: text(body, "orderId"),
            sellerId: text(body, "sellerId"),
            itemCount: integer(body, "itemCount"),
            status: "accepted",
            totalAmount1000: integer(body, "totalAmount1000"),
            totalCurrencyCode: "USD",
          },
        },
      };
    default:
      throw new InputError(`Unsupported message kind: ${kind}.`);
  }
}
