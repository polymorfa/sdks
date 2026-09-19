import {
  createCipheriv,
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
} from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  MessagingClient,
  PolymorfaCancelledError,
  PolymorfaConfigurationError,
  PolymorfaMediaIntegrityError,
  decodeWhatsAppMedia,
  decryptWhatsAppMedia,
  deriveWhatsAppMediaKeys,
  downloadWhatsAppMedia,
  isWhatsAppMediaUrl,
  isEvent,
  type LinkedDeviceMessagePayload,
  type MessageReceivedPayload,
  type WhatsAppMediaCrypto,
  type WhatsAppMediaInput,
  type WhatsAppMediaKind,
  type WhatsAppMediaVerifyMode,
} from "../src/index.js";
import {
  downloadWhatsAppMediaToFile,
  nodeMediaCrypto,
  writeStreamToFile,
} from "../src/node.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";

const INFO: Record<WhatsAppMediaKind, string> = {
  image: "WhatsApp Image Keys",
  video: "WhatsApp Video Keys",
  audio: "WhatsApp Audio Keys",
  document: "WhatsApp Document Keys",
  sticker: "WhatsApp Image Keys",
};

// Field numbers from whatsmeow proto/waE2E/WAWebProtobufsE2E.proto.
const FIELDS: Record<WhatsAppMediaKind, Record<string, number>> = {
  image: { url: 1, mimetype: 2, sha: 4, len: 5, key: 8, enc: 9, path: 11 },
  video: { url: 1, mimetype: 2, sha: 3, len: 4, key: 6, enc: 11, path: 13 },
  audio: { url: 1, mimetype: 2, sha: 3, len: 4, key: 7, enc: 8, path: 9 },
  document: {
    url: 1,
    mimetype: 2,
    sha: 4,
    len: 5,
    key: 7,
    name: 8,
    enc: 9,
    path: 10,
  },
  sticker: { url: 1, sha: 2, enc: 3, key: 4, mimetype: 5, path: 8, len: 9 },
};

function varint(value: number): number[] {
  const out: number[] = [];
  while (value >= 0x80) {
    out.push((value % 0x80) | 0x80);
    value = Math.floor(value / 0x80);
  }
  out.push(value);
  return out;
}

function lengthDelimited(field: number, bytes: Uint8Array | string): number[] {
  const data =
    typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  return [...varint((field << 3) | 2), ...varint(data.length), ...data];
}

interface Fixture {
  readonly kind: WhatsAppMediaKind;
  readonly plaintext: Uint8Array;
  readonly encrypted: Uint8Array;
  readonly mediaKey: Uint8Array;
  readonly fileSha256: Uint8Array;
  readonly fileEncSha256: Uint8Array;
  readonly media: string;
  readonly url: string;
}

function encrypt(
  kind: WhatsAppMediaKind,
  plaintext: Uint8Array,
  mediaKey: Uint8Array,
): Uint8Array {
  const expanded = new Uint8Array(
    hkdfSync("sha256", mediaKey, new Uint8Array(0), INFO[kind], 112),
  );
  const iv = expanded.subarray(0, 16);
  const cipher = createCipheriv("aes-256-cbc", expanded.subarray(16, 48), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const mac = createHmac("sha256", expanded.subarray(48, 80))
    .update(iv)
    .update(ciphertext)
    .digest()
    .subarray(0, 10);
  return new Uint8Array(Buffer.concat([ciphertext, mac]));
}

function fixture(
  kind: WhatsAppMediaKind,
  size = 100,
  extra: { readonly omitUrl?: boolean; readonly url?: string } = {},
): Fixture {
  const plaintext = new Uint8Array(randomBytes(size));
  const mediaKey = new Uint8Array(randomBytes(32));
  const encrypted = encrypt(kind, plaintext, mediaKey);
  const fileSha256 = new Uint8Array(
    createHash("sha256").update(plaintext).digest(),
  );
  const fileEncSha256 = new Uint8Array(
    createHash("sha256").update(encrypted).digest(),
  );
  const f = FIELDS[kind];
  const url =
    extra.url ??
    `https://mmg.whatsapp.net/v/t62/${kind}.enc?ccb=11-4&oh=x&oe=y`;
  const bytes = [
    // An unrelated fixed32 and a nested message to exercise skipping.
    ...varint((20 << 3) | 5),
    1,
    2,
    3,
    4,
    ...lengthDelimited(17, Uint8Array.from([8, 1])),
    ...(extra.omitUrl === true ? [] : lengthDelimited(f.url!, url)),
    ...lengthDelimited(f.mimetype!, `${kind}/x-test`),
    ...lengthDelimited(f.sha!, fileSha256),
    ...varint((f.len! << 3) | 0),
    ...varint(plaintext.length),
    ...lengthDelimited(f.key!, mediaKey),
    ...lengthDelimited(f.enc!, fileEncSha256),
    ...lengthDelimited(f.path!, `/v/t62/${kind}.enc?ccb=11-4`),
    ...(f.name === undefined ? [] : lengthDelimited(f.name, "report.pdf")),
  ];
  return {
    kind,
    plaintext,
    encrypted,
    mediaKey,
    fileSha256,
    fileEncSha256,
    media: Buffer.from(Uint8Array.from(bytes)).toString("base64"),
    url,
  };
}

function flip(data: Uint8Array, index: number): void {
  data[index] = data[index]! ^ 1;
}

function chunked(data: Uint8Array, size: number): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (offset >= data.length) {
          controller.close();
          return;
        }
        controller.enqueue(data.slice(offset, offset + size));
        offset += size;
      },
    },
    { highWaterMark: 0 },
  );
}

