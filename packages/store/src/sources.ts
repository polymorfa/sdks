import type { PolymorfaStore } from "./store.js";
import type { PolymorfaEvent } from "./types.js";

export interface LiveEventMeta {
  /** Resume position after this delivery, such as an SSE event ID. */
  readonly cursor?: string;
}

export type LiveEventListener = (
  events: PolymorfaEvent | readonly PolymorfaEvent[],
  meta?: LiveEventMeta,
) => void;

export interface LiveEventSubscribeOptions {
  /** Resume after this position. */
  readonly cursor?: string;
  readonly onError?: (error: unknown) => void;
}

/** Anything that pushes webhook-shaped events. */
export interface LiveEventSource {
  subscribe(
    listener: LiveEventListener,
    options?: LiveEventSubscribeOptions,
  ): () => void;
}

export interface EventSourceConnection {
  /** Resolves when every event received so far has been stored. */
  idle(): Promise<void>;
  /** The last cursor saved to the checkpoint store. */
  readonly cursor: string | undefined;
  close(): void;
}

export interface ConnectEventSourceOptions {
  /** Checkpoint ID for resume. Defaults to `default`. */
  readonly checkpoint?: string;
  /** Maximum events per `ingest` call. */
  readonly maxBatch?: number;
  readonly onError?: (error: unknown) => void;
}

/**
 * Feeds `source` into `store`, resuming from the saved checkpoint and
 * saving the cursor after each committed batch.
 */
export function connectEventSource(
  store: PolymorfaStore,
  source: LiveEventSource,
  options: ConnectEventSourceOptions = {},
): EventSourceConnection {
  const checkpoint = options.checkpoint ?? "default";
  const maxBatch = Math.max(1, options.maxBatch ?? 500);
  const pending: { event: PolymorfaEvent; cursor?: string }[] = [];
  let cursor: string | undefined;
  let closed = false;
  let unsubscribe: (() => void) | undefined;
  let draining: Promise<void> = Promise.resolve();
  let running = false;

  const report = (error: unknown) => options.onError?.(error);

  const drain = async () => {
    running = true;
    try {
      while (pending.length > 0 && !closed) {
        const batch = pending.splice(0, maxBatch);
        await store.ingest(batch.map(({ event }) => event));
        let last: string | undefined;
        for (const entry of batch) last = entry.cursor ?? last;
        if (last !== undefined && !closed) {
          await store.checkpoints.set(checkpoint, last);
          cursor = last;
        }
      }
    } catch (error) {
      report(error);
    } finally {
      running = false;
    }
  };

  const listener: LiveEventListener = (events, meta) => {
    if (closed) return;
    const list: readonly PolymorfaEvent[] = Array.isArray(events)
      ? events
      : [events as PolymorfaEvent];
    list.forEach((event, index) =>
      pending.push({
        event,
        ...(index === list.length - 1 && meta?.cursor !== undefined
          ? { cursor: meta.cursor }
          : {}),
      }),
    );
    if (!running) draining = drain();
  };

  const started = store.checkpoints.get(checkpoint).then(
    (saved) => {
      if (closed) return;
      cursor = saved?.cursor;
      unsubscribe = source.subscribe(listener, {
        ...(cursor === undefined ? {} : { cursor }),
        onError: report,
      });
    },
    (error: unknown) => report(error),
  );

  return {
    async idle() {
      await started;
      while (running || pending.length > 0) {
        if (!running) draining = drain();
        await draining;
      }
    },
    get cursor() {
      return cursor;
    },
    close() {
      closed = true;
      unsubscribe?.();
      unsubscribe = undefined;
    },
  };
}

export interface SseFrame {
  readonly event: string;
  readonly data: string;
  readonly id?: string;
  readonly retry?: number;
}

