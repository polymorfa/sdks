import {
  ObservableController,
  type ControllerSnapshot,
} from "../controller.js";
import type {
  ConversationMessage,
  ConversationMessageKind,
  MessageDirection,
  MessageOrder,
} from "./conversation.js";

export interface MessageFilters {
  readonly query: string;
  readonly type: ConversationMessageKind | "all";
  readonly direction: MessageDirection | "all";
}

export interface MessageFilterSnapshot
  extends MessageFilters, ControllerSnapshot {}

export const DEFAULT_MESSAGE_FILTERS: MessageFilters = Object.freeze({
  query: "",
  type: "all",
  direction: "all",
});

export function orderSearchText(order: MessageOrder | undefined): string {
  return !order || order === "unreadable"
    ? ""
    : [
        order.catalogId,
        order.text ?? "",
        ...order.items.map((item) => item.productRetailerId),
      ].join(" ");
}

export function conversationMessageKind(
  message: ConversationMessage,
): ConversationMessageKind {
  if (message.messageType) return message.messageType;
  if (message.order) return "order";
  const attachment = message.attachments?.[0];
  if (!attachment) return "text";
  if (attachment.contentType.startsWith("image/")) return "image";
  if (attachment.contentType.startsWith("video/")) return "video";
  if (attachment.contentType.startsWith("audio/")) return "audio";
  return "document";
}

/** Search only the loaded, available content. Never requests or retains history. */
export function messageMatchesFilters(
  message: ConversationMessage,
  filters: MessageFilters,
  locale?: string,
): boolean {
  if (
    filters.type !== "all" &&
    conversationMessageKind(message) !== filters.type
  )
    return false;
  if (filters.direction !== "all" && message.direction !== filters.direction)
    return false;
  if (filters.query === "") return true;
  if (message.contentState && message.contentState !== "available")
    return false;
  return [
    message.text,
    ...(message.attachments ?? []).map((file) => file.name),
    orderSearchText(message.order),
  ]
    .join(" ")
    .toLocaleLowerCase(locale)
    .includes(filters.query.toLocaleLowerCase(locale));
}

/** Framework-neutral local filter state. Changing it never reloads or cancels a conversation. */
export class MessageFilterController extends ObservableController<MessageFilterSnapshot> {
  constructor(initial: Partial<MessageFilters> = {}) {
    super({ ...DEFAULT_MESSAGE_FILTERS, ...initial });
  }
  setQuery(query: string): void {
    this.update({ query });
  }
  setType(type: MessageFilters["type"]): void {
    this.update({ type });
  }
  setDirection(direction: MessageFilters["direction"]): void {
    this.update({ direction });
  }
  clear(): void {
    this.transition(DEFAULT_MESSAGE_FILTERS);
  }
  matches(message: ConversationMessage, locale?: string): boolean {
    return messageMatchesFilters(message, this.getSnapshot(), locale);
  }
  private update(next: Partial<MessageFilters>): void {
    const current = this.getSnapshot();
    this.transition({
      query: current.query,
      type: current.type,
      direction: current.direction,
      ...next,
    });
  }
}
