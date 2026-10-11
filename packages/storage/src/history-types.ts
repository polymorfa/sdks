/**
 * Structural types for a decoded WhatsApp `HistorySync` chunk. Field names
 * follow the protobuf JSON names (camelCase) used by protobuf.js and
 * `@bufbuild/protobuf`, so a decoded object from either library fits.
 * 64-bit integers may be numbers, bigints, decimal strings or Long objects.
 * Bytes may be `Uint8Array` or base64 strings.
 *
 * Only the fields the reducer reads are listed; extra fields are ignored.
 */

export type ProtoInt =
  | number
  | bigint
  | string
  | { toNumber(): number }
  | null
  | undefined;

export type ProtoBytes = Uint8Array | string | null | undefined;

/** `HistorySync.HistorySyncType`. Enum numbers or names are accepted. */
export const HISTORY_SYNC_TYPES = {
  INITIAL_BOOTSTRAP: 0,
  INITIAL_STATUS_V3: 1,
  FULL: 2,
  RECENT: 3,
  PUSH_NAME: 4,
  NON_BLOCKING_DATA: 5,
  ON_DEMAND: 6,
} as const;

export type HistorySyncTypeName = keyof typeof HISTORY_SYNC_TYPES;

export interface HistoryMessageKey {
  readonly remoteJid?: string | null;
  readonly fromMe?: boolean | null;
  readonly id?: string | null;
  readonly participant?: string | null;
}

export interface HistoryContextInfo {
  readonly stanzaId?: string | null;
  readonly participant?: string | null;
}

export interface HistoryMediaMessage {
  readonly url?: string | null;
  readonly mimetype?: string | null;
  readonly caption?: string | null;
  readonly fileSha256?: ProtoBytes;
  readonly fileLength?: ProtoInt;
  readonly mediaKey?: ProtoBytes;
  readonly fileEncSha256?: ProtoBytes;
  readonly directPath?: string | null;
  readonly mediaKeyTimestamp?: ProtoInt;
  readonly fileName?: string | null;
  readonly title?: string | null;
  readonly ptt?: boolean | null;
  readonly contextInfo?: HistoryContextInfo | null;
}

/** The subset of `waE2E.Message` the reducer maps. */
export interface HistoryMessageContent {
  readonly conversation?: string | null;
  readonly extendedTextMessage?: {
    readonly text?: string | null;
    readonly contextInfo?: HistoryContextInfo | null;
  } | null;
  readonly imageMessage?: HistoryMediaMessage | null;
  readonly videoMessage?: HistoryMediaMessage | null;
  readonly ptvMessage?: HistoryMediaMessage | null;
  readonly audioMessage?: HistoryMediaMessage | null;
  readonly documentMessage?: HistoryMediaMessage | null;
  readonly stickerMessage?: HistoryMediaMessage | null;
  readonly locationMessage?: {
    readonly degreesLatitude?: number | null;
    readonly degreesLongitude?: number | null;
    readonly name?: string | null;
    readonly contextInfo?: HistoryContextInfo | null;
  } | null;
  readonly contactMessage?: {
    readonly displayName?: string | null;
    readonly contextInfo?: HistoryContextInfo | null;
  } | null;
  readonly pollCreationMessage?: HistoryPollCreation | null;
  readonly pollCreationMessageV2?: HistoryPollCreation | null;
  readonly pollCreationMessageV3?: HistoryPollCreation | null;
  readonly reactionMessage?: {
    readonly key?: HistoryMessageKey | null;
    readonly text?: string | null;
    readonly senderTimestampMs?: ProtoInt;
  } | null;
  readonly protocolMessage?: {
    readonly key?: HistoryMessageKey | null;
    /** `ProtocolMessage.Type`: 0 REVOKE, 14 MESSAGE_EDIT. */
    readonly type?: number | string | null;
    readonly editedMessage?: HistoryMessageContent | null;
    readonly timestampMs?: ProtoInt;
  } | null;
  readonly ephemeralMessage?: { readonly message?: HistoryMessageContent | null } | null;
  readonly viewOnceMessage?: { readonly message?: HistoryMessageContent | null } | null;
  readonly viewOnceMessageV2?: { readonly message?: HistoryMessageContent | null } | null;
  readonly documentWithCaptionMessage?: {
    readonly message?: HistoryMessageContent | null;
  } | null;
  readonly editedMessage?: { readonly message?: HistoryMessageContent | null } | null;
}

export interface HistoryPollCreation {
  readonly name?: string | null;
  readonly options?: readonly { readonly optionName?: string | null }[] | null;
  readonly contextInfo?: HistoryContextInfo | null;
}

