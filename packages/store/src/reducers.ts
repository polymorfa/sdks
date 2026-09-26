import type {
  ConversationReferenceView,
  DataStoreName,
  IdentityReferenceView,
  PolymorfaEvent,
  StoreRowMap,
  StoredCall,
  StoredCallState,
  StoredConversation,
  StoredMessage,
  StoredMessageStatus,
  StoredRow,
} from "./types.js";

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** The write surface a reducer sees. Writes commit with the whole batch. */
export interface ReducerContext {
  /** Event time in epoch milliseconds. */
  readonly time: number;
  get<S extends DataStoreName>(
    store: S,
    id: string,
  ): Promise<StoreRowMap[S] | undefined>;
  put<S extends DataStoreName>(store: S, row: StoreRowMap[S]): void;
  delete(store: DataStoreName, id: string): void;
  /** Deletes every message in a conversation. */
  deleteConversationMessages(conversationId: string): void;
}

/**
 * Applies one event. Return `false` when the event was not filed anywhere,
 * so the store keeps it in `custom`.
 */
export type StoreReducer = (
  event: PolymorfaEvent,
  context: ReducerContext,
) => void | boolean | Promise<void | boolean>;

/** Row keys a reducer is likely to read, fetched in one transaction. */
export type KeyHints = readonly (readonly [DataStoreName, string])[];

type Payload = Record<string, unknown>;

const isRecord = (value: unknown): value is Payload =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const str = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;
const num = (value: unknown): number | undefined =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;
const bool = (value: unknown): boolean | undefined =>
  typeof value === "boolean" ? value : undefined;

function identity(value: unknown): IdentityReferenceView | undefined {
  if (!isRecord(value) || typeof value.id !== "string") return undefined;
  return pick({
    id: value.id,
    phoneNumber: str(value.phoneNumber),
    bsuid: str(value.bsuid),
    username: str(value.username),
  }) as unknown as IdentityReferenceView;
}

function conversationRef(
  value: unknown,
): ConversationReferenceView | undefined {
  const base = identity(value);
  if (base === undefined || !isRecord(value)) return undefined;
  const sender = identity(value.sender);
  return sender === undefined ? base : { ...base, sender };
}

/** `T` with every possibly-undefined field made optional instead. */
export type Defined<T> = {
  [K in keyof T as undefined extends T[K] ? never : K]: T[K];
} & {
  [K in keyof T as undefined extends T[K] ? K : never]?: Exclude<
    T[K],
    undefined
  >;
};

/** Drops `undefined` values so rows stay valid under exact optional types. */
export function pick<T extends object>(value: T): Defined<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Defined<T>;
}

