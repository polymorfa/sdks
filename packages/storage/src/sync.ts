import type {
  EventStreamItem,
  EventStreamParams,
  EventStreamAcknowledgement,
  LinkedHistorySyncPayload,
  DirectHistorySyncPayload,
  WebhookEvent,
} from "@polymorfa/sdk";

import { createStorage, type ApplyResult, type Storage } from "./engine.js";
import type { HistorySyncChunk } from "./history-types.js";
import { reduceEvent, STORED_EVENT_TYPES } from "./reducer/events.js";
import { historyIdentityIndex, reduceHistoryChunk } from "./reducer/history.js";
import type { StorageAdapter } from "./types.js";
import {
  decodedHistoryChunk,
  descriptorIntent,
  historyDescriptor,
} from "./history-descriptor.js";

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

/** Caller owns authorized download, full decoding and application projection. */
export type HistoryDescriptorDecoder = (
  payload: DirectHistorySyncPayload,
  event: WebhookEvent,
) => Promise<HistorySyncChunk>;
export type HistoryDescriptorMode = "decode" | "metadata-only";

export interface ApplyEventOptions {
  readonly decodeHistory?: HistoryChunkDecoder;
  readonly decodeHistoryDescriptor?: HistoryDescriptorDecoder;
  /** Metadata-only consumes the event; ordinary replay cannot import it later. */
  readonly historyDescriptorMode?: HistoryDescriptorMode;
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
    options.historyDescriptorMode !== undefined &&
    !["decode", "metadata-only"].includes(options.historyDescriptorMode)
  )
    throw new Error("Invalid history descriptor mode.");
  if (event.event === "history.sync" && descriptorIntent(event.payload)) {
    const payload = historyDescriptor(event.payload);
    if (await storage.hasEvent(event.session, event.id))
      return { applied: false, writes: 0 };
    const batch = reduceEvent(event);
    if (options.historyDescriptorMode === "metadata-only")
      return storage.apply(batch);
    if (!options.decodeHistoryDescriptor)
      throw new Error("A history descriptor decoder is required.");
    try {
      const chunk = decodedHistoryChunk(
        await options.decodeHistoryDescriptor(payload, event),
      );
      const history = reduceHistoryChunk({
        sessionId: event.session,
        chunk,
        identities: {},
      });
      return storage.apply({
        ...batch,
        operations: [...history.operations, ...batch.operations],
      });
    } catch {
      // Decoder failures may contain descriptor keys or inline bytes.
      throw new Error("Failed to decode history descriptor.");
    }
  }
  let batch = reduceEvent(event);
  if (
    event.event === "history.sync" &&
    options.decodeHistory &&
    (event.payload as { kind?: unknown } | null)?.kind !== "history"
  ) {
    if (await storage.hasEvent(event.session, event.id))
      return { applied: false, writes: 0 };
    const payload = event.payload as LinkedHistorySyncPayload;
    const chunk = await options.decodeHistory(payload, event);
    if (chunk) {
      const history = reduceHistoryChunk({
        sessionId: event.session,
        chunk,
        identities: historyIdentityIndex(payload),
      });
      batch = {
        ...batch,
        operations: [...history.operations, ...batch.operations],
      };
    }
  }
  return storage.apply(batch);
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
  acknowledgeStream(
    streamId: string,
    input: EventStreamAcknowledgement,
  ): Promise<unknown>;
}

export interface SyncToStorageOptions extends ApplyEventOptions {
  /** Where the stream cursor is saved. Default `{ sessionId: "*", stream: "events" }`. */
  readonly checkpoint?: { readonly sessionId: string; readonly stream: string };
  /** Stream parameters, such as event `types`. `since` comes from the checkpoint. */
  readonly params?: Omit<EventStreamParams, "since" | "signal" | "ack">;
  /** Explicit metadata-only consumption may skip absent payloads. Default true. */
  readonly requirePayload?: boolean;
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
    let expectedCursor = saved?.cursor ?? null;
    let gapError: Error | undefined;
    const stream = source.stream({
      types: STORED_EVENT_TYPES,
      ...options.params,
      ...(saved ? { since: saved.cursor } : {}),
      signal,
      ack: "manual",
      onGap(gap) {
        gapError = new Error(
          "The event retention window has a storage gap. Reconcile customer-owned history before resuming.",
        );
        controller.abort();
        options.params?.onGap?.(gap);
      },
    });
    for await (const item of stream) {
      if (signal.aborted) break;
      if (!item.webhook && options.requirePayload !== false)
        throw new Error(
          "The event body is unavailable. The storage checkpoint and acknowledgement were not advanced.",
        );
      let result: ApplyResult = { applied: false, writes: 0 };
      if (item.webhook)
        result = await applyEvent(
          storage,
          item.webhook as WebhookEvent,
          options,
        );
      await storage.apply({
        sessionId: checkpoint.sessionId,
        operations: [
          {
            kind: "checkpoint",
            sessionId: checkpoint.sessionId,
            stream: checkpoint.stream,
            cursor: item.cursor,
            expectedCursor,
            updatedAt: now(),
          },
        ],
      });
      expectedCursor = item.cursor;
      await source.acknowledgeStream(item.streamId, {
        cursor: item.cursor,
        sequence: item.sequence,
      });
      options.onApplied?.(item, result);
    }
    if (gapError) throw gapError;
  })();
  return { done, stop: () => controller.abort() };
}
