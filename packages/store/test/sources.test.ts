import { describe, expect, it, vi } from "vitest";

import {
  SseParser,
  connectEventSource,
  eventsFromFrame,
  fromEventSource,
  fromEventStream,
  fromIterable,
  fromWebSocket,
  MIN_EVENT_STREAM_RETRY_MS,
  readProjectStreamFrame,
  type EventSourceLike,
  type LiveEventListener,
  type LiveEventSource,
} from "../src/index.js";
import { openStore, received } from "./helpers.js";

describe("SseParser", () => {
  it("parses event, data, id, retry, and comments across chunk boundaries", () => {
    const parser = new SseParser();
    const frames = [
      ...parser.feed(":keepalive\r"),
      ...parser.feed("\nevent: message.received\r\nid: 41\r"),
      ...parser.feed('\ndata: {"a":\ndata: 1}\r\n\r\n'),
      ...parser.feed("retry: 5000\ndata:x\n\n"),
      ...parser.feed("id\ndata: y\n"),
    ];
    expect(frames).toEqual([
      { event: "message.received", data: '{"a":\n1}', id: "41" },
      { event: "message", data: "x", id: "41", retry: 5000 },
    ]);
    // A frame without its blank line is discarded at the end of the stream.
    expect(parser.end()).toEqual([]);
    expect(parser.lastEventId).toBe("41");
    // An empty id resets the last event ID.
    expect(parser.feed("id\ndata: z\n\n")).toEqual([
      { event: "message", data: "z", id: "" },
    ]);
  });

  it("rejects a line longer than the limit and recovers", () => {
    const parser = new SseParser({ maxLineLength: 8 });
    expect(() => parser.feed("data: 0123456789")).toThrow(/exceeded 8/);
    expect(parser.feed("data: ok\n\n")).toEqual([
      { event: "message", data: "ok" },
    ]);
    expect(() => parser.feed("data: 0123456789\n\n")).toThrow(/exceeded 8/);
  });

  it("ignores frames without data and strips a byte-order mark", () => {
    const parser = new SseParser();
    expect(parser.feed("﻿event: ping\n\nid: 7\n\n")).toEqual([]);
    expect(parser.lastEventId).toBe("7");
  });

  it("fills a missing event name and ID from the frame", () => {
    expect(
      eventsFromFrame({
        event: "presence.update",
        id: "9",
        data: '{"session":"s","timestamp":"t","payload":{}}',
      }),
    ).toEqual([
      {
        id: "9",
        event: "presence.update",
        session: "s",
        timestamp: "t",
        payload: {},
      },
    ]);
    expect(() => eventsFromFrame({ event: "message", data: "1" })).toThrow(
      /JSON object/,
    );
  });
});

class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<
    string,
    Set<(event: MessageEvent<string>) => void>
  >();
  onerror: ((event: Event) => void) | null = null;
  closed = false;
  constructor(
    readonly url: string,
    readonly init?: { withCredentials?: boolean },
  ) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(
    type: string,
    listener: (event: MessageEvent<string>) => void,
  ) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }
  removeEventListener(
    type: string,
    listener: (event: MessageEvent<string>) => void,
  ) {
    this.listeners.get(type)?.delete(listener);
  }
  close() {
    this.closed = true;
  }
  emit(type: string, data: unknown, lastEventId = "") {
    for (const listener of this.listeners.get(type) ?? [])
      listener({
        type,
        data: typeof data === "string" ? data : JSON.stringify(data),
        lastEventId,
      } as MessageEvent<string>);
  }
}

