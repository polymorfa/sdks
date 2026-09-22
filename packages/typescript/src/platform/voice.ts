import {
  PolymorfaAuthorizationError,
  PolymorfaConfigurationError,
  PolymorfaNotFoundError,
  PolymorfaTimeoutError,
  PolymorfaValidationError,
} from "../errors.js";
import { CursorPage } from "../pagination.js";
import { RawClient } from "../raw.js";
import { HttpTransport } from "../transport/http.js";
import { defaultSleep } from "../transport/retry.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { ClientOwner } from "./developer-types.js";
import {
  type DataEnvelope,
  decodeCursorPage,
  unwrapResponse,
} from "./response.js";

// Response enums preserve values returned by the API. Request fields use
// the closed known-value unions accepted by the pinned API.

export const VOICE_AUDIO_STATUSES = [
  "pending_upload",
  "uploaded",
  "transcoding",
  "ready",
  "failed",
] as const;
export type KnownVoiceAudioStatus = (typeof VOICE_AUDIO_STATUSES)[number];
export type VoiceAudioStatus = KnownVoiceAudioStatus | (string & {});

export const VOICE_AUDIO_SOURCES = ["upload", "tts"] as const;
export type KnownVoiceAudioSource = (typeof VOICE_AUDIO_SOURCES)[number];
export type VoiceAudioSource = KnownVoiceAudioSource | (string & {});

export const VOICE_AUDIO_FAILURE_REASONS = [
  "unsupported_format",
  "too_large",
  "too_long",
  "decode_failed",
  "silent",
  "tts_failed",
  "processing_failed",
] as const;
export type KnownVoiceAudioFailureReason =
  (typeof VOICE_AUDIO_FAILURE_REASONS)[number];
export type VoiceAudioFailureReason =
  KnownVoiceAudioFailureReason | (string & {});

/** Container of the original upload. */
export const VOICE_AUDIO_FORMATS = ["mp3", "wav", "ogg", "m4a"] as const;
export type KnownVoiceAudioFormat = (typeof VOICE_AUDIO_FORMATS)[number];
export type VoiceAudioFormat = KnownVoiceAudioFormat | (string & {});

export const VOICE_PROVIDERS = ["elevenlabs", "openai"] as const;
export type KnownVoiceProvider = (typeof VOICE_PROVIDERS)[number];
export type VoiceProvider = KnownVoiceProvider | (string & {});

/** Whose provider key produced a TTS asset. */
export const VOICE_KEY_SOURCES = ["managed", "customer"] as const;
export type KnownVoiceKeySource = (typeof VOICE_KEY_SOURCES)[number];
export type VoiceKeySource = KnownVoiceKeySource | (string & {});

export const VOICE_PROVIDER_CREDENTIAL_STATUSES = [
  "unverified",
  "valid",
  "invalid",
] as const;
export type KnownVoiceProviderCredentialStatus =
  (typeof VOICE_PROVIDER_CREDENTIAL_STATUSES)[number];
export type VoiceProviderCredentialStatus =
  KnownVoiceProviderCredentialStatus | (string & {});

export const VOICE_PROVIDER_CREDENTIAL_ERRORS = [
  "unauthorized",
  "quota_exceeded",
  "forbidden_scope",
  "provider_unavailable",
] as const;
export type KnownVoiceProviderCredentialError =
  (typeof VOICE_PROVIDER_CREDENTIAL_ERRORS)[number];
export type VoiceProviderCredentialError =
  KnownVoiceProviderCredentialError | (string & {});

export const VOICE_AUDIO_UPLOAD_CONTENT_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
] as const;
export type KnownVoiceAudioUploadContentType =
  (typeof VOICE_AUDIO_UPLOAD_CONTENT_TYPES)[number];
export type VoiceAudioUploadContentType = KnownVoiceAudioUploadContentType;

