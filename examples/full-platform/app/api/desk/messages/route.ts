import type { MessageAttachment } from "@polymorfa/browser";

import { desk } from "../../../../lib/desk/data.js";
import type { SendInput } from "../../../../lib/desk/types.js";
import {
  InputError,
  action,
  flag,
  idempotencyKey,
  object,
  optionalFlag,
  optionalText,
  route,
  text,
  texts,
  unknownAction,
  type Body,
} from "../../../../lib/route.js";

export const GET = route(
  "agent",
  async ({ url }) => {
    const ticketId = url.searchParams.get("ticket");
    if (ticketId === null) throw new InputError("ticket is required.");
    return (await desk()).listMessages(
      ticketId,
      url.searchParams.get("cursor") ?? undefined,
    );
  },
  { demo: "handler" },
);

export const POST = route(
  "agent",
  async ({ body, operator, request }) => {
    const data = await desk();
    const ticketId = text(body, "ticketId");
    switch (action(body)) {
      case "send":
        return data.sendMessage(
          ticketId,
          sendInput(body),
          operator,
          idempotencyKey(request),
        );
      case "react":
        await data.react(
          ticketId,
          text(body, "messageId"),
          typeof body.emoji === "string" ? body.emoji.slice(0, 16) : "",
        );
        return { ok: true };
      case "typing":
        await data.setTyping(ticketId, flag(body, "typing"));
        return { ok: true };
      case "presence":
        return data.presence(ticketId);
      default:
        return unknownAction(action(body));
    }
  },
  { demo: "handler" },
);

function sendInput(body: Body): SendInput {
  const clientId = text(body, "clientId");
  const kind = text(body, "kind");
  switch (kind) {
    case "text": {
      const replyTo = optionalText(body, "replyTo");
      const note = optionalFlag(body, "note");
      const attachments = readAttachments(body.attachments);
      const content = typeof body.text === "string" ? body.text : "";
      if (content.trim() === "" && attachments.length === 0) {
        throw new InputError("A message needs text or an attachment.");
      }
      if (content.length > 4096) {
        throw new InputError("Messages are limited to 4096 characters.");
      }
      return {
        kind,
        clientId,
        text: content,
        ...(replyTo === undefined ? {} : { replyTo }),
        ...(note === undefined ? {} : { note }),
        ...(attachments.length === 0 ? {} : { attachments }),
      };
    }
    case "location": {
      const location = object(body, "location");
      const { lat, long } = location;
      if (
        typeof lat !== "number" ||
        typeof long !== "number" ||
        Math.abs(lat) > 90 ||
        Math.abs(long) > 180
      ) {
        throw new InputError("location needs a valid lat and long.");
      }
      const name = optionalText(location, "name");
      return {
        kind,
        clientId,
        lat,
        long,
        ...(name === undefined ? {} : { name }),
      };
    }
    case "contact":
      return {
        kind,
        clientId,
        name: text(body, "name"),
        phone: text(body, "phone"),
      };
    case "template": {
      const values: Record<string, string> = {};
      if (body.values !== undefined) {
        for (const [key, value] of Object.entries(object(body, "values"))) {
          if (typeof value !== "string" || value.length > 200) {
            throw new InputError("Template values must be short strings.");
          }
          values[key] = value;
        }
      }
      return {
        kind,
        clientId,
        templateId: text(body, "templateId"),
        ...(Object.keys(values).length === 0 ? {} : { values }),
      };
    }
    case "buttons": {
      const buttons = texts(body, "buttons").map((item) => item.slice(0, 20));
      if (buttons.length < 1 || buttons.length > 3) {
        throw new InputError("Buttons messages have 1 to 3 buttons.");
      }
      return {
        kind: "interactive",
        clientId,
        interactive: { type: "buttons", body: text(body, "text"), buttons },
      };
    }
    case "list": {
      const rows = texts(body, "rows").map((item) => item.slice(0, 24));
      if (rows.length < 1 || rows.length > 10) {
        throw new InputError("List messages have 1 to 10 rows.");
      }
      return {
        kind: "interactive",
        clientId,
        interactive: {
          type: "list",
          body: text(body, "text"),
          buttonText: text(body, "buttonText").slice(0, 20),
          rows,
        },
      };
    }
    default:
      throw new InputError(`Unsupported message kind: ${kind}.`);
  }
}

// Only attachments uploaded through /api/desk/media are accepted.
function readAttachments(value: unknown): MessageAttachment[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 10) {
    throw new InputError("attachments must be an array of up to 10 files.");
  }
  return value.map((item: unknown) => {
    const entry = (item ?? {}) as Body;
    const url = text(entry, "url");
    const parsed = new URL(url, "http://local");
    if (parsed.pathname !== "/api/desk/media") {
      throw new InputError("Attachments must be uploaded first.");
    }
    const size = entry.size;
    return {
      id: text(entry, "id"),
      name: text(entry, "name"),
      contentType: text(entry, "contentType"),
      size: typeof size === "number" ? size : 0,
      url,
    };
  });
}
