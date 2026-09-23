import type {
  ConversationMessage,
  MessageAttachment,
} from "@polymorfa/browser";

/**
 * Help-desk domain types shared by the server data layer and the browser UI.
 * Tickets, queues and agents are application concepts: Polymorfa delivers the
 * WhatsApp conversations, and this app organizes them into tickets.
 */

export type TicketStatus = "open" | "pending" | "resolved";
export type AgentStatus = "online" | "away" | "offline";

export interface Agent {
  readonly id: string;
  readonly name: string;
  readonly email: string;
  readonly role: "agent" | "admin";
  readonly status: AgentStatus;
  readonly color: string;
}

export interface Queue {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

export interface Tag {
  readonly id: string;
  readonly name: string;
  /** WhatsApp label color index (0-19). */
  readonly color: number;
  readonly chatCount: number;
}

export type HealthLevel = "healthy" | "watch" | "at_risk";

export interface Connection {
  /** Session name used in Messaging API paths. */
  readonly id: string;
  readonly name: string;
  readonly phone: string | null;
  readonly platform: string | null;
  readonly isBusiness: boolean;
  readonly status: string;
  readonly color: string;
  readonly messageCount: number;
  readonly lastActiveAt: number | null;
  readonly health: { readonly score: number; readonly level: HealthLevel };
}

export interface BusinessInfo {
  readonly description?: string;
  readonly category?: string;
  readonly website?: string;
  readonly email?: string;
  readonly address?: string;
}

export interface DeskContact {
  readonly id: string;
  readonly name: string;
  readonly phone: string;
  readonly avatarUrl?: string;
  readonly about?: string;
  readonly email?: string;
  readonly company?: string;
  readonly tags: readonly string[];
  readonly customFields: Readonly<Record<string, string>>;
  readonly notes: string;
  readonly blocked: boolean;
  readonly muted: boolean;
  readonly business?: BusinessInfo;
  readonly createdAt: number;
  readonly lastSeenAt?: number;
}

export type DeskMessageKind =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "location"
  | "contact"
  | "template"
  | "sticker"
  | "interactive"
  | "system";

export type DeliveryState = "sent" | "delivered" | "read";

export interface DeskReaction {
  readonly emoji: string;
  readonly fromMe: boolean;
}

export interface DeskMessage extends ConversationMessage {
  readonly ticketId: string;
  readonly kind: DeskMessageKind;
  readonly delivery?: DeliveryState;
  readonly reactions?: readonly DeskReaction[];
  /** Internal note: never sent to the customer. */
  readonly note?: boolean;
  readonly authorId?: string;
  readonly location?: {
    readonly lat: number;
    readonly long: number;
    readonly name?: string;
    readonly address?: string;
  };
  readonly contactCard?: { readonly name: string; readonly phone: string };
  readonly template?: { readonly name: string; readonly language: string };
  /** Sent by an automation (chatbot) rather than a person. */
  readonly bot?: boolean;
  /** Outbound buttons or list message. */
  readonly interactive?: InteractiveContent;
  /** The button or list row a customer tapped. */
  readonly selection?: { readonly title: string };
  /** Voice note transcript, when one is available. */
  readonly transcript?: string;
}

export type InteractiveContent =
  | {
      readonly type: "buttons";
      readonly body: string;
      readonly buttons: readonly string[];
    }
  | {
      readonly type: "list";
      readonly body: string;
      readonly buttonText: string;
      readonly rows: readonly string[];
    };

export interface LastMessage {
  readonly preview: string;
  readonly kind: DeskMessageKind;
  readonly at: number;
  readonly direction: "inbound" | "outbound";
  readonly note?: boolean;
}

export interface Ticket {
  readonly id: string;
  readonly number: number;
  readonly contact: DeskContact;
  readonly status: TicketStatus;
  readonly queueId: string;
  readonly assigneeId?: string;
  readonly connectionId: string;
  readonly unread: number;
  readonly lastMessage?: LastMessage;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** Last inbound message; the free-form reply window closes 24h later. */
  readonly lastInboundAt?: number;
  readonly firstResponseAt?: number;
  readonly resolvedAt?: number;
  /**
   * When the free-form reply window closes (epoch ms), computed on the server.
   * Absent when the customer never wrote, so only templates can be sent.
   */
  readonly windowExpiresAt?: number;
}

export interface TicketCounts {
  readonly open: number;
  readonly pending: number;
  readonly resolved: number;
}

export interface TicketQuery {
  readonly status: TicketStatus;
  readonly search?: string;
  readonly queueId?: string;
  readonly tag?: string;
  readonly connectionId?: string;
  readonly mine?: boolean;
}

export interface TicketList {
  readonly tickets: readonly Ticket[];
  readonly counts: TicketCounts;
}

export interface TicketDetail {
  readonly ticket: Ticket;
  readonly history: readonly Ticket[];
}

export type TicketAction =
  | { readonly action: "accept" }
  | { readonly action: "resolve" }
  | { readonly action: "reopen" }
  | { readonly action: "markRead" }
  | {
      readonly action: "transfer";
      readonly agentId?: string;
      readonly queueId?: string;
    };

export interface QuickReply {
  readonly id: string;
  readonly shortcut: string;
  readonly message: string;
}

export interface DeskTemplate {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly language: string;
  readonly status: string;
  readonly body: string;
  readonly header?: string;
  readonly footer?: string;
  readonly buttons: readonly string[];
  readonly variables: readonly string[];
  readonly updatedAt: number;
}

export interface DeskCampaign {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly templateId: string | null;
  readonly recipientCount: number;
  readonly sentCount: number;
  readonly deliveredCount: number;
  readonly readCount: number;
  readonly failedCount: number;
  readonly scheduledAt: number | null;
  readonly createdAt: number;
}

export interface CampaignInput {
  readonly name: string;
  readonly templateId: string;
  readonly audience: "all" | "tag";
  readonly tag?: string;
  readonly scheduledAt?: number;
}

export interface DashboardStats {
  readonly open: number;
  readonly pending: number;
  readonly resolvedToday: number;
  readonly avgFirstResponseSeconds: number;
  readonly messagesToday: number;
  /** Messages per hour for the last 12 hours, oldest first. */
  readonly volume: readonly {
    readonly hour: number;
    readonly inbound: number;
    readonly outbound: number;
  }[];
  readonly agents: readonly {
    readonly agentId: string;
    readonly open: number;
    readonly resolved: number;
    readonly avgFirstResponseSeconds: number;
    readonly satisfaction: number;
  }[];
  readonly queues: readonly {
    readonly queueId: string;
    readonly open: number;
  }[];
}

export interface CallRecord {
  readonly id: string;
  readonly peer: string;
  readonly name?: string;
  readonly direction: "incoming" | "outgoing";
  readonly video: boolean;
  readonly outcome: "answered" | "missed" | "rejected";
  readonly durationSeconds: number;
  readonly at: number;
}

export type SendInput =
  | {
      readonly kind: "text";
      readonly clientId: string;
      readonly text: string;
      readonly replyTo?: string;
      readonly note?: boolean;
      readonly attachments?: readonly MessageAttachment[];
    }
  | {
      readonly kind: "location";
      readonly clientId: string;
      readonly lat: number;
      readonly long: number;
      readonly name?: string;
    }
  | {
      readonly kind: "contact";
      readonly clientId: string;
      readonly name: string;
      readonly phone: string;
    }
  | {
      readonly kind: "template";
      readonly clientId: string;
      readonly templateId: string;
      readonly values?: Readonly<Record<string, string>>;
    }
  | {
      readonly kind: "interactive";
      readonly clientId: string;
      readonly interactive: InteractiveContent;
    };

export type ContactPatch = {
  readonly name?: string;
  readonly tags?: readonly string[];
  readonly customFields?: Readonly<Record<string, string>>;
  readonly notes?: string;
  readonly blocked?: boolean;
  readonly muted?: boolean;
};

export interface Presence {
  readonly state: "online" | "typing" | "recording" | "offline" | "unknown";
  readonly lastSeen?: number;
}

export type ConnectionAction =
  "restart" | "logout" | "delete" | "start" | "stop" | "qr" | "pairingCode";

export interface Me {
  readonly agent: Agent;
  readonly demo: boolean;
}

export interface Bootstrap {
  readonly me: Me;
  readonly agents: readonly Agent[];
  readonly queues: readonly Queue[];
  readonly tags: readonly Tag[];
  readonly connections: readonly Connection[];
  readonly quickReplies: readonly QuickReply[];
  readonly customFieldNames: readonly string[];
}

export interface UploadInput {
  readonly name: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

export interface StoredMedia {
  readonly name: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
}

/** WhatsApp label palette, indexed by `Tag.color`. */
export const TAG_COLORS = [
  "#ff9485",
  "#64c4ff",
  "#ffd429",
  "#dfaef0",
  "#99b6c1",
  "#55ccb3",
  "#ff9dff",
  "#d3a91d",
  "#6d7cce",
  "#d7e752",
  "#00d0e2",
  "#ffc5c7",
  "#93ceac",
  "#f74848",
  "#00a0f2",
  "#83e422",
  "#ffaf04",
  "#b5ebff",
  "#9ba6ff",
  "#9368cf",
] as const;

export function tagColor(index: number): string {
  return TAG_COLORS[Math.abs(index) % TAG_COLORS.length] ?? "#99b6c1";
}

export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function windowOpen(ticket: Ticket, now = Date.now()): boolean {
  return (
    ticket.lastInboundAt !== undefined &&
    now - ticket.lastInboundAt < REPLY_WINDOW_MS
  );
}

const E164 = /^\+[1-9]\d{6,14}$/;

export function isE164(value: string): boolean {
  return E164.test(value);
}
