import type { MessageAttachment } from "@polymorfa/browser";

import type { Operator } from "../auth.js";
import { InputError } from "../route.js";
import { emit } from "../realtime.js";
import {
  MemoryHistorySource,
  type HistorySource,
  type MessagePage,
} from "./history.js";
import {
  REPLY_WINDOW_MS,
  type Agent,
  type CallRecord,
  type ContactPatch,
  type DeskContact,
  type DeskMessage,
  type DeskMessageKind,
  type Queue,
  type QuickReply,
  type StoredMedia,
  type Tag,
  type Ticket,
  type TicketAction,
  type TicketDetail,
  type TicketList,
  type TicketQuery,
  type UploadInput,
} from "./types.js";

const MEDIA_LIMIT = 200;
export const MAX_UPLOAD_BYTES = 16 * 1024 * 1024;

/**
 * In-memory ticket, contact and message state. Both data layers use it: the
 * demo seeds it, and the Polymorfa layer fills it from webhooks and sends.
 * It only works for a single server process; use a database in production.
 */
export class DeskStore {
  constructor(readonly history: HistorySource = new MemoryHistorySource()) {}

  readonly agents = new Map<string, Agent>();
  readonly queues = new Map<string, Queue>();
  readonly tags = new Map<string, Tag>();
  readonly quickReplies = new Map<string, QuickReply>();
  readonly contacts = new Map<string, DeskContact>();
  readonly tickets = new Map<string, Ticket>();
  readonly media = new Map<string, StoredMedia>();
  readonly calls: CallRecord[] = [];
  #nextNumber = 1000;

  agentFor(operator: Operator): Agent {
    const existing = this.agents.get(operator.userId);
    if (existing !== undefined) return existing;
    const agent: Agent = {
      id: operator.userId,
      name: titleCase(operator.userId),
      email: `${operator.userId}@acme.test`,
      role: operator.role,
      status: "online",
      color: "#0f766e",
    };
    this.agents.set(agent.id, agent);
    return agent;
  }

  // Contacts --------------------------------------------------------------

  contactByPhone(phone: string): DeskContact | undefined {
    for (const contact of this.contacts.values()) {
      if (contact.phone === phone) return contact;
    }
    return undefined;
  }

  ensureContact(phone: string, name?: string): DeskContact {
    const existing = this.contactByPhone(phone);
    if (existing !== undefined) return existing;
    const contact: DeskContact = {
      id: `ct_${crypto.randomUUID().slice(0, 8)}`,
      name: name ?? phone,
      phone,
      tags: [],
      customFields: {},
      notes: "",
      blocked: false,
      muted: false,
      createdAt: Date.now(),
    };
    this.contacts.set(contact.id, contact);
    return contact;
  }

