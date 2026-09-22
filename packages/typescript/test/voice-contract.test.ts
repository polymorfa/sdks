import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  VOICE_AUDIO_STATUSES,
  VOICE_AUDIO_UPLOAD_CONTENT_TYPES,
  VOICE_PROVIDERS,
  type CreateVoiceAudioUploadInput,
  type CreateVoiceProviderCredentialInput,
  type ElevenLabsTtsModel,
  type KnownVoiceAudioStatus,
  type KnownVoiceAudioUploadContentType,
  type KnownVoiceProvider,
  type ListVoiceAudioParams,
  type OpenAiTtsModel,
  type OpenAiTtsVoice,
  type SynthesizeVoiceAudioInput,
  type UpdateVoiceAudioInput,
  type VoiceAudioAsset,
  type VoiceAudioPreview,
  type VoiceAudioTts,
  type VoiceAudioUpload,
  type VoiceProviderCredential,
} from "../src/index.js";

interface Schema {
  readonly $ref?: string;
  readonly nullable?: boolean;
  readonly enum?: readonly unknown[];
  readonly required?: readonly string[];
  readonly properties?: Readonly<Record<string, Schema>>;
}

const { components } = JSON.parse(
  readFileSync(
    new URL("../../../contracts/openapi.platform.json", import.meta.url),
    "utf8",
  ),
) as { components: { schemas: Readonly<Record<string, Schema>> } };

const schema = (name: string): Schema => {
  const value = components.schemas[`PlatformAccess${name}`];
  if (value === undefined) throw new Error(`Missing schema ${name}`);
  return value;
};

function resolve(value: Schema): Schema {
  if (value.$ref === undefined) return value;
  const target = components.schemas[value.$ref.split("/").at(-1)!];
  if (target === undefined) throw new Error(`Unresolved ${value.$ref}`);
  return resolve(target);
}

// Every property must appear, with its TypeScript required/nullable flags.
type FieldShape<T> = {
  [K in keyof T]-?: readonly [
    undefined extends T[K] ? false : true,
    null extends T[K] ? true : false,
  ];
};
const shape =
  <T>() =>
  (name: string, fields: FieldShape<T>, omit: readonly string[] = []) => ({
    name,
    fields,
    omit,
  });

const shapes = [
  shape<VoiceAudioAsset>()("VoiceAudioAsset", {
    id: [true, false],
    projectId: [true, false],
    name: [true, false],
    source: [true, false],
    status: [true, false],
    failureReason: [true, true],
    originalFormat: [true, true],
    originalContentType: [true, true],
    sizeBytes: [true, true],
    durationMs: [true, true],
    contentSha256: [true, true],
    tts: [true, true],
    retentionDays: [true, true],
    expiresAt: [true, true],
    inUseCount: [true, false],
    revision: [true, false],
    createdAt: [true, false],
    updatedAt: [true, false],
    readyAt: [true, true],
  }),
  shape<VoiceAudioTts>()("VoiceAudioTts", {
    provider: [true, false],
    voiceId: [true, false],
    model: [true, false],
    text: [true, false],
    characters: [true, false],
    keySource: [true, false],
    credentialId: [true, true],
  }),
  shape<VoiceAudioUpload>()("VoiceAudioUpload", {
    url: [true, false],
    method: [true, false],
    headers: [true, false],
    maxBytes: [true, false],
    expiresAt: [true, false],
  }),
  shape<VoiceAudioPreview>()("VoiceAudioPreview", {
    url: [true, false],
    contentType: [true, false],
    expiresAt: [true, false],
  }),
  shape<VoiceProviderCredential>()("VoiceProviderCredential", {
    id: [true, false],
    projectId: [true, true],
    provider: [true, false],
    label: [true, false],
    keyFingerprint: [true, false],
    status: [true, false],
    verifiedAt: [true, true],
    lastError: [true, true],
    revision: [true, false],
    createdAt: [true, false],
    updatedAt: [true, false],
  }),
  shape<CreateVoiceAudioUploadInput>()(
    "CreateVoiceAudioUploadRequest",
    {
      name: [true, false],
      contentType: [true, false],
      sizeBytes: [true, false],
      retentionDays: [false, false],
    },
    // The resource binds projectId from its client or separate method argument.
    ["projectId"],
  ),
  shape<SynthesizeVoiceAudioInput>()(
    "SynthesizeVoiceAudioRequest",
    {
      name: [true, false],
      text: [true, false],
      provider: [true, false],
      voiceId: [true, false],
      model: [false, false],
      credentialId: [false, false],
      retentionDays: [false, false],
    },
    ["projectId"],
  ),
  shape<UpdateVoiceAudioInput>()("UpdateVoiceAudioRequest", {
    expectedRevision: [false, false],
    name: [false, false],
    retentionDays: [false, true],
  }),
  shape<CreateVoiceProviderCredentialInput>()(
    "CreateVoiceProviderCredentialRequest",
    {
      provider: [true, false],
      label: [true, false],
      apiKey: [true, false],
      projectId: [false, true],
    },
  ),
];

describe("pinned voice contract", () => {
  it.each(shapes)(
    "matches $name required and nullable fields",
    ({ name, fields, omit }) => {
      const value = schema(name);
      const actual = Object.fromEntries(
        Object.entries(value.properties ?? {})
          .filter(([key]) => !omit.includes(key))
          .map(([key, property]) => [
            key,
            [
              (value.required ?? []).includes(key),
              resolve(property).nullable === true,
            ],
          ]),
      );
      expect(actual).toEqual(fields);
    },
  );

  it("restricts input enums to the values the pinned API accepts", () => {
    expect(schema("VoiceAudioStatus").enum).toEqual(VOICE_AUDIO_STATUSES);
    expect(schema("VoiceAudioContentType").enum).toEqual(
      VOICE_AUDIO_UPLOAD_CONTENT_TYPES,
    );
    expect(schema("VoiceProvider").enum).toEqual(VOICE_PROVIDERS);
    expectTypeOf<ListVoiceAudioParams["status"]>().toEqualTypeOf<
      KnownVoiceAudioStatus | undefined
    >();
    expectTypeOf<
      CreateVoiceAudioUploadInput["contentType"]
    >().toEqualTypeOf<KnownVoiceAudioUploadContentType>();
    expectTypeOf<
      CreateVoiceProviderCredentialInput["provider"]
    >().toEqualTypeOf<KnownVoiceProvider>();
    expectTypeOf<
      VoiceAudioPreview["contentType"]
    >().toEqualTypeOf<"audio/ogg">();
    expect(schema("VoiceAudioPreview").properties?.contentType?.enum).toEqual([
      "audio/ogg",
    ]);
    expectTypeOf<"future-model">().not.toExtend<ElevenLabsTtsModel>();
    expectTypeOf<"future-model">().not.toExtend<OpenAiTtsModel>();
    expectTypeOf<"future-voice">().not.toExtend<OpenAiTtsVoice>();
  });
});
