import { describe, expect, it, vi } from "vitest";

import {
  MessagingClient,
  PolymorfaAuthorizationError,
  PolymorfaCancelledError,
  PolymorfaError,
  PolymorfaNotFoundError,
  parseContentDispositionFilename,
  signedUrlExpiry,
} from "../src/index.js";
import { HttpTransport } from "../src/transport/http.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";

const API = "https://api.polymorfa.test";
const SIGNED =
  "https://storage.example.com/media/abc?X-Amz-Date=20260917T100000Z&X-Amz-Expires=300&X-Amz-Signature=secret";

type Call = { url: string; init: RequestInit };

function mockFetch(
  handler: (url: string, init: RequestInit, index: number) => Response,
) {
  const calls: Call[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    if (init?.signal?.aborted === true) throw init.signal.reason;
    return handler(url, init ?? {}, calls.length - 1);
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

function client(fetch: typeof globalThis.fetch): MessagingClient {
  return new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl: API,
    maxNetworkRetries: 0,
    timeoutMs: 1_000,
    fetch,
  });
}

function header(init: RequestInit, name: string): string | null {
  return new Headers(init.headers).get(name);
}

/** A body that records how many chunks were pulled. */
function countingBody(chunks: Uint8Array[]) {
  let pulled = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        const chunk = chunks[pulled];
        pulled += 1;
        if (chunk === undefined) controller.close();
        else controller.enqueue(chunk);
      },
    },
    { highWaterMark: 0 },
  );
  return { stream, pulled: () => pulled };
}