/** ElevenLabs models. `eleven_multilingual_v2` is the default. */
export const ELEVENLABS_TTS_MODELS = [
  "eleven_multilingual_v2",
  "eleven_flash_v2_5",
  "eleven_turbo_v2_5",
] as const;
export type ElevenLabsTtsModel = (typeof ELEVENLABS_TTS_MODELS)[number];

/** OpenAI models. `gpt-4o-mini-tts` is the default. */
export const OPENAI_TTS_MODELS = [
  "gpt-4o-mini-tts",
  "tts-1",
  "tts-1-hd",
] as const;
export type OpenAiTtsModel = (typeof OPENAI_TTS_MODELS)[number];

export const OPENAI_TTS_VOICES = [
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
] as const;
export type OpenAiTtsVoice = (typeof OPENAI_TTS_VOICES)[number];

/** Largest upload the API accepts: 16 MiB. */
export const VOICE_AUDIO_MAX_UPLOAD_BYTES = 16_777_216;

export interface VoiceAudioTts {
  readonly provider: VoiceProvider;
  readonly voiceId: string;
  readonly model: string;
  readonly text: string;
  readonly characters: number;
  readonly keySource: VoiceKeySource;
  /** The customer credential used, or `null` for a Polymorfa-managed key. */
  readonly credentialId: string | null;
}

export interface VoiceAudioAsset {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly source: VoiceAudioSource;
  readonly status: VoiceAudioStatus;
  readonly failureReason: VoiceAudioFailureReason | null;
  readonly originalFormat: VoiceAudioFormat | null;
  readonly originalContentType: string | null;
  /** Size of the original bytes. */
  readonly sizeBytes: number | null;
  /** Length of the canonical audio, set when `ready`. */
  readonly durationMs: number | null;
  /** Hex SHA-256 of the canonical 16 kHz mono PCM, set when `ready`. */
  readonly contentSha256: string | null;
  readonly tts: VoiceAudioTts | null;
  /** Days the asset is kept (1 to 3650), or `null` to keep it until deleted. */
  readonly retentionDays: number | null;
  readonly expiresAt: string | null;
  /** Campaigns and flows that use the asset. Delete fails while it is above 0. */
  readonly inUseCount: number;
  /** Increases on every change. Send it as `expectedRevision` to guard updates. */
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly readyAt: string | null;
}

/** Where to send the file. The URL is valid for 5 minutes; treat it as a secret. */
export interface VoiceAudioUpload {
  readonly url: string;
  readonly method: "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly maxBytes: number;
  readonly expiresAt: string;
}

export interface VoiceAudioUploadCreated {
  readonly asset: VoiceAudioAsset;
  readonly upload: VoiceAudioUpload;
}

/** A short-lived link to Opus-in-Ogg audio (16 kHz mono), valid for 5 minutes. */
export interface VoiceAudioPreview {
  readonly url: string;
  readonly contentType: "audio/ogg";
  readonly expiresAt: string;
}

