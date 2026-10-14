import { createHash, hkdfSync } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  PolymorfaConfigurationError,
  PolymorfaMediaIntegrityError,
  decryptWhatsAppMedia,
  deriveWhatsAppMediaKeys,
  encryptWhatsAppMedia,
  encryptWhatsAppMediaStream,
  toWhatsAppMediaSendDescriptor,
  whatsAppEncryptedLength,
  type WhatsAppMediaEncryptor,
  type WhatsAppUploadMediaType,
} from "../src/index.js";
import { nodeMediaCrypto, nodeMediaEncryptor } from "../src/node.js";

const engines: [string, WhatsAppMediaEncryptor | undefined][] = [
  ["webcrypto", undefined],
  ["node", nodeMediaEncryptor],
];

const KEY_TYPE: Record<WhatsAppUploadMediaType, string> = {
  image: "image",
  video: "video",
  audio: "audio",
  ptt: "ptt",
  document: "document",
  sticker: "sticker",
};

function sha256(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(createHash("sha256").update(bytes).digest());
}

function pattern(size: number): Uint8Array {
  return Uint8Array.from({ length: size }, (_, index) => (index * 31) & 0xff);
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

async function bytesOf(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

describe("WhatsApp media encryption", () => {
  // Same golden vectors as the decryption suite: whatsmeow util/hkdfutil and
  // util/cbcutil with mediaKey = 0..31.
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

  describe.each(engines)("%s encryptor", (_name, encryptor) => {
    const backend = encryptor === undefined ? {} : { encryptor };

    it.each(vectors)(
      "reproduces the whatsmeow golden vector for %s",
      async (mediaType, encrypted, encSha) => {
        const result = await encryptWhatsAppMedia(plaintext, {
          mediaType,
          mediaKey,
          mimetype: "text/plain",
          ...backend,
        });
        expect(Buffer.from(result.ciphertext).toString("hex")).toBe(encrypted);
        expect(Buffer.from(result.fileEncSha256).toString("hex")).toBe(encSha);
        expect(Buffer.from(result.fileSha256).toString("hex")).toBe(
          "c090368078d73efad27a94d2d7e357408e56f43b5d20ac99ad23860b829b6a92",
        );
        expect(result.fileLength).toBe(plaintext.length);
        expect(result.encryptedLength).toBe(encrypted.length / 2);
        expect(result.mimetype).toBe("text/plain");
      },
    );

    it.each(Object.keys(KEY_TYPE) as WhatsAppUploadMediaType[])(
      "round-trips %s through the existing decryptor",
      async (mediaType) => {
        for (const size of [0, 1, 15, 16, 17, 4096, 70_001]) {
          const input = pattern(size);
          const result = await encryptWhatsAppMedia(chunked(input, 999), {
            mediaType,
            ...backend,
          });
          expect(result.mediaKey).toHaveLength(32);
          expect(result.encryptedLength).toBe(whatsAppEncryptedLength(size));
          expect(result.ciphertext).toHaveLength(result.encryptedLength);
          expect(result.fileSha256).toEqual(sha256(input));
          expect(result.fileEncSha256).toEqual(sha256(result.ciphertext));
          const keys = await deriveWhatsAppMediaKeys(
            result.mediaKey,
            mediaType,
          );
          for (const crypto of [undefined, nodeMediaCrypto]) {
            const out = await bytesOf(
              decryptWhatsAppMedia(result.ciphertext, keys, {
                fileSha256: result.fileSha256,
                fileEncSha256: result.fileEncSha256,
                ...(crypto === undefined ? {} : { crypto }),
              }),
            );
            expect(out).toEqual(input);
          }
        }
      },
    );

    it("rejects input above maxBytes", async () => {
      await expect(
        encryptWhatsAppMedia(pattern(100), {
          mediaType: "image",
          maxBytes: 99,
          ...backend,
        }),
      ).rejects.toMatchObject({ code: "media_too_large" });
    });

    it("accepts Blob and ArrayBuffer input", async () => {
      const input = pattern(5000);
      const fromBlob = await encryptWhatsAppMedia(
        new Blob([input.slice().buffer]),
        {
          mediaType: "document",
          mediaKey,
          ...backend,
        },
      );
      const fromBuffer = await encryptWhatsAppMedia(input.slice().buffer, {
        mediaType: "document",
        mediaKey,
        ...backend,
      });
      expect(fromBlob.ciphertext).toEqual(fromBuffer.ciphertext);
    });
  });

  it("derives voice-note keys with the audio label", async () => {
    // WAMediaHkdfInfo.js: audio and ptt share "WhatsApp Audio Keys".
    const ptt = await deriveWhatsAppMediaKeys(mediaKey, "ptt");
    const expected = new Uint8Array(
      hkdfSync(
        "sha256",
        mediaKey,
        new Uint8Array(0),
        "WhatsApp Audio Keys",
        112,
      ),
    );
    expect(ptt.iv).toEqual(expected.subarray(0, 16));
    expect(ptt.cipherKey).toEqual(expected.subarray(16, 48));
    expect(ptt.macKey).toEqual(expected.subarray(48, 80));
    const history = await deriveWhatsAppMediaKeys(mediaKey, "history");
    const historyExpected = new Uint8Array(
      hkdfSync(
        "sha256",
        mediaKey,
        new Uint8Array(0),
        "WhatsApp History Keys",
        112,
      ),
    );
    expect(history.cipherKey).toEqual(historyExpected.subarray(16, 48));
  });

  it("validates options", async () => {
    expect(() =>
      encryptWhatsAppMediaStream(pattern(1), {
        mediaType: "gif" as WhatsAppUploadMediaType,
      }),
    ).toThrow(PolymorfaConfigurationError);
    expect(() =>
      encryptWhatsAppMediaStream(pattern(1), {
        mediaType: "image",
        mediaKey: new Uint8Array(31),
      }),
    ).toThrow(PolymorfaConfigurationError);
  });

  it("streams a large file without buffering it (node)", async () => {
    // 96 MiB of generated plaintext. The encryptor must emit ciphertext
    // while the source is still being read, and heap growth must stay far
    // below the file size.
    const total = 96 * 1024 * 1024;
    const chunk = 256 * 1024;
    const block = pattern(chunk);
    let produced = 0;
    let emittedBeforeEnd = false;
    const source = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          if (produced >= total) {
            controller.close();
            return;
          }
          controller.enqueue(block);
          produced += chunk;
        },
      },
      { highWaterMark: 0 },
    );
    const plainHash = createHash("sha256");
    for (let offset = 0; offset < total; offset += chunk)
      plainHash.update(block);
    const encHash = createHash("sha256");
    global.gc?.();
    const before = process.memoryUsage().heapUsed;
    let peak = before;
    const { body, info } = encryptWhatsAppMediaStream(source, {
      mediaType: "video",
      maxBytes: total,
      encryptor: nodeMediaEncryptor,
    });
    const reader = body.getReader();
    let encrypted = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (produced < total) emittedBeforeEnd = true;
      encrypted += value.length;
      encHash.update(value);
      peak = Math.max(peak, process.memoryUsage().heapUsed);
    }
    const result = await info;
    expect(emittedBeforeEnd).toBe(true);
    expect(encrypted).toBe(whatsAppEncryptedLength(total));
    expect(result.fileLength).toBe(total);
    expect(Buffer.from(result.fileSha256)).toEqual(plainHash.digest());
    expect(Buffer.from(result.fileEncSha256)).toEqual(encHash.digest());
    expect(peak - before).toBeLessThan(48 * 1024 * 1024);
  }, 60_000);

  it("fails the stream and the digest when the MAC input is cut short", async () => {
    const failing = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("source failed"));
      },
    });
    const { body, info } = encryptWhatsAppMediaStream(failing, {
      mediaType: "image",
      encryptor: nodeMediaEncryptor,
    });
    await expect(bytesOf(body)).rejects.toThrow("source failed");
    await expect(info).rejects.toThrow("source failed");
  });
});