describe("MessagingMediaResource streaming downloads", () => {
  it("streams without buffering and exposes response metadata", async () => {
    const body = countingBody([
      Uint8Array.from([1, 2]),
      Uint8Array.from([3]),
      Uint8Array.from([4, 5]),
    ]);
    const { fetch, calls } = mockFetch(
      () =>
        new Response(body.stream, {
          headers: {
            "content-type": "image/png",
            "content-length": "5",
            "content-disposition":
              "attachment; filename=\"fallback.png\"; filename*=UTF-8''%E2%82%AC%20rates.png",
            "x-request-id": "req_stream",
          },
        }),
    );

    const download = await client(fetch).media.downloadStream("media/1");
    expect(download).toMatchObject({
      contentType: "image/png",
      contentLength: 5,
      filename: "€ rates.png",
      requestId: "req_stream",
      redirected: false,
    });
    expect(body.pulled()).toBe(0);

    const reader = download.body.getReader();
    expect((await reader.read()).value).toEqual(Uint8Array.from([1, 2]));
    expect(body.pulled()).toBeLessThanOrEqual(2);
    const rest = await new Response(
      new ReadableStream({
        async pull(controller) {
          const next = await reader.read();
          if (next.done) controller.close();
          else controller.enqueue(next.value);
        },
      }),
    ).arrayBuffer();
    expect(Array.from(new Uint8Array(rest))).toEqual([3, 4, 5]);
    expect(calls[0]?.url).toBe(`${API}/messaging/media/media%2F1`);
    expect(calls[0]?.init.redirect).toBe("manual");
    expect(header(calls[0]!.init, "authorization")).toBe(
      `Bearer ${ORGANIZATION_API_KEY}`,
    );
  });

  it("follows a storage redirect without sending credentials or caller headers", async () => {
    const { fetch, calls } = mockFetch((url) =>
      url.startsWith(API)
        ? new Response(null, {
            status: 302,
            headers: { location: SIGNED, "x-request-id": "req_redirect" },
          })
        : new Response(Uint8Array.from([9, 9]), {
            headers: { "content-type": "video/mp4" },
          }),
    );

    const download = await client(fetch).media.downloadStream("m", {
      headers: { "x-tenant-secret": "keep-me-home" },
    });
    expect(download).toMatchObject({
      redirected: true,
      contentType: "video/mp4",
      requestId: "req_redirect",
    });
    expect(
      Array.from(
        new Uint8Array(await new Response(download.body).arrayBuffer()),
      ),
    ).toEqual([9, 9]);
    expect(calls).toHaveLength(2);
    const storage = calls[1]!;
    expect(storage.url).toBe(SIGNED);
    expect(header(storage.init, "authorization")).toBeNull();
    expect(header(storage.init, "x-tenant-secret")).toBeNull();
    expect(header(storage.init, "polymorfa-version")).toBeNull();
    expect(storage.init.credentials).toBe("omit");
  });

  it("rejects a redirect to a non-HTTPS location", async () => {
    const { fetch, calls } = mockFetch(
      () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://storage.example.com/x" },
        }),
    );
    const error = await client(fetch)
      .media.downloadStream("m")
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PolymorfaError);
    expect(error).toMatchObject({ code: "invalid_redirect" });
    expect(calls).toHaveLength(1);
  });

  it("returns the signed URL without following it", async () => {
    const { fetch, calls } = mockFetch(
      () =>
        new Response(null, {
          status: 302,
          headers: { location: SIGNED, "x-request-id": "req_url" },
        }),
    );
    const result = await client(fetch).media.downloadUrl("m");
    expect(result).toEqual({
      streamed: false,
      url: SIGNED,
      expiresAt: new Date("2026-09-17T10:05:00Z"),
      requestId: "req_url",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.init.redirect).toBe("manual");
  });

  it("reports a streamed response and cancels its body", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(Uint8Array.from([1]));
      },
      cancel() {
        cancelled = true;
      },
    });
    const { fetch } = mockFetch(
      () => new Response(body, { headers: { "content-type": "image/jpeg" } }),
    );
    await expect(client(fetch).media.downloadUrl("m")).resolves.toEqual({
      streamed: true,
      url: undefined,
    });
    expect(cancelled).toBe(true);
  });

  it("builds a typed Blob", async () => {
    const { fetch } = mockFetch(
      () =>
        new Response("hello", {
          headers: {
            "content-type": "text/plain",
            "content-disposition": "attachment; filename=note.txt",
          },
        }),
    );
    const { blob, filename } = await client(fetch).media.downloadBlob("m");
    expect(blob.type).toBe("text/plain");
    expect(await blob.text()).toBe("hello");
    expect(filename).toBe("note.txt");
  });

  it.each([
    [404, PolymorfaNotFoundError, "resource_not_found"],
    [403, PolymorfaAuthorizationError, "permission_denied"],
  ])("decodes %i JSON errors", async (status, type, code) => {
    const { fetch } = mockFetch(() =>
      Response.json(
        { error: { code, message: `denied ${status}` } },
        { status, headers: { "x-request-id": `req_${status}` } },
      ),
    );
    const error = await client(fetch)
      .media.downloadStream("m")
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(type);
    expect(error).toMatchObject({
      code,
      status,
      message: `denied ${status}`,
      requestId: `req_${status}`,
    });
  });

  it("cancels before and during the body", async () => {
    const before = new AbortController();
    before.abort();
    const { fetch } = mockFetch(() => new Response("x"));
    await expect(
      client(fetch).media.downloadStream("m", { signal: before.signal }),
    ).rejects.toBeInstanceOf(PolymorfaCancelledError);

    const during = new AbortController();
    const slow = mockFetch(
      (_url, init) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(Uint8Array.from([1]));
              init.signal?.addEventListener("abort", () =>
                controller.error(init.signal?.reason),
              );
            },
          }),
        ),
    );
    const download = await client(slow.fetch).media.downloadStream("m", {
      signal: during.signal,
    });
    const reader = download.body.getReader();
    await reader.read();
    during.abort();
    await expect(reader.read()).rejects.toBeInstanceOf(PolymorfaCancelledError);
  });

  it("retries only before the body is handed out", async () => {
    let sent = false;
    const { fetch, calls } = mockFetch((_url, _init, index) =>
      index === 0
        ? Response.json({ error: "busy" }, { status: 503 })
        : new Response(
            new ReadableStream<Uint8Array>(
              {
                pull(controller) {
                  if (sent) {
                    controller.error(new Error("socket reset"));
                  } else {
                    sent = true;
                    controller.enqueue(Uint8Array.from([7]));
                  }
                },
              },
              { highWaterMark: 0 },
            ),
          ),
    );
    const transport = new HttpTransport({
      baseUrl: API,
      authorization: "Bearer pmfa_example",
      timeoutMs: 1_000,
      maxNetworkRetries: 3,
      fetch,
      sleep: async () => undefined,
      random: () => 0,
    });
    const response = await transport.requestStream({
      method: "GET",
      path: "/messaging/media/m",
    });
    expect(response.metadata.attempts).toBe(2);
    const reader = response.body.getReader();
    await reader.read();
    await expect(reader.read()).rejects.toMatchObject({
      code: "connection_error",
    });
    expect(calls).toHaveLength(2);
  });

  it("does not retry non-idempotent streams", async () => {
    const { fetch, calls } = mockFetch(() =>
      Response.json({ error: "busy" }, { status: 503 }),
    );
    const transport = new HttpTransport({
      baseUrl: API,
      authorization: "Bearer pmfa_example",
      timeoutMs: 1_000,
      maxNetworkRetries: 3,
      fetch,
      sleep: async () => undefined,
    });
    await expect(
      transport.requestStream({ method: "POST", path: "/x" }),
    ).rejects.toMatchObject({ status: 503 });
    expect(calls).toHaveLength(1);
  });
});

