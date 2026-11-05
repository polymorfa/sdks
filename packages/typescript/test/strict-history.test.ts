import { readFileSync } from "node:fs";
import { toBinary } from "@bufbuild/protobuf";
import { describe, expect, it, vi } from "vitest";
import {
  decodeHistorySyncPayload,
  downloadHistoryChunk,
  HistorySyncSchema,
} from "../src/history/index.js";

interface Stream {
  input: string;
  plain: string;
  format: string;
}
interface Invalid {
  name: string;
  base?: string;
  append?: string;
  tailHex?: string;
  cut?: number;
  flip?: number;
  mask?: number;
  hex?: string;
}
const corpus = JSON.parse(
  readFileSync(
    new URL("./fixtures/strict-history.json", import.meta.url),
    "utf8",
  ),
) as {
  streams: Record<string, Stream>;
  plain: Record<string, { base64?: string; zeroFieldBytes?: number }>;
  invalid: Invalid[];
};
const bytes = (value: string) => new Uint8Array(Buffer.from(value, "base64"));
function plain(name: string): Uint8Array {
  const value = corpus.plain[name]!;
  if (value.base64 !== undefined) return bytes(value.base64);
  let n = value.zeroFieldBytes!;
  const length: number[] = [];
  while (n > 127) {
    length.push((n & 127) | 128);
    n >>>= 7;
  }
  length.push(n);
  const result = new Uint8Array(4 + length.length + value.zeroFieldBytes!);
  result.set([8, 3, 162, 6, ...length]);
  return result;
}
function input(name: string): Uint8Array {
  return bytes(corpus.streams[name]!.input);
}
function malformed(value: Invalid): Uint8Array {
  if (value.hex !== undefined)
    return new Uint8Array(Buffer.from(value.hex, "hex"));
  let result = input(value.base!);
  if (value.cut !== undefined) result = result.slice(0, value.cut);
  if (value.flip !== undefined) {
    const offset = value.flip < 0 ? result.length + value.flip : value.flip;
    result[offset]! ^= value.mask ?? 1;
  }
  if (value.append)
    result = new Uint8Array([...result, ...input(value.append)]);
  if (value.tailHex) {
    result = new Uint8Array([...result, ...Buffer.from(value.tailHex, "hex")]);
  }
  return result;
}
const invalidCompression = {
  code: "media_invalid_ciphertext",
  message: "The history chunk is not valid compressed data.",
};

