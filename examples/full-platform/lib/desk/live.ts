import type { MessageAttachment } from "@polymorfa/browser";
import type {
  PlatformSession,
  ProjectTemplate,
  SendMessageRequest,
} from "@polymorfa/sdk";

import type { Operator } from "../auth.js";
import { env, optionalEnv } from "../env.js";
import { messaging, organization } from "../polymorfa.js";
import { emit } from "../realtime.js";
import { InputError } from "../route.js";
import type { DeskData, InboundMessage, MessagePage } from "./data.js";
import { signMediaUrl } from "./media-url.js";
import { assertCanSend, buildOutbound } from "./mock.js";
import { DeskStore } from "./store.js";
import {
  isE164,
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
  type HealthLevel,
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

const COLORS = ["#10b981", "#6366f1", "#f59e0b", "#ec4899", "#0ea5e9"];

/**
 * Data layer backed by the Polymorfa SDK. WhatsApp resources (sessions,
 * labels, quick replies, contacts, templates, campaigns, presence, sends) go
 * to the Messaging API. Tickets are this app's own records: they live in a
 * process-local store fed by webhooks and sends, standing in for your database.
 */
export class PolymorfaDesk implements DeskData {
  readonly demo = false;
  readonly #store = new DeskStore();
  #templates: DeskTemplate[] = [];

  constructor() {
    for (const [id, name, color] of [
      ["support", "Support", "#0ea5e9"],
      ["sales", "Sales", "#8b5cf6"],
      ["billing", "Billing", "#f59e0b"],
    ] as const) {
      this.#store.queues.set(id, { id, name, color });
    }
  }

  get #session(): string {
    return env.session();
  }

  async bootstrap(operator: Operator): Promise<Bootstrap> {
    const agent = this.#store.agentFor(operator);
    const [tags, connections, quickReplies] = await Promise.all([
      this.listTags(),
      this.listConnections(),
      this.listQuickReplies(),
    ]);
    return {
      me: { agent, demo: false },
      agents: [...this.#store.agents.values()],
      queues: [...this.#store.queues.values()],
      tags,
      connections,
      quickReplies,
      customFieldNames: ["Plan", "City"],
    };
  }

  /** Records an inbound WhatsApp message (called from the webhook handler). */
  ingestInbound(input: InboundMessage): void {
    const contact = this.#store.ensureContact(input.phone, input.name);
    const ticket = this.#store.openTicket(contact, input.session);
    this.#store.upsert({
      id: input.id,
      ticketId: ticket.id,
      kind: input.kind,
      text: input.text,
      createdAt: input.createdAt,
      direction: "inbound",
      status: "sent",
    });
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
    const session = input.connectionId ?? this.#session;
    // Confirm the number is on WhatsApp before opening a ticket.
    const checked = await messaging().contacts.check(session, input.phone);
    if (!checked.data.data.some((result) => result.exists)) {
      throw new InputError("This number is not on WhatsApp.");
    }
    const contact = this.#store.ensureContact(input.phone);
    const agent = this.#store.agentFor(operator);
    return this.#store.openTicket(contact, session, { assigneeId: agent.id });
  }

  async updateTicket(
    ticketId: string,
    action: TicketAction,
    operator: Operator,
  ) {
    const ticket = this.#store.applyAction(ticketId, action, operator);
    if (action.action === "markRead") {
      const last = [...this.#store.page(ticketId).messages]
        .reverse()
        .find((message) => message.direction === "inbound");
      if (last !== undefined && !last.id.startsWith("sys_")) {
        await messaging()
          .messages.markSeen(ticket.connectionId, {
            conversation: { phoneNumber: ticket.contact.phone },
            id: last.id,
          })
          .catch((error: unknown) => console.warn("markSeen failed", error));
      }
    }
    return ticket;
  }

  async listMessages(ticketId: string, cursor?: string): Promise<MessagePage> {
    this.#store.ticket(ticketId);
    return this.#store.page(ticketId, cursor);
  }

  async sendMessage(
    ticketId: string,
    input: SendInput,
    operator: Operator,
    idempotencyKey: string,
  ): Promise<DeskMessage> {
    const ticket = this.#store.ticket(ticketId);
    const agent = this.#store.agentFor(operator);
    const base = {
      id: `pending_${input.clientId}`,
      clientId: input.clientId,
      ticketId,
      createdAt: Date.now(),
      direction: "outbound" as const,
      status: "sent" as const,
      authorId: agent.id,
    };
    if (input.kind === "template" && this.#templates.length === 0) {
      await this.listTemplates();
    }
    const draft = buildOutbound(input, base, this.#templates, ticket);
    // Internal notes never leave this application.
    if (draft.note)
      return this.#store.upsert({ ...draft, id: `note_${input.clientId}` });
    assertCanSend(ticket, input);

    const response = await messaging().messages.send(
      ticket.connectionId,
      toSendRequest(ticket, draft, input),
      { idempotencyKey },
    );
    const sent = response.data.data;
    return this.#store.upsert({
      ...draft,
      id: sent.id,
      createdAt: Date.parse(sent.timestamp) || draft.createdAt,
    });
  }

  async react(ticketId: string, messageId: string, emoji: string) {
    const ticket = this.#store.ticket(ticketId);
    await messaging().messages.react(
      ticket.connectionId,
      {
        conversation: { phoneNumber: ticket.contact.phone },
        id: messageId,
        reaction: emoji,
      },
      { idempotencyKey: crypto.randomUUID() },
    );
    const message = this.#store.message(ticketId, messageId);
    const others = (message?.reactions ?? []).filter((item) => !item.fromMe);
    this.#store.patchMessage(ticketId, messageId, {
      reactions: emoji === "" ? others : [...others, { emoji, fromMe: true }],
    });
  }

  async setTyping(ticketId: string, typing: boolean) {
    const ticket = this.#store.ticket(ticketId);
    await messaging().messages.setTyping(ticket.connectionId, {
      conversation: { phoneNumber: ticket.contact.phone },
      state: typing ? "typing" : "paused",
    });
  }

  async presence(ticketId: string): Promise<Presence> {
    const ticket = this.#store.ticket(ticketId);
    const response = await messaging().presence.getForChat(
      ticket.connectionId,
      ticket.contact.phone,
    );
    const data = response.data.data;
    const lastSeen =
      data.lastSeen === undefined ? undefined : Date.parse(data.lastSeen);
    const presence: Presence = {
      state:
        data.chatState?.state === "composing" && !data.chatState.stale
          ? "typing"
          : data.available === true
            ? "online"
            : data.available === false
              ? "offline"
              : "unknown",
      ...(lastSeen === undefined || Number.isNaN(lastSeen) ? {} : { lastSeen }),
    };
    emit("desk.presence", ticket.connectionId, { ticketId, presence });
    return presence;
  }

  async uploadMedia(input: UploadInput): Promise<MessageAttachment> {
    const attachment = this.#store.storeMedia(input, "");
    // Polymorfa fetches the file from this app, so the URL must be public but
    // unguessable: it carries a short-lived signature.
    return {
      ...attachment,
      url: signMediaUrl(env.appOrigin(), attachment.id),
    };
  }

  async readMedia(mediaId: string): Promise<StoredMedia | null> {
    return this.#store.media.get(mediaId) ?? null;
  }

  async listContacts(search?: string): Promise<readonly DeskContact[]> {
    const response = await messaging().contacts.list(this.#session);
    for (const contact of response.data.data) {
      if (contact.phoneNumber === undefined) continue;
      const known = this.#store.ensureContact(
        contact.phoneNumber,
        contact.name || contact.pushName || contact.phoneNumber,
      );
      if (contact.profileUrl !== undefined && known.avatarUrl === undefined) {
        this.#store.updateContact(known.id, {});
        this.#store.contacts.set(known.id, {
          ...known,
          avatarUrl: contact.profileUrl,
        });
      }
    }
    return this.#store.listContacts(search);
  }

  async updateContact(contactId: string, patch: ContactPatch) {
    const contact = this.#store.contacts.get(contactId);
    if (contact === undefined) throw new InputError("Unknown contact.");
    const contacts = messaging().contacts;
    if (patch.blocked !== undefined && patch.blocked !== contact.blocked) {
      await (patch.blocked ? contacts.block : contacts.unblock).call(
        contacts,
        this.#session,
        contact.phone,
      );
    }
    if (patch.tags !== undefined) {
      // Labels are WhatsApp Business chat labels; replace the chat's full set.
      await messaging().labels.replaceForChat(this.#session, contact.phone, {
        labels: patch.tags,
      });
    }
    return this.#store.updateContact(contactId, patch);
  }

  async importContacts(rows: readonly { name: string; phone: string }[]) {
    const valid = rows.filter((row) => isE164(row.phone));
    if (valid.length === 0) return { imported: 0, skipped: rows.length };
    const checked = await messaging().contacts.check(
      this.#session,
      valid.map((row) => row.phone),
    );
    const onWhatsApp = new Set(
      checked.data.data
        .filter((result) => result.exists)
        .map((result) => result.phoneNumber),
    );
    let imported = 0;
    for (const row of valid) {
      if (!onWhatsApp.has(row.phone) || this.#store.contactByPhone(row.phone))
        continue;
      this.#store.ensureContact(row.phone, row.name || row.phone);
      imported += 1;
    }
    return { imported, skipped: rows.length - imported };
  }

  async listTemplates(): Promise<readonly DeskTemplate[]> {
    const response = await messaging().templates.list(env.projectSlug());
    this.#templates = response.data.data.map(toDeskTemplate);
    return this.#templates;
  }

  async listQuickReplies(): Promise<readonly QuickReply[]> {
    const response = await messaging().quickReplies.list(this.#session);
    return response.data.data.quickReplies.map(({ id, shortcut, message }) => ({
      id,
      shortcut,
      message,
    }));
  }

  async saveQuickReply(input: {
    id?: string;
    shortcut: string;
    message: string;
  }) {
    const body = { shortcut: input.shortcut, message: input.message };
    const quickReplies = messaging().quickReplies;
    const response =
      input.id === undefined
        ? await quickReplies.create(this.#session, body)
        : await quickReplies.replace(this.#session, input.id, body);
    const { id, shortcut, message } = response.data.data;
    return { id, shortcut, message };
  }

  async deleteQuickReply(id: string) {
    await messaging().quickReplies.delete(this.#session, id);
  }

  async listTags(): Promise<readonly Tag[]> {
    const response = await messaging().labels.list(this.#session);
    const data = response.data.data;
    const labels = "labels" in data ? data.labels : data;
    return labels.map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
      chatCount: label.chatCount ?? 0,
    }));
  }

  async saveTag(input: { id?: string; name: string; color: number }) {
    const labels = messaging().labels;
    if (input.id === undefined) {
      const created = await labels.create(this.#session, {
        name: input.name,
        color: input.color,
      });
      return { ...created.data.data, chatCount: 0 };
    }
    await labels.update(this.#session, input.id, {
      name: input.name,
      color: input.color,
    });
    return { id: input.id, name: input.name, color: input.color, chatCount: 0 };
  }

  async deleteTag(id: string) {
    await messaging().labels.delete(this.#session, id);
  }

  async listConnections(): Promise<readonly Connection[]> {
    const response = await messaging().sessions.list();
    const sessions = response.data.data;
    const health = await this.#health();
    return sessions.map((session, index) =>
      toConnection(session, index, health.get(session.name)),
    );
  }

  /** BanSafe Health needs the organization key; without it health is unknown. */
  async #health(): Promise<Map<string, number | null>> {
    const scores = new Map<string, number | null>();
    if (optionalEnv("POLYMORFA_ORGANIZATION_API_KEY") === undefined)
      return scores;
    try {
      const page = await organization().banSafe.listHealth({
        projectId: env.projectId(),
        limit: 100,
      });
      for (const number of page.data.data)
        scores.set(number.session, number.health);
    } catch (error) {
      console.warn("BanSafe health unavailable", error);
    }
    return scores;
  }

  async connectionAction(
    connectionId: string,
    action: ConnectionAction,
    phone?: string,
  ): Promise<Readonly<Record<string, unknown>>> {
    const sessions = messaging().sessions;
    switch (action) {
      case "restart":
        return { ...(await sessions.restart(connectionId)).data };
      case "logout":
        return { ...(await sessions.logout(connectionId)).data };
      case "delete":
        return { ...(await sessions.delete(connectionId)).data };
      case "start":
        return { ...(await sessions.start(connectionId)).data };
      case "stop":
        return { ...(await sessions.stop(connectionId)).data };
      case "qr":
        return { ...(await sessions.qr(connectionId)).data.data };
      case "pairingCode":
        if (phone === undefined || !isE164(phone)) {
          throw new InputError("Enter the phone number in E.164 format.");
        }
        return {
          ...(await sessions.requestPairingCode(connectionId, { phone })).data
            .data,
        };
    }
  }

  async createQuickLink(idempotencyKey: string) {
    const response = await messaging().quickLinks.create(
      {
        externalId: "acme-support",
        configuration: {
          connectionPreference: "both",
          methods: ["qr", "pairing"],
          historySync: { consent: "ask", mode: "metadata_only" },
        },
      },
      { idempotencyKey },
    );
    const { url, expiresAt } = response.data.data;
    return { url, ...(expiresAt ? { expiresAt } : {}) };
  }

  async listCampaigns(): Promise<readonly DeskCampaign[]> {
    const response = await messaging().campaigns.list(env.projectSlug());
    return response.data.data.map(toDeskCampaign);
  }

  async createCampaign(input: CampaignInput, idempotencyKey: string) {
    // Audiences are managed recipient lists; this example sends the template
    // to the project's default list chosen in the dashboard.
    const campaigns = messaging().campaigns;
    const created = await campaigns.create(
      env.projectSlug(),
      {
        name: input.name,
        templateId: input.templateId,
        ...(input.scheduledAt === undefined
          ? {}
          : { scheduledAt: input.scheduledAt }),
      },
      { idempotencyKey },
    );
    return toDeskCampaign(created.data.data);
  }

  async campaignAction(
    campaignId: string,
    action: "launch" | "pause" | "resume" | "stop",
    idempotencyKey: string,
  ) {
    const campaigns = messaging().campaigns;
    const slug = env.projectSlug();
    const response =
      action === "launch"
        ? await campaigns.launch(slug, campaignId, {}, { idempotencyKey })
        : await campaigns[action](slug, campaignId);
    return toDeskCampaign(response.data.data);
  }

  async dashboard(): Promise<DashboardStats> {
    const tickets = [...this.#store.tickets.values()];
    const messages = [...this.#store.history.all()];
    const startOfDay = new Date().setHours(0, 0, 0, 0);
    const hour = 60 * 60 * 1000;
    const now = Date.now();
    const responded = tickets.filter(
      (ticket) => ticket.firstResponseAt !== undefined,
    );
    const avg = (list: Ticket[]) =>
      list.length === 0
        ? 0
        : Math.round(
            list.reduce(
              (sum, ticket) =>
                sum + ((ticket.firstResponseAt ?? 0) - ticket.createdAt),
              0,
            ) /
              list.length /
              1000,
          );
    return {
      open: tickets.filter((ticket) => ticket.status === "open").length,
      pending: tickets.filter((ticket) => ticket.status === "pending").length,
      resolvedToday: tickets.filter(
        (ticket) => (ticket.resolvedAt ?? 0) >= startOfDay,
      ).length,
      avgFirstResponseSeconds: avg(responded),
      messagesToday: messages.filter(
        (message) =>
          message.kind !== "system" && message.createdAt >= startOfDay,
      ).length,
      volume: Array.from({ length: 12 }, (_, index) => {
        const from = now - (12 - index) * hour;
        const window = messages.filter(
          (message) =>
            message.createdAt >= from && message.createdAt < from + hour,
        );
        return {
          hour: new Date(from + hour).getHours(),
          inbound: window.filter((message) => message.direction === "inbound")
            .length,
          outbound: window.filter((message) => message.direction === "outbound")
            .length,
        };
      }),
      agents: [...this.#store.agents.values()].map((agent) => {
        const mine = tickets.filter((ticket) => ticket.assigneeId === agent.id);
        return {
          agentId: agent.id,
          open: mine.filter((ticket) => ticket.status === "open").length,
          resolved: mine.filter((ticket) => ticket.status === "resolved")
            .length,
          avgFirstResponseSeconds: avg(
            mine.filter((ticket) => ticket.firstResponseAt !== undefined),
          ),
          satisfaction: 0,
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
}

function toSendRequest(
  ticket: Ticket,
  message: DeskMessage,
  input: SendInput,
): SendMessageRequest {
  const conversation = { phoneNumber: ticket.contact.phone };
  const quoted =
    message.replyTo === undefined
      ? {}
      : { quotedMessage: { id: message.replyTo } };
  const attachment = message.attachments?.[0];
  if (input.kind === "location") {
    return {
      conversation,
      content: { location: { lat: input.lat, long: input.long } },
    };
  }
  if (input.kind === "contact") {
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${input.name.replace(/[\r\n;]/g, " ")}`,
      `TEL;type=CELL;waid=${input.phone.slice(1)}:${input.phone}`,
      "END:VCARD",
    ].join("\n");
    return { conversation, content: { contact: { vcard } } };
  }
  if (input.kind === "template") {
    const values = Object.values(input.values ?? {});
    return {
      conversation,
      content: {
        template: {
          name: message.template?.name ?? "",
          language: message.template?.language ?? "en_US",
          ...(values.length === 0
            ? {}
            : {
                components: [
                  {
                    type: "body",
                    parameters: values.map((text) => ({ type: "text", text })),
                  },
                ],
              }),
        },
      },
    };
  }
  if (input.kind === "interactive") {
    const content = input.interactive;
    if (content.type === "buttons") {
      return {
        conversation,
        content: {
          buttons: {
            body: content.body,
            buttons: content.buttons.map((text, index) => ({
              type: "reply" as const,
              id: `btn_${index + 1}`,
              text,
            })),
          },
        },
      };
    }
    return {
      conversation,
      content: {
        list: {
          title: content.body,
          buttonText: content.buttonText,
          sections: [
            {
              title: "Options",
              rows: content.rows.map((title, index) => ({
                id: `row_${index + 1}`,
                title,
              })),
            },
          ],
        },
      },
    };
  }
  if (attachment?.url !== undefined) {
    const url = attachment.url;
    const caption = message.text === "" ? {} : { caption: message.text };
    switch (message.kind) {
      case "image":
        return {
          ...quoted,
          conversation,
          content: { image: { url, ...caption } },
        };
      case "video":
        return {
          ...quoted,
          conversation,
          content: { video: { url, ...caption } },
        };
      case "audio":
        return {
          ...quoted,
          conversation,
          content: { voice: { url, ptt: true } },
        };
      default:
        return {
          ...quoted,
          conversation,
          content: { file: { url, filename: attachment.name } },
        };
    }
  }
  return { ...quoted, conversation, content: { text: message.text } };
}

function toConnection(
  session: PlatformSession,
  index: number,
  health: number | null | undefined,
): Connection {
  const score = health ?? (session.status === "connected" ? 90 : 50);
  const level: HealthLevel =
    score >= 80 ? "healthy" : score >= 60 ? "watch" : "at_risk";
  return {
    id: session.name,
    name: session.name,
    phone: session.phone,
    platform: session.platform,
    isBusiness: session.isBusiness,
    status: session.status,
    color: COLORS[index % COLORS.length] ?? "#10b981",
    messageCount: session.messageCount,
    lastActiveAt: session.lastActiveAt,
    health: { score, level },
  };
}

function toDeskTemplate(template: ProjectTemplate): DeskTemplate {
  const definition = template.definition;
  const header = definition?.header;
  return {
    id: template.id,
    name: template.name,
    category: template.category,
    language: template.language,
    status: template.status.toUpperCase(),
    body: definition?.body ?? "",
    ...(header !== undefined &&
    "text" in header &&
    typeof header.text === "string"
      ? { header: header.text }
      : {}),
    ...(typeof definition?.footer === "string"
      ? { footer: definition.footer }
      : {}),
    buttons: (definition?.buttons ?? []).flatMap((button) =>
      button.text === undefined ? [] : [button.text],
    ),
    variables: (definition?.variables ?? []).map((variable) => variable.name),
    updatedAt: template.updatedAt,
  };
}

function toDeskCampaign(campaign: {
  id: string;
  name: string;
  status: string;
  templateId: string | null;
  recipientCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  failedCount: number;
  scheduledAt: number | null;
  createdAt: number;
}): DeskCampaign {
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    templateId: campaign.templateId,
    recipientCount: campaign.recipientCount,
    sentCount: campaign.sentCount,
    deliveredCount: campaign.deliveredCount,
    readCount: campaign.readCount,
    failedCount: campaign.failedCount,
    scheduledAt: campaign.scheduledAt,
    createdAt: campaign.createdAt,
  };
}
