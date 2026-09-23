import { readFile } from "node:fs/promises";

import { Client, PolymorfaError } from "@polymorfa/sdk";

// Voice Automation is a beta for enrolled teams. The credential needs
// voice:read and voice:manage.
const apiKey = process.env.POLYMORFA_API_KEY;
const projectId = process.env.POLYMORFA_PROJECT_ID;
if (apiKey === undefined || projectId === undefined) {
  throw new Error("Set POLYMORFA_API_KEY and POLYMORFA_PROJECT_ID.");
}

const platform = new Client({
  credential: { type: "organizationApiKey", value: apiKey },
});
const project = platform.project(projectId);

async function main(): Promise<void> {
  // 1. Upload a recording. The SDK sends the file to the upload URL without
  //    your API key, then starts transcoding.
  const file = process.argv[2];
  if (file !== undefined) {
    const { data: uploaded } = await project.voice.audio.upload({
      name: "Welcome message",
      contentType: file.endsWith(".wav") ? "audio/wav" : "audio/mpeg",
      body: await readFile(file),
    });
    const { data } = await project.voice.audio.waitUntilReady(uploaded.id);
    console.log(`Upload ${data.id}: ${data.status}`, data.failureReason ?? "");
  }

  // 2. Store your own ElevenLabs key for this project. The key is write-only;
  //    only its fingerprint comes back.
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY;
  let credentialId: string | undefined;
  if (elevenLabsKey !== undefined) {
    const { data: credential } = await project.voice.providerCredentials.create(
      { provider: "elevenlabs", label: "Example", apiKey: elevenLabsKey },
    );
    credentialId = credential.id;
    console.log(
      `Credential ${credential.keyFingerprint}: ${credential.status}`,
    );
  }

  // 3. Render text to speech, with your key when stored, else the managed key.
  const { data: spoken } = await project.voice.audio.synthesize(
    credentialId === undefined
      ? {
          name: "Opening hours",
          text: "We are open from nine to five, Monday to Friday.",
          provider: "openai",
          voiceId: "coral",
        }
      : {
          name: "Opening hours",
          text: "We are open from nine to five, Monday to Friday.",
          provider: "elevenlabs",
          voiceId: "21m00Tcm4TlvDq8ikWAM",
          credentialId,
        },
  );
  const { data: ready } = await project.voice.audio.waitUntilReady(spoken.id);
  if (ready.status === "ready") {
    const { data: preview } = await project.voice.audio.previewUrl(ready.id);
    console.log(`Preview (5 minutes): ${preview.url}`);
  } else {
    console.log(`Speech ${ready.id}: ${ready.status}`, ready.failureReason);
  }

  // 4. List the library.
  for await (const item of await project.voice.audio.list({ limit: 50 })) {
    console.log(item.id, item.name, item.status, item.durationMs);
  }
}

main().catch((error: unknown) => {
  if (error instanceof PolymorfaError && error.code === "voice_not_enabled") {
    console.error("This team is not enrolled in the Voice Automation beta.");
  } else {
    console.error(error);
  }
  process.exitCode = 1;
});