export interface VoiceProviderCredential {
  readonly id: string;
  /** The project, or `null` for a credential every project of the team can use. */
  readonly projectId: string | null;
  readonly provider: VoiceProvider;
  readonly label: string;
  /** First 8 lowercase hex characters of the key's SHA-256. The key is never returned. */
  readonly keyFingerprint: string;
  readonly status: VoiceProviderCredentialStatus;
  readonly verifiedAt: string | null;
  readonly lastError: VoiceProviderCredentialError | null;
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface VoiceResourceDeleted {
  readonly id: string;
  readonly deleted: true;
}

export interface ListVoiceAudioParams {
  readonly status?: KnownVoiceAudioStatus;
  readonly cursor?: string;
  /** 1 to 100. The API default is 50. */
  readonly limit?: number;
}

export interface CreateVoiceAudioUploadInput {
  /** 1 to 100 characters. */
  readonly name: string;
  readonly contentType: VoiceAudioUploadContentType;
  /** 1 to 16777216. */
  readonly sizeBytes: number;
  readonly retentionDays?: number;
}

export type VoiceAudioBody =
  Blob | ArrayBuffer | ArrayBufferView | ReadableStream<Uint8Array>;

export interface UploadVoiceAudioInput {
  readonly name: string;
  /** The file: bytes, a `Buffer`, a `Blob`/`File`, or a stream. */
  readonly body: VoiceAudioBody;
  /** Required unless `body` is a `Blob` with a type. */
  readonly contentType?: VoiceAudioUploadContentType;
  /**
   * Required when `body` is a stream. For bytes and Blobs the size is the
   * body's byte length; a different value is refused before any request.
   */
  readonly sizeBytes?: number;
  readonly retentionDays?: number;
}

interface SynthesizeVoiceAudioBase {
  readonly name: string;
  /** 1 to 5000 characters (1 to 4096 for OpenAI). */
  readonly text: string;
  /**
   * Your provider credential for the same provider. Without it, Polymorfa's
   * managed key is used.
   */
  readonly credentialId?: string;
  readonly retentionDays?: number;
}

export type SynthesizeVoiceAudioInput =
  | (SynthesizeVoiceAudioBase & {
      readonly provider: "elevenlabs";
      /** An ElevenLabs voice ID (`^[A-Za-z0-9]{1,64}$`). */
      readonly voiceId: string;
      readonly model?: ElevenLabsTtsModel;
    })
  | (SynthesizeVoiceAudioBase & {
      readonly provider: "openai";
      readonly voiceId: OpenAiTtsVoice;
      readonly model?: OpenAiTtsModel;
    });

export interface UpdateVoiceAudioInput {
  /** Refuse the change with `voice_asset_revision_conflict` if the asset has another revision. */
  readonly expectedRevision?: number;
  readonly name?: string;
  /** Send `null` to keep the asset until it is deleted. */
  readonly retentionDays?: number | null;
}

export interface WaitForVoiceAudioOptions {
  /** Give up after this long. Default 120000. */
  readonly timeoutMs?: number;
  /** Delay between reads. Default 2000. */
  readonly intervalMs?: number;
  readonly signal?: AbortSignal;
}

export interface ListVoiceProviderCredentialsParams {
  /** Adds that project's credentials to the team-wide ones. */
  readonly projectId?: string;
}

interface CreateVoiceProviderCredentialBase {
  readonly provider: KnownVoiceProvider;
  /** 1 to 100 characters. */
  readonly label: string;
  /** Write-only, 1 to 512 characters. Never returned, logged or echoed in errors. */
  readonly apiKey: string;
}

export type CreateVoiceProviderCredentialInput<
  O extends ClientOwner = "organization",
> = O extends "project"
  ? CreateVoiceProviderCredentialBase
  : CreateVoiceProviderCredentialBase & {
      /** A project, or `null`/omitted for a credential every project can use. */
      readonly projectId?: string | null;
    };

type ProjectArgument<O extends ClientOwner> = O extends "project"
  ? []
  : [projectId: string];

type CredentialListArguments<O extends ClientOwner> = O extends "project"
  ? [options?: RequestOptions]
  : [params?: ListVoiceProviderCredentialsParams, options?: RequestOptions];

/**
 * Prepared for the pending Voice Automation API. Writes require the
 * `calls.voice-automation` beta; other teams get `voice_not_enabled`.
 * Reads, previews and deletes keep working after withdrawal. An installed
 * resource does not grant access or establish an enabled audience.
 */
export class VoiceResource<O extends ClientOwner> {
  readonly audio: VoiceAudioResource<O>;
  readonly providerCredentials: VoiceProviderCredentialsResource<O>;

