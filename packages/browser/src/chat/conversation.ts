import {
  ObservableController,
  type ControllerSnapshot,
} from "../controller.js";

export type MessageDirection = "inbound" | "outbound";
export type MessageStatus = "pending" | "sent" | "failed";

export interface MessageAttachment {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly contentType: string;
}

export interface ConversationMessage {
  readonly id: string;
  readonly clientId?: string;
  readonly text: string;
  readonly createdAt: number;
  readonly direction: MessageDirection;
  readonly status: MessageStatus;
  readonly replyTo?: string;
  readonly attachments?: readonly MessageAttachment[];
  readonly error?: string;
}

export interface OutgoingMessage {
  readonly clientId: string;
  readonly text: string;
  readonly replyTo?: string;
  readonly attachments?: readonly MessageAttachment[];
}

export interface ConversationPage {
  readonly messages: readonly ConversationMessage[];
  readonly nextCursor?: string;
}

export type ConversationEvent =
  | { readonly type: "upsert"; readonly message: ConversationMessage }
  | { readonly type: "delete"; readonly messageId: string };

export interface ConversationDataSource {
  load(cursor?: string, signal?: AbortSignal): Promise<ConversationPage>;
  subscribe(listener: (event: ConversationEvent) => void): () => void;
  send(
    message: OutgoingMessage,
    signal?: AbortSignal,
  ): Promise<ConversationMessage>;
}

export interface ConversationSnapshot extends ControllerSnapshot {
  readonly status: "idle" | "loading" | "ready" | "loading_more" | "error";
  readonly messages: readonly ConversationMessage[];
  readonly hasMore: boolean;
  readonly cursor?: string;
  readonly error?: string;
}

export interface ConversationControllerOptions {
  readonly createClientId?: () => string;
  readonly now?: () => number;
}

export class ConversationController extends ObservableController<ConversationSnapshot> {
  readonly #source: ConversationDataSource;
  readonly #createClientId: () => string;
  readonly #now: () => number;
  #abort = new AbortController();
  #unsubscribe: (() => void) | undefined;

  constructor(
    source: ConversationDataSource,
    options: ConversationControllerOptions = {},
  ) {
    const now = options.now ?? Date.now;
    super({ status: "idle", messages: [], hasMore: false }, now);
    this.#source = source;
    this.#now = now;
    this.#createClientId =
      options.createClientId ?? (() => crypto.randomUUID());
  }

