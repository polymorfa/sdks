import type {
  InboxChange,
  InboxConversation,
  InboxDataSource,
} from "@polymorfa/browser";

import { createStoreConversationSource } from "./conversation-source.js";
import type { PolymorfaStore } from "./store.js";
import type { StoredContact, StoredConversation } from "./types.js";

export interface StoreInboxSourceOptions {
  /**
   * The backend source, usually `createHandlerInboxSource(client)`. It
   * serves history the store does not have yet and sends messages.
   */
  readonly backend: InboxDataSource;
  /** Conversations read from the store. Default 200. */
  readonly limit?: number;
  readonly onError?: (error: unknown) => void;
}

/**
 * An `<Inbox/>` source that renders from the local store first, fills gaps
 * from your backend and follows store changes, so the list and open
 * conversations update as events are ingested.
 */
export function createStoreInboxSource(
  store: PolymorfaStore,
  options: StoreInboxSourceOptions,
): InboxDataSource {
  const { backend } = options;
  const limit = options.limit ?? 200;
  return {
    async listConversations(cursor, signal) {
      if (cursor !== undefined)
        return backend.listConversations(cursor, signal);
      const rows = (await store.conversations.list({ limit })).filter(
        (row) => row.deleted !== true,
      );
      if (rows.length === 0)
        return backend.listConversations(undefined, signal);
      const contacts = await Promise.all(
        rows.map((row) => store.contacts.get(row.id)),
      );
      return {
        conversations: rows.map((row, index) =>
          toInboxConversation(row, contacts[index]),
        ),
      };
    },
    conversation(conversation) {
      const remote = backend.conversation(conversation);
      return createStoreConversationSource(store, {
        conversationId: conversation.id,
        load: (cursor, signal) => remote.load(cursor, signal),
        send: (message, signal) => remote.send(message, signal),
        ...(conversation.session === undefined
          ? {}
          : { session: conversation.session }),
        ...(options.onError === undefined ? {} : { onError: options.onError }),
      });
    },
    ...(backend.contact === undefined
      ? {}
      : {
          contact: (conversation, signal) =>
            backend.contact!(conversation, signal),
        }),
    subscribe(listener: (change: InboxChange) => void) {
      return store.subscribe("conversations", (change) => {
        for (const id of change.deleted)
          listener({ type: "remove", conversationId: id });
        if (change.keys.length === 0) return;
        void Promise.all(
          change.keys.map(async (id) => {
            const [row, contact] = await Promise.all([
              store.conversations.get(id),
              store.contacts.get(id),
            ]);
            if (row === undefined || row.deleted === true) return;
            listener({
              type: "conversation",
              conversation: toInboxConversation(row, contact),
            });
          }),
        ).catch((error: unknown) => options.onError?.(error));
      });
    },
    close() {
      backend.close?.();
    },
  };
}

function toInboxConversation(
  row: StoredConversation,
  contact: StoredContact | undefined,
): InboxConversation {
  const name =
    row.name ??
    contact?.fullName ??
    contact?.businessName ??
    contact?.pushName ??
    undefined;
  return {
    id: row.id,
    ...(row.session === undefined ? {} : { session: row.session }),
    ...(name === undefined ? {} : { name }),
    ...(contact?.phoneNumber === undefined
      ? {}
      : { phoneNumber: contact.phoneNumber }),
    ...(row.lastMessage === undefined
      ? {}
      : {
          lastMessage: {
            text: row.lastMessage.text,
            createdAt: row.lastMessage.createdAt,
            direction: row.lastMessage.fromMe ? "outbound" : "inbound",
          },
        }),
    lastActivity: row.lastActivity,
    unreadCount: row.unreadCount,
  };
}
