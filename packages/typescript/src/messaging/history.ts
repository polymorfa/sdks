import type { ConversationIdentity, WhatsAppMessageIds } from "./types.js";

/** Hosted message history is an enrolled beta and requires HMS on the Number. */
export interface HistoryChat {
  readonly conversation: ConversationIdentity;
  readonly kind: "direct" | "group" | "channel" | "broadcast";
  readonly lastActivityAt: string;
  readonly lastMessage: HistoryMessageSummary;
}

export interface HistoryMessageSummary {
  readonly id: string;
  readonly whatsapp_ids: WhatsAppMessageIds;
  /** @deprecated Temporary singular reference for older consumers; use `whatsapp_ids`. */
  readonly whatsapp_id?: string;
  readonly direction: "inbound" | "outbound";
  readonly type: string;
  readonly timestamp: string;
}

export interface HistoryMedia {
  readonly id: string;
  readonly mimeType: string;
  readonly fileLength: number;
  /** API path for `MessagingClient.media.download`; this is not a signed URL. */
  readonly url: string;
}

export interface HistoryMessage extends HistoryMessageSummary {
  readonly conversation: ConversationIdentity & {
    readonly sender?: ConversationIdentity;
  };
  readonly fromMe: boolean;
  readonly pushName?: string;
  readonly text?: string;
  readonly caption?: string;
  readonly mimeType?: string;
  readonly filename?: string;
  readonly ptt?: boolean;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly displayName?: string;
  readonly title?: string;
  readonly reaction?: string;
  readonly reactionTo?: string;
  readonly edited?: boolean;
  readonly unavailable?: boolean;
  readonly unavailableReason?: string;
  readonly pollOptions?: readonly {
    readonly name: string;
    readonly hash: string;
  }[];
  readonly media?: readonly HistoryMedia[];
}

export interface HistoryPage<T> {
  readonly success: true;
  readonly data: readonly T[];
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  readonly previousCursor: string | null;
}

export interface ListHistoryChatsParams {
  readonly limit?: number;
  readonly cursor?: string;
  readonly kind?: HistoryChat["kind"];
  readonly activeSince?: string;
  readonly activeBefore?: string;
}

export interface ListHistoryMessagesParams {
  readonly limit?: number;
  readonly cursor?: string;
  readonly order?: "desc" | "asc";
  readonly since?: string;
  readonly until?: string;
  readonly direction?: HistoryMessage["direction"];
  /** Comma-separated message types, such as `text,image` (up to 16). */
  readonly types?: string;
}
