import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MediaStateCommands,
  type MediaStateRequest,
} from "../src/media-state.js";

afterEach(() => vi.useRealTimers());
describe("acknowledged media controls", () => {
  it("serializes only validated preferences and snapshots queued updates", async () => {
    const send = vi.fn(() => false);
    const commands = new MediaStateCommands(send);
    await expect(
      commands.set({ audioMuted: "true" as unknown as boolean }),
    ).rejects.toThrow(TypeError);
    expect(send).not.toHaveBeenCalled();
    const input = { audioMuted: true, type: "raw", requestId: "chosen" };
    const result = commands.set(input);
    input.audioMuted = false;
    await expect(result).rejects.toMatchObject({
      code: "media_control_unknown",
    });
    expect(send).toHaveBeenCalledWith({
      type: "media_state",
      requestId: expect.not.stringMatching(/^chosen$/),
      audioMuted: true,
    });
  });
  it("serializes updates and resolves only the matching acknowledgment", async () => {
    const sent: MediaStateRequest[] = [];
    const commands = new MediaStateCommands((frame) => {
      sent.push(frame);
      return true;
    });
    const first = commands.set({ audioMuted: true });
    const second = commands.set({ videoEnabled: true });
    await Promise.resolve();
    expect(sent).toHaveLength(1);
    commands.receive({
      type: "media_state",
      requestId: "unrelated",
      audioMuted: false,
      videoEnabled: false,
    });
    expect(sent).toHaveLength(1);
    commands.receive({
      type: "media_state",
      requestId: sent[0]!.requestId,
      audioMuted: true,
      videoEnabled: false,
    });
    await expect(first).resolves.toEqual({
      audioMuted: true,
      videoEnabled: false,
    });
    for (let i = 0; i < 5; i++) await Promise.resolve();
    expect(sent).toHaveLength(2);
    commands.receive({
      type: "media_error",
      requestId: sent[1]!.requestId,
      code: "video_publisher_busy",
    });
    await expect(second).rejects.toMatchObject({
      code: "video_publisher_busy",
    });
  });
  it("does not replay an uncertain command and closes queued work", async () => {
    vi.useFakeTimers();
    const send = vi.fn(() => true);
    const commands = new MediaStateCommands(send);
    const result = commands.set({ videoEnabled: true });
    const failure = expect(result).rejects.toMatchObject({
      code: "media_control_unknown",
    });
    await vi.advanceTimersByTimeAsync(5000);
    await failure;
    expect(send).toHaveBeenCalledTimes(1);
    commands.close();
    await expect(commands.set({ audioMuted: true })).rejects.toMatchObject({
      code: "media_control_unavailable",
    });
  });
});
