import { createCipheriv, createHash, createHmac, hkdfSync } from "node:crypto";
import { gzipSync, deflateSync, deflateRawSync } from "node:zlib";
import { create, toBinary } from "@bufbuild/protobuf";
import { describe, expect, it } from "vitest";
import {
  decodeHistorySyncPayload,
  downloadHistoryChunk,
  HistorySyncSchema,
  HistorySync_HistorySyncType,
} from "../src/history/index.js";
import { nodeMediaCrypto } from "../src/node.js";

// Synthetic history with a large timestamp and an unknown protobuf field.
// Unknown fields must survive decoding; the SDK does not normalize history.
const history = create(HistorySyncSchema, {
  syncType: HistorySync_HistorySyncType.RECENT,
  chunkOrder: 7,
  progress: 92,
  conversations: [
    {
      id: "fixture-user@s.whatsapp.net",
      name: "Fixture",
      unreadCount: 3,
      lastMsgTimestamp: 9_007_199_254_740_991n,
    },
  ],
  pushnames: [{ id: "fixture-user@s.whatsapp.net", pushname: "Fixture name" }],
});
const binary = new Uint8Array([
  ...toBinary(HistorySyncSchema, history),
  0xa0,
  0x06,
  0x7b,
]);
const key = Uint8Array.from({ length: 32 }, (_, index) => index);
function sha(bytes: Uint8Array) {
  return new Uint8Array(createHash("sha256").update(bytes).digest());
}
function seal(compressed: Uint8Array) {
  // Independent implementation of Cellar WAMediaCrypto75-96 and WAMediaHkdfInfo14.
  const material = new Uint8Array(
    hkdfSync("sha256", key, new Uint8Array(32), "WhatsApp History Keys", 112),
  );
  const iv = material.subarray(0, 16),
    cipherKey = material.subarray(16, 48),
    macKey = material.subarray(48, 80);
  const cipher = createCipheriv("aes-256-cbc", cipherKey, iv);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const mac = createHmac("sha256", macKey)
    .update(iv)
    .update(ciphertext)
    .digest()
    .subarray(0, 10);
  return new Uint8Array(Buffer.concat([ciphertext, mac]));
}
describe("local history chunk processing", () => {
  it.each([
    ["gzip", gzipSync],
    ["zlib", deflateSync],
    ["raw", deflateRawSync],
  ] as const)(
    "decodes %s without dropping provider data",
    async (_name, compress) => {
      const decoded = await decodeHistorySyncPayload(compress(binary));
      expect(decoded.syncType).toBe(HistorySync_HistorySyncType.RECENT);
      expect(decoded.chunkOrder).toBe(7);
      expect(decoded.conversations[0]!.lastMsgTimestamp).toBe(
        9_007_199_254_740_991n,
      );
      expect(decoded.pushnames[0]!.pushname).toBe("Fixture name");
      expect(toBinary(HistorySyncSchema, decoded)).toEqual(binary);
    },
  );
  it("processes inline history without contacting either service", async () => {
    let called = false;
    const fetcher: typeof fetch = async () => {
      called = true;
      throw new Error("unexpected download");
    };
    const decoded = await downloadHistoryChunk(
      { inlinePayload: Buffer.from(deflateSync(binary)).toString("base64") },
      { fetch: fetcher },
    );
    expect(toBinary(HistorySyncSchema, decoded)).toEqual(binary);
    expect(called).toBe(false);
  });
  it.each([undefined, nodeMediaCrypto])(
    "verifies encrypted history before parsing",
    async (crypto) => {
      const compressed = deflateSync(binary);
      const encrypted = seal(compressed);
      const headers: Headers[] = [];
      const fetcher: typeof fetch = async (input, init) => {
        expect(String(input)).toMatch(/^https:\/\/mmg\.whatsapp\.net\//);
        headers.push(new Headers(init?.headers));
        return new Response(encrypted.slice().buffer);
      };
      const decoded = await downloadHistoryChunk(
        {
          directPath: "/v/history.enc?fixture=1",
          mediaKey: key,
          fileSha256: sha(compressed),
          fileEncSha256: sha(encrypted),
          fileLength: compressed.length,
        },
        { fetch: fetcher, ...(crypto === undefined ? {} : { crypto }) },
      );
      expect(toBinary(HistorySyncSchema, decoded)).toEqual(binary);
      expect(headers.every((header) => !header.has("authorization"))).toBe(
        true,
      );
    },
  );
  it("rejects ciphertext tampering before protobuf parsing", async () => {
    const compressed = deflateSync(binary);
    const encrypted = seal(compressed);
    const hash = sha(encrypted);
    encrypted[0]! ^= 1;
    await expect(
      downloadHistoryChunk(
        {
          directPath: "/v/history.enc",
          mediaKey: key,
          fileSha256: sha(compressed),
          fileEncSha256: hash,
        },
        { fetch: async () => new Response(encrypted.slice().buffer) },
      ),
    ).rejects.toMatchObject({ code: "media_enc_hash_mismatch" });
  });
  it("rejects a decompression bomb at the configured output limit", async () => {
    const compressed = deflateSync(new Uint8Array(2 * 1024 * 1024));
    await expect(
      decodeHistorySyncPayload(compressed, { maxInflatedBytes: 1024 }),
    ).rejects.toMatchObject({ code: "media_too_large" });
  });
  it("rejects malformed compression and protobuf data", async () => {
    await expect(
      decodeHistorySyncPayload(new Uint8Array([1, 2, 3])),
    ).rejects.toMatchObject({ code: "media_invalid_ciphertext" });
    await expect(
      decodeHistorySyncPayload(deflateSync(new Uint8Array([0xff]))),
    ).rejects.toMatchObject({ code: "media_invalid_ciphertext" });
  });
  it("bounds compressed input and refuses already canceled downloads", async () => {
    const compressed = deflateSync(binary);
    const encrypted = seal(compressed);
    const descriptor = {
      directPath: "/v/history.enc",
      mediaKey: key,
      fileSha256: sha(compressed),
      fileEncSha256: sha(encrypted),
      fileLength: compressed.length,
    };
    await expect(
      downloadHistoryChunk(descriptor, {
        maxBytes: 1,
        fetch: async () => new Response(encrypted.slice().buffer),
      }),
    ).rejects.toMatchObject({ code: "media_too_large" });
    const controller = new AbortController();
    controller.abort();
    let called = false;
    await expect(
      downloadHistoryChunk(descriptor, {
        signal: controller.signal,
        fetch: async () => {
          called = true;
          throw new Error("unexpected fetch");
        },
      }),
    ).rejects.toMatchObject({ code: "request_cancelled" });
    expect(called).toBe(false);
  });
});
