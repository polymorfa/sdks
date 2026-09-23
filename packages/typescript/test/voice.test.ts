import { createHmac } from "node:crypto";
import { inspect } from "node:util";

import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  Client,
  POLYMORFA_ERROR_CODES,
  PolymorfaAuthorizationError,
  PolymorfaConfigurationError,
  PolymorfaConflictError,
  PolymorfaNotFoundError,
  PolymorfaPaymentRequiredError,
  PolymorfaServerError,
  PolymorfaTimeoutError,
  PolymorfaValidationError,
  VOICE_AUDIO_STATUSES,
  VOICE_PROVIDER_CREDENTIAL_STATUSES,
  constructWebhookEvent,
  isEvent,
  type VoiceAudioAsset,
  type VoiceAudioStatus,
  type VoiceProviderCredential,
} from "../src/index.js";
import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";

const PROJECT = "018f0000-0000-7000-8000-00000000000a";
const OTHER_PROJECT = "018f0000-0000-7000-8000-00000000000b";
const ASSET_ID = "4b1f3c52-8d0e-4f6a-9b7e-2f5d1a0c9e11";
const CREDENTIAL_ID = "9a0e5c2d-3b4f-4e6a-8c1d-7f2b0a9e8d33";
const UPLOAD_URL =
  "https://api.polymorfa.com/platform/voice/uploads/cap_abc?signature=xyz";
const PROVIDER_KEY = "sk-provider-secret-value-0123456789";

function asset(overrides: Partial<VoiceAudioAsset> = {}): VoiceAudioAsset {
  return {
    id: ASSET_ID,
    projectId: PROJECT,
    name: "Greeting",
    source: "upload",
    status: "pending_upload",
    failureReason: null,
    originalFormat: null,
    originalContentType: "audio/mpeg",
    sizeBytes: 4,
    durationMs: null,
    contentSha256: null,
    tts: null,
    retentionDays: null,
    expiresAt: null,
    inUseCount: 0,
    revision: 1,
    createdAt: "2026-09-19T10:00:00.000Z",
    updatedAt: "2026-09-19T10:00:00.000Z",
    readyAt: null,
    ...overrides,
  };
}

function credential(
  overrides: Partial<VoiceProviderCredential> = {},
): VoiceProviderCredential {
  return {
    id: CREDENTIAL_ID,
    projectId: PROJECT,
    provider: "elevenlabs",
    label: "Production",
    keyFingerprint: "a1b2c3d4",
    status: "valid",
    verifiedAt: "2026-09-19T10:00:00.000Z",
    lastError: null,
    revision: 1,
    createdAt: "2026-09-19T10:00:00.000Z",
    updatedAt: "2026-09-19T10:00:00.000Z",
    ...overrides,
  };
}

const ok = (data: unknown, status = 200) =>
  Response.json({ success: true, data }, { status });

const failure = (status: number, code: string, message: string) =>
  Response.json(
    { success: false, error: { code, message, request_id: "req_1" } },
    { status },
  );

function sent(fetch: ReturnType<typeof vi.fn>, index: number) {
  const [url, init] = fetch.mock.calls[index] as [string | URL, RequestInit];
  return {
    url: new URL(String(url)),
    method: init.method,
    headers: new Headers(init.headers),
    init,
    json: () => JSON.parse(String(init.body)) as unknown,
  };
}

function organizationClient(fetch: typeof globalThis.fetch) {
  return new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    fetch,
    maxNetworkRetries: 0,
  });
}

function projectClient(fetch: typeof globalThis.fetch) {
  return new Client({
    credential: { type: "projectToken", value: PROJECT_TOKEN },
    projectId: PROJECT,
    fetch,
    maxNetworkRetries: 0,
  });
}

/** Answers the create, upload and complete steps of `audio.upload`. */
function uploadFlow() {
  return vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === "/platform/voice/audio" && init?.method === "POST") {
      return ok(
        {
          asset: asset(),
          upload: {
            url: UPLOAD_URL,
            method: "POST",
            headers: { "Content-Type": "audio/mpeg" },
            maxBytes: 16_777_216,
            expiresAt: "2026-09-19T10:05:00.000Z",
          },
        },
        201,
      );
    }
    if (url.pathname.startsWith("/platform/voice/uploads/")) {
      return Response.json({ storageId: "st_1" }, { status: 201 });
    }
    if (url.pathname.endsWith("/complete")) {
      return ok(asset({ status: "transcoding" }));
    }
    return ok(asset({ status: "transcoding" }));
  });
}

