import {
  PolymorfaAuthenticationError,
  PolymorfaAuthorizationError,
  PolymorfaError,
  PolymorfaNotFoundError,
  PolymorfaRateLimitError,
  PolymorfaServerError,
  PolymorfaValidationError,
} from "../errors.js";
import type { HttpTransport } from "../transport/http.js";
import type { EncodedEventPayload, JsonValue } from "./developer-types.js";

/** The event object in an `event` frame. Same fields as a project event. */
export interface StreamedEvent {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly type: string;
  readonly source: "runtime" | "platform" | "test";
  readonly environment: "development" | "production";
  readonly createdAt: string;
  readonly payloadAvailability: "available" | "not_retained" | "unavailable";
  readonly payload: EncodedEventPayload | null;
  readonly replayableUntil: string | null;
  readonly metadataExpiresAt: string;
}

/** The decoded webhook body carried in `payload`, when available. */
export interface WebhookEnvelope {
  readonly id: string;
  readonly session: string;
  readonly externalId?: string;
  readonly timestamp: string;
  readonly event: string;
  readonly payload: JsonValue;
}

/** One delivered event. Save `cursor` after processing to resume later. */
export interface EventStreamItem {
  readonly event: StreamedEvent;
  /** The connection that delivered this event; use with `acknowledgeStream`. */
  readonly streamId: string;
  /** Frame number on that connection; use with `acknowledgeStream`. */
  readonly sequence: number;
  /** The exact webhook body, or null when `event.payload` is null. */
  readonly webhook: WebhookEnvelope | null;
  readonly cursor: string;
}

export interface EventStreamAcknowledgement {
  readonly cursor: string;
  readonly sequence: number;
}

export interface EventStreamAcknowledgementReceipt {
  readonly data: {
    readonly streamId: string;
    readonly acknowledgedCursor: string;
    readonly sequence: number;
    readonly replayed: boolean;
  };
}

export interface EventStreamGap {
  readonly reason: "retention_exceeded";
  readonly missedEvents: number;
  readonly requestedCursor: string | null;
}

export interface EventStreamParams {
  /** Event types to include. A trailing `*` matches a prefix. Omit for all. */
  readonly types?: readonly string[];
  /** Resume after this cursor, for example the last `EventStreamItem.cursor` you saved. */
  readonly since?: string;
  /** Stops the stream. The iterator then ends without an error. */
  readonly signal?: AbortSignal;
  /** Reconnect delay bounds. Defaults: 1 000 ms initial, 30 000 ms maximum. */
  readonly reconnect?: {
    readonly initialDelayMs?: number;
    readonly maxDelayMs?: number;
  };
  /** Called when retention removed events after `since`. The stream continues. */
  readonly onGap?: (gap: EventStreamGap) => void;
  /** Called before each reconnect with the error that ended the last connection. */
  readonly onReconnect?: (error: unknown, delayMs: number) => void;
  /** Maximum wait for response headers per connection. Defaults to the client timeout. */
  readonly timeoutMs?: number;
  /**
   * `auto` (default) releases events as they are written. `manual` holds up
   * to `maxInFlight` events until you call `events.acknowledgeStream`.
   */
  readonly ack?: "auto" | "manual";
}

export interface OrganizationEventStreamParams extends EventStreamParams {
  /** Organization credentials stream one project at a time. */
  readonly projectId: string;
}

/** A structural match for `LiveEventSource` from `@polymorfa/store`. */
export interface LiveEventSourceAdapter {
  subscribe(
    listener: (
      events: WebhookEnvelope | readonly WebhookEnvelope[],
      meta?: { readonly cursor?: string },
    ) => void,
    options?: {
      readonly cursor?: string;
      readonly onError?: (error: unknown) => void;
    },
  ): () => void;
}

interface SseMessage {
  readonly event: string;
  readonly data: string;
  readonly id?: string;
}

/** Incremental `text/event-stream` parser (WHATWG rules, UTF-8 input). */
class SseParser {
  #buffer = "";
  #event = "";
  #data: string[] = [];
  #id: string | undefined;
  #carriageReturn = false;