function cdn(body: () => Uint8Array | ReadableStream<Uint8Array>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    if (init?.signal?.aborted === true) throw init.signal.reason;
    const value = body();
    return new Response(
      value instanceof Uint8Array ? new Blob([Buffer.from(value)]) : value,
    );
  });
  return { fetch: fetch as unknown as typeof globalThis.fetch, calls };
}

async function bytesOf(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const engines: [string, WhatsAppMediaCrypto, WhatsAppMediaVerifyMode][] = [
  ["webcrypto", undefined as unknown as WhatsAppMediaCrypto, "before-release"],
  ["node before-release", nodeMediaCrypto, "before-release"],
  ["node streaming", nodeMediaCrypto, "streaming"],
];

describe("decodeWhatsAppMedia", () => {
  it("accepts typed message webhook payloads", () => {
    const accept = (input: WhatsAppMediaInput) => input;
    const payload = {} as MessageReceivedPayload;
    const linked = {} as LinkedDeviceMessagePayload;
    accept(payload);
    accept(linked);
    expect(isEvent).toBeTypeOf("function");
  });

  it.each(["image", "video", "audio", "document", "sticker"] as const)(
    "decodes %s descriptors with the proto field numbers",
    (kind) => {
      const f = fixture(kind, 33);
      const decoded = decodeWhatsAppMedia(f.media, kind);
      expect(decoded).toMatchObject({
        mediaKind: kind,
        url: f.url,
        directPath: `/v/t62/${kind}.enc?ccb=11-4`,
        mimetype: `${kind}/x-test`,
        fileLength: 33,
        ...(kind === "document" ? { fileName: "report.pdf" } : {}),
      });
      expect(decoded.mediaKey).toEqual(f.mediaKey);
      expect(decoded.fileSha256).toEqual(f.fileSha256);
      expect(decoded.fileEncSha256).toEqual(f.fileEncSha256);
    },
  );

  it.each([
    ["not base64", "!!!", "image"],
    ["empty", "", "image"],
    ["text type", "CAE=", "text"],
    [
      "truncated length",
      Buffer.from([0x0a, 0x05, 0x61]).toString("base64"),
      "image",
    ],
    [
      "bad varint",
      Buffer.from(Array(11).fill(0xff)).toString("base64"),
      "image",
    ],
    ["group wire type", Buffer.from([0x0b]).toString("base64"), "image"],
    [
      "missing key",
      Buffer.from(lengthDelimited(1, "https://mmg.whatsapp.net/x")).toString(
        "base64",
      ),
      "image",
    ],
    [
      "short key",
      Buffer.from(lengthDelimited(8, new Uint8Array(31))).toString("base64"),
      "image",
    ],
    [
      "short hash",
      Buffer.from(lengthDelimited(4, new Uint8Array(20))).toString("base64"),
      "image",
    ],
    ["oversize", "A".repeat(1024 * 1024 + 4), "image"],
  ])("rejects %s input", (_name, value, type) => {
    const error = (() => {
      try {
        decodeWhatsAppMedia(value, type);
      } catch (caught) {
        return caught;
      }
      return undefined;
    })();
    expect(error).toBeInstanceOf(PolymorfaMediaIntegrityError);
    expect(error).toMatchObject({ code: "media_invalid_descriptor" });
  });
});

describe("WhatsApp media crypto", () => {
  it("matches a whatsmeow cbcutil/hkdfutil golden vector", async () => {
    // Generated by a Go program calling whatsmeow util/hkdfutil.SHA256 and
    // util/cbcutil.Encrypt (whatsmeow v0.0.0-20260904121843-28bfe537ea6a).
    const mediaKey = Uint8Array.from({ length: 32 }, (_, index) => index);
    const plaintext = new TextEncoder().encode(
      "Polymorfa golden vector: whatsmeow cbcutil + hkdfutil, 2026.",
    );
    const vectors = [
      [
        "image",
        "474233e574aba8c2e6f5c68cd3ea5b7e4cad764538e8593340c36d30d4067b87783033c9ef4b31ce661e6bd986f4a2c01c454eabdf2c3653726639cc1bc8eeb58ddb7d86c09618d427a0",
        "a0f35fa34e6d5bfc21acf306ca610b1b6df743601b02c63d8325fb986faaf7b6",
      ],
      [
        "document",
        "a152af0afcc1abc69708d42cd69405d5f54acb48a16964f8e61ebe26b53d1f07e8eeb87617194a5bcc9781404d5ab4b14ac1e3f51052d7ffbdb4102e3f1996744ea9bd705fff983e5d7c",
        "e6b1be38b195aa06f89ba158a85cbb59235cfcc9bb01d034292b380d6e196b9b",
      ],
    ] as const;
    const fileSha256 = Uint8Array.from(
      Buffer.from(
        "c090368078d73efad27a94d2d7e357408e56f43b5d20ac99ad23860b829b6a92",
        "hex",
      ),
    );
    for (const [kind, encrypted, encSha] of vectors) {
      const data = Uint8Array.from(Buffer.from(encrypted, "hex"));
      expect(encrypt(kind, plaintext, mediaKey)).toEqual(data);
      const keys = await deriveWhatsAppMediaKeys(mediaKey, kind);
      for (const crypto of [undefined, nodeMediaCrypto]) {
        const out = await bytesOf(
          decryptWhatsAppMedia(data, keys, {
            fileSha256,
            fileEncSha256: Uint8Array.from(Buffer.from(encSha, "hex")),
            ...(crypto === undefined ? {} : { crypto }),
          }),
        );
        expect(new TextDecoder().decode(out)).toBe(
          new TextDecoder().decode(plaintext),
        );
      }
    }
  });

  describe.each(engines)("%s", (_name, engine, verify) => {
    const crypto = engine === undefined ? {} : { crypto: engine };

    it.each(["image", "video", "audio", "document", "sticker"] as const)(
      "downloads and decrypts %s media",
      async (kind) => {
        const f = fixture(kind, 70_001);
        const { fetch, calls } = cdn(() => chunked(f.encrypted, 997));
        const download = await downloadWhatsAppMedia(
          { type: kind, media: f.media },
          { fetch, verify, ...crypto },
        );
        expect(download).toMatchObject({
          mediaKind: kind,
          mimetype: `${kind}/x-test`,
          fileLength: 70_001,
        });
        expect(await bytesOf(download.body)).toEqual(f.plaintext);
        expect(calls[0]?.url).toBe(f.url);
        const headers = new Headers(calls[0]?.init.headers);
        expect(headers.get("authorization")).toBeNull();
        expect(headers.get("origin")).toBe("https://web.whatsapp.com");
        expect(calls[0]?.init.credentials).toBe("omit");
      },
    );

    it.each([
      ["mac", "media_mac_mismatch"],
      ["enc hash", "media_enc_hash_mismatch"],
      ["plaintext hash", "media_hash_mismatch"],
      ["truncated", "media_too_short"],
      ["partial block", "media_invalid_ciphertext"],
    ])("fails on %s", async (failure, code) => {
      const f = fixture("image", 64);
      const keys = await deriveWhatsAppMediaKeys(f.mediaKey, "image");
      let data = f.encrypted.slice();
      let fileEncSha256: Uint8Array | undefined = f.fileEncSha256;
      let fileSha256 = f.fileSha256;
      if (failure === "mac") {
        flip(data, data.length - 1);
        fileEncSha256 = undefined;
      } else if (failure === "enc hash") {
        fileEncSha256 = new Uint8Array(32);
      } else if (failure === "plaintext hash") {
        fileSha256 = new Uint8Array(32);
      } else if (failure === "truncated") {
        data = data.slice(0, 10);
        fileEncSha256 = undefined;
      } else {
        // Recompute a valid MAC over a ciphertext that is not block aligned.
        const expanded = new Uint8Array(
          hkdfSync("sha256", f.mediaKey, new Uint8Array(0), INFO.image, 112),
        );
        const ciphertext = f.encrypted.slice(0, 20);
        const mac = createHmac("sha256", expanded.subarray(48, 80))
          .update(expanded.subarray(0, 16))
          .update(ciphertext)
          .digest()
          .subarray(0, 10);
        data = new Uint8Array(Buffer.concat([ciphertext, mac]));
        fileEncSha256 = undefined;
      }
      const chunks: Uint8Array[] = [];
      const error = await (async () => {
        const reader = decryptWhatsAppMedia(chunked(data, 7), keys, {
          fileSha256,
          ...(fileEncSha256 === undefined ? {} : { fileEncSha256 }),
          verify,
          ...crypto,
        }).getReader();
        while (true) {
          const next = await reader.read();
          if (next.done) return undefined;
          chunks.push(next.value);
        }
      })().catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(PolymorfaMediaIntegrityError);
      expect(error).toMatchObject({ code });
      if (verify === "before-release") expect(chunks).toHaveLength(0);
    });

    it("enforces maxBytes and fileLength", async () => {
      const f = fixture("video", 5_000);
      const { fetch } = cdn(() => chunked(f.encrypted, 512));
      await expect(
        downloadWhatsAppMedia(
          { type: "video", media: f.media },
          { fetch, maxBytes: 4_000, verify, ...crypto },
        ),
      ).rejects.toMatchObject({ code: "media_too_large" });

      const keys = await deriveWhatsAppMediaKeys(f.mediaKey, "video");
      await expect(
        bytesOf(
          decryptWhatsAppMedia(chunked(f.encrypted, 512), keys, {
            fileLength: 1_000,
            verify,
            ...crypto,
          }),
        ),
      ).rejects.toMatchObject({ code: "media_too_large" });
    });

    it("stops on abort", async () => {
      const f = fixture("audio", 50_000);
      const controller = new AbortController();
      const { fetch } = cdn(() => chunked(f.encrypted, 1_000));
      const download = await downloadWhatsAppMedia(
        { type: "audio", media: f.media },
        { fetch, signal: controller.signal, verify, ...crypto },
      );
      const reader = download.body.getReader();
      controller.abort();
      await expect(reader.read()).rejects.toBeInstanceOf(
        PolymorfaCancelledError,
      );
      const aborted = new AbortController();
      aborted.abort();
      await expect(
        downloadWhatsAppMedia(
          { type: "audio", media: f.media },
          { fetch, signal: aborted.signal, verify, ...crypto },
        ),
      ).rejects.toBeInstanceOf(PolymorfaCancelledError);
    });
  });

  it("emits early chunks only in streaming mode", async () => {
    const f = fixture("document", 50_000);
    const keys = await deriveWhatsAppMediaKeys(f.mediaKey, "document");
    const tampered = f.encrypted.slice();
    flip(tampered, tampered.length - 1);
    const reader = decryptWhatsAppMedia(chunked(tampered, 4_096), keys, {
      fileSha256: f.fileSha256,
      verify: "streaming",
      crypto: nodeMediaCrypto,
    }).getReader();
    const first = await reader.read();
    expect(first.done).toBe(false);
    let error: unknown;
    try {
      while (!(await reader.read()).done);
    } catch (caught) {
      error = caught;
    }
    expect(error).toMatchObject({ code: "media_mac_mismatch" });
  });

  it("requires an incremental backend for streaming verification", async () => {
    const f = fixture("image");
    await expect(
      downloadWhatsAppMedia(
        { type: "image", media: f.media },
        { verify: "streaming", fetch: cdn(() => f.encrypted).fetch },
      ),
    ).rejects.toBeInstanceOf(PolymorfaConfigurationError);
  });

  it("rejects non-WhatsApp hosts and redirects", async () => {
    for (const url of [
      "https://evil.example/x.enc",
      "http://mmg.whatsapp.net/x.enc",
      "https://mmg.whatsapp.net.evil.example/x",
      "https://mmg.whatsapp.net:8443/x",
    ]) {
      const f = fixture("image", 10, { url });
      const { fetch, calls } = cdn(() => f.encrypted);
      await expect(
        downloadWhatsAppMedia({ type: "image", media: f.media }, { fetch }),
      ).rejects.toMatchObject({ code: "media_invalid_descriptor" });
      expect(calls).toHaveLength(0);
    }
    expect(
      isWhatsAppMediaUrl("https://media-lhr8-1.cdn.whatsapp.net/v/x"),
    ).toBe(true);

    const f = fixture("image");
    const redirecting = vi.fn(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://attacker.example/steal" },
        }),
    ) as unknown as typeof globalThis.fetch;
    await expect(
      downloadWhatsAppMedia(
        { type: "image", media: f.media },
        { fetch: redirecting },
      ),
    ).rejects.toMatchObject({ code: "media_invalid_descriptor" });
  });

  it("falls back to directPath on mmg.whatsapp.net", async () => {
    const f = fixture("sticker", 40, { omitUrl: true });
    const { fetch, calls } = cdn(() => f.encrypted);
    const download = await downloadWhatsAppMedia(
      { type: "sticker", media: f.media },
      { fetch },
    );
    expect(await bytesOf(download.body)).toEqual(f.plaintext);
    const url = new URL(calls[0]!.url);
    expect(url.host).toBe("mmg.whatsapp.net");
    expect(url.pathname).toBe("/v/t62/sticker.enc");
    expect(url.searchParams.get("ccb")).toBe("11-4");
    expect(url.searchParams.get("mms-type")).toBe("image");
    expect(url.searchParams.get("hash")).toBe(
      Buffer.from(f.fileEncSha256).toString("base64url") + "=",
    );
    expect(url.searchParams.has("__wa-mms")).toBe(true);
  });

  it("tries directPath after the signed URL fails", async () => {
    const f = fixture("image");
    const fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input) === f.url
        ? new Response("gone", { status: 410 })
        : new Response(new Blob([Buffer.from(f.encrypted)])),
    ) as unknown as typeof globalThis.fetch;
    const download = await downloadWhatsAppMedia(
      { type: "image", media: f.media },
      { fetch },
    );
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(f.plaintext);
  });

  it("rejects messages without an encrypted descriptor", async () => {
    await expect(
      downloadWhatsAppMedia({
        type: "image",
        mediaUrl: "https://s3/x",
      } as never),
    ).rejects.toMatchObject({ code: "media_invalid_descriptor" });
    await expect(
      downloadWhatsAppMedia({ type: "text", media: fixture("image").media }),
    ).rejects.toMatchObject({ code: "media_invalid_descriptor" });
  });

  it("is reachable from MessagingClient.media and returns a typed Blob", async () => {
    const f = fixture("image", 300);
    const messaging = new MessagingClient({
      credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    });
    const download = await messaging.media.downloadFromWhatsApp(
      { type: "image", media: f.media },
      { fetch: cdn(() => f.encrypted).fetch },
    );
    const blob = await download.blob();
    expect(blob.type).toBe("image/x-test");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(f.plaintext);
  });
});

