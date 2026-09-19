import { InputError } from "../route.js";
import type { DeskMessage } from "./types.js";

export interface MessagePage {
  readonly messages: readonly DeskMessage[];
  readonly nextCursor?: string;
}

/**
 * Where conversation history comes from. The app records every message it
 * receives by webhook or sends itself, and serves history from its own
 * routes when a page opens.
 */
export interface HistorySource {
  /** Newest-last page for a ticket, paged backwards with an opaque cursor. */
  page(ticketId: string, cursor?: string): MessagePage;
  get(ticketId: string, messageId: string): DeskMessage | undefined;
  /** Inserts or replaces by id or client id; returns whether it was new. */
  record(message: DeskMessage): boolean;
  /** Messages stored before the others, for seeded or imported history. */
  prepend(ticketId: string, messages: readonly DeskMessage[]): void;
  all(): Iterable<DeskMessage>;
}

const PAGE_SIZE = 40;
const PER_TICKET_LIMIT = 1000;

/** Process-local history. Use your database in production. */
export class MemoryHistorySource implements HistorySource {
  readonly #messages = new Map<string, DeskMessage[]>();

  page(ticketId: string, cursor?: string): MessagePage {
    const messages = this.#messages.get(ticketId) ?? [];
    const end = cursor === undefined ? messages.length : Number(cursor);
    if (!Number.isInteger(end) || end < 0) {
      throw new InputError("cursor is invalid.");
    }
    const start = Math.max(0, end - PAGE_SIZE);
    return {
      messages: messages.slice(start, end),
      ...(start > 0 ? { nextCursor: String(start) } : {}),
    };
  }

  get(ticketId: string, messageId: string): DeskMessage | undefined {
    return this.#messages.get(ticketId)?.find((item) => item.id === messageId);
  }

  record(message: DeskMessage): boolean {
    const list = this.#messages.get(message.ticketId) ?? [];
    const index = list.findIndex(
      (item) =>
        item.id === message.id ||
        (message.clientId !== undefined && item.clientId === message.clientId),
    );
    if (index === -1) list.push(message);
    else list[index] = message;
    this.#messages.set(message.ticketId, list.slice(-PER_TICKET_LIMIT));
    return index === -1;
  }

  prepend(ticketId: string, messages: readonly DeskMessage[]): void {
    this.#messages.set(ticketId, [
      ...messages,
      ...(this.#messages.get(ticketId) ?? []),
    ]);
  }

  *all(): Iterable<DeskMessage> {
    for (const list of this.#messages.values()) yield* list;
  }
}

/**
 * Placeholder for Polymorfa's hosted message storage (HMS) history.
 *
 * TODO: implement `page` and `get` with the HMS history API once the SDK
 * ships it, and keep `record` as a no-op (HMS stores messages itself). Until
 * then this class is not used; `MemoryHistorySource` serves history.
 */
export class HmsHistorySource implements HistorySource {
  page(): MessagePage {
    throw new Error("HMS history is not available in the SDK yet.");
  }

  get(): DeskMessage | undefined {
    throw new Error("HMS history is not available in the SDK yet.");
  }

  record(): boolean {
    return false;
  }

  prepend(): void {
    // HMS owns stored history; nothing to import locally.
  }

  all(): Iterable<DeskMessage> {
    return [];
  }
}
