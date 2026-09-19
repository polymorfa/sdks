import { describe, expect, it, vi } from "vitest";

import {
  Client,
  PolymorfaAuthorizationError,
  PolymorfaConfigurationError,
  type EventStreamItem,
} from "../src/index.js";
import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";

const PROJECT = "018f0000-0000-7000-8000-000000000077";

function webhookBody(id: string, type = "message.received") {
  return {
    id,
    session: "support",
    timestamp: "2026-09-18T10:00:00.000Z",
    event: type,
    payload: { text: "hello" },
  };
}

function eventFrame(
  sequence: number,
  id: string,
  cursor: string,
  withBody = true,
) {
  const body = webhookBody(id);
  return {
    id: cursor,
    event: "event",
    data: {
      v: 1,
      type: "event",
      streamId: "s",
      sequence,
      sentAt: "2026-09-18T10:00:00.000Z",
      cursor,
      event: {
        id,
        organizationId: "o",
        projectId: PROJECT,
        type: body.event,
        source: "runtime",
        environment: "development",
        createdAt: body.timestamp,
        payloadAvailability: withBody ? "available" : "not_retained",
        payload: withBody
          ? {
              encoding: "base64",
              contentType: "application/json",
              data: Buffer.from(JSON.stringify(body)).toString("base64"),
            }
          : null,
        replayableUntil: null,
        metadataExpiresAt: "2026-10-18T10:00:00.000Z",
      },
    },
  };
}

const ready = {
  event: "ready",
  data: {
    v: 1,
    type: "ready",
    streamId: "s",
    sequence: 1,
    heartbeatIntervalMs: 15_000,
  },
};

function sse(
  frames: Array<{ id?: string; event: string; data: unknown }>,
  keepOpen = false,
): Response {
  const text = frames
    .map(
      (frame) =>
        `${frame.id === undefined ? "" : `id: ${frame.id}\n`}event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`,
    )
    .join("");
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      // Split mid-frame to exercise incremental parsing.
      const bytes = new TextEncoder().encode(text);
      const middle = Math.floor(bytes.length / 2);
      controller.enqueue(bytes.slice(0, middle));
      controller.enqueue(bytes.slice(middle));
      if (!keepOpen) controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });
}

function jsonError(
  status: number,
  code: string,
  headers: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({
      error: { type: "permission_error", code, message: code, param: null },
      data: null,
      docs: "https://docs.polymorfa.com",
    }),
    {
      status,
      headers: { "content-type": "application/json", ...headers },
    },
  );
}

function projectClient(fetcher: typeof fetch) {
  return new Client({
    credential: { type: "projectToken", value: PROJECT_TOKEN },
    projectId: PROJECT,
    fetch: fetcher,
    maxNetworkRetries: 0,
  });
}

async function collect(
  iterable: AsyncIterable<EventStreamItem>,
  count: number,
): Promise<EventStreamItem[]> {
  const items: EventStreamItem[] = [];
  for await (const item of iterable) {
    items.push(item);
    if (items.length === count) break;
  }
  return items;
}