  listContacts(search?: string): DeskContact[] {
    const needle = search?.trim().toLowerCase();
    return [...this.contacts.values()]
      .filter(
        (contact) =>
          needle === undefined ||
          needle === "" ||
          contact.name.toLowerCase().includes(needle) ||
          contact.phone.includes(needle),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  updateContact(contactId: string, patch: ContactPatch): DeskContact {
    const contact = this.contacts.get(contactId);
    if (contact === undefined) throw new InputError("Unknown contact.");
    const updated: DeskContact = { ...contact, ...patch };
    this.contacts.set(contactId, updated);
    // Tickets embed the contact, so refresh them for connected browsers.
    for (const ticket of this.tickets.values()) {
      if (ticket.contact.id === contactId) {
        this.saveTicket({ ...ticket, contact: updated }, false);
      }
    }
    return updated;
  }

  // Tickets ---------------------------------------------------------------

  nextTicketNumber(): number {
    this.#nextNumber += 1;
    return this.#nextNumber;
  }

  saveTicket(ticket: Ticket, touch = true): Ticket {
    const { windowExpiresAt: _stale, ...rest } = ticket;
    // The reply window is derived here, on the server, never in the browser.
    const saved: Ticket = {
      ...rest,
      ...(touch ? { updatedAt: Date.now() } : {}),
      ...(ticket.lastInboundAt === undefined
        ? {}
        : { windowExpiresAt: ticket.lastInboundAt + REPLY_WINDOW_MS }),
    };
    this.tickets.set(saved.id, saved);
    emit("desk.ticket", saved.connectionId, { ticket: saved });
    return saved;
  }

  ticket(ticketId: string): Ticket {
    const ticket = this.tickets.get(ticketId);
    if (ticket === undefined) throw new InputError("Unknown ticket.");
    return ticket;
  }

  /** The active (open or pending) ticket for a contact, if any. */
  activeTicketFor(contactId: string, connectionId: string): Ticket | undefined {
    for (const ticket of this.tickets.values()) {
      if (
        ticket.contact.id === contactId &&
        ticket.connectionId === connectionId &&
        ticket.status !== "resolved"
      ) {
        return ticket;
      }
    }
    return undefined;
  }

  openTicket(
    contact: DeskContact,
    connectionId: string,
    options: { assigneeId?: string; queueId?: string } = {},
  ): Ticket {
    const active = this.activeTicketFor(contact.id, connectionId);
    if (active !== undefined) return active;
    const now = Date.now();
    const ticket: Ticket = {
      id: `tk_${crypto.randomUUID().slice(0, 8)}`,
      number: this.nextTicketNumber(),
      contact,
      status: options.assigneeId === undefined ? "pending" : "open",
      queueId: options.queueId ?? this.queues.keys().next().value ?? "general",
      ...(options.assigneeId === undefined
        ? {}
        : { assigneeId: options.assigneeId }),
      connectionId,
      unread: 0,
      createdAt: now,
      updatedAt: now,
    };
    return this.saveTicket(ticket);
  }

  listTickets(query: TicketQuery, operator: Operator): TicketList {
    const all = [...this.tickets.values()];
    const matches = (ticket: Ticket) => {
      if (query.queueId && ticket.queueId !== query.queueId) return false;
      if (query.connectionId && ticket.connectionId !== query.connectionId) {
        return false;
      }
      if (query.tag && !ticket.contact.tags.includes(query.tag)) return false;
      if (query.mine && ticket.assigneeId !== operator.userId) return false;
      const needle = query.search?.trim().toLowerCase();
      if (needle) {
        return (
          ticket.contact.name.toLowerCase().includes(needle) ||
          ticket.contact.phone.includes(needle) ||
          String(ticket.number).includes(needle) ||
          (ticket.lastMessage?.preview.toLowerCase().includes(needle) ?? false)
        );
      }
      return true;
    };
    const filtered = all.filter(matches);
    const count = (status: Ticket["status"]) =>
      filtered.filter((ticket) => ticket.status === status).length;
    return {
      tickets: filtered
        .filter((ticket) => ticket.status === query.status)
        .sort(
          (a, b) =>
            (b.lastMessage?.at ?? b.updatedAt) -
            (a.lastMessage?.at ?? a.updatedAt),
        ),
      counts: {
        open: count("open"),
        pending: count("pending"),
        resolved: count("resolved"),
      },
    };
  }

  detail(ticketId: string): TicketDetail {
    const ticket = this.ticket(ticketId);
    const history = [...this.tickets.values()]
      .filter(
        (other) =>
          other.contact.id === ticket.contact.id && other.id !== ticket.id,
      )
      .sort((a, b) => b.createdAt - a.createdAt);
    return { ticket, history };
  }

  applyAction(
    ticketId: string,
    action: TicketAction,
    operator: Operator,
  ): Ticket {
    const ticket = this.ticket(ticketId);
    const agent = this.agentFor(operator);
    switch (action.action) {
      case "markRead":
        return this.saveTicket({ ...ticket, unread: 0 }, false);
      case "accept":
        this.system(ticket.id, `${agent.name} accepted the ticket`);
        return this.saveTicket({
          ...ticket,
          status: "open",
          assigneeId: agent.id,
          unread: 0,
        });
      case "resolve": {
        this.system(ticket.id, `${agent.name} resolved the ticket`);
        return this.saveTicket({
          ...ticket,
          status: "resolved",
          resolvedAt: Date.now(),
        });
      }
      case "reopen": {
        this.system(ticket.id, `${agent.name} reopened the ticket`);
        const { resolvedAt: _resolved, ...rest } = ticket;
        return this.saveTicket({
          ...rest,
          status: "open",
          assigneeId: agent.id,
        });
      }
      case "transfer": {
        const target =
          action.agentId === undefined
            ? undefined
            : this.agents.get(action.agentId);
        const queue =
          action.queueId === undefined
            ? undefined
            : this.queues.get(action.queueId);
        if (target === undefined && queue === undefined) {
          throw new InputError("Choose an agent or a queue.");
        }
        const where = [target?.name, queue?.name].filter(Boolean).join(" · ");
        this.system(
          ticket.id,
          `${agent.name} transferred the ticket to ${where}`,
        );
        const { assigneeId: _previous, ...rest } = ticket;
        return this.saveTicket({
          ...rest,
          ...(queue === undefined ? {} : { queueId: queue.id }),
          ...(target === undefined
            ? { status: "pending" as const }
            : { assigneeId: target.id, status: "open" as const }),
        });
      }
    }
  }

  // Messages --------------------------------------------------------------

  page(ticketId: string, cursor?: string): MessagePage {
    return this.history.page(ticketId, cursor);
  }

  message(ticketId: string, messageId: string): DeskMessage | undefined {
    return this.history.get(ticketId, messageId);
  }

  /** Adds or replaces a message and updates the ticket preview. */
  upsert(message: DeskMessage, options: { countUnread?: boolean } = {}) {
    const added = this.history.record(message);
    const ticket = this.tickets.get(message.ticketId);
    emit("desk.message", ticket?.connectionId ?? "desk", {
      ticketId: message.ticketId,
      message,
    });

    if (!added || message.kind === "system" || ticket === undefined) {
      return message;
    }
    const inbound = message.direction === "inbound";
    this.saveTicket({
      ...ticket,
      lastMessage: {
        preview: previewOf(message),
        kind: message.kind,
        at: message.createdAt,
        direction: message.direction,
        ...(message.note ? { note: true } : {}),
      },
      unread:
        inbound && options.countUnread !== false
          ? ticket.unread + 1
          : ticket.unread,
      ...(inbound ? { lastInboundAt: message.createdAt } : {}),
      ...(!inbound && !message.note && ticket.firstResponseAt === undefined
        ? { firstResponseAt: message.createdAt }
        : {}),
      // A customer writing into a resolved ticket reopens it for the queue.
      ...(inbound && ticket.status === "resolved"
        ? { status: "pending" as const }
        : {}),
    });
    return message;
  }

  patchMessage(
    ticketId: string,
    messageId: string,
    patch: Partial<DeskMessage>,
  ): DeskMessage | undefined {
    const current = this.message(ticketId, messageId);
    if (current === undefined) return undefined;
    return this.upsert({ ...current, ...patch });
  }

  system(ticketId: string, text: string): DeskMessage {
    return this.upsert({
      id: `sys_${crypto.randomUUID()}`,
      ticketId,
      kind: "system",
      text,
      createdAt: Date.now(),
      direction: "inbound",
      status: "sent",
    });
  }

  // Media -----------------------------------------------------------------

  storeMedia(input: UploadInput, baseUrl: string): MessageAttachment {
    if (input.bytes.byteLength > MAX_UPLOAD_BYTES) {
      throw new InputError("The file is larger than 16 MB.");
    }
    const id = `md_${crypto.randomUUID()}`;
    this.media.set(id, {
      name: input.name,
      contentType: input.contentType,
      bytes: input.bytes,
    });
    // Bounded: drop the oldest uploads first.
    while (this.media.size > MEDIA_LIMIT) {
      const oldest = this.media.keys().next().value;
      if (oldest === undefined) break;
      this.media.delete(oldest);
    }
    return {
      id,
      name: input.name,
      size: input.bytes.byteLength,
      contentType: input.contentType,
      url: `${baseUrl}/api/desk/media?id=${encodeURIComponent(id)}`,
    };
  }
}

export function kindOfAttachment(contentType: string): DeskMessageKind {
  if (contentType.startsWith("image/")) return "image";
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("audio/")) return "audio";
  return "document";
}

export function previewOf(message: DeskMessage): string {
  if (message.text.trim() !== "") return message.text;
  switch (message.kind) {
    case "image":
      return "Photo";
    case "video":
      return "Video";
    case "audio":
      return "Voice message";
    case "document":
      return message.attachments?.[0]?.name ?? "Document";
    case "location":
      return message.location?.name ?? "Location";
    case "contact":
      return message.contactCard?.name ?? "Contact";
    case "template":
      return message.template?.name ?? "Template";
    case "sticker":
      return "Sticker";
    case "interactive":
      return message.interactive?.body ?? message.selection?.title ?? "Message";
    default:
      return "";
  }
}

function titleCase(value: string): string {
  return value
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}
