import { randomUUID } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import {
  S3Client,
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encryptWhatsAppMedia } from "../src/media/encrypt.js";
import { nodeMediaEncryptor } from "../src/node.js";
import { S3MediaStore } from "../src/s3.js";
import type { WhatsAppMediaDescriptor } from "../src/media/whatsapp.js";

const endpoint = process.env["POLYMORFA_MINIO_ENDPOINT"];
const scratch = process.env["POLYMORFA_MEDIA_SCRATCH"];
describe.skipIf(endpoint === undefined || scratch === undefined)(
  "real S3-compatible media boundary",
  () => {
    const client = new S3Client({
      ...(endpoint === undefined ? {} : { endpoint }),
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env["POLYMORFA_MINIO_ACCESS_KEY"] ?? "",
        secretAccessKey: process.env["POLYMORFA_MINIO_SECRET_KEY"] ?? "",
      },
    });
    const bucket = `zk-media-${randomUUID()}`;
    const store = new S3MediaStore({ client, bucket, prefix: "verified/" });
    const plaintext = Uint8Array.from({ length: 131_089 }, (_, i) => i % 251);
    let encrypted: Awaited<ReturnType<typeof encryptWhatsAppMedia>>;
    let descriptor: WhatsAppMediaDescriptor;
    let spool: string;
    beforeAll(async () => {
      spool = join(scratch!, bucket);
      await mkdir(spool, { recursive: true });
      await client.send(new CreateBucketCommand({ Bucket: bucket }));
      encrypted = await encryptWhatsAppMedia(plaintext, {
        mediaType: "document",
        mimetype: "application/octet-stream",
        encryptor: nodeMediaEncryptor,
      });
      descriptor = {
        mediaKind: "document",
        mediaKey: encrypted.mediaKey,
        fileSha256: encrypted.fileSha256,
        fileEncSha256: encrypted.fileEncSha256,
        fileLength: plaintext.length,
        directPath: "/v/fixture.enc",
        mimetype: "application/octet-stream",
        fileName: "fixture.bin",
      };
    });
    afterAll(async () => {
      const objects = await client.send(
        new ListObjectsV2Command({ Bucket: bucket }),
      );
      for (const item of objects.Contents ?? [])
        await client.send(
          new DeleteObjectCommand({ Bucket: bucket, Key: item.Key }),
        );
      await client.send(new DeleteBucketCommand({ Bucket: bucket }));
      client.destroy();
    });
    const fetcher: typeof fetch = async (_input, init) => {
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
      return new Response(encrypted.ciphertext.slice().buffer);
    };
    it("archives verified plaintext with safe metadata and cleans its private spool", async () => {
      const result = await store.archive(descriptor, {
        key: "success",
        fetch: fetcher,
        scratchDirectory: spool,
        metadata: { fixture: "synthetic" },
      });
      expect(result.bytes).toBe(plaintext.length);
      const object = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: "verified/success" }),
      );
      expect(await object.Body!.transformToByteArray()).toEqual(plaintext);
      expect(object.Metadata).toMatchObject({
        fixture: "synthetic",
        "wa-media-kind": "document",
        "wa-file-name": "fixture.bin",
      });
      expect(JSON.stringify(object.Metadata)).not.toContain(
        Buffer.from(encrypted.mediaKey).toString("base64"),
      );
      expect(await readdir(spool)).toEqual([]);
    });
    it("preserves an existing object when ciphertext fails integrity", async () => {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: "verified/preserved",
          Body: "existing",
        }),
      );
      const corrupted = encrypted.ciphertext.slice();
      corrupted[20]! ^= 1;
      await expect(
        store.archive(descriptor, {
          key: "preserved",
          scratchDirectory: spool,
          fetch: async () => new Response(corrupted.buffer),
        }),
      ).rejects.toMatchObject({ code: "media_enc_hash_mismatch" });
      const object = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: "verified/preserved" }),
      );
      expect(await object.Body!.transformToString()).toBe("existing");
      expect(await readdir(spool)).toEqual([]);
    });
    it("refuses inconsistent declared length before object PUT", async () => {
      await expect(
        store.archive(
          { ...descriptor, fileLength: plaintext.length + 1 },
          { key: "wrong-length", fetch: fetcher, scratchDirectory: spool },
        ),
      ).rejects.toMatchObject({ code: "media_invalid_descriptor" });
      await expect(
        client.send(
          new HeadObjectCommand({
            Bucket: bucket,
            Key: "verified/wrong-length",
          }),
        ),
      ).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
      expect(await readdir(spool)).toEqual([]);
    });
    it("does not contact the CDN or replace an object after pre-cancellation", async () => {
      const controller = new AbortController();
      controller.abort();
      let called = false;
      await expect(
        store.archive(descriptor, {
          key: "cancelled",
          signal: controller.signal,
          scratchDirectory: spool,
          fetch: async () => {
            called = true;
            return fetcher("");
          },
        }),
      ).rejects.toMatchObject({ code: "request_cancelled" });
      expect(called).toBe(false);
      expect(await readdir(spool)).toEqual([]);
    });
    it("pins both upload passes to the bucket ETag and streams the stored object", async () => {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: "verified/source",
          Body: plaintext,
          ContentType: "application/octet-stream",
        }),
      );
      let reads = 0;
      const upload = async (
        _session: string,
        source: { open: () => Promise<ReadableStream<Uint8Array>> },
        options: { mimetype?: string },
      ) => {
        expect(options.mimetype).toBe("application/octet-stream");
        for (let pass = 0; pass < 2; pass++) {
          const bytes = new Uint8Array(
            await new Response(await source.open()).arrayBuffer(),
          );
          expect(bytes).toEqual(plaintext);
          reads++;
        }
        return { fixture: true };
      };
      // This fixture tests the real S3 source seam; encrypted provider upload has independent native TCP tests.
      const result = await store.uploadToWhatsApp({
        messaging: { whatsappMedia: { upload } as never },
        session: "fixture",
        key: "source",
        mediaType: "document",
      });
      expect(result).toEqual({ fixture: true });
      expect(reads).toBe(2);
    });
  },
);