describe("events.stream", () => {
  it("opens the project stream with filters and yields decoded webhook bodies", async () => {
    const requests: Request[] = [];
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        requests.push(new Request(input, init));
        return sse([
          ready,
          eventFrame(2, "e1", "c1"),
          eventFrame(3, "e2", "c2", false),
        ]);
      },
    ) as unknown as typeof fetch;
    const items = await collect(
      projectClient(fetcher).events.stream({
        types: ["message.*", "session.connected"],
      }),
      2,
    );
    const url = new URL(requests[0]!.url);
    expect(url.pathname).toBe(`/platform/projects/${PROJECT}/events/stream`);
    expect(url.searchParams.get("types")).toBe("message.*,session.connected");
    expect(requests[0]!.headers.get("accept")).toBe("text/event-stream");
    expect(requests[0]!.headers.get("authorization")).toBe(
      `Bearer ${PROJECT_TOKEN}`,
    );
    expect(requests[0]!.headers.get("last-event-id")).toBeNull();
    expect(items[0]).toMatchObject({
      cursor: "c1",
      event: { id: "e1" },
      webhook: webhookBody("e1"),
    });
    expect(items[1]).toMatchObject({
      cursor: "c2",
      webhook: null,
      event: { payloadAvailability: "not_retained" },
    });
  });

  it("requires projectId on organization clients and builds that project's path", async () => {
    const requests: string[] = [];
    const client = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      fetch: (async (input: RequestInfo | URL) => {
        requests.push(String(input));
        return sse([ready, eventFrame(2, "e1", "c1")]);
      }) as typeof fetch,
    });
    expect(() => client.events.stream({} as never)).toThrow(
      PolymorfaConfigurationError,
    );
    await collect(client.events.stream({ projectId: PROJECT }), 1);
    expect(new URL(requests[0]!).pathname).toBe(
      `/platform/projects/${PROJECT}/events/stream`,
    );
    await collect(client.project(PROJECT).events.stream(), 1);
    expect(new URL(requests[1]!).pathname).toBe(
      `/platform/projects/${PROJECT}/events/stream`,
    );
  });

  it("reconnects after expiry and resumes from the last delivered cursor", async () => {
    const lastEventIds: Array<string | null> = [];
    let call = 0;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      lastEventIds.push(new Request(input, init).headers.get("last-event-id"));
      call += 1;
      return call === 1
        ? sse([
            ready,
            eventFrame(2, "e1", "c1"),
            {
              event: "expiry",
              data: { v: 1, type: "expiry", reason: "idle_timeout" },
            },
          ])
        : sse([ready, eventFrame(2, "e2", "c2")]);
    }) as typeof fetch;
    const onReconnect = vi.fn();
    const stream = projectClient(fetcher).events.stream({
      since: "c0",
      reconnect: { initialDelayMs: 1, maxDelayMs: 2 },
      onReconnect,
    });
    const items = await collect(stream, 2);
    expect(items.map((item) => item.cursor)).toEqual(["c1", "c2"]);
    expect(lastEventIds).toEqual(["c0", "c1"]);
    expect(onReconnect).toHaveBeenCalledOnce();
    expect(stream.cursor).toBe("c2");
  });

  it("reconnects after a dropped connection and a recoverable gap", async () => {
    let call = 0;
    const fetcher = (async () => {
      call += 1;
      if (call === 1) throw new TypeError("socket hang up");
      if (call === 2)
        return sse([
          ready,
          {
            event: "gap",
            data: {
              v: 1,
              type: "gap",
              reason: "source_unavailable",
              recoverable: true,
            },
          },
        ]);
      return sse([ready, eventFrame(2, "e1", "c1")]);
    }) as typeof fetch;
    const items = await collect(
      projectClient(fetcher).events.stream({
        reconnect: { initialDelayMs: 1, maxDelayMs: 2 },
      }),
      1,
    );
    expect(items[0]!.cursor).toBe("c1");
    expect(call).toBe(3);
  });

  it("reconnects when heartbeats stop arriving", async () => {
    let call = 0;
    const onReconnect = vi.fn();
    const fetcher = (async () => {
      call += 1;
      return call === 1
        ? sse(
            [
              {
                event: "ready",
                data: { v: 1, type: "ready", heartbeatIntervalMs: 5 },
              },
            ],
            true,
          )
        : sse([ready, eventFrame(2, "e1", "c1")]);
    }) as typeof fetch;
    const items = await collect(
      projectClient(fetcher).events.stream({
        onReconnect,
        reconnect: { initialDelayMs: 1, maxDelayMs: 2 },
      }),
      1,
    );
    expect(items[0]!.cursor).toBe("c1");
    expect(onReconnect.mock.calls[0]![0]).toMatchObject({
      reason: "heartbeat_missed",
    });
  });

  it("reports a retention gap and keeps streaming", async () => {
    const onGap = vi.fn();
    const fetcher = (async () =>
      sse([
        ready,
        {
          event: "gap",
          data: {
            v: 1,
            type: "gap",
            reason: "retention_exceeded",
            recoverable: false,
            missedEvents: 4,
            requestedCursor: "c0",
          },
        },
        eventFrame(3, "e1", "c1"),
      ])) as typeof fetch;
    const items = await collect(
      projectClient(fetcher).events.stream({ since: "c0", onGap }),
      1,
    );
    expect(onGap).toHaveBeenCalledWith({
      reason: "retention_exceeded",
      missedEvents: 4,
      requestedCursor: "c0",
    });
    expect(items[0]!.cursor).toBe("c1");
  });

  it("stops without retrying when the beta is not enabled", async () => {
    const fetcher = vi.fn(async () =>
      jsonError(403, "feature_unavailable"),
    ) as unknown as typeof fetch;
    const error = await collect(
      projectClient(fetcher).events.stream({
        reconnect: { initialDelayMs: 1 },
      }),
      1,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PolymorfaAuthorizationError);
    expect((error as PolymorfaAuthorizationError).code).toBe(
      "feature_unavailable",
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("stops without retrying on an expired cursor", async () => {
    const fetcher = vi.fn(async () =>
      jsonError(410, "stream_cursor_expired"),
    ) as unknown as typeof fetch;
    const error = await collect(
      projectClient(fetcher).events.stream({ since: "old" }),
      1,
    ).catch((caught: unknown) => caught);
    expect((error as { code?: string }).code).toBe("stream_cursor_expired");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("ends with an authorization error when the stream is revoked", async () => {
    const fetcher = vi.fn(async () =>
      sse([
        ready,
        {
          event: "revoked",
          data: { v: 1, type: "revoked", reason: "principal_revoked" },
        },
      ]),
    ) as unknown as typeof fetch;
    const error = await collect(
      projectClient(fetcher).events.stream(),
      1,
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PolymorfaAuthorizationError);
    expect((error as PolymorfaAuthorizationError).code).toBe("stream_revoked");
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("honors Retry-After on a connection limit and then connects", async () => {
    let call = 0;
    const onReconnect = vi.fn();
    const fetcher = (async () => {
      call += 1;
      return call === 1
        ? jsonError(429, "stream_connection_limit_reached", {
            "retry-after": "0",
          })
        : sse([ready, eventFrame(2, "e1", "c1")]);
    }) as typeof fetch;
    const items = await collect(
      projectClient(fetcher).events.stream({ onReconnect }),
      1,
    );
    expect(items).toHaveLength(1);
    expect(onReconnect).toHaveBeenCalledWith(
      expect.objectContaining({ code: "stream_connection_limit_reached" }),
      0,
    );
  });

  it("ends cleanly when the caller aborts", async () => {
    const controller = new AbortController();
    const fetcher = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      const response = sse([ready, eventFrame(2, "e1", "c1")], true);
      init?.signal?.addEventListener(
        "abort",
        () => void response.body?.cancel().catch(() => undefined),
      );
      return response;
    }) as typeof fetch;
    const seen: string[] = [];
    for await (const item of projectClient(fetcher).events.stream({
      signal: controller.signal,
    })) {
      seen.push(item.cursor);
      controller.abort();
    }
    expect(seen).toEqual(["c1"]);
  });
});

describe("events.stream review fixes", () => {
  it("advances the resume cursor on checkpoint frames", async () => {
    const lastEventIds: Array<string | null> = [];
    let call = 0;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      lastEventIds.push(new Request(input, init).headers.get("last-event-id"));
      call += 1;
      return call === 1
        ? sse([
            ready,
            {
              event: "checkpoint",
              data: { v: 1, type: "checkpoint", cursor: "k1" },
            },
          ])
        : sse([ready, eventFrame(2, "e1", "c1")]);
    }) as typeof fetch;
    const stream = projectClient(fetcher).events.stream({
      since: "c0",
      reconnect: { initialDelayMs: 1, maxDelayMs: 2 },
    });
    const items = await collect(stream, 1);
    expect(lastEventIds).toEqual(["c0", "k1"]);
    expect(items[0]!.cursor).toBe("c1");
  });

  it("honors an HTTP-date Retry-After, clamped to maxDelayMs", async () => {
    let call = 0;
    const fetcher = (async () => {
      call += 1;
      if (call === 1)
        return jsonError(429, "rate_limit_exceeded", {
          "retry-after": new Date(Date.now() + 3_600_000).toUTCString(),
        });
      if (call === 2)
        return jsonError(429, "rate_limit_exceeded", {
          "retry-after": new Date(Date.now() - 60_000).toUTCString(),
        });
      return sse([ready, eventFrame(2, "e1", "c1")]);
    }) as typeof fetch;
    const onReconnect = vi.fn();
    await collect(
      projectClient(fetcher).events.stream({
        reconnect: { initialDelayMs: 1, maxDelayMs: 5 },
        onReconnect,
      }),
      1,
    );
    expect(onReconnect.mock.calls.map((args) => args[1])).toEqual([5, 0]);
  });

  it("ignores a blank Retry-After and uses backoff", async () => {
    let call = 0;
    const fetcher = (async () => {
      call += 1;
      return call === 1
        ? jsonError(429, "rate_limit_exceeded", { "retry-after": " " })
        : sse([ready, eventFrame(2, "e1", "c1")]);
    }) as typeof fetch;
    const onReconnect = vi.fn();
    await collect(
      projectClient(fetcher).events.stream({
        reconnect: { initialDelayMs: 4, maxDelayMs: 8 },
        onReconnect,
      }),
      1,
    );
    const delay = onReconnect.mock.calls[0]![1] as number;
    expect(delay).toBeGreaterThanOrEqual(2);
    expect(delay).toBeLessThanOrEqual(4);
  });

  it("stops without waiting when onReconnect aborts", async () => {
    const controller = new AbortController();
    const fetcher = (async () =>
      jsonError(503, "service_unavailable", {
        "retry-after": "60",
      })) as typeof fetch;
    const started = Date.now();
    const items = await collect(
      projectClient(fetcher).events.stream({
        signal: controller.signal,
        reconnect: { initialDelayMs: 60_000, maxDelayMs: 60_000 },
        onReconnect: () => controller.abort(),
      }),
      1,
    );
    expect(items).toEqual([]);
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it("does not reconnect after an abort that closes the connection normally", async () => {
    const controller = new AbortController();
    const onReconnect = vi.fn();
    const fetcher = (async () => sse([ready], true)) as typeof fetch;
    const stream = projectClient(fetcher).events.stream({
      signal: controller.signal,
      reconnect: { initialDelayMs: 60_000, maxDelayMs: 60_000 },
      onReconnect,
    });
    const iterator = stream[Symbol.asyncIterator]();
    const next = iterator.next();
    setTimeout(() => controller.abort(), 10);
    await expect(next).resolves.toEqual({ done: true, value: undefined });
    expect(onReconnect).not.toHaveBeenCalled();
  });

  it("removes each reconnect abort listener once its delay ends", async () => {
    const controller = new AbortController();
    const signal = controller.signal;
    let active = 0;
    const add = signal.addEventListener.bind(signal);
    const remove = signal.removeEventListener.bind(signal);
    const listeners = new Set<unknown>();
    signal.addEventListener = ((
      type: string,
      listener: unknown,
      options?: boolean | AddEventListenerOptions,
    ) => {
      if (type === "abort" && !listeners.has(listener)) {
        listeners.add(listener);
        active += 1;
      }
      add(type, listener as EventListener, options);
    }) as typeof signal.addEventListener;
    signal.removeEventListener = ((
      type: string,
      listener: unknown,
      options?: boolean | EventListenerOptions,
    ) => {
      if (type === "abort" && listeners.delete(listener)) active -= 1;
      remove(type, listener as EventListener, options);
    }) as typeof signal.removeEventListener;
    let call = 0;
    const fetcher = (async () => {
      call += 1;
      if (call <= 5) throw new TypeError("socket hang up");
      return sse([ready, eventFrame(2, "e1", "c1")]);
    }) as typeof fetch;
    await collect(
      projectClient(fetcher).events.stream({
        signal,
        reconnect: { initialDelayMs: 1, maxDelayMs: 1 },
      }),
      1,
    );
    expect(call).toBe(6);
    expect(active).toBe(0);
  });

  it("treats an event without a payload field as having no webhook body", async () => {
    const frame = eventFrame(2, "e1", "c1");
    const event: Record<string, unknown> = { ...frame.data.event };
    delete event.payload;
    const fetcher = (async () =>
      sse([
        ready,
        { ...frame, data: { ...frame.data, event } },
      ])) as typeof fetch;
    const [item] = await collect(projectClient(fetcher).events.stream(), 1);
    expect(item!.webhook).toBeNull();
  });
});

describe("events.acknowledgeStream", () => {
  it("opens a manual stream and acknowledges with the delivered stream position", async () => {
    const requests: Request[] = [];
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      requests.push(request);
      if (request.method === "POST") {
        return new Response(
          JSON.stringify({
            data: {
              streamId: "s",
              acknowledgedCursor: "c1",
              sequence: 2,
              replayed: false,
            },
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          },
        );
      }
      return sse([ready, eventFrame(2, "e1", "c1")]);
    }) as typeof fetch;
    const client = projectClient(fetcher);
    const [item] = await collect(client.events.stream({ ack: "manual" }), 1);
    expect(new URL(requests[0]!.url).searchParams.get("ack")).toBe("manual");
    const receipt = await client.events.acknowledgeStream(item!.streamId, {
      cursor: item!.cursor,
      sequence: item!.sequence,
    });
    expect(receipt.data).toEqual({
      streamId: "s",
      acknowledgedCursor: "c1",
      sequence: 2,
      replayed: false,
    });
    expect(new URL(requests[1]!.url).pathname).toBe(
      `/platform/projects/${PROJECT}/events/stream/s/ack`,
    );
    expect(await requests[1]!.json()).toEqual({ cursor: "c1", sequence: 2 });
  });
});

describe("events.liveSource", () => {
  it("feeds webhook-shaped events with cursors and skips events without a body", async () => {
    let call = 0;
    const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
      call += 1;
      expect(new Request(input, init).headers.get("last-event-id")).toBe(
        "saved",
      );
      return sse(
        [ready, eventFrame(2, "e1", "c1", false), eventFrame(3, "e2", "c2")],
        true,
      );
    }) as typeof fetch;
    const received: Array<{ events: unknown; cursor?: string }> = [];
    const done = new Promise<void>((resolve) => {
      const source = projectClient(fetcher).events.liveSource({
        types: ["message.*"],
      });
      const stop = source.subscribe(
        (events, meta) => {
          received.push({
            events,
            ...(meta?.cursor === undefined ? {} : { cursor: meta.cursor }),
          });
          stop();
          resolve();
        },
        { cursor: "saved" },
      );
    });
    await done;
    expect(call).toBe(1);
    expect(received).toEqual([{ events: [webhookBody("e2")], cursor: "c2" }]);
  });
});
