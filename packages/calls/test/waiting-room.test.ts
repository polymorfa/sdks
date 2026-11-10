import { afterEach, expect, it, vi } from "vitest";
import {
  WaitingRoomCommands,
  type WaitingRoomRequest,
} from "../src/waiting-room.js";
import { parseMediaControl } from "../src/protocol.js";

afterEach(() => vi.useRealTimers());

it("validates public targets, orders commands and matches acknowledgements", async () => {
  const frames: WaitingRoomRequest[] = [];
  const commands = new WaitingRoomCommands((frame) => {
    frames.push(frame);
    return true;
  });
  await expect(
    commands.execute({ operation: "admit", participantId: "222@lid" }),
  ).rejects.toThrow(TypeError);
  const first = commands.execute({ operation: "admit", participantId: "123" });
  const second = commands.execute({ operation: "toggle", enabled: false });
  await Promise.resolve();
  expect(frames).toHaveLength(1);
  commands.receive({
    type: "waiting_room_result",
    requestId: "unrelated",
    ok: true,
  });
  expect(frames).toHaveLength(1);
  commands.receive({
    type: "waiting_room_result",
    requestId: frames[0]!.requestId,
    ok: true,
  });
  await first;
  await vi.waitFor(() => expect(frames).toHaveLength(2));
  commands.receive({
    type: "waiting_room_result",
    requestId: frames[1]!.requestId,
    ok: false,
    code: "waiting_room_admin_required",
  });
  await expect(second).rejects.toMatchObject({
    code: "waiting_room_admin_required",
  });
  commands.close();
});

it("does not retry uncertain commands and rejects queued commands after close", async () => {
  vi.useFakeTimers();
  const send = vi.fn(() => true);
  const commands = new WaitingRoomCommands(send);
  const request = commands.execute({ operation: "deny", participantId: "123" });
  const failed = expect(request).rejects.toMatchObject({
    code: "waiting_room_control_unknown",
  });
  await vi.advanceTimersByTimeAsync(5000);
  await failed;
  expect(send).toHaveBeenCalledTimes(1);
  const active = commands.execute({ operation: "toggle", enabled: true });
  const activeFailed = expect(active).rejects.toThrow();
  const queued = commands.execute({ operation: "admit", participantId: "123" });
  const queuedFailed = expect(queued).rejects.toThrow();
  await Promise.resolve();
  commands.close();
  await Promise.all([activeFailed, queuedFailed]);
  expect(send).toHaveBeenCalledTimes(2);
});

it("accepts guest waiting identities without phones and rejects malformed metadata", () => {
  const frame = {
    type: "waiting_room",
    state: {
      enabled: true,
      isAdmin: true,
      inWaitingRoom: false,
      users: [{ id: "123", state: "invited", audioMuted: false, video: false, guest: true, name: "<Guest>" }],
    },
  };
  expect(parseMediaControl(JSON.stringify(frame))).toEqual(frame);
  frame.state.users[0]!.guest = "yes" as unknown as boolean;
  expect(parseMediaControl(JSON.stringify(frame))).toBeUndefined();
});
