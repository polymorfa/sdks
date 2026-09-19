import type { MessageAttachment } from "@polymorfa/browser";

import type { Operator } from "../auth.js";
import { isDemoMode } from "../env.js";
import type {
  Bootstrap,
  CallRecord,
  CampaignInput,
  Connection,
  ConnectionAction,
  ContactPatch,
  DashboardStats,
  DeskCampaign,
  DeskContact,
  DeskMessage,
  DeskMessageKind,
  DeskTemplate,
  Presence,
  QuickReply,
  SendInput,
  StoredMedia,
  Tag,
  Ticket,
  TicketAction,
  TicketDetail,
  TicketList,
  TicketQuery,
  UploadInput,
} from "./types.js";
import type { MessagePage } from "./history.js";

export interface InboundMessage {
  readonly id: string;
  readonly session: string;
  readonly phone: string;
  readonly name?: string;
  readonly text: string;
  readonly kind: DeskMessageKind;
  readonly createdAt: number;
}

export type { MessagePage } from "./history.js";

/**
 * Everything the help-desk UI reads and writes. `MockDesk` serves in-memory
 * demo data; `PolymorfaDesk` uses the Polymorfa SDK. Route handlers only see
 * this interface, so both paths share one UI and one set of routes.
 */
export interface DeskData {
  readonly demo: boolean;
  /** Records a customer message received by webhook (live data only). */
  ingestInbound?(input: InboundMessage): void;
  bootstrap(operator: Operator): Promise<Bootstrap>;

  listTickets(query: TicketQuery, operator: Operator): Promise<TicketList>;
  getTicket(ticketId: string): Promise<TicketDetail>;
  createTicket(
    input: { readonly phone: string; readonly connectionId?: string },
    operator: Operator,
  ): Promise<Ticket>;
  updateTicket(
    ticketId: string,
    action: TicketAction,
    operator: Operator,
  ): Promise<Ticket>;

  listMessages(ticketId: string, cursor?: string): Promise<MessagePage>;
  sendMessage(
    ticketId: string,
    input: SendInput,
    operator: Operator,
    idempotencyKey: string,
  ): Promise<DeskMessage>;
  react(ticketId: string, messageId: string, emoji: string): Promise<void>;
  setTyping(ticketId: string, typing: boolean): Promise<void>;
  presence(ticketId: string): Promise<Presence>;

  uploadMedia(input: UploadInput): Promise<MessageAttachment>;
  readMedia(mediaId: string): Promise<StoredMedia | null>;

  listContacts(search?: string): Promise<readonly DeskContact[]>;
  updateContact(contactId: string, patch: ContactPatch): Promise<DeskContact>;
  importContacts(
    rows: readonly { readonly name: string; readonly phone: string }[],
  ): Promise<{ readonly imported: number; readonly skipped: number }>;

  listTemplates(): Promise<readonly DeskTemplate[]>;

  listQuickReplies(): Promise<readonly QuickReply[]>;
  saveQuickReply(input: {
    readonly id?: string;
    readonly shortcut: string;
    readonly message: string;
  }): Promise<QuickReply>;
  deleteQuickReply(id: string): Promise<void>;

  listTags(): Promise<readonly Tag[]>;
  saveTag(input: {
    readonly id?: string;
    readonly name: string;
    readonly color: number;
  }): Promise<Tag>;
  deleteTag(id: string): Promise<void>;

  listConnections(): Promise<readonly Connection[]>;
  connectionAction(
    connectionId: string,
    action: ConnectionAction,
    phone?: string,
  ): Promise<Readonly<Record<string, unknown>>>;
  createQuickLink(
    idempotencyKey: string,
  ): Promise<{ readonly url: string; readonly expiresAt?: string }>;

  listCampaigns(): Promise<readonly DeskCampaign[]>;
  createCampaign(
    input: CampaignInput,
    idempotencyKey: string,
  ): Promise<DeskCampaign>;
  campaignAction(
    campaignId: string,
    action: "launch" | "pause" | "resume" | "stop",
    idempotencyKey: string,
  ): Promise<DeskCampaign>;

  dashboard(): Promise<DashboardStats>;
  listCalls(): Promise<readonly CallRecord[]>;
}

export { isDemoMode };

const cache = globalThis as typeof globalThis & {
  __acmeDesk?: Promise<DeskData>;
};

/** The process-wide data layer. Survives Next.js dev module reloads. */
export function desk(): Promise<DeskData> {
  const loaded: Promise<DeskData> =
    cache.__acmeDesk ??
    (isDemoMode()
      ? import("./mock.js").then(({ MockDesk }) => new MockDesk())
      : import("./live.js").then(({ PolymorfaDesk }) => new PolymorfaDesk()));
  cache.__acmeDesk = loaded;
  return loaded;
}