  constructor(
    transport: HttpTransport,
    projectId: string | null,
    confineById: boolean,
  ) {
    this.audio = new VoiceAudioResource(transport, projectId, confineById);
    this.providerCredentials = new VoiceProviderCredentialsResource(
      transport,
      projectId,
      confineById,
    );
  }
}

/**
 * The project's audio library: uploaded recordings and text-to-speech
 * renders, transcoded to 16 kHz mono for calls. Team clients name the project
 * on `list`, `createUpload`, `upload` and `synthesize`; project clients use
 * their own project.
 */
export class VoiceAudioResource<O extends ClientOwner> {
  readonly #raw: RawClient;

  constructor(
    private readonly transport: HttpTransport,
    private readonly projectId: string | null,
    /**
     * Team keys reach every asset of the team by ID, so a project client
     * built from one checks an asset's project before acting on it.
     */
    private readonly confineById: boolean,
  ) {
    this.#raw = new RawClient(transport);
  }

  list(
    ...args: [
      ...ProjectArgument<O>,
      params?: ListVoiceAudioParams,
      options?: RequestOptions,
    ]
  ): Promise<CursorPage<VoiceAudioAsset>> {
    const [projectId, rest] = this.#project(args);
    const params = (rest[0] as ListVoiceAudioParams | undefined) ?? {};
    const options = (rest[1] as RequestOptions | undefined) ?? {};
    return this.#raw.paginate<VoiceAudioAsset>(
      {
        method: "GET",
        path: AUDIO_PATH,
        query: {
          projectId,
          ...(params.status === undefined ? {} : { status: params.status }),
          ...(params.cursor === undefined ? {} : { cursor: params.cursor }),
          ...(params.limit === undefined ? {} : { limit: params.limit }),
        },
        ...options,
      },
      decodeCursorPage<VoiceAudioAsset>,
    );
  }

  /**
   * Creates an asset in `pending_upload` and returns where to send the file.
   * Send it with `POST upload.url`, only the `upload.headers`, and no
   * `Authorization` header, then call `complete`. `upload` does all three.
   */
  createUpload(
    ...args: [
      ...ProjectArgument<O>,
      input: CreateVoiceAudioUploadInput,
      options?: RequestOptions,
    ]
  ): Promise<ApiResponse<VoiceAudioUploadCreated>> {
    const [projectId, rest] = this.#project(args);
    const input = rest[0] as CreateVoiceAudioUploadInput;
    const options = (rest[1] as RequestOptions | undefined) ?? {};
    return this.#createUpload(projectId, input, options);
  }