export interface HistoryUserReceipt {
  readonly userJid?: string | null;
  readonly receiptTimestamp?: ProtoInt;
  readonly readTimestamp?: ProtoInt;
  readonly playedTimestamp?: ProtoInt;
}

export interface HistoryReaction {
  readonly key?: HistoryMessageKey | null;
  readonly text?: string | null;
  readonly senderTimestampMs?: ProtoInt;
}

/** `waWeb.WebMessageInfo`. */
export interface WebMessageInfo {
  readonly key?: HistoryMessageKey | null;
  readonly message?: HistoryMessageContent | null;
  /** Unix seconds. */
  readonly messageTimestamp?: ProtoInt;
  /** `WebMessageInfo.Status`: 0 ERROR … 5 PLAYED. */
  readonly status?: number | string | null;
  readonly participant?: string | null;
  readonly pushName?: string | null;
  readonly starred?: boolean | null;
  /** `WebMessageInfo.StubType`; 1 is REVOKE. */
  readonly messageStubType?: number | string | null;
  readonly revokeMessageTimestamp?: ProtoInt;
  readonly userReceipt?: readonly HistoryUserReceipt[] | null;
  readonly reactions?: readonly HistoryReaction[] | null;
}

export interface HistoryGroupParticipant {
  readonly userJid?: string | null;
  /** 0 REGULAR, 1 ADMIN, 2 SUPERADMIN. */
  readonly rank?: number | string | null;
}

export interface HistoryConversation {
  readonly id?: string | null;
  readonly messages?: readonly {
    readonly message?: WebMessageInfo | null;
    readonly msgOrderId?: ProtoInt;
  }[] | null;
  readonly newJid?: string | null;
  readonly lastMsgTimestamp?: ProtoInt;
  readonly unreadCount?: number | null;
  readonly readOnly?: boolean | null;
  readonly ephemeralExpiration?: number | null;
  readonly conversationTimestamp?: ProtoInt;
  readonly name?: string | null;
  readonly displayName?: string | null;
  readonly archived?: boolean | null;
  readonly markedAsUnread?: boolean | null;
  readonly participant?: readonly HistoryGroupParticipant[] | null;
  /** Pin timestamp; non-zero means pinned. */
  readonly pinned?: ProtoInt;
  /** Unix milliseconds; non-zero means muted until then (-1: always). */
  readonly muteEndTime?: ProtoInt;
  readonly createdAt?: ProtoInt;
  readonly createdBy?: string | null;
  readonly description?: string | null;
  readonly pnJid?: string | null;
  readonly lidJid?: string | null;
  readonly username?: string | null;
}

/** A decoded `HistorySync` protobuf object. */
export interface HistorySyncChunk {
  readonly syncType?: number | HistorySyncTypeName | string | null;
  readonly conversations?: readonly HistoryConversation[] | null;
  readonly statusV3Messages?: readonly WebMessageInfo[] | null;
  readonly chunkOrder?: ProtoInt;
  readonly progress?: ProtoInt;
  readonly pushnames?: readonly {
    readonly id?: string | null;
    readonly pushname?: string | null;
  }[] | null;
  readonly pastParticipants?: readonly {
    readonly groupJid?: string | null;
    readonly pastParticipants?: readonly {
      readonly userJid?: string | null;
      /** 0 LEFT, 1 REMOVED. */
      readonly leaveReason?: number | string | null;
      /** Unix seconds. */
      readonly leaveTs?: ProtoInt;
    }[] | null;
  }[] | null;
  readonly phoneNumberToLidMappings?: readonly {
    readonly pnJid?: string | null;
    readonly lidJid?: string | null;
  }[] | null;
}

/**
 * Maps native WhatsApp identifiers in a chunk to Polymorfa IDs, so history
 * rows merge with rows written from webhook events. Build it with
 * `historyIdentityIndex` from the `history.sync` event payload.
 */
export interface HistoryIdentityIndex {
  /** Chat JID to Polymorfa conversation ID. */
  readonly conversations?: Readonly<Record<string, string>>;
  /** User JID to Polymorfa conversation ID of that user. */
  readonly contacts?: Readonly<Record<string, string>>;
  readonly messages?: readonly {
    /** The WhatsApp message ID (`key.id`). */
    readonly nativeId: string;
    /** Polymorfa message ID. */
    readonly id: string;
    /** Polymorfa conversation ID. */
    readonly chatId: string;
    readonly fromMe?: boolean;
  }[];
}

export interface HistoryChunkInput {
  readonly sessionId: string;
  readonly chunk: HistorySyncChunk;
  readonly identities?: HistoryIdentityIndex;
  /**
   * Stable ID of the chunk, for example the history notification's message
   * ID. Used to skip a chunk that was already applied.
   */
  readonly chunkId?: string;
}