describe("parseContentDispositionFilename", () => {
  it.each([
    ['attachment; filename="a b.pdf"', "a b.pdf"],
    ["attachment; filename=plain.txt", "plain.txt"],
    ['attachment; filename="quo\\"te.txt"', 'quo"te.txt'],
    ["attachment; filename*=UTF-8''na%C3%AFve.txt", "naïve.txt"],
    [
      "attachment; filename*=utf-8'en'%E2%82%AC.txt; filename=\"e.txt\"",
      "€.txt",
    ],
    ["attachment; filename*=iso-8859-1''caf%E9.txt", "café.txt"],
    ["attachment; filename*=UTF-8''%FF.txt; filename=ok.txt", "ok.txt"],
    ['attachment; filename="../../etc/passwd"', "passwd"],
    ['attachment; filename="..\\\\win.ini"', "win.ini"],
    ["inline", undefined],
    [null, undefined],
    ['attachment; filename=".."', undefined],
  ])("parses %s", (value, expected) => {
    expect(parseContentDispositionFilename(value)).toBe(expected);
  });
});

describe("signedUrlExpiry", () => {
  it("reads SigV4 and epoch expiry parameters", () => {
    expect(signedUrlExpiry(SIGNED)?.toISOString()).toBe(
      "2026-09-17T10:05:00.000Z",
    );
    expect(
      signedUrlExpiry("https://s.example/x?Expires=1800000000")?.getTime(),
    ).toBe(1_800_000_000_000);
    expect(signedUrlExpiry("https://s.example/x")).toBeUndefined();
  });
});

describe("downloadMediaToFile", () => {
  it("renames on success and removes the temp file on a body error", async () => {
    const { mkdtempSync, readdirSync, readFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { downloadMediaToFile } = await import("../src/node.js");
    const directory = mkdtempSync(join(tmpdir(), "pmfa-api-media-"));

    const ok = mockFetch(
      () =>
        new Response("file-bytes", {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": "attachment; filename=a.pdf",
          },
        }),
    );
    const path = join(directory, "a.pdf");
    await expect(
      downloadMediaToFile(client(ok.fetch).media, "m", path),
    ).resolves.toMatchObject({
      path,
      bytes: 10,
      contentType: "application/pdf",
      filename: "a.pdf",
    });
    expect(readFileSync(path, "utf8")).toBe("file-bytes");

    let sent = false;
    const broken = mockFetch(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              if (sent) controller.error(new Error("reset"));
              sent = true;
              controller.enqueue(new Uint8Array(4));
            },
          }),
        ),
    );
    await expect(
      downloadMediaToFile(
        client(broken.fetch).media,
        "m",
        join(directory, "b.bin"),
      ),
    ).rejects.toMatchObject({ code: "connection_error" });
    expect(readdirSync(directory)).toEqual(["a.pdf"]);
  });
});

describe("module boundaries", () => {
  it("keeps node:fs out of the main entry graph", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const root = new URL("../src/", import.meta.url).pathname;
    const offenders = (
      readdirSync(root, { recursive: true }) as string[]
    ).filter(
      (file) =>
        file.endsWith(".ts") &&
        file !== "node.ts" &&
        /from "node:(fs|path|stream)/.test(
          readFileSync(join(root, file), "utf8"),
        ),
    );
    expect(offenders).toEqual([]);
  });
});
