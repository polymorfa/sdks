// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CallsController,
  IncomingCallRelay,
  createSignalingCallsBackend,
  type CallMediaFactory,
  type CallMediaSession,
  type CallsSignaling,
} from "@polymorfa/browser";
import { createLocale } from "@polymorfa/ui";
import {
  CallControls,
  CallSurface,
  DialPad,
  PolymorfaProvider,
  formatDuration,
} from "../src/index.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function fixture() {
  const relay = new IncomingCallRelay();
  const signaling: CallsSignaling = {
    offer: vi.fn(async () => ({ sdp: "v=0", iceServers: [] })),
    candidate: vi.fn(async () => undefined),
    candidates: vi.fn(async () => []),
    teardown: vi.fn(async () => undefined),
  };
  const session: CallMediaSession = {
    localStream: new MediaStream(),
    remoteStream: new MediaStream(),
    setMuted: vi.fn(),
    audioEnabled: () => true,
    videoEnabled: () => true,
    close: vi.fn(async () => undefined),
  };
  const media: CallMediaFactory = { open: vi.fn(async () => session) };
  const controller = new CallsController(
    createSignalingCallsBackend({
      signaling,
      incoming: relay,
      createCallId: () => "call-out",
    }),
    media,
  );
  controller.initialize();
  return { relay, signaling, session, media, controller };
}

const roots: Root[] = [];
function mount(node: React.ReactNode): HTMLElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(node));
  return host;
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

describe("Calls UI", () => {
  it("shows the incoming card with the resolved name and declines over the wire", async () => {
    const f = fixture();
    const host = mount(
      <PolymorfaProvider locale={createLocale("en")}>
        <CallSurface
          controller={f.controller}
          resolveName={(peer) =>
            peer === "+12025550123" ? "Casey Rivera" : undefined
          }
        />
      </PolymorfaProvider>,
    );
    expect(host.querySelector("[data-pmfa='call-surface']")).toBeNull();

    act(() =>
      f.relay.receive({ callId: "CALL-1", from: "+12025550123", video: false }),
    );
    const card = host.querySelector("[role='alertdialog']");
    expect(card?.getAttribute("aria-label")).toBe(
      "Incoming call from Casey Rivera",
    );
    expect(host.textContent).toContain("WhatsApp audio call");
    expect(document.getElementById("pmfa-calls-styles")).not.toBeNull();
    // Voice offers carry no pre-answer mute row (slim card).
    expect(host.querySelector("[aria-label='Answer muted']")).toBeNull();

    await act(async () => {
      (
        host.querySelector("[aria-label='Reject']") as HTMLButtonElement
      ).click();
    });
    expect(f.signaling.teardown).toHaveBeenCalledWith(
      "CALL-1",
      expect.any(AbortSignal),
    );
    expect(host.querySelector("[role='alertdialog']")).toBeNull();
    expect(f.controller.getSnapshot()).toMatchObject({
      status: "ended",
      endReason: "rejected",
    });
  });

  it("answers, mutes from the dock, and hangs up", async () => {
    const f = fixture();
    const host = mount(
      <PolymorfaProvider>
        <CallSurface controller={f.controller} popout={false} />
      </PolymorfaProvider>,
    );
    act(() =>
      f.relay.receive({ callId: "CALL-2", from: "+12025550123", video: false }),
    );
    await act(async () => {
      (
        host.querySelector("[aria-label='Answer']") as HTMLButtonElement
      ).click();
    });
    expect(f.media.open).toHaveBeenCalledWith(
      "CALL-2",
      false,
      expect.any(Object),
      expect.any(AbortSignal),
      { devices: {} },
    );
    expect(host.querySelector("[aria-label='Hang up']")).not.toBeNull();
    // Audio-only offers on a video-capable line still show the camera
    // upgrade affordance, disabled until the call connects.
    const camera = host.querySelector(
      "[aria-label='Turn camera on']",
    ) as HTMLButtonElement;
    expect(camera.disabled).toBe(true);

    act(() => {
      (host.querySelector("[aria-label='Mute']") as HTMLButtonElement).click();
    });
    expect(f.session.setMuted).toHaveBeenCalledWith({ audio: true });
    expect(host.querySelector("[aria-label='Unmute']")).not.toBeNull();

    await act(async () => {
      (
        host.querySelector("[aria-label='Hang up']") as HTMLButtonElement
      ).click();
    });
    expect(f.signaling.teardown).toHaveBeenCalledWith(
      "CALL-2",
      expect.any(AbortSignal),
    );
    expect(host.querySelector("[data-pmfa='call-surface']")).toBeNull();
  });

  it("dials audio or video on a linked device and audio only on the Business Calling API line", async () => {
    const f = fixture();
    const host = mount(
      <PolymorfaProvider>
        <DialPad controller={f.controller} defaultValue="+1202555" />
        <DialPad controller={f.controller} line="cloudApi" className="cloud" />
      </PolymorfaProvider>,
    );
    expect(
      host.querySelectorAll("[aria-label='Place video call']"),
    ).toHaveLength(1);
    expect(
      host.querySelectorAll("[aria-label='Place audio call']"),
    ).toHaveLength(2);

    act(() => {
      (host.querySelector("[aria-label='0']") as HTMLButtonElement).click();
    });
    await act(async () => {
      (
        host.querySelector(
          "[aria-label='Place video call']",
        ) as HTMLButtonElement
      ).click();
    });
    expect(f.controller.getSnapshot()).toMatchObject({
      status: "connecting",
      peer: "+12025550",
      direction: "outgoing",
      video: true,
      line: "linkedDevice",
    });
  });

  it("applies provider direction and dark theme classes", () => {
    const f = fixture();
    const host = mount(
      <PolymorfaProvider
        locale={createLocale("ar")}
        appearance={{ theme: "dark", variables: { colorPrimary: "#123456" } }}
      >
        <CallControls controller={f.controller} />
      </PolymorfaProvider>,
    );
    act(() => {
      f.relay.receive({ callId: "CALL-3", from: "+12025550123", video: true });
    });
    // Controls only render on an active call; answer first.
    expect(host.querySelector(".pmfa-calls")).toBeNull();
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(65)).toBe("1:05");
  });
});
