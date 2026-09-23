import { describe, expect, it, vi } from "vitest";

import { MessagingClient } from "../../typescript/src/index.js";
import {
  createMediaDownloadRoute,
  safeMediaHeaders,
  type MediaDownloadRouteOptions,
} from "../src/index.js";

const SIGNED = "https://storage.example.com/o?X-Amz-Signature=s";

function bytes(value: string): ReadableStream<Uint8Array> {
  return new Response(value).body!;
}

function media(
  overrides: Partial<MediaDownloadRouteOptions["client"]["media"]> = {},
): MediaDownloadRouteOptions["client"]["media"] {
  return {
    downloadStream: vi.fn(async () => ({
      body: bytes("payload"),
      contentType: "image/png; charset=binary",
      contentLength: 7,
      filename: "photo.png",
    })),
    downloadUrl: vi.fn(async () => ({
      streamed: false as const,
      url: SIGNED,
    })),
    downloadFromWhatsApp: vi.fn(async () => ({
      body: bytes("decrypted"),
      mimetype: "application/pdf",
      fileName: "report.pdf",
    })),
    ...overrides,
  };
}

const get = () => new Request("https://app.test/media/1");

describe("createMediaDownloadRoute", () => {
  it("accepts a MessagingClient", () => {
    const client = new MessagingClient({
      credential: { type: "apiKey", value: `pmfa_${"A".repeat(72)}` },
    });
    expect(() =>
      createMediaDownloadRoute({
        authorize: () => null,
        client,
        mode: "whatsapp",
      }),
    ).not.toThrow();
  });

  it("requires authorize and a known mode", () => {
    expect(() =>
      createMediaDownloadRoute({
        client: { media: media() },
        mode: "proxy",
      } as unknown as MediaDownloadRouteOptions),
    ).toThrow(TypeError);
    expect(() =>
      createMediaDownloadRoute({
        authorize: () => null,
        client: { media: media() },
        mode: "open" as "proxy",
      }),
    ).toThrow(TypeError);
  });

  it.each(["redirect", "proxy", "whatsapp"] as const)(
    "fails closed in %s mode",
    async (mode) => {
      const resource = media();
      for (const authorize of [
        () => null,
        () => {
          throw new Error("session store down");
        },
        () => ({}) as never,
        () => ({ mediaId: "" }),
      ]) {
        const route = createMediaDownloadRoute({
          authorize,
          client: { media: resource },
          mode,
        });
        const response = await route(get());
        expect(response.status).toBe(403);
        expect(await response.text()).not.toContain("session store");
      }
      expect(resource.downloadStream).not.toHaveBeenCalled();
      expect(resource.downloadUrl).not.toHaveBeenCalled();
      expect(resource.downloadFromWhatsApp).not.toHaveBeenCalled();
    },
  );

  it("rejects non-GET methods", async () => {
    const route = createMediaDownloadRoute({
      authorize: () => ({ mediaId: "m" }),
      client: { media: media() },
      mode: "proxy",
    });
    const response = await route(
      new Request("https://app.test/media/1", { method: "POST" }),
    );
    expect(response.status).toBe(405);
  });

  it("redirects to the signed URL without caching", async () => {
    const resource = media();
    const route = createMediaDownloadRoute({
      authorize: () => ({ mediaId: "m1" }),
      client: { media: resource },
      mode: "redirect",
    });
    const response = await route(get());
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(SIGNED);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(resource.downloadUrl).toHaveBeenCalledWith("m1", {
      signal: expect.any(AbortSignal),
    });
    expect(resource.downloadStream).not.toHaveBeenCalled();
  });

  it("proxies in redirect mode when the API streams", async () => {
    const resource = media({
      downloadUrl: vi.fn(async () => ({
        streamed: true as const,
        url: undefined,
      })),
    });
    const route = createMediaDownloadRoute({
      authorize: () => ({ mediaId: "m1" }),
      client: { media: resource },
      mode: "redirect",
    });
    const response = await route(get());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("payload");
  });

  it("proxies allow-listed media inline with safe headers", async () => {
    const route = createMediaDownloadRoute({
      authorize: () => ({ mediaId: "m1" }),
      client: { media: media() },
      mode: "proxy",
    });
    const response = await route(get());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("payload");
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "content-type": "image/png",
      "content-disposition":
        "inline; filename=\"photo.png\"; filename*=UTF-8''photo.png",
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox",
      "cache-control": "private, no-store",
      "content-length": "7",
    });
  });

  it.each([
    ["text/html", "application/octet-stream", "attachment"],
    ["image/svg+xml", "application/octet-stream", "attachment"],
    ["application/pdf", "application/octet-stream", "attachment"],
    [undefined, "application/octet-stream", "attachment"],
    ["not a type", "application/octet-stream", "attachment"],
    ["VIDEO/MP4", "video/mp4", "inline"],
    ["audio/ogg; codecs=opus", "audio/ogg", "inline"],
  ])("maps %s to %s (%s)", (input, type, disposition) => {
    const headers = safeMediaHeaders(input, undefined);
    expect(headers["Content-Type"]).toBe(type);
    expect(headers["Content-Disposition"]).toBe(disposition);
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("encodes hostile filenames", () => {
    const headers = safeMediaHeaders(
      "text/html",
      '../evil"\r\nSet-Cookie: x=1€.html',
    );
    expect(headers["Content-Disposition"]).toBe(
      "attachment; filename=\".._evil_Set-Cookie: x=1_.html\"; filename*=UTF-8''..%2Fevil%22Set-Cookie%3A%20x%3D1%E2%82%AC.html".replace(
        "%2F",
        "_",
      ),
    );
  });

  it("serves WhatsApp media from the stored descriptor", async () => {
    const resource = media();
    const route = createMediaDownloadRoute({
      authorize: () => ({
        message: { type: "document", media: "stored-descriptor" },
      }),
      client: { media: resource },
      mode: "whatsapp",
    });
    const response = await route(get());
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("decrypted");
    expect(response.headers.get("content-type")).toBe(
      "application/octet-stream",
    );
    expect(response.headers.get("content-disposition")).toContain("attachment");
    expect(resource.downloadFromWhatsApp).toHaveBeenCalledWith(
      { type: "document", media: "stored-descriptor" },
      { signal: expect.any(AbortSignal) },
    );
    expect(resource.downloadStream).not.toHaveBeenCalled();
  });

  it("maps upstream failures without leaking details", async () => {
    for (const [status, expected] of [
      [404, 404],
      [403, 502],
      [500, 502],
    ] as const) {
      const route = createMediaDownloadRoute({
        authorize: () => ({ mediaId: "m1" }),
        client: {
          media: media({
            downloadStream: vi.fn(async () => {
              throw Object.assign(new Error("internal detail"), { status });
            }),
          }),
        },
        mode: "proxy",
      });
      const response = await route(get());
      expect(response.status).toBe(expected);
      expect(await response.text()).not.toContain("internal detail");
    }
  });
});
