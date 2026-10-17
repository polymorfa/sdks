import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

const fault = vi.hoisted(() => ({
  init: undefined as number | undefined,
  status: undefined as number | undefined,
  thrown: undefined as Error | undefined,
  endStatus: undefined as number | undefined,
  endThrown: undefined as Error | undefined,
  ends: 0,
  calls: 0,
  maxInput: 0,
  maxOutput: 0,
  onEnd: undefined as (() => void) | undefined,
}));

// Replace only the external compression dependency. Public SDK methods remain real.
vi.mock("pako", async (importOriginal) => {
  const real = await importOriginal<typeof import("pako")>();
  return {
    ...real,
    zlibInflateInit2: (...args: Parameters<typeof real.zlibInflateInit2>) =>
      fault.init ?? real.zlibInflateInit2(...args),
    zlibInflate: (...args: Parameters<typeof real.zlibInflate>) => {
      fault.calls++;
      fault.maxInput = Math.max(fault.maxInput, args[0].avail_in);
      fault.maxOutput = Math.max(fault.maxOutput, args[0].avail_out);
      if (fault.thrown) throw fault.thrown;
      if (fault.status !== undefined) return fault.status;
      const status = real.zlibInflate(...args);
      if (status === real.Z_STREAM_END) fault.onEnd?.();
      return status;
    },
    zlibInflateEnd: (...args: Parameters<typeof real.zlibInflateEnd>) => {
      fault.ends++;
      const status = real.zlibInflateEnd(...args);
      if (fault.endThrown) throw fault.endThrown;
      return fault.endStatus ?? status;
    },
  };
});
import {
  Z_OK,
  Z_BUF_ERROR,
  Z_DATA_ERROR,
  Z_NEED_DICT,
  Z_STREAM_ERROR,
  Z_MEM_ERROR,
} from "pako";
import {
  decodeHistorySyncPayload,
  downloadHistoryChunk,
} from "../src/history/index.js";

const corpus = JSON.parse(
  readFileSync(
    new URL("./fixtures/strict-history.json", import.meta.url),
    "utf8",
  ),
) as { streams: Record<string, { input: string }> };
const input = (name = "provider-gzip") =>
  new Uint8Array(Buffer.from(corpus.streams[name]!.input, "base64"));
afterEach(() => {
  Object.assign(fault, {
    init: undefined,
    status: undefined,
    thrown: undefined,
    endStatus: undefined,
    endThrown: undefined,
    ends: 0,
    calls: 0,
    maxInput: 0,
    maxOutput: 0,
    onEnd: undefined,
  });
});

describe("history dependency failures through public methods", () => {
  it.each([Z_STREAM_ERROR, Z_MEM_ERROR, Z_DATA_ERROR])(
    "does not call cleanup after failed initialization %s",
    async (status) => {
      fault.init = status;
      await expect(decodeHistorySyncPayload(input())).rejects.toMatchObject({
        name:
          status === Z_MEM_ERROR ? "RangeError" : "PolymorfaConfigurationError",
      });
      expect(fault.ends).toBe(0);
    },
  );

  it.each([Z_DATA_ERROR, Z_NEED_DICT, Z_OK, Z_BUF_ERROR])(
    "refuses corruption or stalled progress %s and ends exactly once",
    async (status) => {
      fault.status = status;
      await expect(decodeHistorySyncPayload(input())).rejects.toMatchObject({
        code: "media_invalid_ciphertext",
      });
      expect(fault.ends).toBe(1);
    },
  );

  it.each([Z_STREAM_ERROR, Z_MEM_ERROR, -99])(
    "does not label internal status %s as customer corruption",
    async (status) => {
      fault.status = status;
      await expect(decodeHistorySyncPayload(input())).rejects.toMatchObject({
        name:
          status === Z_MEM_ERROR ? "RangeError" : "PolymorfaConfigurationError",
      });
      expect(fault.ends).toBe(1);
    },
  );

  it("preserves unexpected allocation/dependency errors and primary failures over cleanup", async () => {
    const internal = new RangeError("synthetic resource error");
    fault.thrown = internal;
    fault.endThrown = new Error("synthetic cleanup error");
    await expect(decodeHistorySyncPayload(input())).rejects.toBe(internal);
    expect(fault.ends).toBe(1);
  });

  it.each(["throw", "status"])(
    "refuses unexplained cleanup %s after success",
    async (mode) => {
      const cleanup = new Error("synthetic cleanup error");
      if (mode === "throw") fault.endThrown = cleanup;
      else fault.endStatus = Z_STREAM_ERROR;
      const pending = expect(decodeHistorySyncPayload(input())).rejects;
      if (mode === "throw") await pending.toBe(cleanup);
      else await pending.toMatchObject({ code: "configuration_error" });
      expect(fault.ends).toBe(1);
    },
  );

  it.each(["integrity", "quota", "cancellation"])(
    "keeps primary %s when cleanup fails",
    async (mode) => {
      fault.endThrown = new Error("synthetic cleanup failure");
      let compressed = input();
      const controller = new AbortController();
      let code = "media_invalid_ciphertext";
      if (mode === "integrity") compressed[compressed.length - 8]! ^= 1;
      if (mode === "quota") {
        compressed = input("large-gzip");
        code = "media_too_large";
      }
      if (mode === "cancellation") {
        compressed = input("large-gzip");
        setTimeout(() => controller.abort(), 0);
        code = "request_cancelled";
      }
      await expect(
        downloadHistoryChunk(
          { inlinePayload: compressed },
          {
            signal: controller.signal,
            ...(mode === "quota" ? { maxInflatedBytes: 1 } : {}),
          },
        ),
      ).rejects.toMatchObject({ code });
      expect(fault.ends).toBe(1);
    },
  );

  it("checks cancellation during final coalescing and bounds the real dependency calls", async () => {
    const controller = new AbortController();
    let finishedInflation = false;
    fault.onEnd = () => {
      finishedInflation = true;
      setTimeout(() => controller.abort(), 0);
    };
    await expect(
      downloadHistoryChunk(
        { inlinePayload: input("large-gzip") },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ code: "request_cancelled" });
    expect(finishedInflation).toBe(true);
    expect(fault.ends).toBe(1);
    expect(fault.maxInput).toBeLessThanOrEqual(8192);
    expect(fault.maxOutput).toBeLessThanOrEqual(65536);
    expect(fault.calls).toBeGreaterThan(32);
  });
});
