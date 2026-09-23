import type { ConversationMessage } from "@polymorfa/browser";

/**
 * Opt-in, per-device copy of recently viewed conversations, so a chat can
 * render before the network answers. Small and self-contained so the SDK can
 * absorb it later.
 */
export interface ConversationCache<T extends ConversationMessage> {
  read(key: string): Promise<CachedConversation<T> | undefined>;
  write(
    key: string,
    messages: readonly T[],
    nextCursor?: string,
  ): Promise<void>;
  clear(): Promise<void>;
}

export interface CachedConversation<T> {
  readonly messages: readonly T[];
  /** The backend cursor for older messages, when there were more. */
  readonly nextCursor?: string;
  readonly savedAt: number;
}

const DB_NAME = "acme-conversations";
const STORE = "conversations";
const MAX_MESSAGES = 150;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
}

export class IndexedDbConversationCache<
  T extends ConversationMessage,
> implements ConversationCache<T> {
  #db: Promise<IDBDatabase> | undefined;

  #open(): Promise<IDBDatabase> {
    this.#db ??= new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => reject(open.error);
    });
    return this.#db;
  }

  async read(key: string): Promise<CachedConversation<T> | undefined> {
    const db = await this.#open();
    const value = (await request(
      db.transaction(STORE).objectStore(STORE).get(key),
    )) as CachedConversation<T> | undefined;
    if (value === undefined || Date.now() - value.savedAt > MAX_AGE_MS) {
      return undefined;
    }
    return value;
  }

  async write(
    key: string,
    messages: readonly T[],
    nextCursor?: string,
  ): Promise<void> {
    const db = await this.#open();
    // Only settled messages are cached; pending sends are not replayed.
    const settled = messages
      .filter((message) => message.status === "sent")
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(-MAX_MESSAGES);
    const value: CachedConversation<T> = {
      messages: settled,
      ...(nextCursor === undefined ? {} : { nextCursor }),
      savedAt: Date.now(),
    };
    await request(
      db.transaction(STORE, "readwrite").objectStore(STORE).put(value, key),
    );
  }

  async clear(): Promise<void> {
    const db = await this.#open();
    await request(
      db.transaction(STORE, "readwrite").objectStore(STORE).clear(),
    );
  }
}

let shared: IndexedDbConversationCache<ConversationMessage> | undefined;

/** The device cache, or `undefined` where IndexedDB is unavailable. */
export function deviceConversationCache<T extends ConversationMessage>():
  ConversationCache<T> | undefined {
  if (typeof indexedDB === "undefined") return undefined;
  shared ??= new IndexedDbConversationCache();
  return shared as unknown as ConversationCache<T>;
}

/** Removes every cached conversation, for sign-out or when the user opts out. */
export async function clearDeviceConversationCache(): Promise<void> {
  await deviceConversationCache()
    ?.clear()
    .catch(() => undefined);
}