/** Payload times are Unix seconds or milliseconds; returns milliseconds. */
export function payloadTime(value: unknown): number | undefined {
  const numeric =
    typeof value === "string" && /^\d+(\.\d+)?$/.test(value)
      ? Number(value)
      : num(value);
  if (numeric !== undefined)
    return numeric < 1e12 ? Math.round(numeric * 1000) : numeric;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

/**
 * Copies each defined field of `patch` onto `row` unless the row already
 * holds a newer value for that field.
 */
export function applyFields<T extends StoredRow>(
  row: T,
  patch: Partial<T>,
  time: number,
): T {
  const fieldTimes: Record<string, number> = { ...row.fieldTimes };
  const next: Record<string, unknown> = { ...(row as object) };
  for (const [field, value] of Object.entries(patch as object)) {
    if (value === undefined) continue;
    if ((fieldTimes[field] ?? -Infinity) > time) continue;
    next[field] = value;
    fieldTimes[field] = time;
  }
  next.fieldTimes = fieldTimes;
  next._t = Math.max(row._t, time);
  return next as T;
}

const STATUS_RANK: Record<StoredMessageStatus, number> = {
  failed: -1,
  pending: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  played: 4,
};

/** Status only moves forward, whatever order acknowledgements arrive in. */
export function advanceStatus(
  current: StoredMessageStatus,
  next: StoredMessageStatus,
): StoredMessageStatus {
  if (current === "failed") return next === "pending" ? current : next;
  return STATUS_RANK[next] > STATUS_RANK[current] ? next : current;
}

function ackStatus(type: string): StoredMessageStatus | undefined {
  const normalized = type.toLowerCase();
  if (normalized.includes("play")) return "played";
  if (normalized.includes("read")) return "read";
  if (normalized.includes("deliver")) return "delivered";
  if (normalized === "sent" || normalized === "server") return "sent";
  return undefined;
}

function emptyMessage(
  id: string,
  session: string,
  conversationId: string,
  time: number,
): StoredMessage {
  return {
    id,
    _t: time,
    session,
    conversationId,
    createdAt: time,
    fromMe: false,
    status: "sent",
    stub: true,
  };
}

function emptyConversation(id: string, time: number): StoredConversation {
  return { id, _t: time, lastActivity: 0, unreadCount: 0 };
}

function preview(message: StoredMessage): string {
  return message.text ?? message.caption ?? "";
}

/** Upserts message content and updates the conversation summary. */
export async function upsertMessage(
  context: ReducerContext,
  patch: Partial<StoredMessage> & {
    readonly id: string;
    readonly conversationId: string;
    readonly session: string;
  },
  time: number,
  options: { readonly content: boolean; readonly status?: StoredMessageStatus },
): Promise<void> {
  const conversation =
    (await context.get("conversations", patch.conversationId)) ??
    emptyConversation(patch.conversationId, time);
  const createdAt = patch.createdAt ?? time;
  if (
    conversation.clearedAt !== undefined &&
    createdAt <= conversation.clearedAt
  )
    return;
  const existing = await context.get("messages", patch.id);
  if (existing?.deleted === true) return;
  const base =
    existing ??
    emptyMessage(patch.id, patch.session, patch.conversationId, createdAt);
  // `createdAt` and `conversationId` are identity, not state: always accept.
  let next = applyFields(base, patch, time);
  if (patch.createdAt !== undefined) next = { ...next, createdAt };
  if (options.content) next = { ...next, stub: false };
  if (next.stub !== true) {
    const rest: Mutable<StoredMessage> = { ...next };
    delete rest.stub;
    next = rest;
  }
  if (options.status !== undefined)
    next = {
      ...next,
      status: advanceStatus(existing?.status ?? "pending", options.status),
    };
  else if (existing !== undefined) next = { ...next, status: existing.status };
  context.put("messages", next);

  if (next.stub === true) return;
  let summary: StoredConversation = conversation;
  if (createdAt >= conversation.lastActivity) {
    summary = {
      ...summary,
      lastActivity: createdAt,
      lastMessage: pick({
        id: next.id,
        text: preview(next),
        type: next.type,
        fromMe: next.fromMe,
        createdAt,
      }),
    };
  }
  const isNewInbound =
    (existing === undefined || existing.stub === true) &&
    !next.fromMe &&
    createdAt > (conversation.readAt ?? -Infinity);
  if (isNewInbound)
    summary = { ...summary, unreadCount: summary.unreadCount + 1 };
  if (!next.fromMe && next.pushName !== undefined && summary.isGroup !== true)
    summary = applyFields(summary, { name: next.pushName }, time);
  if (summary !== conversation || existing === undefined)
    context.put("conversations", {
      ...summary,
      _t: Math.max(summary._t, time),
      ...(conversation.session === undefined ? { session: patch.session } : {}),
    });
}

async function tombstone(
  context: ReducerContext,
  id: string,
  conversationId: string | undefined,
  event: PolymorfaEvent,
  time: number,
  revoked: boolean,
): Promise<void> {
  const existing = await context.get("messages", id);
  const conversation = existing?.conversationId ?? conversationId;
  if (conversation === undefined) return;
  const base = existing ?? emptyMessage(id, event.session, conversation, time);
  const row: Mutable<StoredMessage> = {
    ...base,
    _t: Math.max(base._t, time),
    deleted: true,
    ...(revoked ? { revoked: true } : {}),
  };
  delete row.text;
  delete row.caption;
  delete row.attachments;
  delete row.mediaUrl;
  delete row.reactions;
  context.put("messages", row);
}

function messageFromPayload(
  event: PolymorfaEvent,
  payload: Payload,
  time: number,
):
  | (Partial<StoredMessage> & {
      id: string;
      conversationId: string;
      session: string;
    })
  | undefined {
  const id = str(payload.id);
  const conversation = conversationRef(payload.conversation);
  if (id === undefined || conversation === undefined) return undefined;
  const mediaUrl = str(payload.mediaUrl);
  const mimeType = str(payload.mimeType);
  const filename = str(payload.filename);
  const type = str(payload.type);
  return pick({
    id,
    session: event.session,
    conversationId: conversation.id,
    createdAt: payloadTime(payload.timestamp) ?? time,
    fromMe: bool(payload.fromMe) ?? false,
    senderId: conversation.sender?.id,
    pushName: str(payload.pushName) ?? str(payload.senderName),
    type,
    text: str(payload.text),
    caption: str(payload.caption),
    mimeType,
    filename,
    mediaUrl,
    edited: bool(payload.edited),
    attachments:
      mediaUrl === undefined
        ? undefined
        : [
            pick({
              id: str(payload.media) ?? id,
              name: filename ?? type ?? "attachment",
              size: 0,
              contentType: mimeType ?? "application/octet-stream",
              url: mediaUrl,
            }),
          ],
  });
}

const receivedMessage: StoreReducer = async (event, context) => {
  if (!isRecord(event.payload)) return false;
  const payload = event.payload;
  if (typeof payload.revokedId === "string" && payload.type === "revoke") {
    await tombstone(
      context,
      payload.revokedId,
      conversationRef(payload.conversation)?.id,
      event,
      context.time,
      true,
    );
    return;
  }
  const message = messageFromPayload(event, payload, context.time);
  if (message === undefined) return false;
  await upsertMessage(context, message, context.time, {
    content: true,
    ...(message.fromMe === true ? { status: "sent" as const } : {}),
  });
};

const reactionMessage: StoreReducer = async (event, context) => {
  if (!isRecord(event.payload)) return false;
  const payload = event.payload;
  const target = str(payload.reactionTo);
  const conversation = conversationRef(payload.conversation);
  if (target === undefined || conversation === undefined) return false;
  const reactor =
    bool(payload.fromMe) === true
      ? "me"
      : (conversation.sender?.id ?? conversation.id);
  const existing =
    (await context.get("messages", target)) ??
    emptyMessage(target, event.session, conversation.id, context.time);
  if (existing.deleted === true) return;
  const key = `reaction:${reactor}`;
  if ((existing.fieldTimes?.[key] ?? -Infinity) > context.time) return;
  const reactions: Record<string, string> = { ...existing.reactions };
  const reaction = str(payload.reaction) ?? "";
  if (reaction === "") delete reactions[reactor];
  else reactions[reactor] = reaction;
  context.put("messages", {
    ...existing,
    reactions,
    fieldTimes: { ...existing.fieldTimes, [key]: context.time },
    _t: Math.max(existing._t, context.time),
  });
};

const sentMessage: StoreReducer = async (event, context) => {
  if (!isRecord(event.payload)) return false;
  const payload = event.payload;
  const id = str(payload.id);
  const conversation = conversationRef(payload.conversation);
  if (id === undefined || conversation === undefined) return false;
  await upsertMessage(
    context,
    pick({
      id,
      session: event.session,
      conversationId: conversation.id,
      createdAt: payloadTime(payload.timestamp) ?? context.time,
      fromMe: true,
      type: str(payload.type),
    }),
    context.time,
    { content: true, status: "sent" },
  );
};

const ackMessage: StoreReducer = async (event, context) => {
  if (!isRecord(event.payload)) return false;
  const payload = event.payload;
  const conversation = conversationRef(payload.conversation);
  const type = str(payload.type) ?? "";
  const status = ackStatus(type);
  if (conversation === undefined || !Array.isArray(payload.messages))
    return false;
  for (const entry of payload.messages) {
    const id = isRecord(entry) ? str(entry.id) : undefined;
    if (id === undefined) continue;
    const existing =
      (await context.get("messages", id)) ??
      emptyMessage(
        id,
        event.session,
        conversation.id,
        payloadTime(payload.timestamp) ?? context.time,
      );
    if (existing.deleted === true) continue;
    context.put("messages", {
      ...existing,
      status:
        status === undefined
          ? existing.status
          : advanceStatus(existing.status, status),
      ...(status === undefined ? { ackType: type } : {}),
      _t: Math.max(existing._t, context.time),
    });
  }
};

const deleteMessage: StoreReducer = async (event, context) => {
  if (!isRecord(event.payload)) return false;
  const id = str(event.payload.id);
  if (id === undefined) return false;
  await tombstone(
    context,
    id,
    conversationRef(event.payload.conversation)?.id,
    event,
    context.time,
    false,
  );
};

const revokedMessage: StoreReducer = async (event, context) => {
  if (!isRecord(event.payload)) return false;
  const payload = event.payload;
  const id = str(payload.revokedId) ?? str(payload.id);
  if (id === undefined) return false;
  await tombstone(
    context,
    id,
    conversationRef(payload.conversation)?.id,
    event,
    context.time,
    true,
  );
};

const voteMessage: StoreReducer = async (event, context) => {
  if (!isRecord(event.payload)) return false;
  const payload = event.payload;
  const target = str(payload.pollMessageId);
  const voter = identity(payload.voter);
  const conversation = conversationRef(payload.conversation);
  if (target === undefined || voter === undefined || conversation === undefined)
    return false;
  const selected = Array.isArray(payload.selectedHashes)
    ? payload.selectedHashes.filter(
        (hash): hash is string => typeof hash === "string",
      )
    : [];
  const time = payloadTime(payload.timestamp) ?? context.time;
  const existing =
    (await context.get("messages", target)) ??
    emptyMessage(target, event.session, conversation.id, time);
  const key = `vote:${voter.id}`;
  if ((existing.fieldTimes?.[key] ?? -Infinity) > time) return;
  context.put("messages", {
    ...existing,
    votes: { ...existing.votes, [voter.id]: selected },
    fieldTimes: { ...existing.fieldTimes, [key]: time },
    _t: Math.max(existing._t, context.time),
  });
};

async function updateConversation(
  context: ReducerContext,
  id: string,
  patch: Partial<StoredConversation>,
  event: PolymorfaEvent,
): Promise<StoredConversation> {
  const existing = (await context.get("conversations", id)) ?? {
    ...emptyConversation(id, context.time),
    session: event.session,
  };
  const next = applyFields(existing, patch, context.time);
  context.put("conversations", next);
  return next;
}

function chatId(event: PolymorfaEvent): string | undefined {
  return isRecord(event.payload) ? identity(event.payload.from)?.id : undefined;
}

const chatRead: StoreReducer = async (event, context) => {
  const id = chatId(event);
  if (id === undefined || !isRecord(event.payload)) return false;
  const read = bool(event.payload.read);
  if (read === undefined) return false;
  const existing = await context.get("conversations", id);
  if (read) {
    if ((existing?.readAt ?? -Infinity) > context.time) return;
    await updateConversation(
      context,
      id,
      { readAt: context.time, markedUnread: false },
      event,
    );
    const updated = await context.get("conversations", id);
    if (updated !== undefined)
      context.put("conversations", { ...updated, unreadCount: 0 });
  } else {
    await updateConversation(context, id, { markedUnread: true }, event);
  }
};

const chatArchive: StoreReducer = async (event, context) => {
  const id = chatId(event);
  if (id === undefined || !isRecord(event.payload)) return false;
  await updateConversation(
    context,
    id,
    pick({
      archived: bool(event.payload.archive),
      pinned: bool(event.payload.pinned),
    }),
    event,
  );
};

const chatMute: StoreReducer = async (event, context) => {
  const id = chatId(event);
  if (id === undefined || !isRecord(event.payload)) return false;
  await updateConversation(
    context,
    id,
    pick({
      muted: bool(event.payload.muted),
      muteEndTimestamp: num(event.payload.muteEndTimestamp),
    }),
    event,
  );
};

function clearChat(deleted: boolean): StoreReducer {
  return async (event, context) => {
    const id = chatId(event);
    if (id === undefined) return false;
    const existing = await context.get("conversations", id);
    if ((existing?.clearedAt ?? -Infinity) >= context.time && !deleted) return;
    context.deleteConversationMessages(id);
    const base = existing ?? {
      ...emptyConversation(id, context.time),
      session: event.session,
    };
    const row: Mutable<StoredConversation> = {
      ...base,
      _t: Math.max(base._t, context.time),
      clearedAt: Math.max(base.clearedAt ?? -Infinity, context.time),
      unreadCount: 0,
      ...(deleted ? { deleted: true } : {}),
    };
    delete row.lastMessage;
    context.put("conversations", row);
  };
}

const contactUpdate: StoreReducer = async (event, context) => {
  if (!isRecord(event.payload)) return false;
  const payload = event.payload;
  const id = str(payload.id);
  if (id === undefined) return false;
  const existing = (await context.get("contacts", id)) ?? {
    id,
    _t: context.time,
  };
  context.put(
    "contacts",
    applyFields(
      existing,
      pick({
        phoneNumber: str(payload.phoneNumber),
        bsuid: str(payload.bsuid),
        username: str(payload.username),
        fullName: str(payload.fullName),
        firstName: str(payload.firstName),
        pushName: str(payload.pushName),
        businessName: str(payload.businessName),
        pictureId: str(payload.pictureId),
        pictureRemoved: bool(payload.pictureRemoved),
      }),
      context.time,
    ),
  );
};

const blocklistUpdate: StoreReducer = async (event, context) => {
  if (!isRecord(event.payload) || !Array.isArray(event.payload.changes))
    return false;
  for (const change of event.payload.changes) {
    if (!isRecord(change)) continue;
    const id = str(change.id);
    const action = str(change.action)?.toLowerCase();
    if (id === undefined || (action !== "block" && action !== "unblock"))
      continue;
    const existing = (await context.get("contacts", id)) ?? {
      id,
      _t: context.time,
    };
    context.put(
      "contacts",
      applyFields(
        existing,
        pick({
          blocked: action === "block",
          phoneNumber: str(change.phoneNumber),
          bsuid: str(change.bsuid),
          username: str(change.username),
        }),
        context.time,
      ),
    );
  }
};

const presenceUpdate: StoreReducer = async (event, context) => {
  if (!isRecord(event.payload)) return false;
  const payload = event.payload;
  const who = identity(payload.from) ?? identity(payload.sender);
  if (who === undefined) return false;
  const observedAt = payloadTime(payload.observedAt) ?? context.time;
  const existing = await context.get("presence", who.id);
  if (existing !== undefined && existing.observedAt > observedAt) return;
  context.put(
    "presence",
    pick({
      id: who.id,
      _t: observedAt,
      observedAt,
      state: str(payload.state),
      media: str(payload.media),
      unavailable: bool(payload.unavailable),
      lastSeen: payloadTime(payload.lastSeen),
    }),
  );
};

const CALL_RANK: Record<StoredCallState, number> = {
  ringing: 0,
  active: 1,
  rejected: 2,
  missed: 2,
  ended: 2,
};

function callEvent(state: StoredCallState | undefined): StoreReducer {
  return async (event, context) => {
    if (!isRecord(event.payload)) return false;
    const payload = event.payload;
    const callId = str(payload.callId);
    if (callId === undefined) return false;
    const existing: StoredCall = (await context.get("calls", callId)) ?? {
      id: callId,
      _t: context.time,
      session: event.session,
      state: "ringing",
      startedAt: context.time,
    };
    const from = identity(payload.from);
    let next: StoredCall = applyFields(
      existing,
      pick({
        from,
        direction:
          payload.direction === "inbound" || payload.direction === "outbound"
            ? payload.direction
            : (existing.direction ??
              (event.event === "call.received" ? "inbound" : undefined)),
        reason: str(payload.reason),
        durationSeconds: num(payload.durationSeconds),
        hadVideo: bool(payload.hadVideo),
      }) as Partial<StoredCall>,
      context.time,
    );
    if (state !== undefined) {
      const stateAt = existing.fieldTimes?.state;
      const incoming = CALL_RANK[state];
      const current = CALL_RANK[existing.state];
      const accept =
        stateAt === undefined
          ? incoming >= current
          : incoming > current ||
            (incoming === current && incoming < 2 && context.time >= stateAt);
      if (accept)
        next = {
          ...next,
          state,
          fieldTimes: { ...next.fieldTimes, state: context.time },
        };
      if (state === "ringing" && context.time < next.startedAt)
        next = { ...next, startedAt: context.time };
      if (state === "active" && next.acceptedAt === undefined)
        next = { ...next, acceptedAt: context.time };
      if (CALL_RANK[state] === 2 && next.endedAt === undefined)
        next = { ...next, endedAt: context.time };
    }
    context.put("calls", next);
  };
}

const callParticipant: StoreReducer = async (event, context) => {
  if (!isRecord(event.payload)) return false;
  const payload = event.payload;
  const callId = str(payload.callId);
  if (callId === undefined) return false;
  const existing: StoredCall = (await context.get("calls", callId)) ?? {
    id: callId,
    _t: context.time,
    session: event.session,
    state: "active",
    startedAt: context.time,
  };
  const participant = isRecord(payload.participant)
    ? payload.participant
    : undefined;
  const participantId = str(participant?.id) ?? str(payload.participantId);
  if (participantId === undefined) return false;
  const key = `participant:${participantId}`;
  if ((existing.fieldTimes?.[key] ?? -Infinity) > context.time) return;
  const previous = existing.participants?.[participantId];
  const updated = pick({
    id: participantId,
    state:
      event.event === "call.participant_left"
        ? "left"
        : (str(participant?.state) ?? previous?.state ?? "connected"),
    phoneNumber: str(participant?.phoneNumber) ?? previous?.phoneNumber,
    username: str(participant?.username) ?? previous?.username,
    reason: str(payload.reason),
  });
  context.put("calls", {
    ...existing,
    participants: { ...existing.participants, [participantId]: updated },
    fieldTimes: { ...existing.fieldTimes, [key]: context.time },
    _t: Math.max(existing._t, context.time),
  });
};

const callTelemetry: StoreReducer = async (event, context) => {
  if (!isRecord(event.payload)) return false;
  const callId = str(event.payload.callId);
  if (callId === undefined) return false;
  const existing: StoredCall = (await context.get("calls", callId)) ?? {
    id: callId,
    _t: context.time,
    session: event.session,
    state: "ended",
    startedAt: context.time,
  };
  context.put(
    "calls",
    applyFields(existing, { telemetry: event.payload }, context.time),
  );
};

const labelsUpdate: StoreReducer = async (event, context) => {
  if (!isRecord(event.payload)) return false;
  const payload = event.payload;
  const action = str(payload.action);
  const labelId = str(payload.labelId);
  const messageId = str(payload.messageId);
  if (action === "label_edit" && labelId !== undefined) {
    const existing = (await context.get("labels", labelId)) ?? {
      id: labelId,
      _t: context.time,
    };
    context.put(
      "labels",
      applyFields(
        existing,
        pick({
          name: str(payload.name) ?? str(payload.label),
          color: num(payload.color),
          orderIndex: num(payload.orderIndex),
          deleted: bool(payload.deleted),
        }),
        context.time,
      ),
    );
    return;
  }
  if (action === "label_association_chat" && labelId !== undefined) {
    const id = identity(payload.from)?.id;
    const labeled = bool(payload.labeled);
    if (id === undefined || labeled === undefined) return false;
    const existing = (await context.get("conversations", id)) ?? {
      ...emptyConversation(id, context.time),
      session: event.session,
    };
    context.put(
      "conversations",
      toggleLabel(existing, labelId, labeled, context.time),
    );
    return;
  }
  if (
    action === "label_association_message" &&
    labelId !== undefined &&
    messageId !== undefined
  ) {
    const labeled = bool(payload.labeled);
    const existing = await context.get("messages", messageId);
    if (existing === undefined || labeled === undefined) return false;
    context.put(
      "messages",
      toggleLabel(existing, labelId, labeled, context.time),
    );
    return;
  }
  if (action === "star" && messageId !== undefined) {
    const starred = bool(payload.starred);
    const existing = await context.get("messages", messageId);
    if (existing === undefined || starred === undefined) return false;
    context.put("messages", applyFields(existing, { starred }, context.time));
    return;
  }
  return false;
};

function toggleLabel<
  T extends StoredRow & { readonly labelIds?: readonly string[] },
>(row: T, labelId: string, labeled: boolean, time: number): T {
  const key = `label:${labelId}`;
  if ((row.fieldTimes?.[key] ?? -Infinity) > time) return row;
  const labels = new Set(row.labelIds ?? []);
  if (labeled) labels.add(labelId);
  else labels.delete(labelId);
  return {
    ...row,
    labelIds: [...labels],
    fieldTimes: { ...row.fieldTimes, [key]: time },
    _t: Math.max(row._t, time),
  };
}

function sessionEvent(
  patch: (payload: Payload) => Record<string, unknown>,
): StoreReducer {
  return async (event, context) => {
    if (!isRecord(event.payload)) return false;
    const existing = (await context.get("sessions", event.session)) ?? {
      id: event.session,
      _t: context.time,
    };
    context.put(
      "sessions",
      applyFields(existing, pick(patch(event.payload)), context.time),
    );
  };
}

const templateStatus: StoreReducer = async (event, context) => {
  if (!isRecord(event.payload)) return false;
  const payload = event.payload;
  const id = str(payload.templateId);
  if (id === undefined) return false;
  const existing = (await context.get("templates", id)) ?? {
    id,
    _t: context.time,
  };
  context.put(
    "templates",
    applyFields(
      existing,
      pick({
        templateName: str(payload.templateName),
        status: str(
          payload.kind === "message_template_status_update"
            ? payload.event
            : payload.status,
        ),
        category: str(payload.category),
        reason: str(payload.reason),
        qualityRating: str(
          payload.kind === "message_template_quality_update"
            ? payload.newQualityScore
            : payload.qualityRating,
        ),
        language: str(payload.language),
        wabaId: str(payload.wabaId),
      }),
      context.time,
    ),
  );
};

const groupUpdate: StoreReducer = async (event, context) => {
  if (!isRecord(event.payload)) return false;
  const id = str(event.payload.id);
  if (id === undefined) return false;
  await updateConversation(
    context,
    id,
    pick({
      isGroup: true,
      name: str(event.payload.newSubject),
      description: str(event.payload.newDescription),
    }),
    event,
  );
};

export const BUILT_IN_REDUCERS: Readonly<Record<string, StoreReducer>> = {
  "message.received": receivedMessage,
  "message.update": receivedMessage,
  "message.edited": receivedMessage,
  "message.reaction": reactionMessage,
  "message.sent": sentMessage,
  "message.ack": ackMessage,
  "message.delete": deleteMessage,
  "message.revoked": revokedMessage,
  "message.vote": voteMessage,
  "chat.read": chatRead,
  "chat.archive": chatArchive,
  "chat.mute": chatMute,
  "chat.clear": clearChat(false),
  "chat.delete": clearChat(true),
  "contact.update": contactUpdate,
  "blocklist.update": blocklistUpdate,
  "presence.update": presenceUpdate,
  "call.received": callEvent("ringing"),
  "call.accepted": callEvent("active"),
  "call.rejected": callEvent("rejected"),
  "call.missed": callEvent("missed"),
  "call.ended": callEvent("ended"),
  "call.participant_joined": callParticipant,
  "call.participant_state": callParticipant,
  "call.participant_left": callParticipant,
  "call.telemetry": callTelemetry,
  "labels.update": labelsUpdate,
  "session.status": sessionEvent((payload) =>
    payload.source === "meta"
      ? {
          cloudAccountNotification: {
            kind: str(payload.kind),
            wabaId: str(payload.wabaId),
            value: payload.value,
          },
        }
      : {
          status: str(payload.status),
          statusReason: str(payload.statusReason),
        },
  ),
  "session.connected": sessionEvent((payload) => ({
    status: "connected",
    phoneNumber: str(payload.phoneNumber),
    pushName: str(payload.pushName),
    phonePlatform: str(payload.phonePlatform),
    accountType: str(payload.accountType),
    businessName: str(payload.businessName),
  })),
  "session.logged_out": sessionEvent((payload) => ({
    status: "logged_out",
    loggedOutReason: str(payload.reason),
  })),
  "session.phone_offline": sessionEvent((payload) => ({
    phoneOffline: {
      daysSinceLastSeen: num(payload.daysSinceLastSeen) ?? 0,
      daysRemaining: num(payload.daysRemaining) ?? 0,
      lastSeen: str(payload.lastSeen) ?? "",
      action: str(payload.action) ?? "",
    },
  })),
  "template.status": templateStatus,
  "group.update": groupUpdate,
};

/** Keys the built-in reducers read, so a batch can load them together. */
export function keyHints(event: PolymorfaEvent): KeyHints {
  if (!isRecord(event.payload)) return [];
  const payload = event.payload;
  const hints: [DataStoreName, string][] = [];
  const add = (store: DataStoreName, key: unknown) => {
    if (typeof key === "string") hints.push([store, key]);
  };
  const conversation = conversationRef(payload.conversation);
  if (conversation !== undefined) add("conversations", conversation.id);
  if (event.event.startsWith("message.")) {
    add("messages", payload.id);
    add("messages", payload.reactionTo);
    add("messages", payload.revokedId);
    add("messages", payload.pollMessageId);
    if (Array.isArray(payload.messages))
      for (const entry of payload.messages)
        if (isRecord(entry)) add("messages", entry.id);
  } else if (event.event.startsWith("chat.")) {
    add("conversations", identity(payload.from)?.id);
  } else if (event.event.startsWith("call.")) {
    add("calls", payload.callId);
  } else if (event.event === "contact.update") {
    add("contacts", payload.id);
  } else if (event.event === "presence.update") {
    add("presence", (identity(payload.from) ?? identity(payload.sender))?.id);
  } else if (event.event.startsWith("session.")) {
    add("sessions", event.session);
  } else if (event.event === "template.status") {
    add("templates", payload.templateId);
  } else if (event.event === "labels.update") {
    add("labels", payload.labelId);
    add("messages", payload.messageId);
    add("conversations", identity(payload.from)?.id);
  } else if (event.event === "group.update") {
    add("conversations", payload.id);
  }
  return hints;
}