describe("fromEventSource and connectEventSource", () => {
  it("stores streamed events, saves the last event ID, and resumes from it", async () => {
    FakeEventSource.instances = [];
    const store = await openStore();
    const errors: unknown[] = [];
    const source = fromEventSource("https://example.test/v1/events", {
      EventSource: FakeEventSource,
      withCredentials: true,
    });
    const connection = connectEventSource(store, source, {
      onError: (error) => errors.push(error),
    });
    await connection.idle();
    const [first] = FakeEventSource.instances;
    expect(first?.url).toBe("https://example.test/v1/events");
    expect(first?.init).toEqual({ withCredentials: true });
    first?.emit("message.received", received("m1", "hi"), "cursor-1");
    first?.emit("message", "not json", "cursor-2");
    await connection.idle();
    expect(await store.messages.get("m1")).toMatchObject({ text: "hi" });
    expect(connection.cursor).toBe("cursor-1");
    expect(errors).toHaveLength(1);
    connection.close();
    expect(first?.closed).toBe(true);

    const resumed = connectEventSource(store, source);
    await resumed.idle();
    const second = FakeEventSource.instances[1];
    expect(second?.url).toBe(
      "https://example.test/v1/events?lastEventId=cursor-1",
    );
    second?.emit("message", [received("m2", "a"), received("m3", "b")], "c-3");
    await resumed.idle();
    expect(await store.checkpoints.get("default")).toMatchObject({
      cursor: "c-3",
    });
    expect(
      await store.messages.list({ conversationId: "chat_1" }),
    ).toHaveLength(3);
    resumed.close();
    store.close();
  });

  it("does not close an EventSource it did not create", () => {
    const existing = new FakeEventSource("x");
    const unsubscribe = fromEventSource(existing).subscribe(() => undefined);
    expect(existing.listeners.get("message")?.size).toBe(1);
    unsubscribe();
    expect(existing.listeners.get("message")?.size).toBe(0);
    expect(existing.closed).toBe(false);
  });

  it("keeps the checkpoint behind events whose write failed", async () => {
    const store = await openStore();
    const onError = vi.fn();
    vi.spyOn(store, "ingest").mockRejectedValueOnce(new Error("quota"));
    let push: LiveEventListener = () => undefined;
    const source: LiveEventSource = {
      subscribe(listener) {
        push = listener;
        return () => undefined;
      },
    };
    const connection = connectEventSource(store, source, { onError });
    await connection.idle();
    push(received("a", "a"), { cursor: "1" });
    await connection.idle();
    expect(onError).toHaveBeenCalledWith(new Error("quota"));
    push(received("b", "b"), { cursor: "2" });
    await connection.idle();
    expect(connection.cursor).toBeUndefined();
    expect(await store.checkpoints.get("default")).toBeUndefined();
    expect(await store.messages.get("b")).toBeUndefined();
    connection.close();
    store.close();
  });

  it("batches pushes that arrive while a write is in flight", async () => {
    const store = await openStore();
    const ingest = vi.spyOn(store, "ingest");
    let push: LiveEventListener = () => undefined;
    const source: LiveEventSource = {
      subscribe(listener) {
        push = listener;
        return () => undefined;
      },
    };
    const connection = connectEventSource(store, source, { maxBatch: 2 });
    await connection.idle();
    push(received("a", "a"));
    push(received("b", "b"));
    push(received("c", "c"), { cursor: "3" });
    await connection.idle();
    expect(
      ingest.mock.calls.map(([events]) => (events as unknown[]).length),
    ).toEqual([1, 2]);
    expect(connection.cursor).toBe("3");
    connection.close();
    store.close();
  });
});

