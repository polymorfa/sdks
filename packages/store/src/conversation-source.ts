import type {
  ConversationDataSource,
  ConversationEvent,
  ConversationMessage,
  ConversationPage,
  OutgoingMessage,
} from "@polymorfa/browser";

import type { MessageInput, PolymorfaStore } from "./store.js";
import type { StoredMessage } from "./types.js";

export interface StoreConversationSourceOptions {
  readonly conversationId: string;
  /** Messages per local page. */
  readonly pageSize?: number;
  /**
   * Reads history from your backend. The first page reconciles the local
   * copy in the background; later cursors page through the backend.
   */
  readonly load?: (
    cursor: string | undefined,
    signal?: AbortSignal,
  ) => Promise<ConversationPage>;
  /** Sends through your backend or `BrowserMessagingClient`. */
  readonly send: (
    message: OutgoingMessage,
    signal?: AbortSignal,
  ) => Promise<ConversationMessage>;
  /** Session written on messages from `load` and `send`. */
  readonly session?: string;
  /** Reports a failed background reconcile or change read. */
  readonly onError?: (error: unknown) => void;
}

const LOCAL = "store:local:";
const REMOTE = "store:remote";

const RECEIPT_RANK = { delivered: 1, read: 2, played: 3 } as const;
type ReceiptState = keyof typeof RECEIPT_RANK;

const isReceiptState = (value: unknown): value is ReceiptState =>
  value === "delivered" || value === "read" || value === "played";

/**
 * The stored receipt with the furthest state seen. Acknowledgements advance
 * `status` without touching a receipt cached from history, so neither may
 * move the other back.
 */
function receiptOf(
  row: StoredMessage,
): Pick<ConversationMessage, "receipt"> | Record<string, never> {
  const fromStatus = isReceiptState(row.status) ? row.status : undefined;
  const fromReceipt = row.receipt?.state;
  if (fromStatus === undefined && row.receipt === undefined) return {};
  const state =
    fromStatus === undefined
      ? fromReceipt
      : fromReceipt === undefined ||
          RECEIPT_RANK[fromStatus] >= RECEIPT_RANK[fromReceipt]
        ? fromStatus
        : fromReceipt;
  return {
    receipt: { ...row.receipt, ...(state === undefined ? {} : { state }) },
  };
}

/** Maps a stored row to the `@polymorfa/browser` message shape. */
export function toConversationMessage(row: StoredMessage): ConversationMessage {
  return {
    id: row.id,
    ...(row.clientId === undefined ? {} : { clientId: row.clientId }),
    text: row.text ?? row.caption ?? "",
    createdAt: row.createdAt,
    direction: row.fromMe ? "outbound" : "inbound",
    status:
      row.status === "pending" || row.status === "failed" ? row.status : "sent",
    ...receiptOf(row),
    ...(row.replyTo === undefined ? {} : { replyTo: row.replyTo }),
    ...(row.attachments === undefined || row.attachments.length === 0
      ? {}
      : { attachments: row.attachments }),
    ...(row.linkPreview === undefined ? {} : { linkPreview: row.linkPreview }),
  };
}

/**
 * Fold an HD upload into its standard parent: the parent's first matching
 * picture or video gains an `hd` variant. Either may arrive first; a child
 * whose parent has not arrived stays hidden, as the parent will show it.
 */
export function withHdVariant(
  parent: ConversationMessage,
  child: StoredMessage | undefined,
): ConversationMessage {
  const media = child?.attachments?.[0];
  if (child?.association === undefined || media === undefined) return parent;
  const kind = child.association.type === "hd_video" ? "video/" : "image/";
  const index =
    parent.attachments?.findIndex((attachment) =>
      attachment.contentType.toLowerCase().startsWith(kind),
    ) ?? -1;
  if (parent.attachments === undefined || index === -1) return parent;
  const attachments = [...parent.attachments];
  const target = attachments[index]!;
  attachments[index] = {
    ...target,
    hd: {
      ...(media.url === undefined ? {} : { url: media.url }),
      ...(media.previewUrl === undefined
        ? {}
        : { previewUrl: media.previewUrl }),
      ...(media.size > 0 ? { size: media.size } : {}),
      ...(media.width === undefined ? {} : { width: media.width }),
      ...(media.height === undefined ? {} : { height: media.height }),
    },
  };
  return { ...parent, attachments };
}