/** Incremental `text/event-stream` parser. */
export class SseParser {
  #buffer = "";
  #event = "";
  #data: string[] = [];
  #id: string | undefined;
  #retry: number | undefined;
  #sawBom = false;
  #pendingCarriageReturn = false;
  /** The last event ID seen, kept across frames as the spec requires. */
  lastEventId: string | undefined;

  /** Parses `chunk` and returns every frame it completes. */
  feed(chunk: string): SseFrame[] {
    if (this.#pendingCarriageReturn && chunk.startsWith("\n"))
      chunk = chunk.slice(1);
    this.#pendingCarriageReturn = chunk.endsWith("\r");
    let text = this.#buffer + chunk;
    if (!this.#sawBom && text.length > 0) {
      this.#sawBom = true;
      if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    }
    const frames: SseFrame[] = [];
    const lines = text.split(/\r\n|\r|\n/);
    // The last piece is an unterminated line; `\r\n` split across chunks
    // is handled by `#pendingCarriageReturn`.
    this.#buffer = lines.pop() ?? "";
    for (const line of lines) {
      const frame = this.#line(line);
      if (frame !== undefined) frames.push(frame);
    }
    return frames;
  }

  /** Flushes a final unterminated line; an unfinished frame is dropped. */
  end(): SseFrame[] {
    const frames = this.#buffer === "" ? [] : this.feed("\n");
    this.#buffer = "";
    this.#event = "";
    this.#data = [];
    this.#id = undefined;
    this.#retry = undefined;
    this.#pendingCarriageReturn = false;
    return frames;
  }

  #line(line: string): SseFrame | undefined {
    if (line === "") return this.#dispatch();
    if (line.startsWith(":")) return undefined;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") this.#event = value;
    else if (field === "data") this.#data.push(value);
    else if (field === "id" && !value.includes("\u0000")) this.#id = value;
    else if (field === "retry" && /^\d+$/.test(value))
      this.#retry = Number(value);
    return undefined;
  }

