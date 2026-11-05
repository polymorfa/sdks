import { createHash } from "node:crypto";
import { once } from "node:events";
import { createServer, type IncomingHttpHeaders } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import {
  MessagingClient,
  type WhatsAppUploadMediaType,
  toWhatsAppMediaSendDescriptor,
  type SendMediaMessageRequest,
} from "../src/index.js";
import {
  base64UrlUnpadded,
  prepareWhatsAppUpload,
} from "../src/media/upload.js";
import { nodeMediaEncryptor } from "../src/node.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";

type Request = {
  method: string;
  url: URL;
  headers: IncomingHttpHeaders;
  body: Uint8Array;
};
type Reply = {
  status?: number;
  value?: unknown;
  body?: string;
  contentType?: string;
};
const cleanup: (() => Promise<void>)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});
async function server(reply: (request: Request, index: number) => Reply) {
  const requests: Request[] = [];
  const http = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const record = {
        method: request.method!,
        url: new URL(request.url!, "http://localhost"),
        headers: request.headers,
        body: new Uint8Array(Buffer.concat(chunks)),
      };
      requests.push(record);
      const result = reply(record, requests.length - 1);
      response.writeHead(result.status ?? 200, {
        "content-type": result.contentType ?? "application/json",
      });
      response.end(result.body ?? JSON.stringify(result.value ?? {}));
    });
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const address = http.address();
  if (!address || typeof address === "string")
    throw new Error("TCP fixture did not bind");
  cleanup.push(async () => {
    const closed = once(http, "close");
    http.close();
    http.closeAllConnections();
    await closed;
  });
  return { requests, url: `http://127.0.0.1:${address.port}` };
}
const location = {
  directPath: "/v/t62/fixture.enc",
  url: "https://mmg.whatsapp.net/v/t62/fixture.enc",
};
function client(baseUrl: string) {
  return new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl,
    maxNetworkRetries: 0,
  });
}
function json(request: Request) {
  return JSON.parse(new TextDecoder().decode(request.body)) as Record<
    string,
    unknown
  >;
}
function sha(bytes: Uint8Array) {
  return new Uint8Array(createHash("sha256").update(bytes).digest());
}
const plaintext = new TextEncoder().encode("Customer-owned media fixture");
const cases: [WhatsAppUploadMediaType, string, boolean | undefined][] = [
  ["image", "image", undefined],
  ["video", "video", undefined],
  ["document", "file", undefined],
  ["audio", "voice", false],
  ["ptt", "voice", true],
  ["sticker", "sticker", undefined],
];
function grant(request: Request, auth = "fixture-upload-auth") {
  const body = json(request);
  const mediaType =
    body.type === "file"
      ? "document"
      : body.type === "voice"
        ? body.ptt
          ? "ptt"
          : "audio"
        : body.type;
  return {
    success: true,
    data: {
      uploadUrl: `https://mmg.whatsapp.net/mms/${String(mediaType)}/${String(body.fileEncSha256)}?auth=${auth}&token=${String(body.fileEncSha256)}&media_id=123`,
      host: "mmg.whatsapp.net",
      expiresAt: 2_000_000_000,
    },
  };
}
function cdnFetch(url: string, seen: URL[]): typeof fetch {
  return async (input, init) => {
    const original = new URL(String(input));
    seen.push(original);
    expect(original.protocol).toBe("https:");
    expect(original.hostname).toBe("mmg.whatsapp.net");
    expect(new Headers(init?.headers).has("authorization")).toBe(false);
    expect(init?.credentials).toBe("omit");
    expect(init?.redirect).toBe("error");
    return fetch(`${url}${original.pathname}${original.search}`, init);
  };
}

