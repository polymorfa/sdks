# Voice audio library

Uploads a recording, stores an ElevenLabs key, renders text-to-speech and
lists the audio library of one project with `@polymorfa/sdk`.

Voice Automation is a beta. Only teams enrolled in it can create audio or
provider credentials; other teams get `voice_not_enabled`. The API key needs
the `voice:read` and `voice:manage` scopes.

```sh
export POLYMORFA_API_KEY=...        # a team API key
export POLYMORFA_PROJECT_ID=...
export ELEVENLABS_API_KEY=...       # optional; the managed OpenAI voice is used otherwise
npm install
npm start -- welcome.mp3            # the file argument is optional
```

Uploads accept MP3, WAV, Ogg and M4A files of up to 16 MiB. Assets are
transcoded to 16 kHz mono; the example waits for each to become `ready` or
`failed`. In production, use the `voice.asset_ready` and `voice.asset_failed`
webhooks instead of polling.