describe("voice audio library", () => {
  it("lists a team client's named project with filters and pages", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const url = new URL(String(input));
      return url.searchParams.get("cursor") === null
        ? Response.json({
            success: true,
            data: [asset()],
            page: { nextCursor: "next_1", hasMore: true },
          })
        : Response.json({
            success: true,
            data: [asset({ id: "second" })],
            page: { nextCursor: null, hasMore: false },
          });
    });
    const page = await organizationClient(fetch).voice.audio.list(PROJECT, {
      status: "ready",
      limit: 10,
    });
    expect(page.items.map((item) => item.id)).toEqual([ASSET_ID]);
    expect(page.hasMore).toBe(true);
    const first = sent(fetch, 0);
    expect(first.method).toBe("GET");
    expect(first.url.pathname).toBe("/platform/voice/audio");
    expect(Object.fromEntries(first.url.searchParams)).toEqual({
      projectId: PROJECT,
      status: "ready",
      limit: "10",
    });
    const next = await page.nextPage();
    expect(next?.items.map((item) => item.id)).toEqual(["second"]);
    expect(next?.hasMore).toBe(false);
    expect(sent(fetch, 1).url.searchParams.get("cursor")).toBe("next_1");
  });

  it("requires a project for team clients", () => {
    const audio = organizationClient(vi.fn()).voice.audio;
    // @ts-expect-error team clients must name the project
    expect(() => audio.list()).toThrow(PolymorfaConfigurationError);
    expect(() =>
      // @ts-expect-error team clients must name the project
      audio.createUpload({
        name: "x",
        contentType: "audio/mpeg",
        sizeBytes: 1,
      }),
    ).toThrow(PolymorfaConfigurationError);
  });

  it("creates an upload and completes it", async () => {
    const fetch = uploadFlow();
    const audio = organizationClient(fetch).voice.audio;
    const created = await audio.createUpload(
      PROJECT,
      {
        name: "Greeting",
        contentType: "audio/mpeg",
        sizeBytes: 4,
        retentionDays: 30,
      },
      { idempotencyKey: "upload-1" },
    );
    expect(created.data.upload.url).toBe(UPLOAD_URL);
    const create = sent(fetch, 0);
    expect(create.method).toBe("POST");
    expect(create.json()).toEqual({
      projectId: PROJECT,
      name: "Greeting",
      contentType: "audio/mpeg",
      sizeBytes: 4,
      retentionDays: 30,
    });
    expect(create.headers.get("idempotency-key")).toBe("upload-1");

    const completed = await audio.complete(ASSET_ID);
    expect(completed.data.status).toBe("transcoding");
    const complete = sent(fetch, 1);
    expect(complete.method).toBe("POST");
    expect(complete.url.pathname).toBe(
      `/platform/voice/audio/${ASSET_ID}/complete`,
    );
    expect(complete.init.body).toBeUndefined();
  });

  it("uploads bytes to the upload URL without the credential", async () => {
    const fetch = uploadFlow();
    const pool = Buffer.from("xxAUDIOyy");
    const result = await projectClient(fetch).voice.audio.upload(
      {
        name: "Greeting",
        contentType: "audio/mpeg",
        body: pool.subarray(2, 7),
      },
      { idempotencyKey: "upload-2", headers: { "x-trace": "t1" } },
    );
    expect(result.data.status).toBe("transcoding");
    expect(fetch).toHaveBeenCalledTimes(3);

    const create = sent(fetch, 0);
    expect(create.json()).toEqual({
      projectId: PROJECT,
      name: "Greeting",
      contentType: "audio/mpeg",
      sizeBytes: 5,
    });
    expect(create.headers.get("authorization")).toBe(`Bearer ${PROJECT_TOKEN}`);
    expect(create.headers.get("idempotency-key")).toBe("upload-2");

    const upload = sent(fetch, 1);
    expect(upload.url.toString()).toBe(UPLOAD_URL);
    expect(upload.method).toBe("POST");
    expect(upload.headers.get("authorization")).toBeNull();
    expect(upload.headers.get("content-type")).toBe("audio/mpeg");
    expect(upload.headers.get("idempotency-key")).toBeNull();
    expect(upload.headers.get("x-trace")).toBeNull();
    expect(upload.init.redirect).toBe("error");
    expect(new TextDecoder().decode(upload.init.body as ArrayBuffer)).toBe(
      "AUDIO",
    );

    const complete = sent(fetch, 2);
    expect(complete.url.pathname).toBe(
      `/platform/voice/audio/${ASSET_ID}/complete`,
    );
    expect(complete.headers.get("authorization")).toBe(
      `Bearer ${PROJECT_TOKEN}`,
    );
    expect(complete.headers.get("idempotency-key")).toBeNull();
    expect(complete.headers.get("x-trace")).toBe("t1");
  });

  it("takes the content type and size from a Blob", async () => {
    const fetch = uploadFlow();
    await organizationClient(fetch).voice.audio.upload(PROJECT, {
      name: "Greeting",
      body: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/ogg" }),
    });
    expect(sent(fetch, 0).json()).toMatchObject({
      contentType: "audio/ogg",
      sizeBytes: 3,
    });
    expect(sent(fetch, 1).init.body).toBeInstanceOf(Blob);
  });

  it.each(["application/json", "audio/flac"])(
    "refuses an unsupported Blob content type %s before creating an asset",
    async (contentType) => {
      const fetch = uploadFlow();
      await expect(
        projectClient(fetch).voice.audio.upload({
          name: "Greeting",
          body: new Blob(["audio"], { type: contentType }),
        }),
      ).rejects.toBeInstanceOf(PolymorfaValidationError);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

  it("streams a body with an explicit size", async () => {
    const fetch = uploadFlow();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.close();
      },
    });
    await projectClient(fetch).voice.audio.upload({
      name: "Greeting",
      contentType: "audio/wav",
      body,
      sizeBytes: 2,
    });
    const upload = sent(fetch, 1);
    expect(upload.init.body).toBe(body);
    expect((upload.init as { duplex?: string }).duplex).toBe("half");
  });

  it("refuses a sizeBytes that does not match a byte body before any request", async () => {
    const fetch = uploadFlow();
    const audio = projectClient(fetch).voice.audio;
    const pool = Buffer.from("xxAUDIOyy");
    const error = await audio
      .upload({
        name: "Greeting",
        contentType: "audio/mpeg",
        body: pool.subarray(2, 7),
        sizeBytes: pool.length,
      })
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );
    expect(error).toBeInstanceOf(PolymorfaValidationError);
    expect(error).toMatchObject({
      code: "invalid_parameter",
      details: { field: "sizeBytes", sizeBytes: 9, byteLength: 5 },
    });
    await expect(
      audio.upload({
        name: "Greeting",
        contentType: "audio/mpeg",
        body: new ArrayBuffer(4),
        sizeBytes: 3,
      }),
    ).rejects.toBeInstanceOf(PolymorfaValidationError);
    await expect(
      audio.upload({
        name: "Greeting",
        body: new Blob([new Uint8Array([1, 2, 3])], { type: "audio/ogg" }),
        sizeBytes: 4,
      }),
    ).rejects.toBeInstanceOf(PolymorfaValidationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("sends a Buffer's byte length as its size", async () => {
    const fetch = uploadFlow();
    const audio = projectClient(fetch).voice.audio;
    const body = Buffer.from("AUDIO!");
    await audio.upload({ name: "Greeting", contentType: "audio/mpeg", body });
    expect(sent(fetch, 0).json()).toMatchObject({ sizeBytes: 6 });

    fetch.mockClear();
    await audio.upload({
      name: "Greeting",
      contentType: "audio/mpeg",
      body,
      sizeBytes: 6,
    });
    expect(sent(fetch, 0).json()).toMatchObject({ sizeBytes: 6 });
  });

  it("refuses uploads it cannot describe before calling the API", async () => {
    const fetch = uploadFlow();
    const audio = projectClient(fetch).voice.audio;
    await expect(
      audio.upload({ name: "x", body: new Uint8Array([1]) }),
    ).rejects.toBeInstanceOf(PolymorfaConfigurationError);
    await expect(
      audio.upload({
        name: "x",
        contentType: "audio/wav",
        body: new ReadableStream<Uint8Array>(),
      }),
    ).rejects.toBeInstanceOf(PolymorfaConfigurationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("refuses a plain-HTTP upload URL and never names it in errors", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      ok(
        {
          asset: asset(),
          upload: {
            url: "http://storage.example.com/cap_secret",
            method: "POST",
            headers: { "Content-Type": "audio/mpeg" },
            maxBytes: 16_777_216,
            expiresAt: "2026-09-19T10:05:00.000Z",
          },
        },
        201,
      ),
    );
    const error = await projectClient(fetch)
      .voice.audio.upload({
        name: "x",
        contentType: "audio/mpeg",
        body: new Uint8Array([1]),
      })
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(PolymorfaValidationError);
    expect(inspect(error, { depth: 10 })).not.toContain("cap_secret");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("does not retain a signed upload URL from a network error", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (
        new URL(String(input)).pathname.startsWith("/platform/voice/uploads/")
      ) {
        throw new Error(`network failed for ${UPLOAD_URL}`);
      }
      return ok(
        {
          asset: asset(),
          upload: {
            url: UPLOAD_URL,
            method: "POST",
            headers: { "Content-Type": "audio/mpeg" },
            maxBytes: 16_777_216,
            expiresAt: "2026-09-19T10:05:00.000Z",
          },
        },
        201,
      );
    });
    const error = await projectClient(fetch)
      .voice.audio.upload({
        name: "x",
        contentType: "audio/mpeg",
        body: new Uint8Array([1]),
      })
      .catch((cause: unknown) => cause);
    expect(error).toMatchObject({ code: "connection_error" });
    expect((error as Error).cause).toBeUndefined();
    expect(inspect(error, { depth: 10 })).not.toContain(UPLOAD_URL);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not retain a signed upload URL echoed by a failed upload response", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      if (
        new URL(String(input)).pathname.startsWith("/platform/voice/uploads/")
      ) {
        return Response.json(
          {
            error: {
              code: "invalid_parameter",
              message: `Rejected ${UPLOAD_URL}`,
              request_log_url: UPLOAD_URL,
            },
            docs: UPLOAD_URL,
          },
          { status: 413, headers: { "x-request-id": UPLOAD_URL } },
        );
      }
      return ok(
        {
          asset: asset(),
          upload: {
            url: UPLOAD_URL,
            method: "POST",
            headers: { "Content-Type": "audio/mpeg" },
            maxBytes: 16_777_216,
            expiresAt: "2026-09-19T10:05:00.000Z",
          },
        },
        201,
      );
    });
    const error = await projectClient(fetch)
      .voice.audio.upload({
        name: "x",
        contentType: "audio/mpeg",
        body: new Uint8Array([1]),
      })
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(PolymorfaValidationError);
    expect(error).toMatchObject({ status: 413 });
    expect(inspect(error, { depth: 10 })).not.toContain(UPLOAD_URL);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("maps upload URL refusals to typed errors and leaves the asset pending", async () => {
    const fetch = uploadFlow();
    fetch.mockImplementation(async (input) =>
      new URL(String(input)).pathname.startsWith("/platform/voice/uploads/")
        ? failure(413, "invalid_parameter", "The file is larger than 16 MB.")
        : ok(
            {
              asset: asset(),
              upload: {
                url: UPLOAD_URL,
                method: "POST",
                headers: { "Content-Type": "audio/mpeg" },
                maxBytes: 16_777_216,
                expiresAt: "2026-09-19T10:05:00.000Z",
              },
            },
            201,
          ),
    );
    const error = await projectClient(fetch)
      .voice.audio.upload({
        name: "x",
        contentType: "audio/mpeg",
        body: new Uint8Array([1]),
      })
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(PolymorfaValidationError);
    expect((error as PolymorfaValidationError).status).toBe(413);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("synthesizes speech with the project and provider fields", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      ok(
        asset({
          source: "tts",
          status: "transcoding",
          tts: {
            provider: "openai",
            voiceId: "coral",
            model: "gpt-4o-mini-tts",
            text: "Hello",
            characters: 5,
            keySource: "managed",
            credentialId: null,
          },
        }),
        201,
      ),
    );
    const created = await organizationClient(fetch).voice.audio.synthesize(
      PROJECT,
      { name: "Hello", text: "Hello", provider: "openai", voiceId: "coral" },
    );
    expect(created.data.tts?.keySource).toBe("managed");
    const request = sent(fetch, 0);
    expect(request.method).toBe("POST");
    expect(request.url.pathname).toBe("/platform/voice/audio/tts");
    expect(request.json()).toEqual({
      projectId: PROJECT,
      name: "Hello",
      text: "Hello",
      provider: "openai",
      voiceId: "coral",
    });

    await projectClient(fetch).voice.audio.synthesize({
      name: "Hi",
      text: "Hi",
      provider: "elevenlabs",
      voiceId: "21m00Tcm4TlvDq8ikWAM",
      model: "eleven_flash_v2_5",
      credentialId: CREDENTIAL_ID,
      retentionDays: 7,
    });
    expect(sent(fetch, 1).json()).toEqual({
      projectId: PROJECT,
      name: "Hi",
      text: "Hi",
      provider: "elevenlabs",
      voiceId: "21m00Tcm4TlvDq8ikWAM",
      model: "eleven_flash_v2_5",
      credentialId: CREDENTIAL_ID,
      retentionDays: 7,
    });
  });

  it("retrieves, updates, deletes and previews by asset ID", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/preview"))
        return ok({
          url: "https://media.example.com/p.ogg",
          contentType: "audio/ogg",
          expiresAt: "2026-09-19T10:05:00.000Z",
        });
      if (init?.method === "DELETE") return ok({ id: ASSET_ID, deleted: true });
      return ok(asset({ status: "ready", retentionDays: null, revision: 2 }));
    });
    const audio = projectClient(fetch).voice.audio;
    await audio.retrieve(ASSET_ID);
    await audio.update(ASSET_ID, {
      name: "Welcome",
      retentionDays: null,
      expectedRevision: 1,
    });
    const deleted = await audio.delete(ASSET_ID);
    const preview = await audio.previewUrl(ASSET_ID);
    expect(deleted.data).toEqual({ id: ASSET_ID, deleted: true });
    expect(preview.data.contentType).toBe("audio/ogg");
    expect(fetch).toHaveBeenCalledTimes(4);
    const calls = [0, 1, 2, 3].map((index) => sent(fetch, index));
    expect(calls.map((call) => [call.method, call.url.pathname])).toEqual([
      ["GET", `/platform/voice/audio/${ASSET_ID}`],
      ["PATCH", `/platform/voice/audio/${ASSET_ID}`],
      ["DELETE", `/platform/voice/audio/${ASSET_ID}`],
      ["GET", `/platform/voice/audio/${ASSET_ID}/preview`],
    ]);
    expect(calls[1]!.json()).toEqual({
      name: "Welcome",
      retentionDays: null,
      expectedRevision: 1,
    });
  });

  it("confines team-key project clients to their project's assets", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      ok(asset({ projectId: OTHER_PROJECT })),
    );
    const scoped = organizationClient(fetch).project(PROJECT).voice.audio;
    for (const attempt of [
      () => scoped.retrieve(ASSET_ID),
      () => scoped.update(ASSET_ID, { name: "x" }),
      () => scoped.delete(ASSET_ID),
      () => scoped.complete(ASSET_ID),
      () => scoped.previewUrl(ASSET_ID),
    ]) {
      await expect(attempt()).rejects.toBeInstanceOf(PolymorfaNotFoundError);
    }
    expect(
      fetch.mock.calls.every((_, index) => sent(fetch, index).method === "GET"),
    ).toBe(true);

    fetch.mockImplementation(async (_input, init) =>
      init?.method === "DELETE"
        ? ok({ id: ASSET_ID, deleted: true })
        : ok(asset({ projectId: PROJECT.toUpperCase() })),
    );
    fetch.mockClear();
    await scoped.delete(ASSET_ID, { idempotencyKey: "delete-1" });
    expect(sent(fetch, 0).headers.get("idempotency-key")).toBeNull();
    expect(sent(fetch, 1).method).toBe("DELETE");
    expect(sent(fetch, 1).headers.get("idempotency-key")).toBe("delete-1");
  });

  it("waits until the asset is ready or failed", async () => {
    const statuses: VoiceAudioStatus[] = [
      "transcoding",
      "transcoding",
      "ready",
    ];
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      ok(asset({ status: statuses.shift() ?? "ready" })),
    );
    const audio = projectClient(fetch).voice.audio;
    const ready = await audio.waitUntilReady(ASSET_ID, { intervalMs: 1 });
    expect(ready.data.status).toBe("ready");
    expect(fetch).toHaveBeenCalledTimes(3);

    fetch.mockImplementation(async () =>
      ok(asset({ status: "failed", failureReason: "silent" })),
    );
    const failed = await audio.waitUntilReady(ASSET_ID, { intervalMs: 1 });
    expect(failed.data.failureReason).toBe("silent");

    fetch.mockImplementation(async () => ok(asset({ status: "transcoding" })));
    await expect(
      audio.waitUntilReady(ASSET_ID, { intervalMs: 1, timeoutMs: 5 }),
    ).rejects.toBeInstanceOf(PolymorfaTimeoutError);
  });

  it("cancels a slow read at the wait deadline and never resolves after it", async () => {
    let delivered = false;
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise<Response>((resolve, reject) => {
          const answer = setTimeout(() => {
            delivered = true;
            resolve(ok(asset({ status: "ready" })));
          }, 400);
          init?.signal?.addEventListener("abort", () => {
            clearTimeout(answer);
            reject(init.signal?.reason ?? new Error("aborted"));
          });
        }),
    );
    const audio = projectClient(fetch).voice.audio;
    const started = Date.now();
    const error = await audio
      .waitUntilReady(ASSET_ID, { timeoutMs: 50, intervalMs: 1 })
      .then(
        () => undefined,
        (reason: unknown) => reason,
      );
    const elapsed = Date.now() - started;
    expect(error).toBeInstanceOf(PolymorfaTimeoutError);
    expect((error as PolymorfaTimeoutError).code).toBe("request_timeout");
    expect((error as PolymorfaTimeoutError).details).toEqual({
      assetId: ASSET_ID,
    });
    expect(elapsed).toBeGreaterThanOrEqual(45);
    expect(elapsed).toBeLessThan(300);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(sent(fetch, 0).init.signal?.aborted).toBe(true);
    expect(delivered).toBe(false);
  });

  it("reports a terminal result that arrives after the deadline as a timeout", async () => {
    let now = 1_000_000;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    try {
      const fetch = vi.fn<typeof globalThis.fetch>(async () => {
        now += 1_001;
        return ok(asset({ status: "ready" }));
      });
      const audio = projectClient(fetch).voice.audio;
      await expect(
        audio.waitUntilReady(ASSET_ID, { timeoutMs: 1_000, intervalMs: 1 }),
      ).rejects.toMatchObject({
        name: "PolymorfaTimeoutError",
        code: "request_timeout",
      });
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally {
      clock.mockRestore();
    }
  });

  it("keeps a caller abort during a wait a cancellation", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason ?? new Error("aborted")),
          );
        }),
    );
    const controller = new AbortController();
    const waiting = projectClient(fetch).voice.audio.waitUntilReady(ASSET_ID, {
      timeoutMs: 5_000,
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 10);
    const error = await waiting.then(
      () => undefined,
      (reason: unknown) => reason,
    );
    expect(error).not.toBeInstanceOf(PolymorfaTimeoutError);
    expect(error).toMatchObject({ code: "request_cancelled" });
  });

  it("passes unknown enum values through for callers to treat as other", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      ok(
        asset({
          status: "archived",
          source: "recording",
          failureReason: "future_reason",
          originalFormat: "flac",
        }),
      ),
    );
    const { data } = await projectClient(fetch).voice.audio.retrieve(ASSET_ID);
    expect(data.status).toBe("archived");
    expect(
      (VOICE_AUDIO_STATUSES as readonly string[]).includes(data.status),
    ).toBe(false);
    expect(data.source).toBe("recording");
    expect(data.failureReason).toBe("future_reason");
    expectTypeOf<"archived">().toExtend<VoiceAudioStatus>();
  });
});