function toInput(
  conversationId: string,
  message: ConversationMessage,
): MessageInput {
  return {
    id: message.id,
    conversationId,
    createdAt: message.createdAt,
    fromMe: message.direction === "outbound",
    text: message.text,
    status: message.status,
    ...(message.receipt === undefined ? {} : { receipt: message.receipt }),
    ...(message.clientId === undefined ? {} : { clientId: message.clientId }),
    ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo }),
    ...(message.attachments === undefined
      ? {}
      : { attachments: message.attachments }),
    ...(message.linkPreview === undefined
      ? {}
      : { linkPreview: message.linkPreview }),
  };
}

/**
 * A `ConversationDataSource` that reads the local store first, reconciles
 * with your backend, and follows store changes, so `ConversationController`
 * and the React and Web Component chat views work on top of it.
 */
export function createStoreConversationSource(
  store: PolymorfaStore,
  options: StoreConversationSourceOptions,
): ConversationDataSource {
  const { conversationId } = options;
  const pageSize = Math.max(1, options.pageSize ?? 50);
  const upsertOptions =
    options.session === undefined ? {} : { session: options.session };
  let reconcile: Promise<string | undefined> | undefined;
  const listeners = new Set<(event: ConversationEvent) => void>();
  let buffered: ConversationEvent[] = [];
  let storeUnsubscribe: (() => void) | undefined;
  // HD children seen in this conversation, keyed by their parent's ID.
  const hdChildren = new Map<string, StoredMessage>();
  // IDs of messages already returned from a local page.
  const shown = new Set<string>();

  const emit = (event: ConversationEvent) => {
    if (listeners.size === 0) buffered.push(event);
    for (const listener of listeners) listener(event);
  };

  const remotePage = async (
    cursor: string | undefined,
    signal?: AbortSignal,
  ) => {
    if (options.load === undefined) return { messages: [] };
    const page = await options.load(cursor, signal);
    await store.messages.upsert(
      page.messages.map((message) => toInput(conversationId, message)),
      upsertOptions,
    );
    return page;
  };

  /** Re-emits a stored parent so it shows its HD child. */
  const refreshParent = async (child: StoredMessage): Promise<void> => {
    const parentId = child.association?.parentMessageId;
    if (parentId === undefined) return;
    const parent = await store.messages.get(parentId);
    if (
      parent !== undefined &&
      parent.conversationId === conversationId &&
      parent.deleted !== true &&
      parent.stub !== true
    )
      emit({
        type: "upsert",
        message: withHdVariant(toConversationMessage(parent), child),
      });
  };

  /** Visible messages for stored rows, with HD children folded into parents. */
  const present = async (
    rows: readonly StoredMessage[],
  ): Promise<ConversationMessage[]> => {
    const children = new Map<string, StoredMessage>();
    for (const row of rows)
      if (row.association !== undefined) {
        children.set(row.association.parentMessageId, row);
        // Remember it for a parent that arrives later.
        hdChildren.set(row.association.parentMessageId, row);
      }
    const visible = rows.filter((row) => row.association === undefined);
    const messages = await Promise.all(
      visible.map(async (row) =>
        withHdVariant(
          toConversationMessage(row),
          children.get(row.id) ?? (await hdChildOf(row)),
        ),
      ),
    );
    // A child on this page whose parent an earlier page already returned:
    // that parent was shown without HD, so refresh it.
    for (const [parentId, child] of children)
      if (shown.has(parentId) && !visible.some((row) => row.id === parentId))
        await refreshParent(child).catch((error: unknown) =>
          options.onError?.(error),
        );
    for (const row of visible) shown.add(row.id);
    return messages;
  };

  /** A parent's HD child stored outside the current page, if any. */
  const hdChildOf = async (
    row: StoredMessage,
  ): Promise<StoredMessage | undefined> => {
    const media = row.attachments?.[0]?.contentType.toLowerCase() ?? "";
    if (!media.startsWith("image/") && !media.startsWith("video/"))
      return undefined;
    return hdChildren.get(row.id);
  };

  const localPage = async (
    before: { readonly at: number; readonly id?: string } | undefined,
  ): Promise<ConversationPage> => {
    const rows = await store.messages.list({
      conversationId,
      limit: pageSize,
      ...(before === undefined ? {} : { before: before.at }),
      ...(before?.id === undefined ? {} : { beforeId: before.id }),
    });
    const oldest = rows.at(-1);
    // The ID breaks ties between messages that share a timestamp.
    const nextCursor =
      rows.length === pageSize && oldest !== undefined
        ? `${LOCAL}${oldest.createdAt}:${encodeURIComponent(oldest.id)}`
        : options.load === undefined
          ? undefined
          : REMOTE;
    return {
      messages: await present(rows),
      ...(nextCursor === undefined ? {} : { nextCursor }),
    };
  };

  return {
    async load(cursor, signal) {
      if (cursor === undefined) {
        shown.clear();
        const local = await localPage(undefined);
        if (options.load === undefined) return local;
        const remote = remotePage(undefined, signal);
        reconcile = remote.then(
          (page) => page.nextCursor,
          () => undefined,
        );
        if (local.messages.length === 0) {
          const page = await remote;
          return page.nextCursor === undefined
            ? { messages: page.messages }
            : { messages: page.messages, nextCursor: page.nextCursor };
        }
        buffered = [];
        remote.then(
          (page) => {
            if (signal?.aborted === true) return;
            for (const message of page.messages)
              emit({ type: "upsert", message });
          },
          (error: unknown) => options.onError?.(error),
        );
        return local;
      }
      if (cursor.startsWith(LOCAL)) {
        const value = cursor.slice(LOCAL.length);
        const split = value.indexOf(":");
        return localPage(
          split === -1
            ? { at: Number(value) }
            : {
                at: Number(value.slice(0, split)),
                id: decodeURIComponent(value.slice(split + 1)),
              },
        );
      }
      if (cursor === REMOTE) {
        const next = await (reconcile ?? Promise.resolve(undefined)).catch(
          () => undefined,
        );
        return next === undefined ? { messages: [] } : remotePage(next, signal);
      }
      return remotePage(cursor, signal);
    },

    subscribe(listener) {
      listeners.add(listener);
      const pending = buffered;
      buffered = [];
      for (const event of pending) listener(event);
      // One store subscription fans out to every listener.
      storeUnsubscribe ??= store.subscribe("messages", (change) => {
        for (const messageId of change.deleted)
          emit({ type: "delete", messageId });
        if (change.keys.length === 0) return;
        void Promise.all(change.keys.map((id) => store.messages.get(id))).then(
          (rows) => {
            for (const row of rows) {
              if (row === undefined || row.conversationId !== conversationId)
                continue;
              if (row.association !== undefined) {
                // A child refreshes its parent, which shows it as HD.
                hdChildren.set(row.association.parentMessageId, row);
                void refreshParent(row).catch((error: unknown) =>
                  options.onError?.(error),
                );
                continue;
              }
              if (row.deleted === true)
                emit({ type: "delete", messageId: row.id });
              else if (row.stub !== true)
                emit({
                  type: "upsert",
                  message: withHdVariant(
                    toConversationMessage(row),
                    hdChildren.get(row.id),
                  ),
                });
            }
          },
          (error: unknown) => options.onError?.(error),
        );
      });
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          storeUnsubscribe?.();
          storeUnsubscribe = undefined;
        }
      };
    },

    async send(message, signal) {
      const acknowledged = await options.send(message, signal);
      await store.messages.upsert(
        [
          toInput(conversationId, {
            ...acknowledged,
            clientId: acknowledged.clientId ?? message.clientId,
          }),
        ],
        upsertOptions,
      );
      return acknowledged;
    },
  };
}