  feed(chunk: string): SseMessage[] {
    if (this.#carriageReturn && chunk.startsWith("\n")) chunk = chunk.slice(1);
    this.#carriageReturn = chunk.endsWith("\r");
    const lines = (this.#buffer + chunk).split(/\r\n|\r|\n/);
    this.#buffer = lines.pop() ?? "";
    const messages: SseMessage[] = [];
    for (const line of lines) {
      if (line === "") {
        if (this.#data.length > 0) {
          messages.push({
            event: this.#event === "" ? "message" : this.#event,
            data: this.#data.join("\n"),
            ...(this.#id === undefined ? {} : { id: this.#id }),
          });
        }
        this.#event = "";
        this.#data = [];
        this.#id = undefined;
        continue;
      }
      if (line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon < 0 ? line : line.slice(0, colon);
      let value = colon < 0 ? "" : line.slice(colon + 1);
      if (value.startsWith(" ")) value = value.slice(1);
      if (field === "event") this.#event = value;
      else if (field === "data") this.#data.push(value);
      else if (field === "id" && !value.includes("\u0000")) this.#id = value;
    }
    return messages;
  }
}

class ReconnectSignal extends Error {
  constructor(
    readonly reason: string,
    readonly resetBackoff: boolean,
  ) {
    super(`Event stream closed: ${reason}.`);
  }
}

function decodeWebhook(
  payload: EncodedEventPayload | null,
): WebhookEnvelope | null {
  if (payload === null) return null;
  const bytes = Uint8Array.from(atob(payload.data), (char) =>
    char.charCodeAt(0),
  );
  return JSON.parse(new TextDecoder().decode(bytes)) as WebhookEnvelope;
}

function retryAfterMs(error: PolymorfaError): number | undefined {
  const header = error.metadata?.headers["retry-after"];
  if (header === undefined) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1_000 : undefined;
}

/** Errors that no reconnect can fix end the iterator; everything else retries. */
function isTerminal(error: unknown): boolean {
  if (
    error instanceof PolymorfaRateLimitError ||
    error instanceof PolymorfaServerError
  )
    return false;
  return (
    error instanceof PolymorfaAuthenticationError ||
    error instanceof PolymorfaAuthorizationError ||
    error instanceof PolymorfaNotFoundError ||
    error instanceof PolymorfaValidationError ||
    (error instanceof PolymorfaError && error.status === 410) ||
    (error instanceof PolymorfaError && error.code === "stream_revoked")
  );
}

/**
 * Streams project events with automatic reconnect and resume.
 *
 * Iterate with `for await`. The stream reconnects with exponential backoff
 * and jitter after a dropped connection, an `expiry`, or a recoverable `gap`,
 * sending the last delivered cursor as `Last-Event-ID`. Authentication,
 * authorization, invalid or expired cursors, and `revoked` end the iterator
 * with an error. Aborting `signal` or leaving the loop ends it without one.
 */
export class EventStream implements AsyncIterable<EventStreamItem> {
  #cursor: string | undefined;

  constructor(
    private readonly transport: HttpTransport,
    private readonly path: string,
    private readonly params: EventStreamParams,
  ) {
    this.#cursor = params.since;
  }

  /** The cursor of the last event this stream delivered. */
  get cursor(): string | undefined {
    return this.#cursor;
  }

  async *[Symbol.asyncIterator](): AsyncIterator<EventStreamItem> {
    const initialDelay = this.params.reconnect?.initialDelayMs ?? 1_000;
    const maxDelay = this.params.reconnect?.maxDelayMs ?? 30_000;
    let attempt = 0;
    const outer = this.params.signal;
    const stopped = () => outer?.aborted === true;
    while (!stopped()) {
      const controller = new AbortController();
      const forward = () => controller.abort(outer?.reason);
      outer?.addEventListener("abort", forward, { once: true });
      let failure: unknown;
      let serverDelay: number | undefined;
      try {
        for await (const item of this.#connect(controller)) {
          attempt = 0;
          yield item;
        }
        failure = new ReconnectSignal("closed", false);
      } catch (error) {
        if (stopped()) return;
        if (isTerminal(error)) throw error;
        failure = error;
        if (error instanceof ReconnectSignal && error.resetBackoff) attempt = 0;
        if (error instanceof PolymorfaError) serverDelay = retryAfterMs(error);
      } finally {
        outer?.removeEventListener("abort", forward);
        controller.abort();
      }
      const ceiling = Math.min(maxDelay, initialDelay * 2 ** attempt);
      const delay =
        serverDelay ?? Math.round(ceiling / 2 + Math.random() * (ceiling / 2));
      attempt += 1;
      this.params.onReconnect?.(failure, delay);
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, delay);
        outer?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }
  }

  async *#connect(
    controller: AbortController,
  ): AsyncGenerator<EventStreamItem> {
    const query: Record<string, string> = {};
    if (this.params.types !== undefined && this.params.types.length > 0) {
      query.types = this.params.types.join(",");
    }
    if (this.params.ack === "manual") query.ack = "manual";
    const { response } = await this.transport.openStream({
      method: "GET",
      path: this.path,
      query,
      accept: "text/event-stream",
      headers:
        this.#cursor === undefined ? {} : { "last-event-id": this.#cursor },
      signal: controller.signal,
      ...(this.params.timeoutMs === undefined
        ? {}
        : { timeoutMs: this.params.timeoutMs }),
    });
    if (response.body === null) throw new ReconnectSignal("empty_body", false);
    const reader = response.body
      .pipeThrough(new TextDecoderStream())
      .getReader();
    const parser = new SseParser();
    // Some fetch implementations do not error a body when its request signal
    // aborts; cancel the reader directly so a pending read always settles.
    const cancelRead = () =>
      void reader.cancel(controller.signal.reason).catch(() => undefined);
    controller.signal.addEventListener("abort", cancelRead, { once: true });
    let heartbeatMs = 15_000;
    let watchdog: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(
        () => controller.abort(new ReconnectSignal("heartbeat_missed", false)),
        heartbeatMs * 2,
      );
    };
    arm();
    try {
      for (;;) {
        let chunk: ReadableStreamReadResult<string>;
        try {
          chunk = await reader.read();
        } catch (error) {
          if (controller.signal.reason instanceof ReconnectSignal)
            throw controller.signal.reason;
          throw error;
        }
        if (chunk.done) {
          if (controller.signal.reason instanceof ReconnectSignal)
            throw controller.signal.reason;
          return;
        }
        arm();
        for (const message of parser.feed(chunk.value)) {
          const frame = JSON.parse(message.data) as Record<string, unknown> & {
            type?: string;
          };
          switch (frame.type) {
            case "ready":
              if (typeof frame.heartbeatIntervalMs === "number") {
                heartbeatMs = frame.heartbeatIntervalMs;
                arm();
              }
              break;
            case "event": {
              const event = frame.event as StreamedEvent;
              const cursor = String(frame.cursor);
              this.#cursor = cursor;
              yield Object.freeze({
                event,
                webhook: decodeWebhook(event.payload),
                cursor,
                streamId: String(frame.streamId),
                sequence: Number(frame.sequence),
              });
              break;
            }
            case "gap":
              if (frame.reason === "retention_exceeded") {
                this.params.onGap?.({
                  reason: "retention_exceeded",
                  missedEvents: Number(frame.missedEvents ?? 0),
                  requestedCursor:
                    (frame.requestedCursor as string | null) ?? null,
                });
                break;
              }
              throw new ReconnectSignal(`gap_${String(frame.reason)}`, false);
            case "expiry":
              throw new ReconnectSignal("expiry", true);
            case "dropped":
              throw new ReconnectSignal("dropped", false);
            case "revoked":
              throw new PolymorfaAuthorizationError(
                "The event stream was revoked. Check the credential, its events:listen permission, and the team's Event streams enrollment.",
                { code: "stream_revoked" },
              );
            default:
              break;
          }
        }
      }
    } finally {
      clearTimeout(watchdog);
      controller.signal.removeEventListener("abort", cancelRead);
      await reader.cancel().catch(() => undefined);
    }
  }
}

/**
 * Adapts a stream factory to the `LiveEventSource` shape used by
 * `@polymorfa/store`'s `connectEventSource`. Events without a webhook body
 * (hosted message storage off) are skipped, because the store needs the body.
 */
export function eventStreamSource(
  open: (params: EventStreamParams) => EventStream,
  params: Omit<EventStreamParams, "since" | "signal"> = {},
): LiveEventSourceAdapter {
  return {
    subscribe(listener, options = {}) {
      const controller = new AbortController();
      const stream = open({
        ...params,
        ...(options.cursor === undefined ? {} : { since: options.cursor }),
        signal: controller.signal,
      });
      void (async () => {
        try {
          for await (const item of stream) {
            if (item.webhook !== null)
              listener([item.webhook], { cursor: item.cursor });
          }
        } catch (error) {
          if (!controller.signal.aborted) options.onError?.(error);
        }
      })();
      return () => controller.abort();
    },
  };
}