  /**
   * Uploads a file into the library: creates the asset, sends the bytes to
   * the upload URL without your credential, and completes it. Resolves with
   * the asset in `transcoding`; wait for `voice.asset_ready` or use
   * `waitUntilReady`. If sending fails, the asset stays in `pending_upload`.
   * `options` apply to the API requests, not to the upload URL, except
   * `signal` and `timeoutMs`.
   */
  async upload(
    ...args: [
      ...ProjectArgument<O>,
      input: UploadVoiceAudioInput,
      options?: RequestOptions,
    ]
  ): Promise<ApiResponse<VoiceAudioAsset>> {
    const [projectId, rest] = this.#project(args);
    const input = rest[0] as UploadVoiceAudioInput;
    const options = (rest[1] as RequestOptions | undefined) ?? {};
    const contentType =
      input.contentType ??
      (input.body instanceof Blob && input.body.type !== ""
        ? input.body.type
        : undefined);
    if (contentType === undefined) {
      throw new PolymorfaConfigurationError(
        "A contentType is required to upload audio.",
        "contentType",
      );
    }
    if (
      !(VOICE_AUDIO_UPLOAD_CONTENT_TYPES as readonly string[]).includes(
        contentType,
      )
    ) {
      throw new PolymorfaValidationError(
        "The upload content type must be MP3, WAV, OGG or M4A audio.",
      );
    }
    const { body, sizeBytes } = uploadBody(input);
    const created = await this.#createUpload(
      projectId,
      {
        name: input.name,
        contentType: contentType as KnownVoiceAudioUploadContentType,
        sizeBytes,
        ...(input.retentionDays === undefined
          ? {}
          : { retentionDays: input.retentionDays }),
      },
      options,
    );
    const { asset, upload } = created.data;
    await this.transport.sendToUploadUrl({
      url: upload.url,
      method: upload.method,
      headers: upload.headers,
      body,
      ...(options.signal === undefined ? {} : { signal: options.signal }),
      ...(options.timeoutMs === undefined
        ? {}
        : { timeoutMs: options.timeoutMs }),
    });
    return this.#complete(asset.id, withoutIdempotencyKey(options));
  }

  /** Starts transcoding after the upload. Fails with `state_conflict` if the file was not received. */
  async complete(
    assetId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<VoiceAudioAsset>> {
    await this.#confine(assetId, options);
    return this.#complete(assetId, options);
  }

  /** Renders text to speech into a new asset, returned in `transcoding`. */
  synthesize(
    ...args: [
      ...ProjectArgument<O>,
      input: SynthesizeVoiceAudioInput,
      options?: RequestOptions,
    ]
  ): Promise<ApiResponse<VoiceAudioAsset>> {
    const [projectId, rest] = this.#project(args);
    const input = rest[0] as SynthesizeVoiceAudioInput;
    const options = (rest[1] as RequestOptions | undefined) ?? {};
    return this.transport
      .request<DataEnvelope<VoiceAudioAsset>>({
        method: "POST",
        path: `${AUDIO_PATH}/tts`,
        body: { ...input, projectId },
        ...options,
      })
      .then(unwrapResponse);
  }

  retrieve(
    assetId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<VoiceAudioAsset>> {
    return this.#retrieve(assetId, options).then((response) => {
      this.#assertProject(assetId, response.data);
      return response;
    });
  }

  async update(
    assetId: string,
    input: UpdateVoiceAudioInput,
    options: RequestOptions = {},
  ): Promise<ApiResponse<VoiceAudioAsset>> {
    await this.#confine(assetId, options);
    return this.transport
      .request<DataEnvelope<VoiceAudioAsset>>({
        method: "PATCH",
        path: assetPath(assetId),
        body: input,
        ...options,
      })
      .then(unwrapResponse);
  }

  /** Fails with `voice_asset_in_use` while a campaign or flow uses the asset. */
  async delete(
    assetId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<VoiceResourceDeleted>> {
    await this.#confine(assetId, options);
    return this.transport
      .request<DataEnvelope<VoiceResourceDeleted>>({
        method: "DELETE",
        path: assetPath(assetId),
        ...options,
      })
      .then(unwrapResponse);
  }

  /** A 5-minute link to the transcoded audio. Fails with `asset_not_ready` before `ready`. */
  async previewUrl(
    assetId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<VoiceAudioPreview>> {
    await this.#confine(assetId, options);
    return this.transport
      .request<DataEnvelope<VoiceAudioPreview>>({
        method: "GET",
        path: `${assetPath(assetId)}/preview`,
        ...options,
      })
      .then(unwrapResponse);
  }

  /**
   * Reads the asset until it is `ready` or `failed` and returns it; check
   * `status` and `failureReason`. Throws `PolymorfaTimeoutError` (code
   * `request_timeout`) once `timeoutMs` has elapsed: a read still in flight
   * at the deadline is cancelled, and a result that arrives after it is not
   * returned. Prefer the `voice.asset_ready` and `voice.asset_failed`
   * webhooks in production.
   */
  async waitUntilReady(
    assetId: string,
    wait: WaitForVoiceAudioOptions = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<VoiceAudioAsset>> {
    const timeoutMs = wait.timeoutMs ?? 120_000;
    const intervalMs = wait.intervalMs ?? 2_000;
    const deadline = Date.now() + timeoutMs;
    const callerSignals = [options.signal, wait.signal].filter(
      (signal): signal is AbortSignal => signal !== undefined,
    );
    const timedOut = () =>
      new PolymorfaTimeoutError(
        `The audio asset was not processed within ${timeoutMs}ms.`,
        { code: "request_timeout", details: { assetId } },
      );
    while (true) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw timedOut();
      // Each read is bounded by the time left, including the transport's own
      // retries, and still honours the caller's signals.
      const expiry = new AbortController();
      const timer = setTimeout(() => expiry.abort(), remaining);
      const read = linkSignals([...callerSignals, expiry.signal]);
      let response: ApiResponse<VoiceAudioAsset>;
      try {
        response = await this.retrieve(assetId, {
          ...options,
          ...(read.signal === undefined ? {} : { signal: read.signal }),
        });
      } catch (error) {
        if (
          expiry.signal.aborted &&
          !callerSignals.some((caller) => caller.aborted)
        ) {
          throw timedOut();
        }
        throw error;
      } finally {
        clearTimeout(timer);
        read.dispose();
      }
      if (Date.now() >= deadline) throw timedOut();
      if (
        response.data.status === "ready" ||
        response.data.status === "failed"
      ) {
        return response;
      }
      const left = deadline - Date.now();
      if (left <= 0) throw timedOut();
      const pause = linkSignals(callerSignals);
      try {
        await defaultSleep(Math.min(intervalMs, left), pause.signal);
      } finally {
        pause.dispose();
      }
    }
  }

  #createUpload(
    projectId: string,
    input: CreateVoiceAudioUploadInput,
    options: RequestOptions,
  ): Promise<ApiResponse<VoiceAudioUploadCreated>> {
    return this.transport
      .request<DataEnvelope<VoiceAudioUploadCreated>>({
        method: "POST",
        path: AUDIO_PATH,
        body: { ...input, projectId },
        ...options,
      })
      .then(unwrapResponse);
  }

  #complete(
    assetId: string,
    options: RequestOptions,
  ): Promise<ApiResponse<VoiceAudioAsset>> {
    return this.transport
      .request<DataEnvelope<VoiceAudioAsset>>({
        method: "POST",
        path: `${assetPath(assetId)}/complete`,
        ...options,
      })
      .then(unwrapResponse);
  }

  #retrieve(assetId: string, options: RequestOptions) {
    return this.transport
      .request<DataEnvelope<VoiceAudioAsset>>({
        method: "GET",
        path: assetPath(assetId),
        ...options,
      })
      .then(unwrapResponse);
  }

  #project(args: readonly unknown[]): [string, readonly unknown[]] {
    if (this.projectId !== null) return [this.projectId, args];
    return [requireProjectId(args[0]), args.slice(1)];
  }

  async #confine(assetId: string, options: RequestOptions): Promise<void> {
    if (!this.confineById) return;
    const response = await this.#retrieve(
      assetId,
      withoutIdempotencyKey(options),
    );
    this.#assertProject(assetId, response.data);
  }

  #assertProject(assetId: string, asset: VoiceAudioAsset): void {
    if (
      this.projectId !== null &&
      asset.projectId.toLowerCase() !== this.projectId.toLowerCase()
    ) {
      throw new PolymorfaNotFoundError("Audio asset not found.", {
        code: "resource_not_found",
        status: 404,
        details: { assetId },
      });
    }
  }
}