describe("voice provider credentials", () => {
  it("lists team-wide credentials and a named project's", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      ok([credential({ projectId: null }), credential()]),
    );
    const client = organizationClient(fetch);
    const listed = await client.voice.providerCredentials.list();
    expect(listed.data).toHaveLength(2);
    expect(sent(fetch, 0).url.pathname).toBe(
      "/platform/voice/provider-credentials",
    );
    expect(sent(fetch, 0).url.search).toBe("");
    await client.voice.providerCredentials.list({ projectId: PROJECT });
    expect(sent(fetch, 1).url.searchParams.get("projectId")).toBe(PROJECT);
    await projectClient(fetch).voice.providerCredentials.list();
    expect(sent(fetch, 2).url.searchParams.get("projectId")).toBe(PROJECT);
  });

  it("creates team-wide and project credentials", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      ok(credential({ projectId: null }), 201),
    );
    const created = await organizationClient(
      fetch,
    ).voice.providerCredentials.create({
      provider: "elevenlabs",
      label: "Production",
      apiKey: PROVIDER_KEY,
      projectId: null,
    });
    expect(created.data).not.toHaveProperty("apiKey");
    expect(sent(fetch, 0).method).toBe("POST");
    expect(sent(fetch, 0).json()).toEqual({
      provider: "elevenlabs",
      label: "Production",
      apiKey: PROVIDER_KEY,
      projectId: null,
    });

    await organizationClient(fetch).voice.providerCredentials.create({
      provider: "openai",
      label: "Team",
      apiKey: PROVIDER_KEY,
    });
    expect(sent(fetch, 1).json()).not.toHaveProperty("projectId");

    await projectClient(fetch).voice.providerCredentials.create({
      provider: "openai",
      label: "Project",
      apiKey: PROVIDER_KEY,
    });
    expect(sent(fetch, 2).json()).toMatchObject({ projectId: PROJECT });
  });

  it("retrieves, verifies and deletes by credential ID", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) =>
      init?.method === "DELETE"
        ? ok({ id: CREDENTIAL_ID, deleted: true })
        : ok(credential()),
    );
    const credentials = projectClient(fetch).voice.providerCredentials;
    await credentials.retrieve(CREDENTIAL_ID);
    await credentials.verify(CREDENTIAL_ID);
    await credentials.delete(CREDENTIAL_ID);
    const base = `/platform/voice/provider-credentials/${CREDENTIAL_ID}`;
    expect(
      [0, 1, 2].map((index) => {
        const call = sent(fetch, index);
        return [call.method, call.url.pathname];
      }),
    ).toEqual([
      ["GET", base],
      ["POST", `${base}/verify`],
      ["DELETE", base],
    ]);
  });

  it("lets team-key project clients read but not manage team-wide credentials", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      ok(credential({ projectId: null })),
    );
    const scoped =
      organizationClient(fetch).project(PROJECT).voice.providerCredentials;
    await expect(scoped.retrieve(CREDENTIAL_ID)).resolves.toBeDefined();
    await expect(scoped.verify(CREDENTIAL_ID)).rejects.toBeInstanceOf(
      PolymorfaAuthorizationError,
    );
    await expect(scoped.delete(CREDENTIAL_ID)).rejects.toBeInstanceOf(
      PolymorfaAuthorizationError,
    );

    fetch.mockImplementation(async () =>
      ok(credential({ projectId: OTHER_PROJECT })),
    );
    await expect(scoped.retrieve(CREDENTIAL_ID)).rejects.toBeInstanceOf(
      PolymorfaNotFoundError,
    );
    await expect(scoped.delete(CREDENTIAL_ID)).rejects.toBeInstanceOf(
      PolymorfaNotFoundError,
    );
    expect(
      fetch.mock.calls.every((_, index) => sent(fetch, index).method === "GET"),
    ).toBe(true);
  });

  it("never puts the provider key in a thrown error", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      failure(
        422,
        "provider_credential_invalid",
        "The provider rejected the key.",
      ),
    );
    const error = await organizationClient(fetch)
      .voice.providerCredentials.create({
        provider: "openai",
        label: "Bad",
        apiKey: PROVIDER_KEY,
      })
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(PolymorfaValidationError);
    expect((error as PolymorfaValidationError).code).toBe(
      "provider_credential_invalid",
    );
    expect(inspect(error, { depth: 20 })).not.toContain(PROVIDER_KEY);
    expect(JSON.stringify(error)).not.toContain(PROVIDER_KEY);
    expect(String(error)).not.toContain(PROVIDER_KEY);

    const offline = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError("fetch failed");
    });
    const connection = await organizationClient(offline)
      .voice.providerCredentials.create({
        provider: "openai",
        label: "Bad",
        apiKey: PROVIDER_KEY,
      })
      .catch((cause: unknown) => cause);
    expect(inspect(connection, { depth: 20 })).not.toContain(PROVIDER_KEY);

    expect(() =>
      organizationClient(vi.fn()).voice.providerCredentials.create({
        provider: "openai",
        label: "Empty",
        apiKey: "",
      }),
    ).toThrow(PolymorfaConfigurationError);
  });

  it("passes unknown credential statuses through", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      ok(credential({ status: "revoked", lastError: "future_error" })),
    );
    const { data } =
      await projectClient(fetch).voice.providerCredentials.retrieve(
        CREDENTIAL_ID,
      );
    expect(data.status).toBe("revoked");
    expect(
      (VOICE_PROVIDER_CREDENTIAL_STATUSES as readonly string[]).includes(
        data.status,
      ),
    ).toBe(false);
  });
});

