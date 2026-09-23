import { describe, expect, it, vi } from "vitest";
import {
  Client,
  PolymorfaConfigurationError,
  PolymorfaNotFoundError,
  PolymorfaServerError,
  type CallRecord,
  type CallStats,
} from "../src/index.js";
import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";

const PROJECT_ID = "018f0000-0000-7000-8000-000000000002";
const OTHER_PROJECT_ID = "018f0000-0000-7000-8000-000000000003";

const metrics = {
  calls: 3,
  answered: 2,
  missed: 1,
  declined: 0,
  failed: 0,
  inProgress: 0,
  answerRate: 0.6667,
  totalDurationSeconds: 95,
  averageDurationSeconds: 47.5,
};

function stats(): CallStats {
  return {
    since: "2026-09-11T00:00:00.000Z",
    until: "2026-09-18T00:00:00.000Z",
    timezone: "Europe/Lisbon",
    groupBy: "day",
    totals: metrics,
    groups: [
      { key: "2026-09-17", start: "2026-09-16T23:00:00.000Z", ...metrics },
    ],
    groupsTruncated: false,
    heatmap: Array.from({ length: 168 }, (_, index) => ({
      dayOfWeek: Math.floor(index / 24) + 1,
      hour: index % 24,
      calls: 0,
      answered: 0,
    })),
  };
}

function record(callId: string): CallRecord {
  return {
    callId,
    projectId: PROJECT_ID,
    sessionId: "support",
    direction: "inbound",
    upstream: "linked_device",
    outcome: "answered",
    state: "ended",
    hasVideo: false,
    peerRef: "pr_7Hq2",
    startedAt: "2026-09-17T10:00:00.000Z",
    connectedAt: "2026-09-17T10:00:04.000Z",
    endedAt: "2026-09-17T10:01:39.000Z",
    durationSeconds: 95,
    endReason: "user_hangup",
  };
}

function call(fetch: ReturnType<typeof vi.fn>, index: number) {
  const [url, init] = fetch.mock.calls[index] as [string | URL, RequestInit];
  return {
    method: init.method,
    url: new URL(String(url)),
    accept: new Headers(init.headers).get("accept"),
    authorization: new Headers(init.headers).get("authorization"),
  };
}

function teamClient(fetch: typeof globalThis.fetch) {
  return new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    fetch,
    maxNetworkRetries: 0,
  });
}

function projectClient(fetch: typeof globalThis.fetch) {
  return new Client({
    credential: { type: "projectToken", value: PROJECT_TOKEN },
    projectId: PROJECT_ID,
    fetch,
    maxNetworkRetries: 0,
  });
}

function csv(rows: readonly string[], cursor?: string): Response {
  return new Response(
    ["callId,projectId,sessionId", ...rows].map((row) => `${row}\r\n`).join(""),
    {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        ...(cursor === undefined ? {} : { "polymorfa-next-cursor": cursor }),
      },
    },
  );
}

function errorResponse(status: number, code: string) {
  return Response.json(
    {
      error: {
        type: "invalid_request_error",
        code,
        message: "The resource is unavailable to this caller.",
        param: null,
        request_id: "req_calls",
      },
      data: null,
    },
    { status },
  );
}

