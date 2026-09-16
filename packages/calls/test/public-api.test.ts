import { describe, expect, it } from "vitest";
import * as publicApi from "../src/index.js";
import { Call } from "../src/internal.js";
import { fakeApi } from "./helpers.js";

describe("@polymorfa/calls public entry point", () => {
  it("exports only neutral calling operations", () => {
    expect(Object.keys(publicApi).sort()).toEqual([
      "AudioTrack",
      "Call",
      "CallClaimedError",
      "CallsApiError",
      "CallsAuthError",
      "CallsClient",
      "CallsDisabledError",
      "CallsError",
      "DEFAULT_SAMPLE_RATE",
      "VideoTrack",
    ]);
  });

  it("reports video sources and frames without transport details", () => {
    const call = new Call({
      id: "C",
      session: "s",
      direction: "inbound",
      peer: "",
      video: true,
      api: fakeApi(),
      media: {},
    });
    const sources: unknown[] = [];
    const frames: unknown[] = [];
    call.video.on("source", (source) => sources.push(source));
    call.video.on("frame", (frame) => frames.push(frame));
    call.video._source({
      source: 4,
      connectionId: "tab-conn-1",
      connectionParticipant: "client:tab-1",
    });
    call.video._source({
      source: 5,
      participant: {
        id: "123",
        phoneNumber: "+15550100",
        audioMuted: false,
        video: true,
        state: "connected",
      },
    });
    const data = new Uint8Array([0, 0, 0, 1, 0x65]);
    call.video._frame({
      codec: 1,
      source: 4,
      keyframe: true,
      timestampUs: 10,
      data,
    });
    expect(sources).toEqual([
      {
        id: 4,
        label: "client:tab-1",
        connectionId: "tab-conn-1",
        connectionParticipant: "client:tab-1",
      },
      {
        id: 5,
        label: "+15550100",
        participant: expect.objectContaining({ id: "123" }),
      },
    ]);
    expect(frames).toEqual([
      { source: 4, keyframe: true, timestampUs: 10, data },
    ]);
  });
});