/**
 * Your own ElevenLabs or OpenAI keys for text-to-speech. A credential belongs
 * to one project or, when created by a team key without a project, to every
 * project of the team. The key is write-only: responses carry only its
 * fingerprint, and the SDK never logs it or includes it in errors.
 */
export class VoiceProviderCredentialsResource<O extends ClientOwner> {
  constructor(
    private readonly transport: HttpTransport,
    private readonly projectId: string | null,
    /**
     * A project client built from a team key checks a credential's project
     * before acting on it. It can read team-wide credentials but manages only
     * its own project's.
     */
    private readonly confineById: boolean,
  ) {}

  /** Team-wide credentials plus, when a project is named, that project's. */
  list(
    ...args: CredentialListArguments<O>
  ): Promise<ApiResponse<readonly VoiceProviderCredential[]>> {
    const values = args as readonly unknown[];
    let projectId: string | undefined;
    let options: RequestOptions;
    if (this.projectId !== null) {
      projectId = this.projectId;
      options = (values[0] as RequestOptions | undefined) ?? {};
    } else {
      const params =
        (values[0] as ListVoiceProviderCredentialsParams | undefined) ?? {};
      projectId = params.projectId;
      options = (values[1] as RequestOptions | undefined) ?? {};
    }
    return this.transport
      .request<DataEnvelope<readonly VoiceProviderCredential[]>>({
        method: "GET",
        path: CREDENTIALS_PATH,
        query: projectId === undefined ? {} : { projectId },
        ...options,
      })
      .then(unwrapResponse);
  }