  #dispatch(): SseFrame | undefined {
    if (this.#id !== undefined) this.lastEventId = this.#id;
    const hasData = this.#data.length > 0;
    const frame: SseFrame = {
      event: this.#event === "" ? "message" : this.#event,
      data: this.#data.join("\n"),
      ...(this.lastEventId === undefined ? {} : { id: this.lastEventId }),
      ...(this.#retry === undefined ? {} : { retry: this.#retry }),
    };
    this.#event = "";
    this.#data = [];
    this.#id = undefined;
    this.#retry = undefined;
    return hasData ? frame : undefined;
  }
}

/**
 * Turns an SSE `data` payload into events. The data is one event envelope
 * or an array of them. A frame without an `event` field takes the SSE
 * event name, and one without an `id` takes the SSE event ID.
 */
export function eventsFromFrame(
  frame: Pick<SseFrame, "event" | "data" | "id">,
): PolymorfaEvent[] {
  const parsed: unknown = JSON.parse(frame.data);
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.map((entry: unknown) => {
    if (typeof entry !== "object" || entry === null)
      throw new TypeError("An event frame must contain a JSON object.");
    const record = entry as Record<string, unknown>;
    return {
      ...record,
      ...(typeof record.event !== "string" && frame.event !== "message"
        ? { event: frame.event }
        : {}),
      ...(typeof record.id !== "string" && frame.id !== undefined
        ? { id: frame.id }
        : {}),
    } as unknown as PolymorfaEvent;
  });
}

export interface EventSourceLike {
  addEventListener(
    type: string,
    listener: (event: MessageEvent<string>) => void,
  ): void;
  removeEventListener(
    type: string,
    listener: (event: MessageEvent<string>) => void,
  ): void;
  close(): void;
  onerror: ((event: Event) => void) | null;
}

export interface FromEventSourceOptions {
  /**
   * Named SSE events to listen for, besides unnamed `message` frames.
   * Browsers only deliver named events that have a listener.
   */
  readonly eventTypes?: readonly string[];
  readonly withCredentials?: boolean;
  /** Query parameter that carries the resume cursor on a new connection. */
  readonly resumeParam?: string;
  readonly EventSource?: new (
    url: string,
    init?: { withCredentials?: boolean },
  ) => EventSourceLike;
}

/** Common event types; pass `eventTypes` to follow others by name. */
export const DEFAULT_SSE_EVENT_TYPES: readonly string[] = [
  "message.received",
  "message.sent",
  "message.ack",
  "message.update",
  "message.edited",
  "message.delete",
  "message.revoked",
  "message.reaction",
  "message.vote",
  "message.failed",
  "chat.read",
  "chat.archive",
  "chat.mute",
  "chat.clear",
  "chat.delete",
  "contact.update",
  "presence.update",
  "call.received",
  "call.accepted",
  "call.rejected",
  "call.missed",
  "call.ended",
  "labels.update",
  "session.status",
  "session.connected",
  "session.logged_out",
  "template.status",
];

/**
 * Follows a server-sent event stream. The browser's `EventSource` resumes
 * within a page with `Last-Event-ID`; across page loads the saved cursor is
 * sent as the `resumeParam` query parameter.
 */
export function fromEventSource(
  input: string | URL | EventSourceLike,
  options: FromEventSourceOptions = {},
): LiveEventSource {
  return {
    subscribe(listener, subscribeOptions = {}) {
      let source: EventSourceLike;
      if (typeof input === "string" || input instanceof URL) {
        const Constructor =
          options.EventSource ??
          (
            globalThis as {
              EventSource?: FromEventSourceOptions["EventSource"];
            }
          ).EventSource;
        if (Constructor === undefined)
          throw new Error("EventSource is not available in this environment.");
        const url = new URL(String(input), globalThis.location?.href);
        if (subscribeOptions.cursor !== undefined)
          url.searchParams.set(
            options.resumeParam ?? "lastEventId",
            subscribeOptions.cursor,
          );
        source = new Constructor(
          url.toString(),
          options.withCredentials === undefined
            ? undefined
            : { withCredentials: options.withCredentials },
        );
      } else source = input;

      const handle = (message: MessageEvent<string>) => {
        try {
          const id =
            message.lastEventId === "" ? undefined : message.lastEventId;
          const events = eventsFromFrame({
            event: message.type,
            data: message.data,
            ...(id === undefined ? {} : { id }),
          });
          listener(events, id === undefined ? undefined : { cursor: id });
        } catch (error) {
          subscribeOptions.onError?.(error);
        }
      };
      const types = [
        "message",
        ...(options.eventTypes ?? DEFAULT_SSE_EVENT_TYPES),
      ];
      for (const type of types) source.addEventListener(type, handle);
      source.onerror = (event) => subscribeOptions.onError?.(event);
      return () => {
        for (const type of types) source.removeEventListener(type, handle);
        source.onerror = null;
        if (typeof input === "string" || input instanceof URL) source.close();
      };
    },
  };
}

export interface FromEventStreamOptions {
  readonly url: string | URL;
  readonly fetch?: typeof fetch;
  /**
   * Request headers, resolved for every connection. Use it to send a fresh
   * client token; the store never saves it.
   */
  readonly headers?: () => HeadersInit | Promise<HeadersInit>;
  readonly credentials?: RequestCredentials;
  /** Reconnect delay in milliseconds unless the server sends `retry`. */
  readonly retryMs?: number;
}

/**
 * Follows an event stream with `fetch`, which can send headers that
 * `EventSource` cannot. Reconnects with `Last-Event-ID`.
 */
export function fromEventStream(
  options: FromEventStreamOptions,
): LiveEventSource {
  return {
    subscribe(listener, subscribeOptions = {}) {
      const controller = new AbortController();
      const request = options.fetch ?? globalThis.fetch.bind(globalThis);
      let lastEventId = subscribeOptions.cursor;
      let retry = options.retryMs ?? 3_000;

      const connect = async () => {
        const headers = new Headers(await options.headers?.());
        headers.set("Accept", "text/event-stream");
        if (lastEventId !== undefined)
          headers.set("Last-Event-ID", lastEventId);
        const response = await request(String(options.url), {
          headers,
          signal: controller.signal,
          ...(options.credentials === undefined
            ? {}
            : { credentials: options.credentials }),
        });
        const type = response.headers.get("content-type") ?? "";
        if (!response.ok || !type.includes("text/event-stream"))
          throw new Error(
            `Event stream request failed with status ${response.status}.`,
          );
        if (response.body === null) return;
        const parser = new SseParser();
        const reader = response.body
          .pipeThrough(new TextDecoderStream())
          .getReader();
        const deliver = (frames: SseFrame[]) => {
          for (const frame of frames) {
            if (frame.retry !== undefined) retry = frame.retry;
            if (frame.id !== undefined) lastEventId = frame.id;
            try {
              listener(
                eventsFromFrame(frame),
                frame.id === undefined ? undefined : { cursor: frame.id },
              );
            } catch (error) {
              subscribeOptions.onError?.(error);
            }
          }
        };
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          deliver(parser.feed(value));
        }
        deliver(parser.end());
      };

      void (async () => {
        while (!controller.signal.aborted) {
          try {
            await connect();
          } catch (error) {
            if (controller.signal.aborted) return;
            subscribeOptions.onError?.(error);
          }
          if (controller.signal.aborted) return;
          await new Promise((resolve) => setTimeout(resolve, retry));
        }
      })();
      return () => controller.abort();
    },
  };
}

