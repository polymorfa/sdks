import type { MessageAttachment } from "@polymorfa/browser";

import type { Operator } from "../auth.js";
import { emit, emitWebhook } from "../realtime.js";
import { InputError } from "../route.js";
import type { DeskData, MessagePage } from "./data.js";
import {
  DEMO_CONNECTIONS,
  DEMO_TEMPLATES,
  demoCampaigns,
  sampleVoiceNote,
  seedStore,
} from "./seed.js";
import { DeskStore, kindOfAttachment } from "./store.js";
import {
  isE164,
  windowOpen,
  type Bootstrap,
  type CallRecord,
  type CampaignInput,
  type Connection,
  type ConnectionAction,
  type ContactPatch,
  type DashboardStats,
  type DeskCampaign,
  type DeskContact,
  type DeskMessage,
  type DeskTemplate,
  type Presence,
  type QuickReply,
  type SendInput,
  type StoredMedia,
  type Tag,
  type Ticket,
  type TicketAction,
  type TicketDetail,
  type TicketList,
  type TicketQuery,
  type UploadInput,
} from "./types.js";

const AUTO_REPLIES = [
  "Thanks! 🙏",
  "Got it, that helps.",
  "Perfect, I will wait for the update.",
  "Could you also check my other order?",
  "👍",
  "Awesome, thank you so much!",
];

/**
 * Demo data layer: every read and write works on seeded in-memory data, and
 * sends simulate delivery, read receipts and occasional customer replies.
 */