describe("customer-owned media upload over native HTTP", () => {
  it.each(cases)(
    "relays only ciphertext for %s",
    async (mediaType, type, ptt) => {
      const api = await server(() => ({
        value: { success: true, data: location },
      }));
      const result = await client(api.url).whatsappMedia.upload(
        "session/id",
        plaintext,
        { mediaType },
      );
      const request = api.requests[0]!;
      expect(request.url.pathname).toBe(
        "/messaging/session%2Fid/media/uploads",
      );
      expect(request.url.searchParams.get("type")).toBe(type);
      expect(request.url.searchParams.get("ptt")).toBe(
        ptt === undefined ? null : String(ptt),
      );
      expect(request.url.searchParams.has("encryptedLength")).toBe(false);
      expect(request.url.searchParams.has("mediaType")).toBe(false);
      expect(request.url.searchParams.get("fileEncSha256")).toBe(
        base64UrlUnpadded(sha(request.body)),
      );
      expect(request.body).not.toEqual(plaintext);
      expect(request.body.length).toBe(result.encryptedLength);
      expect(request.headers["content-type"]).toBe("application/octet-stream");
      expect(request.headers["polymorfa-version"]).toBe("2026-10-14");
      expect(request.url.searchParams.has("mediaKey")).toBe(false);
      expect(result).toMatchObject({
        ...location,
        egress: "relay",
        fileLength: plaintext.length,
      });
    },
  );

  it.each(cases)(
    "uploads %s to the exact granted URL without API credentials",
    async (mediaType, type, ptt) => {
      const api = await server((request) => ({ value: grant(request) }));
      const cdn = await server(() => ({
        value: { direct_path: location.directPath, url: location.url },
      }));
      const seen: URL[] = [];
      const result = await client(api.url).whatsappMedia.upload(
        "s",
        plaintext,
        { mediaType, egress: "direct", fetch: cdnFetch(cdn.url, seen) },
      );
      expect(json(api.requests[0]!)).toEqual({
        type,
        fileEncSha256: base64UrlUnpadded(result.fileEncSha256),
        ...(ptt === undefined ? {} : { ptt }),
      });
      expect(seen[0]!.searchParams.get("media_id")).toBe("123");
      expect(seen[0]!.searchParams.get("auth")).toBe("fixture-upload-auth");
      expect(cdn.requests[0]!.headers.authorization).toBeUndefined();
      expect(sha(cdn.requests[0]!.body)).toEqual(result.fileEncSha256);
      expect(cdn.requests[0]!.body.length).toBe(result.encryptedLength);
    },
  );

  it("refreshes an expired grant and probes before retrying", async () => {
    const api = await server((request, index) => ({
      value: grant(request, `fixture-auth-${index}`),
    }));
    const cdn = await server((request, index) =>
      index === 0
        ? { status: 401 }
        : request.url.searchParams.has("resume")
          ? { value: { resume: "0" } }
          : { value: { direct_path: location.directPath, url: location.url } },
    );
    const seen: URL[] = [];
    await client(api.url).whatsappMedia.upload("s", plaintext, {
      mediaType: "image",
      egress: "direct",
      fetch: cdnFetch(cdn.url, seen),
    });
    expect(api.requests).toHaveLength(2);
    expect(seen.map((url) => url.searchParams.get("auth"))).toEqual([
      "fixture-auth-0",
      "fixture-auth-1",
      "fixture-auth-1",
    ]);
    expect(seen[1]!.searchParams.get("resume")).toBe("1");
  });

  it("resumes a transient upload with only the remaining ciphertext", async () => {
    let original: Uint8Array | undefined;
    const api = await server((request) => ({ value: grant(request) }));
    const cdn = await server((request, index) => {
      if (index === 0) {
        original = request.body;
        return { status: 500 };
      }
      if (request.url.searchParams.has("resume"))
        return { value: { resume: "7" } };
      return { value: { direct_path: location.directPath, url: location.url } };
    });
    const seen: URL[] = [];
    await client(api.url).whatsappMedia.upload("s", plaintext, {
      mediaType: "image",
      egress: "direct",
      fetch: cdnFetch(cdn.url, seen),
    });
    expect(cdn.requests[2]!.body).toEqual(original!.subarray(7));
    expect(seen[2]!.searchParams.get("bytestart")).toBe("7");
    expect(seen[2]!.searchParams.get("byteend")).toBe(String(original!.length));
  });

  it.each([413, 415, 507])(
    "does not retry terminal CDN status %i",
    async (status) => {
      const api = await server((request) => ({ value: grant(request) }));
      const cdn = await server(() => ({ status }));
      await expect(
        client(api.url).whatsappMedia.upload("s", plaintext, {
          mediaType: "image",
          egress: "direct",
          fetch: cdnFetch(cdn.url, []),
        }),
      ).rejects.toMatchObject({ status });
      expect(api.requests).toHaveLength(1);
      expect(cdn.requests).toHaveLength(1);
    },
  );

  it("refuses a grant outside the WhatsApp host boundary before upload", async () => {
    const api = await server(() => ({
      value: {
        success: true,
        data: {
          uploadUrl: "https://evil.example/mms/image/hash?auth=fixture-private",
          host: "evil.example",
          expiresAt: 2_000_000_000,
        },
      },
    }));
    let called = false;
    const fetcher: typeof fetch = async () => {
      called = true;
      throw new Error("unexpected upload");
    };
    await expect(
      client(api.url).whatsappMedia.upload("s", plaintext, {
        mediaType: "image",
        egress: "direct",
        fetch: fetcher,
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
    expect(called).toBe(false);
  });

  it("rejects a source changed between the streaming hash and upload passes", async () => {
    let opens = 0;
    const prepared = await prepareWhatsAppUpload(
      { open: () => new Blob([new Uint8Array([opens++])]).stream() },
      { mediaType: "image", encryptor: nodeMediaEncryptor },
    );
    await expect(
      new Response(await prepared.body.open()).arrayBuffer(),
    ).rejects.toMatchObject({ code: "media_enc_hash_mismatch" });
  });

  it("verifies the final streamed document part before finalization", async () => {
    const api = await server((request) => ({
      value: {
        success: true,
        data: {
          uploadUrl: `https://mmg.whatsapp.net/mms/document/${json(request).fileEncSha256}?auth=fixture&token=fixture`,
          host: "mmg.whatsapp.net",
          expiresAt: 2_000_000_000,
        },
      },
    }));
    const requests: URL[] = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      requests.push(url);
      if (init?.body instanceof ReadableStream)
        await new Response(init.body).arrayBuffer();
      return Response.json(location);
    };
    const sdk = client(api.url);
    const transport = sdk.whatsappMedia.transport("direct", {
      documentPartSize: 16,
      fetch: fetcher,
      maxAttempts: 1,
    });
    let opens = 0;
    await expect(
      sdk.whatsappMedia.upload(
        "s",
        { open: () => new Blob([new Uint8Array(43).fill(opens++)]).stream() },
        {
          mediaType: "document",
          encryptor: nodeMediaEncryptor,
          egress: transport,
        },
      ),
    ).rejects.toMatchObject({ code: "media_enc_hash_mismatch" });
    expect(requests.length).toBeGreaterThan(1);
    expect(requests.some((url) => url.searchParams.has("final_hash"))).toBe(
      false,
    );
  });

  it("sends a pre-uploaded descriptor through the standard-session message API", async () => {
    const api = await server((request) => ({
      value: request.url.pathname.endsWith("/media/uploads")
        ? { success: true, data: location }
        : { success: true, data: { id: "message-id" } },
    }));
    const sdk = client(api.url);
    const upload = await sdk.whatsappMedia.upload("s", plaintext, {
      mediaType: "image",
      mimetype: "image/jpeg",
    });
    const descriptor = toWhatsAppMediaSendDescriptor(upload, {
      width: 32,
      height: 32,
    });
    const body: SendMediaMessageRequest = {
      conversation: { phoneNumber: "+15550000000" },
      content: { image: { descriptor } },
    };
    await sdk.messages.send("s", body);
    expect(json(api.requests[1]!).content).toEqual({ image: { descriptor } });
    expect(api.requests[1]!.headers["polymorfa-version"]).toBe("2026-10-14");
    expect(descriptor.mimeType).toBe("image/jpeg");
  });

  it("uses the versioned history command paths and exact runner fields", async () => {
    const encryptedHash = Buffer.from(
      Array.from({ length: 32 }, (_, i) => (i % 2 ? 255 : 251)),
    );
    const api = await server((request) => {
      if (request.url.pathname.endsWith("/delete")) {
        const digest = json(request).fileEncSha256;
        expect(digest).toMatch(/^[A-Za-z0-9+/]{43}=$/);
        expect(Buffer.from(digest as string, "base64")).toEqual(encryptedHash);
      }
      return {
        value: request.url.pathname.endsWith("/retry")
          ? {
              success: true,
              data: { requestId: "retry-1", status: "requested" },
            }
          : { success: true, data: { status: "deleted" } },
      };
    });
    const sdk = client(api.url);
    const retry = {
      syncType: "RECENT" as const,
      chunkOrder: 3,
      chunkMessageId: "chunk-1",
      regenerate: true,
    };
    expect(await sdk.historySync.requestChunkRetry("s", retry)).toEqual({
      requestId: "retry-1",
      status: "requested",
    });
    const deletion = {
      directPath: "/v/history.enc",
      fileEncSha256: encryptedHash.toString("base64"),
      encHandle: "fixture-handle",
      companionMetaNonce: "fixture-nonce",
    };
    await sdk.historySync.deleteChunk("s", deletion);
    expect(api.requests.map((request) => request.url.pathname)).toEqual([
      "/messaging/s/history/chunks/retry",
      "/messaging/s/history/media/delete",
    ]);
    expect(json(api.requests[0]!)).toEqual(retry);
    expect(json(api.requests[1]!)).toEqual(deletion);
    expect(
      api.requests.every(
        (request) => request.headers["polymorfa-version"] === "2026-10-14",
      ),
    ).toBe(true);
  });
});