describe("strict history compression", () => {
  it("accepts one gzip member and refuses an empty second member on both public paths", async () => {
    const single = input("provider-gzip");
    expect((await decodeHistorySyncPayload(single)).syncType).toBe(3);
    const joined = new Uint8Array([...single, ...input("empty-gzip")]);
    await expect(decodeHistorySyncPayload(joined)).rejects.toMatchObject(
      invalidCompression,
    );
    await expect(
      downloadHistoryChunk({ inlinePayload: joined }),
    ).rejects.toMatchObject(invalidCompression);
  });

  it.each(Object.entries(corpus.streams))(
    "decodes independent %s",
    async (_name, vector) => {
      for (const decode of [
        () => decodeHistorySyncPayload(bytes(vector.input)),
        () => downloadHistoryChunk({ inlinePayload: vector.input }),
      ]) {
        if (vector.plain === "invalid-protobuf") {
          // Valid compression is distinct from valid protobuf.
          await expect(decode()).rejects.toMatchObject({
            code: "media_invalid_ciphertext",
            message: "The history chunk is not a valid HistorySync message.",
          });
        } else {
          const decoded = await decode();
          if (vector.plain === "empty") {
            // Existing parser behavior: an unset required field is observable.
            expect(decoded.syncType).toBe(0);
            expect(() => toBinary(HistorySyncSchema, decoded)).toThrow(
              "required field not set",
            );
          } else {
            expect(
              Buffer.from(toBinary(HistorySyncSchema, decoded)).equals(
                Buffer.from(plain(vector.plain)),
              ),
            ).toBe(true);
          }
          if (vector.plain === "provider") {
            expect(decoded.conversations[0]!.lastMsgTimestamp).toBe(
              18446744073709551615n,
            );
            expect(decoded.chunkOrder).toBe(7);
            expect(decoded.progress).toBe(92);
          }
        }
      }
    },
  );

  it("refuses independent tails, members, every small prefix, sampled long prefixes and corrupt wrappers before protobuf", async () => {
    for (const vector of corpus.invalid) {
      const compressed = malformed(vector);
      await expect(
        decodeHistorySyncPayload(compressed),
        vector.name,
      ).rejects.toMatchObject(invalidCompression);
      await expect(
        downloadHistoryChunk({ inlinePayload: compressed }),
        vector.name,
      ).rejects.toMatchObject(invalidCompression);
    }
  }, 30_000);

  it("handles long optional gzip names/comments without header capture and rejects unterminated headers", async () => {
    const gzip = input("provider-gzip");
    const header = gzip.slice(0, 10);
    header[3] = 24;
    const long = new Uint8Array(2 * 1024 * 1024).fill(97);
    const stream = new Uint8Array(
      header.length + long.length * 2 + 2 + gzip.length - 10,
    );
    stream.set(header);
    stream.set(long, 10);
    stream.set(long, 11 + long.length);
    stream.set(gzip.subarray(10), 12 + long.length * 2);
    expect(
      toBinary(HistorySyncSchema, await decodeHistorySyncPayload(stream)),
    ).toEqual(plain("provider"));
    await expect(
      decodeHistorySyncPayload(stream.subarray(0, long.length)),
    ).rejects.toMatchObject(invalidCompression);
    // A tail outside the first 8 KiB offered to the decoder is also refused.
    const tail = new Uint8Array(gzip.length + 10000);
    tail.set(gzip);
    await expect(decodeHistorySyncPayload(tail)).rejects.toMatchObject(
      invalidCompression,
    );
  });

  it("preserves validation order, positive safe limits and exact output/input caps", async () => {
    await expect(
      decodeHistorySyncPayload("!", { maxInflatedBytes: 0 }),
    ).rejects.toMatchObject({ code: "media_invalid_descriptor" });
    const compressed = input("provider-gzip");
    await expect(
      downloadHistoryChunk(
        { inlinePayload: compressed },
        { maxBytes: 1, maxInflatedBytes: 0 },
      ),
    ).rejects.toMatchObject({ code: "media_too_large" });
    for (const limit of [0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(
        decodeHistorySyncPayload(compressed, { maxInflatedBytes: limit }),
      ).rejects.toMatchObject({ code: "configuration_error" });
    }
    for (const name of [
      "provider-gzip",
      "provider-zlib",
      "provider-raw",
      "repeat-gzip",
    ]) {
      const vector = input(name);
      const length = plain(corpus.streams[name]!.plain).length;
      expect(
        (await decodeHistorySyncPayload(vector, { maxInflatedBytes: length }))
          .syncType,
      ).toBe(3);
      await expect(
        decodeHistorySyncPayload(vector, { maxInflatedBytes: length - 1 }),
      ).rejects.toMatchObject({ code: "media_too_large" });
      expect(
        (
          await downloadHistoryChunk(
            { inlinePayload: vector },
            { maxBytes: vector.length },
          )
        ).syncType,
      ).toBe(3);
      await expect(
        downloadHistoryChunk(
          { inlinePayload: vector },
          { maxBytes: vector.length - 1 },
        ),
      ).rejects.toMatchObject({ code: "media_too_large" });
    }
    const corrupt = input("repeat-gzip");
    corrupt[corrupt.length - 8]! ^= 1;
    await expect(
      decodeHistorySyncPayload(corrupt, { maxInflatedBytes: 1 }),
    ).rejects.toMatchObject({ code: "media_too_large" });
    await expect(
      decodeHistorySyncPayload(new Uint8Array()),
    ).rejects.toMatchObject(invalidCompression);
  });

  it("snapshots caller bytes before a real task yield and needs no DecompressionStream", async () => {
    const previous = globalThis.DecompressionStream;
    vi.stubGlobal("DecompressionStream", undefined);
    try {
      const compressed = input("large-raw");
      let yielded = false;
      setTimeout(() => {
        yielded = true;
        compressed.fill(255);
      }, 0);
      const decoded = await decodeHistorySyncPayload(compressed);
      expect(yielded).toBe(true);
      expect(
        Buffer.from(toBinary(HistorySyncSchema, decoded)).equals(
          Buffer.from(plain("large")),
        ),
      ).toBe(true);
    } finally {
      vi.stubGlobal("DecompressionStream", previous);
    }
  });

  it("keeps pre-abort and mid-inflate download cancellation safe", async () => {
    const controller = new AbortController();
    const reason = new Error("synthetic cancellation reason");
    controller.abort(reason);
    await expect(
      downloadHistoryChunk(null!, { signal: controller.signal, maxBytes: 0 }),
    ).rejects.toMatchObject({
      code: "request_cancelled",
      cause: reason,
      message: "The history download was cancelled.",
    });
    const during = new AbortController();
    setTimeout(() => during.abort(reason), 0);
    await expect(
      downloadHistoryChunk(
        { inlinePayload: input("large-gzip") },
        { signal: during.signal },
      ),
    ).rejects.toMatchObject({ code: "request_cancelled", cause: reason });
  });
});