export class MockDesk implements DeskData {
  readonly demo = true;
  readonly #store = new DeskStore();
  readonly #connections = new Map<string, Connection>(
    DEMO_CONNECTIONS.map((connection) => [connection.id, connection]),
  );
  readonly #campaigns = new Map<string, DeskCampaign>(
    demoCampaigns().map((campaign) => [campaign.id, campaign]),
  );
  readonly #presence = new Map<string, Presence>();

  constructor() {
    seedStore(this.#store, sampleVoiceNote());
  }

  async bootstrap(operator: Operator): Promise<Bootstrap> {
    const agent = this.#store.agentFor(operator);
    return {
      me: { agent, demo: true },
      agents: [...this.#store.agents.values()],
      queues: [...this.#store.queues.values()],
      tags: await this.listTags(),
      connections: await this.listConnections(),
      quickReplies: await this.listQuickReplies(),
      customFieldNames: ["Plan", "Account ID", "City"],
    };
  }

  async listTickets(
    query: TicketQuery,
    operator: Operator,
  ): Promise<TicketList> {
    return this.#store.listTickets(query, operator);
  }

  async getTicket(ticketId: string): Promise<TicketDetail> {
    return this.#store.detail(ticketId);
  }

  async createTicket(
    input: { phone: string; connectionId?: string },
    operator: Operator,
  ): Promise<Ticket> {
    if (!isE164(input.phone)) {
      throw new InputError(
        "Enter the number in E.164 format, like +14155550123.",
      );
    }
    const connectionId = input.connectionId ?? "support-main";
    if (!this.#connections.has(connectionId)) {
      throw new InputError("Unknown connection.");
    }
    const contact = this.#store.ensureContact(input.phone);
    const agent = this.#store.agentFor(operator);
    const ticket = this.#store.openTicket(contact, connectionId, {
      assigneeId: agent.id,
    });
    this.#store.system(ticket.id, `${agent.name} started a conversation`);
    return this.#store.ticket(ticket.id);
  }

  async updateTicket(
    ticketId: string,
    action: TicketAction,
    operator: Operator,
  ): Promise<Ticket> {
    return this.#store.applyAction(ticketId, action, operator);
  }

  async listMessages(ticketId: string, cursor?: string): Promise<MessagePage> {
    this.#store.ticket(ticketId);
    return this.#store.page(ticketId, cursor);
  }

  async sendMessage(
    ticketId: string,
    input: SendInput,
    operator: Operator,
  ): Promise<DeskMessage> {
    const ticket = this.#store.ticket(ticketId);
    const agent = this.#store.agentFor(operator);
    const note = input.kind === "text" && input.note === true;
    if (!note) assertCanSend(ticket, input);
    const base = {
      id: `msg_${crypto.randomUUID()}`,
      clientId: input.clientId,
      ticketId,
      createdAt: Date.now(),
      direction: "outbound" as const,
      status: "sent" as const,
      authorId: agent.id,
    };
    const message = this.#store.upsert(
      buildOutbound(input, base, DEMO_TEMPLATES, ticket),
    );
    if (ticket.status === "pending" && !note) {
      this.#store.applyAction(ticketId, { action: "accept" }, operator);
    }
    if (!note) this.#simulateDelivery(ticketId, message.id);
    return message;
  }

  async react(ticketId: string, messageId: string, emoji: string) {
    const message = this.#store.message(ticketId, messageId);
    if (message === undefined) throw new InputError("Unknown message.");
    const others = (message.reactions ?? []).filter((item) => !item.fromMe);
    this.#store.patchMessage(ticketId, messageId, {
      reactions: emoji === "" ? others : [...others, { emoji, fromMe: true }],
    });
  }

  async setTyping(): Promise<void> {
    // The demo customer has no device to show typing on.
  }

  async presence(ticketId: string): Promise<Presence> {
    return (
      this.#presence.get(ticketId) ?? {
        state: Number(ticketId.at(-1)) % 2 === 0 ? "online" : "offline",
        lastSeen: this.#store.ticket(ticketId).contact.lastSeenAt ?? Date.now(),
      }
    );
  }

  async uploadMedia(input: UploadInput): Promise<MessageAttachment> {
    return this.#store.storeMedia(input, "");
  }

  async readMedia(mediaId: string): Promise<StoredMedia | null> {
    return this.#store.media.get(mediaId) ?? null;
  }

  async listContacts(search?: string): Promise<readonly DeskContact[]> {
    return this.#store.listContacts(search);
  }

  async updateContact(contactId: string, patch: ContactPatch) {
    const updated = this.#store.updateContact(contactId, patch);
    this.#recountTags();
    return updated;
  }

  async importContacts(rows: readonly { name: string; phone: string }[]) {
    let imported = 0;
    let skipped = 0;
    for (const row of rows) {
      if (!isE164(row.phone) || this.#store.contactByPhone(row.phone)) {
        skipped += 1;
        continue;
      }
      this.#store.ensureContact(row.phone, row.name || row.phone);
      imported += 1;
    }
    return { imported, skipped };
  }

  async listTemplates(): Promise<readonly DeskTemplate[]> {
    return DEMO_TEMPLATES;
  }

  async listQuickReplies(): Promise<readonly QuickReply[]> {
    return [...this.#store.quickReplies.values()];
  }

  async saveQuickReply(input: {
    id?: string;
    shortcut: string;
    message: string;
  }): Promise<QuickReply> {
    const reply = {
      ...input,
      id: input.id ?? `qr_${crypto.randomUUID().slice(0, 8)}`,
    };
    this.#store.quickReplies.set(reply.id, reply);
    return reply;
  }

  async deleteQuickReply(id: string): Promise<void> {
    this.#store.quickReplies.delete(id);
  }

  async listTags(): Promise<readonly Tag[]> {
    return [...this.#store.tags.values()];
  }

  async saveTag(input: { id?: string; name: string; color: number }) {
    const existing =
      input.id === undefined ? undefined : this.#store.tags.get(input.id);
    const tag: Tag = {
      id: input.id ?? `lb_${crypto.randomUUID().slice(0, 8)}`,
      name: input.name,
      color: input.color,
      chatCount: existing?.chatCount ?? 0,
    };
    this.#store.tags.set(tag.id, tag);
    return tag;
  }

  async deleteTag(id: string): Promise<void> {
    this.#store.tags.delete(id);
    for (const contact of this.#store.contacts.values()) {
      if (contact.tags.includes(id)) {
        this.#store.updateContact(contact.id, {
          tags: contact.tags.filter((tag) => tag !== id),
        });
      }
    }
  }

  async listConnections(): Promise<readonly Connection[]> {
    return [...this.#connections.values()];
  }

  async connectionAction(
    connectionId: string,
    action: ConnectionAction,
    phone?: string,
  ): Promise<Readonly<Record<string, unknown>>> {
    const connection = this.#connections.get(connectionId);
    if (connection === undefined) throw new InputError("Unknown connection.");
    const set = (status: string) =>
      this.#connections.set(connectionId, { ...connection, status });
    switch (action) {
      case "qr":
        return { qr: `demo-${connectionId}-${Date.now()}` };
      case "pairingCode":
        if (phone === undefined || !isE164(phone)) {
          throw new InputError("Enter the phone number in E.164 format.");
        }
        return { code: "ACME-4F2K" };
      case "delete":
        this.#connections.delete(connectionId);
        return { deleted: true };
      case "logout":
        set("logged_out");
        return { status: "logged_out" };
      case "stop":
        set("stopped");
        return { status: "stopped" };
      case "start":
      case "restart":
        set("connecting");
        setTimeout(() => {
          const current = this.#connections.get(connectionId);
          if (current === undefined) return;
          this.#connections.set(connectionId, {
            ...current,
            status: "connected",
          });
          emitWebhook("session.status", connectionId, { status: "connected" });
        }, 2000);
        return { status: "connecting" };
    }
  }

  async createQuickLink(): Promise<{ url: string; expiresAt: string }> {
    // A real QuickLink URL points at the hosted Polymorfa page.
    return {
      url: `https://link.polymorfa.com/demo/${crypto.randomUUID().slice(0, 8)}`,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    };
  }

  async listCampaigns(): Promise<readonly DeskCampaign[]> {
    return [...this.#campaigns.values()].sort(
      (a, b) => b.createdAt - a.createdAt,
    );
  }

  async createCampaign(input: CampaignInput): Promise<DeskCampaign> {
    const recipients =
      input.audience === "all"
        ? this.#store.contacts.size
        : [...this.#store.contacts.values()].filter((contact) =>
            contact.tags.includes(input.tag ?? ""),
          ).length;
    const campaign: DeskCampaign = {
      id: `cmp_${crypto.randomUUID().slice(0, 8)}`,
      name: input.name,
      status: input.scheduledAt === undefined ? "running" : "scheduled",
      templateId: input.templateId,
      recipientCount: recipients,
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      failedCount: 0,
      scheduledAt: input.scheduledAt ?? Date.now(),
      createdAt: Date.now(),
    };
    this.#campaigns.set(campaign.id, campaign);
    if (campaign.status === "running") this.#progress(campaign.id);
    return campaign;
  }

  async campaignAction(
    campaignId: string,
    action: "launch" | "pause" | "resume" | "stop",
  ): Promise<DeskCampaign> {
    const campaign = this.#campaigns.get(campaignId);
    if (campaign === undefined) throw new InputError("Unknown campaign.");
    const status = {
      launch: "running",
      resume: "running",
      pause: "paused",
      stop: "stopped",
    }[action];
    const updated = { ...campaign, status };
    this.#campaigns.set(campaignId, updated);
    emit("desk.campaign", "desk", { campaign: updated });
    if (status === "running") this.#progress(campaignId);
    return updated;
  }

  async dashboard(): Promise<DashboardStats> {
    const tickets = [...this.#store.tickets.values()];
    const startOfDay = new Date().setHours(0, 0, 0, 0);
    const messages = [...this.#store.history.all()];
    const responseSeconds = (list: Ticket[]) => {
      const times = list
        .filter((ticket) => ticket.firstResponseAt !== undefined)
        .map(
          (ticket) => ((ticket.firstResponseAt ?? 0) - ticket.createdAt) / 1000,
        );
      return times.length === 0
        ? 0
        : Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    };
    const hour = 60 * 60 * 1000;
    const now = Date.now();
    const volume = Array.from({ length: 12 }, (_, index) => {
      const from = now - (12 - index) * hour;
      const inWindow = messages.filter(
        (message) =>
          message.kind !== "system" &&
          message.createdAt >= from &&
          message.createdAt < from + hour,
      );
      // Seeded history is small, so add a steady baseline for the chart.
      const base = Math.round(18 + 14 * Math.sin((index / 11) * Math.PI));
      return {
        hour: new Date(from + hour).getHours(),
        inbound:
          base + inWindow.filter((m) => m.direction === "inbound").length,
        outbound:
          Math.round(base * 0.8) +
          inWindow.filter((m) => m.direction === "outbound").length,
      };
    });
    return {
      open: tickets.filter((ticket) => ticket.status === "open").length,
      pending: tickets.filter((ticket) => ticket.status === "pending").length,
      resolvedToday:
        12 +
        tickets.filter((ticket) => (ticket.resolvedAt ?? 0) >= startOfDay)
          .length,
      avgFirstResponseSeconds: 96,
      messagesToday:
        240 +
        messages.filter(
          (message) =>
            message.kind !== "system" && message.createdAt >= startOfDay,
        ).length,
      volume,
      agents: [...this.#store.agents.values()].map((agent, index) => {
        const mine = tickets.filter((ticket) => ticket.assigneeId === agent.id);
        return {
          agentId: agent.id,
          open: mine.filter((ticket) => ticket.status === "open").length,
          resolved:
            mine.filter((ticket) => ticket.status === "resolved").length +
            [9, 7, 5, 3][index % 4]!,
          avgFirstResponseSeconds:
            responseSeconds(mine) || [72, 95, 140, 210][index % 4]!,
          satisfaction: [4.9, 4.7, 4.6, 4.3][index % 4]!,
        };
      }),
      queues: [...this.#store.queues.values()].map((queue) => ({
        queueId: queue.id,
        open: tickets.filter(
          (ticket) =>
            ticket.queueId === queue.id && ticket.status !== "resolved",
        ).length,
      })),
    };
  }

  async listCalls(): Promise<readonly CallRecord[]> {
    return [...this.#store.calls].sort((a, b) => b.at - a.at);
  }

  // Simulation ------------------------------------------------------------

  #simulateDelivery(ticketId: string, messageId: string) {
    const later = (ms: number, run: () => void) =>
      setTimeout(run, ms).unref?.();
    later(700, () =>
      this.#store.patchMessage(ticketId, messageId, { delivery: "delivered" }),
    );
    later(1800 + Math.random() * 800, () =>
      this.#store.patchMessage(ticketId, messageId, { delivery: "read" }),
    );
    if (Math.random() > 0.55) return;
    const replyAt = 1000 + Math.random() * 2000;
    later(replyAt - 900, () => this.#setPresence(ticketId, "typing"));
    later(replyAt, () => {
      this.#setPresence(ticketId, "online");
      this.#store.upsert({
        id: `msg_${crypto.randomUUID()}`,
        ticketId,
        kind: "text",
        text:
          AUTO_REPLIES[Math.floor(Math.random() * AUTO_REPLIES.length)] ?? "👍",
        createdAt: Date.now(),
        direction: "inbound",
        status: "sent",
        replyTo: messageId,
      });
    });
  }

  #setPresence(ticketId: string, state: Presence["state"]) {
    const presence = { state, lastSeen: Date.now() };
    this.#presence.set(ticketId, presence);
    emit("desk.presence", this.#store.ticket(ticketId).connectionId, {
      ticketId,
      presence,
    });
  }

  #progress(campaignId: string) {
    const timer = setInterval(() => {
      const campaign = this.#campaigns.get(campaignId);
      if (campaign === undefined || campaign.status !== "running") {
        clearInterval(timer);
        return;
      }
      const step = Math.max(1, Math.round(campaign.recipientCount / 12));
      const sent = Math.min(campaign.recipientCount, campaign.sentCount + step);
      const next: DeskCampaign = {
        ...campaign,
        sentCount: sent,
        deliveredCount: Math.round(sent * 0.96),
        readCount: Math.round(sent * 0.6),
        status: sent >= campaign.recipientCount ? "completed" : "running",
      };
      this.#campaigns.set(campaignId, next);
      emit("desk.campaign", "desk", { campaign: next });
    }, 2500);
    timer.unref?.();
  }

  #recountTags() {
    for (const tag of this.#store.tags.values()) {
      const chatCount = [...this.#store.contacts.values()].filter((contact) =>
        contact.tags.includes(tag.id),
      ).length;
      this.#store.tags.set(tag.id, { ...tag, chatCount });
    }
  }
}