describe("voice errors", () => {
  it.each([
    [403, "voice_not_enabled", PolymorfaAuthorizationError],
    [402, "gate_limit_reached", PolymorfaPaymentRequiredError],
    [422, "provider_credential_invalid", PolymorfaValidationError],
    [503, "provider_unavailable", PolymorfaServerError],
    [409, "asset_not_ready", PolymorfaConflictError],
    [409, "voice_asset_in_use", PolymorfaConflictError],
    [409, "voice_asset_revision_conflict", PolymorfaConflictError],
    [503, "voice_unavailable", PolymorfaServerError],
  ] as const)("maps %i %s", async (status, code, type) => {
    expect(POLYMORFA_ERROR_CODES).toContain(code);
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      failure(status, code, "Refused."),
    );
    const error = await projectClient(fetch)
      .voice.audio.synthesize({
        name: "x",
        text: "x",
        provider: "openai",
        voiceId: "alloy",
      })
      .catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(type);
    expect((error as InstanceType<typeof type>).code).toBe(code);
    expect((error as InstanceType<typeof type>).status).toBe(status);
    expect((error as InstanceType<typeof type>).requestId).toBe("req_1");
  });
});

describe("voice webhooks", () => {
  const secret = "voice-secret";
  const sign = (body: Buffer) =>
    createHmac("sha256", secret).update(body).digest("hex");
  const base = {
    eventId: "8c0e2a1b-7f3d-4e5a-9b6c-1d2e3f4a5b6c",
    occurredAt: "2026-09-19T10:00:05.000Z",
    organizationId: "018f0000-0000-7000-8000-000000000001",
    projectId: PROJECT,
    assetId: ASSET_ID,
    name: "Greeting",
    source: "upload",
  };

  it.each([
    [
      "voice.asset_ready",
      {
        ...base,
        durationMs: 12_345,
        contentSha256: "ab".repeat(32),
        originalFormat: "mp3",
      },
    ],
    ["voice.asset_failed", { ...base, failureReason: "too_long" }],
  ] as const)("parses %s", async (type, payload) => {
    const body = Buffer.from(
      JSON.stringify({
        id: "evt_1",
        session: "",
        timestamp: "2026-09-19T10:00:05.000Z",
        event: type,
        payload,
      }),
    );
    const event = await constructWebhookEvent(body, sign(body), secret);
    expect(event.event).toBe(type);
    expect(event.session).toBe("");
    expect(event.payload).toEqual(payload);
    if (isEvent(event, "voice.asset_ready")) {
      expectTypeOf(event.payload.durationMs).toEqualTypeOf<number>();
    }
    if (isEvent(event, "voice.asset_failed")) {
      expect(event.payload.failureReason).toBe("too_long");
    }
  });
});