describe("Node file helpers", () => {
  it("writes WhatsApp media through a temp file and renames on success", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pmfa-media-"));
    const f = fixture("document", 100_000);
    const path = join(directory, "report.pdf");
    const result = await downloadWhatsAppMediaToFile(
      { type: "document", media: f.media },
      path,
      { fetch: cdn(() => chunked(f.encrypted, 8_192)).fetch },
    );
    expect(result).toMatchObject({
      path,
      bytes: 100_000,
      fileName: "report.pdf",
    });
    expect(new Uint8Array(readFileSync(path))).toEqual(f.plaintext);
    expect(readdirSync(directory)).toEqual(["report.pdf"]);
  });

  it("removes the temp file and leaves no output when verification fails", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pmfa-media-"));
    const f = fixture("video", 100_000);
    const tampered = f.encrypted.slice();
    flip(tampered, 5);
    const path = join(directory, "clip.mp4");
    await expect(
      downloadWhatsAppMediaToFile({ type: "video", media: f.media }, path, {
        fetch: cdn(() => chunked(tampered, 8_192)).fetch,
      }),
    ).rejects.toMatchObject({ code: "media_enc_hash_mismatch" });
    expect(existsSync(path)).toBe(false);
    expect(readdirSync(directory)).toEqual([]);
  });

  it("cleans up on abort", async () => {
    const directory = mkdtempSync(join(tmpdir(), "pmfa-media-"));
    const controller = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      pull(stream) {
        stream.enqueue(new Uint8Array(1_024));
        controller.abort();
      },
    });
    await expect(
      writeStreamToFile(body, join(directory, "x.bin"), {
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(PolymorfaCancelledError);
    expect(readdirSync(directory)).toEqual([]);
  });
});