describe("send descriptor", () => {
  it("encodes the upload result for a message send", async () => {
    const encrypted = await encryptWhatsAppMedia(pattern(32), {
      mediaType: "ptt",
      mimetype: "audio/ogg; codecs=opus",
    });
    const descriptor = toWhatsAppMediaSendDescriptor(
      {
        ...encrypted,
        directPath: "/v/t62.7117-24/abc.enc?ccb=11-4",
        url: "https://mmg.whatsapp.net/v/t62.7117-24/abc.enc",
      },
      { seconds: 3, waveform: new Uint8Array(64) },
    );
    expect(descriptor).toEqual({
      directPath: "/v/t62.7117-24/abc.enc?ccb=11-4",
      url: "https://mmg.whatsapp.net/v/t62.7117-24/abc.enc",
      mediaKey: Buffer.from(encrypted.mediaKey).toString("base64"),
      fileSha256: Buffer.from(encrypted.fileSha256).toString("base64"),
      fileEncSha256: Buffer.from(encrypted.fileEncSha256).toString("base64"),
      fileLength: 32,
      mimeType: "audio/ogg; codecs=opus",
      seconds: 3,
      waveform: Buffer.from(new Uint8Array(64)).toString("base64"),
    });
    expect(() =>
      toWhatsAppMediaSendDescriptor({
        ...encrypted,
        mimetype: undefined as unknown as string,
        directPath: "/x",
        url: "",
      }),
    ).toThrow(PolymorfaConfigurationError);
    expect(() =>
      toWhatsAppMediaSendDescriptor(
        { ...encrypted, directPath: "/x", url: "" },
        { width: -1 },
      ),
    ).toThrow(PolymorfaConfigurationError);
  });

  it("keeps the integrity error type for tampered ciphertext", async () => {
    const encrypted = await encryptWhatsAppMedia(pattern(64), {
      mediaType: "image",
    });
    const tampered = encrypted.ciphertext.slice();
    tampered[0]! ^= 1;
    const keys = await deriveWhatsAppMediaKeys(encrypted.mediaKey, "image");
    await expect(
      bytesOf(decryptWhatsAppMedia(tampered, keys, {})),
    ).rejects.toBeInstanceOf(PolymorfaMediaIntegrityError);
  });
});