describe("Platform call analytics", () => {
  it("reads team-wide statistics with every filter", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ data: stats() }),
    );
    const client = teamClient(fetch);
    const result = await client.calls.stats({
      sessionId: "support",
      direction: "inbound",
      upstream: "cloud_api",
      outcome: "answered",
      since: new Date("2026-09-11T00:00:00.000Z"),
      until: "2026-09-18T00:00:00.000Z",
      groupBy: "day",
      timezone: "Europe/Lisbon",
    });
    expect(result.data).toEqual(stats());
    expect(result.data.heatmap).toHaveLength(168);
    const sent = call(fetch, 0);
    expect(sent.method).toBe("GET");
    expect(sent.url.pathname).toBe("/platform/calls/stats");
    expect(sent.authorization).toBe(`Bearer ${ORGANIZATION_API_KEY}`);
    expect(Object.fromEntries(sent.url.searchParams)).toEqual({
      sessionId: "support",
      direction: "inbound",
      upstream: "cloud_api",
      outcome: "answered",
      since: "2026-09-11T00:00:00.000Z",
      until: "2026-09-18T00:00:00.000Z",
      groupBy: "day",
      timezone: "Europe/Lisbon",
    });
    expect(sent.url.searchParams.has("projectId")).toBe(false);

    await client.calls.stats({ projectId: PROJECT_ID });
    expect(call(fetch, 1).url.searchParams.get("projectId")).toBe(PROJECT_ID);
  });

  it("pins project clients to their own project", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ data: stats() }),
    );
    const client = projectClient(fetch);
    await client.calls.stats();
    expect(call(fetch, 0).url.searchParams.get("projectId")).toBe(PROJECT_ID);
    expect(() =>
      client.calls.stats({
        // @ts-expect-error project clients cannot name another project
        projectId: OTHER_PROJECT_ID,
      }),
    ).toThrow(PolymorfaConfigurationError);

    fetch.mockResolvedValueOnce(
      Response.json({ data: [], page: { nextCursor: null, hasMore: false } }),
    );
    const scoped = teamClient(fetch).project(PROJECT_ID);
    await scoped.calls.list();
    expect(call(fetch, 1).url.searchParams.get("projectId")).toBe(PROJECT_ID);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["CET", "GMT", "utc", "Europe/Lisbon"])(
    "passes IANA zone %s to the API without rewriting it",
    async (timezone) => {
      const fetch = vi.fn<typeof globalThis.fetch>(async () =>
        Response.json({ data: stats() }),
      );
      await teamClient(fetch).calls.stats({ timezone });
      expect(call(fetch, 0).url.searchParams.get("timezone")).toBe(timezone);
    },
  );

  it("sends RFC 3339 date-times with any offset unchanged", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ data: [], page: { nextCursor: null, hasMore: false } }),
    );
    const client = teamClient(fetch);
    await client.calls.list({
      since: "2024-02-29T09:30:00.123456+03:00",
      until: "2026-09-01T00:00:00Z",
    });
    const params = call(fetch, 0).url.searchParams;
    expect(params.get("since")).toBe("2024-02-29T09:30:00.123456+03:00");
    expect(params.get("until")).toBe("2026-09-01T00:00:00Z");
  });

  it("validates leap days in years below 0100 without remapping them to 1900", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ data: [], page: { nextCursor: null, hasMore: false } }),
    );
    const client = teamClient(fetch);
    await client.calls.list({ since: "0096-02-29T00:00:00Z" });
    expect(call(fetch, 0).url.searchParams.get("since")).toBe(
      "0096-02-29T00:00:00Z",
    );
    expect(() => client.calls.list({ since: "0097-02-29T00:00:00Z" })).toThrow(
      PolymorfaConfigurationError,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("validates filters before sending", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = teamClient(fetch);
    const invalid = [
      () => client.calls.stats({ groupBy: "week" as unknown as "day" }),
      () => client.calls.stats({ direction: "both" as unknown as "inbound" }),
      () => client.calls.stats({ since: "last tuesday" }),
      () => client.calls.stats({ since: "1" }),
      () => client.calls.stats({ since: "2026-09-01" }),
      () => client.calls.stats({ since: "2026-09-01T00:00:00" }),
      () => client.calls.stats({ since: "2026-02-30T00:00:00Z" }),
      () => client.calls.stats({ until: "2026-09-01T24:00:00Z" }),
      () => client.calls.stats({ until: "Tue, 01 Sep 2026 00:00:00 GMT" }),
      () => client.calls.stats({ until: new Date(Number.NaN) }),
      () => client.calls.stats({ sessionId: "" }),
      () => client.calls.stats({ timezone: "x".repeat(65) }),
      () => client.calls.list({ limit: 0 }),
      () => client.calls.list({ limit: 101 }),
      () => client.calls.list({ limit: 2.5 }),
      () => client.calls.export({ limit: 1001 }),
      () => client.calls.export({ format: "xlsx" as unknown as "csv" }),
    ];
    for (const attempt of invalid) {
      expect(attempt).toThrow(PolymorfaConfigurationError);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("lists call records and follows the page cursor", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json({
          data: [record("call-1"), record("call-2")],
          page: { nextCursor: "cursor-2", hasMore: true },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [record("call-3")],
          page: { nextCursor: null, hasMore: false },
        }),
      );
    const client = teamClient(fetch);
    const page = await client.calls.list({ outcome: "answered", limit: 2 });
    expect(page.items.map(({ callId }) => callId)).toEqual([
      "call-1",
      "call-2",
    ]);
    expect(page.hasMore).toBe(true);
    const ids: string[] = [];
    for await (const item of page) ids.push(item.callId);
    expect(ids).toEqual(["call-1", "call-2", "call-3"]);
    const first = call(fetch, 0);
    expect(first.url.pathname).toBe("/platform/calls");
    expect(first.url.searchParams.get("limit")).toBe("2");
    expect(first.url.searchParams.get("outcome")).toBe("answered");
    expect(first.url.searchParams.has("cursor")).toBe(false);
    const second = call(fetch, 1);
    expect(second.url.searchParams.get("cursor")).toBe("cursor-2");
    expect(second.url.searchParams.get("outcome")).toBe("answered");
  });

  it("exports one CSV page and reads the next cursor from the header", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      csv(["call-1,p,support"], "next-page"),
    );
    const client = teamClient(fetch);
    const page = await client.calls.export({
      limit: 500,
      direction: "outbound",
    });
    expect(page.data).toEqual({
      format: "csv",
      body: "callId,projectId,sessionId\r\ncall-1,p,support\r\n",
      nextCursor: "next-page",
    });
    const sent = call(fetch, 0);
    expect(sent.url.pathname).toBe("/platform/calls/export");
    expect(sent.accept).toBe("text/csv");
    expect(Object.fromEntries(sent.url.searchParams)).toEqual({
      direction: "outbound",
      format: "csv",
      limit: "500",
    });

    fetch.mockResolvedValueOnce(csv([]));
    const last = await client.calls.export({ cursor: "next-page" });
    expect(last.data.nextCursor).toBeNull();
    expect(call(fetch, 1).url.searchParams.get("cursor")).toBe("next-page");
  });

  it("exports NDJSON", async () => {
    const line = `${JSON.stringify(record("call-1"))}\n`;
    const fetch = vi.fn<typeof globalThis.fetch>(
      async () =>
        new Response(line, {
          headers: { "content-type": "application/x-ndjson" },
        }),
    );
    const page = await projectClient(fetch).calls.export({ format: "ndjson" });
    expect(page.data).toEqual({
      format: "ndjson",
      body: line,
      nextCursor: null,
    });
    const sent = call(fetch, 0);
    expect(sent.accept).toBe("application/x-ndjson");
    expect(sent.url.searchParams.get("projectId")).toBe(PROJECT_ID);
    expect(sent.url.searchParams.get("format")).toBe("ndjson");
  });

  it("rejects a successful export response with the wrong media type", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response("<html>proxy error</html>", {
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      )
      .mockResolvedValueOnce(
        new Response('{"callId":"call-1"}\n', {
          headers: { "content-type": "text/csv" },
        }),
      )
      .mockResolvedValueOnce(new Response("callId\r\n"));
    const client = teamClient(fetch);

    await expect(client.calls.export()).rejects.toMatchObject({
      code: "invalid_response",
      status: 200,
    });
    await expect(
      client.calls.export({ format: "ndjson" }),
    ).rejects.toMatchObject({
      code: "invalid_response",
      status: 200,
    });
    await expect(client.calls.export()).rejects.toMatchObject({
      code: "invalid_response",
      status: 200,
    });
  });

  it("walks every export page and drops repeated CSV headers", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(csv(["call-1,p,support"], "page-2"))
      .mockResolvedValueOnce(csv(['call-2,p,"multi\r\nline"'], "page-3"))
      .mockResolvedValueOnce(csv([]));
    const chunks: string[] = [];
    for await (const chunk of teamClient(fetch).calls.exportAll({
      since: "2026-09-01T00:00:00Z",
    })) {
      chunks.push(chunk);
    }
    expect(chunks.join("")).toBe(
      'callId,projectId,sessionId\r\ncall-1,p,support\r\ncall-2,p,"multi\r\nline"\r\n',
    );
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(call(fetch, 1).url.searchParams.get("cursor")).toBe("page-2");
    expect(call(fetch, 2).url.searchParams.get("cursor")).toBe("page-3");
    for (const index of [0, 1, 2]) {
      expect(call(fetch, index).url.searchParams.get("since")).toBe(
        "2026-09-01T00:00:00Z",
      );
    }
  });

  it("keeps every NDJSON line when walking pages", async () => {
    const one = `${JSON.stringify(record("call-1"))}\n`;
    const two = `${JSON.stringify(record("call-2"))}\n`;
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        new Response(one, {
          headers: {
            "content-type": "application/x-ndjson",
            "polymorfa-next-cursor": "page-2",
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(two, {
          headers: { "content-type": "application/x-ndjson" },
        }),
      );
    const chunks: string[] = [];
    for await (const chunk of teamClient(fetch).calls.exportAll({
      format: "ndjson",
    })) {
      chunks.push(chunk);
    }
    expect(chunks).toEqual([one, two]);
  });

  it("stops before yielding a page that repeats an export cursor", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      csv(["call-1,p,support"], "same"),
    );
    const chunks: string[] = [];
    const walk = async () => {
      for await (const chunk of teamClient(fetch).calls.exportAll()) {
        chunks.push(chunk);
      }
    };
    await expect(walk()).rejects.toBeInstanceOf(PolymorfaServerError);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(chunks).toEqual([
      "callId,projectId,sessionId\r\ncall-1,p,support\r\n",
    ]);
  });

  it("treats the starting cursor as already requested", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      csv(["call-1,p,support"], "start"),
    );
    const chunks: string[] = [];
    const walk = async () => {
      for await (const chunk of teamClient(fetch).calls.exportAll({
        cursor: "start",
      })) {
        chunks.push(chunk);
      }
    };
    await expect(walk()).rejects.toBeInstanceOf(PolymorfaServerError);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(chunks).toEqual([]);
  });

  it("raises typed errors from JSON error bodies", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(errorResponse(404, "resource_not_found"))
      .mockResolvedValueOnce(errorResponse(503, "service_unavailable"))
      .mockResolvedValueOnce(errorResponse(404, "resource_not_found"));
    const client = teamClient(fetch);
    await expect(
      client.calls.export({ projectId: OTHER_PROJECT_ID }),
    ).rejects.toMatchObject({
      constructor: PolymorfaNotFoundError,
      code: "resource_not_found",
      requestId: "req_calls",
    });
    await expect(client.calls.stats()).rejects.toMatchObject({
      constructor: PolymorfaServerError,
      code: "service_unavailable",
      status: 503,
    });
    await expect(client.calls.list()).rejects.toBeInstanceOf(
      PolymorfaNotFoundError,
    );
  });

  it("rejects an invalid statistics envelope", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ totals: metrics }),
    );
    await expect(teamClient(fetch).calls.stats()).rejects.toMatchObject({
      code: "invalid_response",
    });
  });
});
