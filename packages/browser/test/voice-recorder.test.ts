import { describe, expect, it, vi } from "vitest";
import {
  VoiceNoteRecorder,
  voiceNoteName,
  type MediaRecorderConstructor,
} from "../src/index.js";

function fakeMedia(options: { readonly types?: readonly string[] } = {}) {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const recorders: FakeRecorder[] = [];
  class FakeRecorder {
    static isTypeSupported(type: string) {
      return (options.types ?? ["audio/webm;codecs=opus"]).includes(type);
    }
    state: "inactive" | "recording" = "inactive";
    ondataavailable: ((event: { data: Blob }) => void) | null = null;
    onstop: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(
      readonly stream: MediaStream,
      readonly options?: { mimeType?: string },
    ) {
      recorders.push(this);
    }
    get mimeType() {
      return this.options?.mimeType ?? "";
    }
    start = vi.fn(() => {
      this.state = "recording";
    });
    stop = vi.fn(() => {
      this.state = "inactive";
      this.ondataavailable?.({ data: new Blob(["voice"]) });
      this.onstop?.();
    });
  }
  const analyser = {
    fftSize: 0,
    frequencyBinCount: 4,
    getByteTimeDomainData: (samples: Uint8Array) => samples.fill(200),
  };
  const close = vi.fn(async () => undefined);
  class FakeAudio {
    createAnalyser = () => analyser;
    createMediaStreamSource = () => ({ connect: vi.fn() });
    close = close;
  }
  let clock = 1_000;
  const frames: (() => void)[] = [];
  const getUserMedia = vi.fn(async () => stream);
  return {
    track,
    recorders,
    close,
    getUserMedia,
    advance(ms: number) {
      clock += ms;
      const pending = frames.splice(0);
      for (const frame of pending) frame();
    },
    options: {
      mediaDevices: { getUserMedia },
      MediaRecorder: FakeRecorder as unknown as MediaRecorderConstructor,
      AudioContext: FakeAudio as never,
      requestAnimationFrame: (callback: () => void) => {
        frames.push(callback);
        return frames.length;
      },
      cancelAnimationFrame: vi.fn(),
      now: () => clock,
      updateInterval: 0,
    },
  };
}

describe("VoiceNoteRecorder", () => {
  it("reports support from getUserMedia and MediaRecorder", () => {
    const media = fakeMedia();
    expect(VoiceNoteRecorder.isSupported(media.options)).toBe(true);
    expect(
      VoiceNoteRecorder.isSupported({
        mediaDevices: {} as never,
        MediaRecorder: media.options.MediaRecorder,
      }),
    ).toBe(false);
  });

  it("records, meters, and stops with a webm file and released tracks", async () => {
    const media = fakeMedia();
    const recorder = new VoiceNoteRecorder(media.options);
    await recorder.start();
    expect(media.getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(recorder.getSnapshot()).toMatchObject({
      status: "recording",
      mimeType: "audio/webm",
    });
    media.advance(65_000);
    expect(recorder.getSnapshot().elapsed).toBe(65_000);
    expect(recorder.getSnapshot().level).toBeGreaterThan(0);
    const file = await recorder.stop();
    expect(file).toBeInstanceOf(File);
    expect(file?.type).toBe("audio/webm");
    expect(file?.name).toMatch(/^voice-note-\d{4}-\d{2}-\d{2}T[\d-]+Z\.webm$/);
    expect(await file?.text()).toBe("voice");
    expect(media.track.stop).toHaveBeenCalled();
    expect(media.close).toHaveBeenCalled();
    expect(recorder.getSnapshot()).toMatchObject({ status: "idle", level: 0 });
  });

  it("picks ogg when webm is unsupported", async () => {
    const media = fakeMedia({ types: ["audio/ogg;codecs=opus"] });
    const recorder = new VoiceNoteRecorder(media.options);
    await recorder.start();
    const file = await recorder.stop();
    expect(file?.type).toBe("audio/ogg");
    expect(file?.name.endsWith(".ogg")).toBe(true);
    expect(voiceNoteName("audio/webm", 0)).toBe(
      "voice-note-1970-01-01T00-00-00-000Z.webm",
    );
  });

  it("cancels without producing a file", async () => {
    const media = fakeMedia();
    const recorder = new VoiceNoteRecorder(media.options);
    await recorder.start();
    recorder.cancel();
    expect(recorder.getSnapshot().status).toBe("idle");
    expect(media.track.stop).toHaveBeenCalled();
    expect(await recorder.stop()).toBeUndefined();
  });

  it("reports permission denial and missing devices", async () => {
    const media = fakeMedia();
    media.getUserMedia.mockRejectedValueOnce(
      Object.assign(new Error("denied"), { name: "NotAllowedError" }),
    );
    const recorder = new VoiceNoteRecorder(media.options);
    await recorder.start();
    expect(recorder.getSnapshot()).toMatchObject({
      status: "error",
      error: "permission-denied",
    });
    media.getUserMedia.mockRejectedValueOnce(
      Object.assign(new Error("none"), { name: "NotFoundError" }),
    );
    await recorder.start();
    expect(recorder.getSnapshot().error).toBe("unavailable");
    const unsupported = new VoiceNoteRecorder({
      mediaDevices: {} as never,
    });
    await unsupported.start();
    expect(unsupported.getSnapshot().error).toBe("unavailable");
  });

  it("stops tracks on dispose, including a late permission grant", async () => {
    const media = fakeMedia();
    const recorder = new VoiceNoteRecorder(media.options);
    await recorder.start();
    recorder.dispose();
    expect(media.track.stop).toHaveBeenCalledTimes(1);
    expect(media.recorders[0]?.stop).toHaveBeenCalled();

    const late = fakeMedia();
    let grant: ((stream: MediaStream) => void) | undefined;
    late.getUserMedia.mockImplementationOnce(
      () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve;
        }),
    );
    const pending = new VoiceNoteRecorder(late.options);
    const started = pending.start();
    pending.dispose();
    grant?.({ getTracks: () => [late.track] } as unknown as MediaStream);
    await started;
    expect(late.track.stop).toHaveBeenCalled();
    expect(late.recorders).toHaveLength(0);
  });
});