  async load(): Promise<void> {
    this.assertActive();
    this.#abort.abort();
    this.#abort = new AbortController();
    this.transition({ status: "loading", messages: [], hasMore: false });
    try {
      const page = await this.#source.load(undefined, this.#abort.signal);
      if (this.#abort.signal.aborted) return;
      this.transition(pageSnapshot(page));
      this.#unsubscribe?.();
      this.#unsubscribe = this.#source.subscribe((event) =>
        this.#receive(event),
      );
    } catch (cause) {
      if (!this.#abort.signal.aborted)
        this.transition({
          status: "error",
          messages: [],
          hasMore: false,
          error: errorMessage(cause),
        });
    }
  }

  async loadMore(): Promise<void> {
    const current = this.getSnapshot();
    if (current.status === "loading_more" || current.cursor === undefined)
      return;
    this.transition({ ...conversationFields(current), status: "loading_more" });
    try {
      const page = await this.#source.load(current.cursor, this.#abort.signal);
      if (this.#abort.signal.aborted) return;
      this.transition({
        status: "ready",
        messages: mergeMessages(current.messages, page.messages),
        hasMore: page.nextCursor !== undefined,
        ...(page.nextCursor === undefined ? {} : { cursor: page.nextCursor }),
      });
    } catch (cause) {
      this.transition({
        ...conversationFields(current),
        status: "error",
        error: errorMessage(cause),
      });
    }
  }

  async send(input: Omit<OutgoingMessage, "clientId">): Promise<void> {
    const clientId = this.#createClientId();
    await this.#send({ ...input, clientId }, false);
  }

  async retry(clientId: string): Promise<void> {
    const message = this.getSnapshot().messages.find(
      (candidate) => candidate.clientId === clientId,
    );
    if (message === undefined || message.status !== "failed")
      throw new Error(`Failed message ${clientId} was not found.`);
    await this.#send(
      {
        clientId,
        text: message.text,
        ...(message.replyTo === undefined ? {} : { replyTo: message.replyTo }),
        ...(message.attachments === undefined
          ? {}
          : { attachments: message.attachments }),
      },
      true,
    );
  }

  protected override onDispose(): void {
    this.#abort.abort();
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
  }

  async #send(outgoing: OutgoingMessage, replacing: boolean): Promise<void> {
    this.assertActive();
    const current = this.getSnapshot();
    const optimistic: ConversationMessage = {
      id: outgoing.clientId,
      clientId: outgoing.clientId,
      text: outgoing.text,
      createdAt: this.#now(),
      direction: "outbound",
      status: "pending",
      ...(outgoing.replyTo === undefined ? {} : { replyTo: outgoing.replyTo }),
      ...(outgoing.attachments === undefined
        ? {}
        : { attachments: outgoing.attachments }),
    };
    const messages = replacing
      ? replaceByClientId(current.messages, optimistic)
      : [optimistic, ...current.messages];
    this.transition({
      ...conversationFields(current),
      status: "ready",
      messages,
    });
    try {
      const acknowledged = await this.#source.send(
        outgoing,
        this.#abort.signal,
      );
      if (!this.#abort.signal.aborted)
        this.#replaceMessage(outgoing.clientId, {
          ...acknowledged,
          status: "sent",
        });
    } catch (cause) {
      if (!this.#abort.signal.aborted)
        this.#replaceMessage(outgoing.clientId, {
          ...optimistic,
          status: "failed",
          error: errorMessage(cause),
        });
    }
  }

  #receive(event: ConversationEvent): void {
    const current = this.getSnapshot();
    const messages =
      event.type === "delete"
        ? current.messages.filter(({ id }) => id !== event.messageId)
        : mergeMessages(current.messages, [event.message]);
    this.transition({
      ...conversationFields(current),
      status: "ready",
      messages,
    });
  }

  #replaceMessage(clientId: string, message: ConversationMessage): void {
    const current = this.getSnapshot();
    this.transition({
      ...conversationFields(current),
      status: "ready",
      messages: replaceByClientId(current.messages, message),
    });
  }
}

function pageSnapshot(
  page: ConversationPage,
): Omit<ConversationSnapshot, "revision" | "updatedAt"> {
  return {
    status: "ready",
    messages: mergeMessages([], page.messages),
    hasMore: page.nextCursor !== undefined,
    ...(page.nextCursor === undefined ? {} : { cursor: page.nextCursor }),
  };
}

function conversationFields(snapshot: ConversationSnapshot) {
  return {
    messages: snapshot.messages,
    hasMore: snapshot.hasMore,
    ...(snapshot.cursor === undefined ? {} : { cursor: snapshot.cursor }),
  };
}

function replaceByClientId(
  messages: readonly ConversationMessage[],
  message: ConversationMessage,
) {
  const index = messages.findIndex(
    (candidate) =>
      candidate.id === message.id ||
      (message.clientId !== undefined &&
        candidate.clientId === message.clientId),
  );
  if (index < 0) return [message, ...messages];
  return messages.map((candidate, candidateIndex) =>
    candidateIndex === index ? message : candidate,
  );
}

function mergeMessages(
  current: readonly ConversationMessage[],
  incoming: readonly ConversationMessage[],
) {
  return incoming.reduce(
    (messages, message) => replaceByClientId(messages, message),
    [...current],
  );
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error
    ? cause.message
    : "Conversation request failed.";
}