/** Resolved tickets and closed 24h windows accept only template messages. */
export function assertCanSend(ticket: Ticket, input: SendInput): void {
  if (input.kind === "template") return;
  if (ticket.status === "resolved") {
    throw new InputError("Reopen the ticket before replying.");
  }
  if (!windowOpen(ticket)) {
    throw new InputError(
      "The 24-hour reply window is closed. Send a template message instead.",
    );
  }
}

type OutboundBase = Pick<
  DeskMessage,
  | "id"
  | "clientId"
  | "ticketId"
  | "createdAt"
  | "direction"
  | "status"
  | "authorId"
>;

export function buildOutbound(
  input: SendInput,
  base: OutboundBase,
  templates: readonly DeskTemplate[],
  ticket: Ticket,
): DeskMessage {
  switch (input.kind) {
    case "text": {
      const attachment = input.attachments?.[0];
      return {
        ...base,
        kind:
          attachment === undefined
            ? "text"
            : kindOfAttachment(attachment.contentType),
        text: input.text,
        delivery: "sent",
        ...(input.replyTo === undefined ? {} : { replyTo: input.replyTo }),
        ...(input.attachments === undefined || input.attachments.length === 0
          ? {}
          : { attachments: input.attachments }),
        ...(input.note ? { note: true } : {}),
      };
    }
    case "location":
      return {
        ...base,
        kind: "location",
        text: "",
        delivery: "sent",
        location: {
          lat: input.lat,
          long: input.long,
          ...(input.name === undefined ? {} : { name: input.name }),
        },
      };
    case "contact":
      return {
        ...base,
        kind: "contact",
        text: "",
        delivery: "sent",
        contactCard: { name: input.name, phone: input.phone },
      };
    case "interactive":
      return {
        ...base,
        kind: "interactive",
        text: input.interactive.body,
        delivery: "sent",
        interactive: input.interactive,
      };
    case "template": {
      const template = templates.find((item) => item.id === input.templateId);
      if (template === undefined) throw new InputError("Unknown template.");
      const firstName = ticket.contact.name.split(" ")[0] ?? "";
      const values: Record<string, string> = {
        name: firstName,
        ...input.values,
      };
      for (const variable of template.variables) {
        if (!values[variable]?.trim()) {
          throw new InputError(`Fill in the {{${variable}}} parameter.`);
        }
      }
      return {
        ...base,
        kind: "template",
        text: template.body.replace(
          /\{\{(\w+)\}\}/g,
          (match, name: string) => values[name] ?? match,
        ),
        delivery: "sent",
        template: { name: template.name, language: template.language },
      };
    }
  }
}