export interface WebSocketLike {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent) => void,
  ): void;
  removeEventListener(
    type: "message",
    listener: (event: MessageEvent) => void,
  ): void;
  close(): void;
}

/** Follows JSON event frames on a WebSocket. */
export function fromWebSocket(
  input: string | URL | WebSocketLike,
  options: { readonly protocols?: string | string[] } = {},
): LiveEventSource {
  return {
    subscribe(listener, subscribeOptions = {}) {
      const socket: WebSocketLike =
        typeof input === "string" || input instanceof URL
          ? (new WebSocket(input, options.protocols) as WebSocketLike)
          : input;
      const handle = (message: MessageEvent) => {
        try {
          if (typeof message.data !== "string")
            throw new TypeError("Event frames must be text.");
          const events = eventsFromFrame({
            event: "message",
            data: message.data,
          });
          const last = events.at(-1);
          listener(
            events,
            last === undefined ? undefined : { cursor: last.id },
          );
        } catch (error) {
          subscribeOptions.onError?.(error);
        }
      };
      socket.addEventListener("message", handle);
      return () => {
        socket.removeEventListener("message", handle);
        if (typeof input === "string" || input instanceof URL) socket.close();
      };
    },
  };
}

export interface IterableEventSource extends LiveEventSource {
  /** Resolves when the most recent subscription has delivered everything. */
  readonly completed: Promise<void>;
}

/** Replays a list or async iterable, for example a backend backfill. */
export function fromIterable(
  events: Iterable<PolymorfaEvent> | AsyncIterable<PolymorfaEvent>,
  options: { readonly batchSize?: number } = {},
): IterableEventSource {
  const batchSize = Math.max(1, options.batchSize ?? 500);
  let completed: Promise<void> = Promise.resolve();
  return {
    get completed() {
      return completed;
    },
    subscribe(listener, subscribeOptions = {}) {
      let stopped = false;
      completed = (async () => {
        let batch: PolymorfaEvent[] = [];
        try {
          for await (const event of events) {
            if (stopped) return;
            batch.push(event);
            if (batch.length >= batchSize) {
              listener(batch);
              batch = [];
            }
          }
          if (!stopped && batch.length > 0) listener(batch);
        } catch (error) {
          subscribeOptions.onError?.(error);
        }
      })();
      return () => {
        stopped = true;
      };
    },
  };
}
