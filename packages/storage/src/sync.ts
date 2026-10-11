import type {
  EventStreamItem,
  EventStreamParams,
  LinkedHistorySyncPayload,
  WebhookEvent,
} from "@polymorfa/sdk";

import { createStorage, type ApplyResult, type Storage } from "./engine.js";
import type { HistorySyncChunk } from "./history-types.js";
import { reduceEvent } from "./reducer/events.js";
import { historyIdentityIndex, reduceHistoryChunk } from "./reducer/history.js";
import type { StorageAdapter } from "./types.js";

function asStorage(target: Storage | StorageAdapter): Storage {
  return "apply" in target ? target : createStorage(target);
}

/**
 * Downloads and decodes the history chunk a `history.sync` event refers to.
 * Return `null` to record only the chunk's progress.
 */
export type HistoryChunkDecoder = (
  payload: LinkedHistorySyncPayload,
  event: WebhookEvent,
) => Promise<HistorySyncChunk | null>;

export interface ApplyEventOptions {
  readonly decodeHistory?: HistoryChunkDecoder;
}

/**
 * Applies one webhook or stream event: its reduced batch and, for
 * `history.sync` with a decoder, the decoded chunk.
 */
export async function applyEvent(
  target: Storage | StorageAdapter,
  event: WebhookEvent,
  options: ApplyEventOptions = {},
): Promise<ApplyResult> {
  const storage = asStorage(target);
  if (
    event.event === "history.sync" &&
    options.decodeHistory &&
    (event.payload as { kind?: unknown } | null)?.kind !== "history"
  ) {
    const payload = event.payload as LinkedHistorySyncPayload;
    if (await storage.hasEvent(event.session, event.id))
      return { applied: false, writes: 0 };
    const chunk = await options.decodeHistory(payload, event);
    if (chunk) {
      // Applied without its own marker; the event marker below covers it.
      const batch = reduceHistoryChunk({
        sessionId: event.session,
        chunk,
        identities: historyIdentityIndex(payload),
      });
      await storage.apply({ sessionId: batch.sessionId, operations: batch.operations });
    }
  }
  return storage.apply(reduceEvent(event));
}

/**
 * Returns a handler for verified webhook events, for example the result of
 * `constructWebhookEvent`. Respond 2xx only after it resolves.
 */
export function storageWebhookHandler(
  target: Storage | StorageAdapter,
  options: ApplyEventOptions = {},
): (event: WebhookEvent) => Promise<ApplyResult> {
  const storage = asStorage(target);
  return (event) => applyEvent(storage, event, options);
}

/** The part of `client.events` that `syncToStorage` uses. */
export interface EventStreamSource {
  stream(params: EventStreamParams): AsyncIterable<EventStreamItem>;
}

export interface SyncToStorageOptions extends ApplyEventOptions {
  /** Where the stream cursor is saved. Default `{ sessionId: "*", stream: "events" }`. */
  readonly checkpoint?: { readonly sessionId: string; readonly stream: string };
  /** Stream parameters, such as event `types`. `since` comes from the checkpoint. */
  readonly params?: Omit<EventStreamParams, "since" | "signal">;
  readonly signal?: AbortSignal;
  /** Called after each event is stored and the cursor saved. */
  readonly onApplied?: (item: EventStreamItem, result: ApplyResult) => void;
  /** Clock for checkpoint `updatedAt`. Default `Date.now`. */
  readonly now?: () => number;
}

export interface StorageSync {
  /** Resolves when the stream ends or `stop` is called; rejects on errors. */
  readonly done: Promise<void>;
  stop(): void;
}

/**
 * Consumes an event stream into storage. Resumes from the saved cursor,
 * applies each event, then saves the cursor, so a crash replays at most the
 * last event, which deduplication skips.
 */
export function syncToStorage(
  source: EventStreamSource,
  target: Storage | StorageAdapter,
  options: SyncToStorageOptions = {},
): StorageSync {
  const storage = asStorage(target);
  const controller = new AbortController();
  const signal = options.signal
    ? AbortSignal.any([options.signal, controller.signal])
    : controller.signal;
  const checkpoint = options.checkpoint ?? { sessionId: "*", stream: "events" };
  const now = options.now ?? Date.now;
  const done = (async () => {
    const saved = await storage.getCheckpoint(
      checkpoint.sessionId,
      checkpoint.stream,
    );
    const stream = source.stream({
      ...options.params,
      ...(saved ? { since: saved.cursor } : {}),
      signal,
    });
    for await (const item of stream) {
      if (signal.aborted) break;
      let result: ApplyResult = { applied: false, writes: 0 };
      if (item.webhook)
        result = await applyEvent(storage, item.webhook as WebhookEvent, options);
      await storage.apply({
        sessionId: checkpoint.sessionId,
        operations: [
          {
            kind: "checkpoint",
            sessionId: checkpoint.sessionId,
            stream: checkpoint.stream,
            cursor: item.cursor,
            updatedAt: now(),
          },
        ],
      });
      options.onApplied?.(item, result);
    }
  })();
  return { done, stop: () => controller.abort() };
}