  /** Stores and checks a provider key. Fails with `provider_credential_invalid` if the provider rejects it. */
  create(
    input: CreateVoiceProviderCredentialInput<O>,
    options: RequestOptions = {},
  ): Promise<ApiResponse<VoiceProviderCredential>> {
    const fields = input as CreateVoiceProviderCredentialBase & {
      readonly projectId?: string | null;
    };
    if (typeof fields.apiKey !== "string" || fields.apiKey.length === 0) {
      throw new PolymorfaConfigurationError("An apiKey is required.", "apiKey");
    }
    const body: Record<string, unknown> = {
      provider: fields.provider,
      label: fields.label,
      apiKey: fields.apiKey,
    };
    if (this.projectId !== null) body.projectId = this.projectId;
    else if (fields.projectId !== undefined) body.projectId = fields.projectId;
    return this.transport
      .request<DataEnvelope<VoiceProviderCredential>>({
        method: "POST",
        path: CREDENTIALS_PATH,
        body,
        ...options,
      })
      .then(unwrapResponse);
  }

  retrieve(
    credentialId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<VoiceProviderCredential>> {
    return this.#retrieve(credentialId, options).then((response) => {
      this.#assertVisible(credentialId, response.data);
      return response;
    });
  }

  /** Checks the stored key with the provider again and returns the updated status. */
  async verify(
    credentialId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<VoiceProviderCredential>> {
    await this.#confine(credentialId, options);
    return this.transport
      .request<DataEnvelope<VoiceProviderCredential>>({
        method: "POST",
        path: `${credentialPath(credentialId)}/verify`,
        ...options,
      })
      .then(unwrapResponse);
  }

  async delete(
    credentialId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<VoiceResourceDeleted>> {
    await this.#confine(credentialId, options);
    return this.transport
      .request<DataEnvelope<VoiceResourceDeleted>>({
        method: "DELETE",
        path: credentialPath(credentialId),
        ...options,
      })
      .then(unwrapResponse);
  }

  #retrieve(credentialId: string, options: RequestOptions) {
    return this.transport
      .request<DataEnvelope<VoiceProviderCredential>>({
        method: "GET",
        path: credentialPath(credentialId),
        ...options,
      })
      .then(unwrapResponse);
  }

  async #confine(credentialId: string, options: RequestOptions): Promise<void> {
    if (!this.confineById) return;
    const response = await this.#retrieve(
      credentialId,
      withoutIdempotencyKey(options),
    );
    const credential = response.data;
    this.#assertVisible(credentialId, credential);
    if (credential.projectId === null) {
      throw new PolymorfaAuthorizationError(
        "Manage team-wide provider credentials from the team client.",
        { code: "permission_denied", status: 403, details: { credentialId } },
      );
    }
  }

  #assertVisible(credentialId: string, credential: VoiceProviderCredential) {
    if (
      this.projectId !== null &&
      credential.projectId !== null &&
      credential.projectId.toLowerCase() !== this.projectId.toLowerCase()
    ) {
      throw new PolymorfaNotFoundError("Provider credential not found.", {
        code: "resource_not_found",
        status: 404,
        details: { credentialId },
      });
    }
  }
}

