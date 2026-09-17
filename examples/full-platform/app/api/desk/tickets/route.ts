import { desk } from "../../../../lib/desk/data.js";
import type { TicketAction, TicketStatus } from "../../../../lib/desk/types.js";
import {
  action,
  oneOf,
  optionalText,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

const STATUSES: readonly TicketStatus[] = ["open", "pending", "resolved"];

// GET ?id=... returns one ticket with the contact's history; otherwise a
// filtered list with per-status counts.
export const GET = route(
  "agent",
  async ({ url, operator }) => {
    const data = await desk();
    const id = url.searchParams.get("id");
    if (id !== null) return data.getTicket(id);
    const query = Object.fromEntries(url.searchParams);
    const status = oneOf(query, "status", STATUSES);
    const pick = (key: string) => {
      const value = query[key];
      return value === undefined || value === "" ? {} : { [key]: value };
    };
    return data.listTickets(
      {
        status,
        ...pick("search"),
        ...pick("queueId"),
        ...pick("tag"),
        ...pick("connectionId"),
        ...(query.mine === "true" ? { mine: true } : {}),
      },
      operator,
    );
  },
  { demo: "handler" },
);

export const POST = route(
  "agent",
  async ({ body, operator }) => {
    const data = await desk();
    const name = action(body);
    if (name === "create") {
      const connectionId = optionalText(body, "connectionId");
      return data.createTicket(
        {
          phone: text(body, "phone").replace(/[\s()-]/g, ""),
          ...(connectionId === undefined ? {} : { connectionId }),
        },
        operator,
      );
    }
    const ticketId = text(body, "ticketId");
    let change: TicketAction;
    switch (name) {
      case "accept":
      case "resolve":
      case "reopen":
      case "markRead":
        change = { action: name };
        break;
      case "transfer": {
        const agentId = optionalText(body, "agentId");
        const queueId = optionalText(body, "queueId");
        change = {
          action: "transfer",
          ...(agentId === undefined ? {} : { agentId }),
          ...(queueId === undefined ? {} : { queueId }),
        };
        break;
      }
      default:
        return unknownAction(name);
    }
    return data.updateTicket(ticketId, change, operator);
  },
  { demo: "handler" },
);