describe("fromEventStream", () => {
  it("sends Last-Event-ID and fresh headers, and delivers frames", async () => {
    const encoder = new TextEncoder();
    const bodies = [`id: 5\ndata: ${JSON.stringify(received("m1", "hi"))}\n\n`];
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = bodies.shift();
      if (body === undefined) {
        return new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        );
      }
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(body));
            controller.close();
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    });
    const store = await openStore();
    await store.checkpoints.set("default", "4");
    const connection = connectEventSource(
      store,
      fromEventStream({
        url: "https://example.test/events",
        fetch: fetcher as unknown as typeof fetch,
        headers: () => ({ Authorization: "Bearer pmfa_ct_fixture" }),
        retryMs: 1,
      }),
    );
    await connection.idle();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await connection.idle();
    const first = new Headers(fetcher.mock.calls[0]?.[1]?.headers);
    const second = new Headers(fetcher.mock.calls[1]?.[1]?.headers);
    expect(first.get("authorization")).toBe("Bearer pmfa_ct_fixture");
    expect(first.get("last-event-id")).toBe("4");
    expect(second.get("last-event-id")).toBe("5");
    expect(await store.messages.get("m1")).toBeDefined();
    connection.close();
    store.close();
  });

  it("waits at least the minimum delay and stops waiting on unsubscribe", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(async () => {
        throw new Error("offline");
      });
      const stop = fromEventStream({
        url: "https://example.test/events",
        fetch: fetcher as unknown as typeof fetch,
        retryMs: 0,
      }).subscribe(() => undefined, { onError: () => undefined });
      await vi.advanceTimersByTimeAsync(MIN_EVENT_STREAM_RETRY_MS - 1);
      expect(fetcher).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetcher).toHaveBeenCalledTimes(2);
      stop();
      await vi.advanceTimersByTimeAsync(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("reads the project event stream format", async () => {
    const encoder = new TextEncoder();
    const envelope = received("m1", "hi");
    const base64 = btoa(
      String.fromCharCode(...encoder.encode(JSON.stringify(envelope))),
    );
    const frame = (value: unknown) => `data: ${JSON.stringify(value)}\n\n`;
    const bodies = [
      frame({ type: "ready", heartbeatIntervalMs: 15_000 }) +
        frame({ type: "heartbeat" }) +
        frame({
          type: "event",
          cursor: "c1",
          streamId: "s",
          sequence: 1,
          event: { id: "e1", payload: { encoding: "base64", data: base64 } },
        }) +
        frame({
          type: "event",
          cursor: "c2",
          streamId: "s",
          sequence: 2,
          event: { id: "e2", payload: null },
        }) +
        frame({ type: "expiry" }) +
        frame({ type: "heartbeat", after: "expiry" }),
      frame({ type: "revoked" }),
    ];
    const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = bodies.shift();
      if (body === undefined)
        return new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("aborted")),
          ),
        );
      return new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(body));
            controller.close();
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    });
    const onError = vi.fn();
    const store = await openStore();
    const connection = connectEventSource(
      store,
      fromEventStream({
        url: "https://example.test/events",
        fetch: fetcher as unknown as typeof fetch,
        format: "project",
        retryMs: 1,
      }),
      { onError },
    );
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
    await vi.waitFor(() =>
      expect(onError).toHaveBeenCalledWith(
        new Error("The event stream was revoked."),
      ),
    );
    await connection.idle();
    expect(await store.messages.get("m1")).toMatchObject({ text: "hi" });
    expect(connection.cursor).toBe("c1");
    // Resumes after the body-less event too.
    expect(
      new Headers(fetcher.mock.calls[1]?.[1]?.headers).get("last-event-id"),
    ).toBe("c2");
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(readProjectStreamFrame('{"type":"gap","reason":"x"}')).toEqual({
      kind: "reconnect",
      reason: "gap_x",
    });
    expect(
      readProjectStreamFrame('{"type":"gap","reason":"retention_exceeded"}'),
    ).toEqual({ kind: "ignore" });
    connection.close();
    store.close();
  });

  it("reports a non-stream response", async () => {
    const onError = vi.fn();
    const stop = fromEventStream({
      url: "https://example.test/events",
      fetch: (async () =>
        new Response("<html>", {
          status: 502,
          headers: { "content-type": "text/html" },
        })) as typeof fetch,
      retryMs: 60_000,
    }).subscribe(() => undefined, { onError });
    await vi.waitFor(() => expect(onError).toHaveBeenCalled());
    expect(String(onError.mock.calls[0]?.[0])).toMatch(/status 502/);
    stop();
  });
});

describe("fromIterable and fromWebSocket", () => {
  it("replays a backfill in batches", async () => {
    const store = await openStore();
    async function* backfill() {
      for (let index = 0; index < 5; index += 1)
        yield received(`m${index}`, "x", { at: 1_000 * (index + 1) });
    }
    const source = fromIterable(backfill(), { batchSize: 2 });
    const connection = connectEventSource(store, source);
    await connection.idle();
    await source.completed;
    await connection.idle();
    expect(
      await store.messages.list({ conversationId: "chat_1" }),
    ).toHaveLength(5);
    connection.close();
    store.close();
  });

  it("reads JSON frames from a WebSocket", () => {
    const handlers = new Set<(event: MessageEvent) => void>();
    const socket = {
      addEventListener: (
        _: "message",
        handler: (event: MessageEvent) => void,
      ) => handlers.add(handler),
      removeEventListener: (
        _: "message",
        handler: (event: MessageEvent) => void,
      ) => handlers.delete(handler),
      close: vi.fn(),
    };
    const listener = vi.fn();
    const onError = vi.fn();
    const stop = fromWebSocket(socket).subscribe(listener, { onError });
    const message = received("m1", "hi");
    for (const handler of handlers)
      handler({ data: JSON.stringify(message) } as MessageEvent);
    for (const handler of handlers)
      handler({ data: new ArrayBuffer(1) } as MessageEvent);
    expect(listener).toHaveBeenCalledWith([message], { cursor: message.id });
    expect(onError).toHaveBeenCalledOnce();
    stop();
    expect(handlers.size).toBe(0);
    expect(socket.close).not.toHaveBeenCalled();
  });
});