const AUDIO_PATH = "/platform/voice/audio";
const CREDENTIALS_PATH = "/platform/voice/provider-credentials";

function assetPath(assetId: string): string {
  return `${AUDIO_PATH}/${encodeURIComponent(requireId(assetId, "assetId"))}`;
}

function credentialPath(credentialId: string): string {
  return `${CREDENTIALS_PATH}/${encodeURIComponent(
    requireId(credentialId, "credentialId"),
  )}`;
}

function requireId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PolymorfaConfigurationError(`A ${field} is required.`, field);
  }
  return value;
}

function requireProjectId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PolymorfaConfigurationError(
      "A projectId is required for team clients.",
      "projectId",
    );
  }
  return value;
}

function withoutIdempotencyKey(options: RequestOptions): RequestOptions {
  // Reads and follow-up steps keep the caller's options; the idempotency key
  // belongs to the change the caller asked for.
  const copy: { -readonly [K in keyof RequestOptions]: RequestOptions[K] } = {
    ...options,
  };
  delete copy.idempotencyKey;
  return copy;
}

function uploadBody(input: UploadVoiceAudioInput): {
  readonly body: BodyInit;
  readonly sizeBytes: number;
} {
  const value = input.body;
  if (value instanceof ReadableStream) {
    if (input.sizeBytes === undefined) {
      throw new PolymorfaConfigurationError(
        "sizeBytes is required when the body is a stream.",
        "sizeBytes",
      );
    }
    return { body: value, sizeBytes: input.sizeBytes };
  }
  if (value instanceof Blob) {
    return { body: value, sizeBytes: knownSize(input, value.size) };
  }
  if (value instanceof ArrayBuffer) {
    return { body: value, sizeBytes: knownSize(input, value.byteLength) };
  }
  if (ArrayBuffer.isView(value)) {
    // Copy into an ArrayBuffer of exactly the view's bytes; a Buffer can be a
    // window into a larger shared pool.
    const bytes = new Uint8Array(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    ).slice();
    return { body: bytes.buffer, sizeBytes: knownSize(input, bytes.length) };
  }
  throw new PolymorfaConfigurationError(
    "body must be bytes, a Blob, or a ReadableStream.",
    "body",
  );
}

/**
 * The size of a body whose length is known is its byte length. A `sizeBytes`
 * that disagrees is refused before any request, so no asset is created for
 * an upload the storage would reject.
 */
function knownSize(input: UploadVoiceAudioInput, byteLength: number): number {
  if (input.sizeBytes !== undefined && input.sizeBytes !== byteLength) {
    throw new PolymorfaValidationError(
      `sizeBytes (${input.sizeBytes}) does not match the body's ${byteLength} bytes. Omit sizeBytes for byte and Blob bodies.`,
      {
        code: "invalid_parameter",
        details: { field: "sizeBytes", sizeBytes: input.sizeBytes, byteLength },
      },
    );
  }
  return byteLength;
}

/**
 * A signal that aborts, with the same reason, when any of `signals` aborts.
 * `dispose` detaches it so a long-lived caller signal does not collect
 * listeners across reads.
 */
function linkSignals(signals: readonly AbortSignal[]): {
  readonly signal: AbortSignal | undefined;
  readonly dispose: () => void;
} {
  if (signals.length <= 1) return { signal: signals[0], dispose: () => {} };
  const controller = new AbortController();
  const detach = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), {
      once: true,
      signal: detach.signal,
    });
  }
  return { signal: controller.signal, dispose: () => detach.abort() };
}
