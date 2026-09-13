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
  type CallsSnapshot,
} from "@polymorfa/browser";
import { createLocale } from "@polymorfa/ui";
import {
  CallControls,
  CallSurface,
  DialPad,
  IncomingCallCard,
  PolymorfaProvider,
  formatDuration,
  useCallDuration,
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
      place: async () => "call-out",
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

/**
 * Collect unhandled rejections for one test. Registered centrally so the
 * listener is removed even when an assertion fails — left attached it would go
 * on swallowing Node's reporting for every later test in the file.
 */
const rejectionWatchers: ((reason: unknown) => void)[] = [];
function watchRejections(): unknown[] {
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => rejections.push(reason);
  process.on("unhandledRejection", onRejection);
  rejectionWatchers.push(onRejection);
  return rejections;
}

const errorWatchers: ((event: ErrorEvent) => void)[] = [];
/** Collect window `error` events for one test; removed by afterEach even on failure. */
function watchErrors(): unknown[] {
  const errors: unknown[] = [];
  const onError = (event: ErrorEvent) => {
    errors.push(event.error);
    event.preventDefault();
  };
  globalThis.addEventListener("error", onError);
  errorWatchers.push(onError);
  return errors;
}

afterEach(() => {
  for (const onError of errorWatchers.splice(0))
    globalThis.removeEventListener("error", onError);
  for (const onRejection of rejectionWatchers.splice(0))
    process.off("unhandledRejection", onRejection);
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
  // Unconditionally, so a failed assertion inside a fake-timer test cannot
  // leak them into the rest of the file.
  vi.useRealTimers();
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

  it("clears the pre-answer toggles when the next call arrives", async () => {
    const f = fixture();
    // Mounted directly, as the composition entry point documents. CallSurface
    // returns null between calls and so unmounts the card for free; a host
    // that composes the card itself keeps it mounted throughout.
    const host = mount(
      <PolymorfaProvider locale={createLocale("en")}>
        <IncomingCallCard controller={f.controller} />
      </PolymorfaProvider>,
    );

    act(() =>
      f.relay.receive({ callId: "CALL-1", from: "+12025550123", video: true }),
    );
    await act(async () => {
      (
        host.querySelector("[aria-label='Answer muted']") as HTMLButtonElement
      ).click();
    });
    expect(host.querySelector("[aria-label='Answer unmuted']")).not.toBeNull();
    await act(async () => {
      (
        host.querySelector("[aria-label='Reject']") as HTMLButtonElement
      ).click();
    });

    act(() =>
      f.relay.receive({ callId: "CALL-2", from: "+15550100", video: true }),
    );
    // The card returns null between calls rather than unmounting, so a stale
    // toggle would mute this call on answer with nothing on screen saying so.
    expect(host.querySelector("[aria-label='Answer muted']")).not.toBeNull();
    expect(host.querySelector("[aria-label='Answer unmuted']")).toBeNull();
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

  it("ignores Enter in the dial input while a call is up", async () => {
    const f = fixture();
    const host = mount(
      <PolymorfaProvider locale={createLocale("en")}>
        <DialPad controller={f.controller} defaultValue="+12025550123" />
      </PolymorfaProvider>,
    );
    const input = host.querySelector(".pmfa-calls-input") as HTMLInputElement;
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(f.controller.getSnapshot().status).toBe("connecting");
    expect(f.media.open).toHaveBeenCalledTimes(1);

    // The buttons are disabled now, but the input keeps focus and its value.
    // place() aborts the live operation, so a second Enter would drop the
    // call in progress and dial again.
    await act(async () => {
      input.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(f.media.open).toHaveBeenCalledTimes(1);
    expect(f.session.close).not.toHaveBeenCalled();
  });

  it("localizes the default device option", async () => {
    const f = fixture();
    (f.media as { listDevices?: unknown }).listDevices = async () => [
      { deviceId: "mic-1", kind: "audioinput" as const, label: "Desk mic" },
    ];
    const host = mount(
      <PolymorfaProvider
        locale={createLocale("ar", { "calls.defaultDevice": "افتراضي" })}
      >
        <CallControls controller={f.controller} />
      </PolymorfaProvider>,
    );
    await act(async () => {
      await f.controller.place("+12025550123");
    });
    await act(async () => {
      (
        host.querySelector(
          "[aria-label='Microphone and speaker settings']",
        ) as HTMLButtonElement
      ).click();
    });
    // Every other label in this panel goes through the locale; this one was
    // hardcoded English and stayed so in an RTL locale.
    const option = host.querySelector(
      ".pmfa-calls-select option",
    ) as HTMLOptionElement;
    expect(option.textContent).toBe("افتراضي");
  });

  it("keeps the duration running while the call is reconnecting", () => {
    // Pinned: measuring against real time, a render crossing a second
    // boundary would read 6 and fail this intermittently.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-06T12:00:00.000Z"));
    const now = Date.now();
    function Probe({ status }: { status: CallsSnapshot["status"] }) {
      return (
        <span>{useCallDuration({ status, connectedAt: now - 5_000 })}</span>
      );
    }
    const host = mount(<Probe status="connected" />);
    expect(host.textContent).toBe("5");
    // The controller holds connectedAt across a flap, so a consumer that shows
    // the duration during reconnecting must not see it reset to zero.
    act(() => {
      for (const root of roots) root.render(<Probe status="reconnecting" />);
    });
    expect(host.textContent).toBe("5");
    act(() => {
      for (const root of roots) root.render(<Probe status="ended" />);
    });
    expect(host.textContent).toBe("0");
  });

  it("keeps the in-call stage layout while reconnecting", async () => {
    const f = fixture();
    let ice: ((state: RTCIceConnectionState) => void) | undefined;
    let connection: ((state: RTCPeerConnectionState) => void) | undefined;
    (f.media.open as ReturnType<typeof vi.fn>).mockImplementation(
      async (_id, _video, callbacks) => {
        ice = callbacks.onIceConnectionState;
        connection = callbacks.onConnectionState;
        return f.session;
      },
    );
    const host = mount(
      <PolymorfaProvider locale={createLocale("en")}>
        <CallSurface controller={f.controller} />
      </PolymorfaProvider>,
    );
    await act(async () => {
      await f.controller.place("+12025550123", { video: true });
    });
    act(() => connection?.("connected"));
    expect(host.querySelector(".pmfa-calls-hero-preview")).toBeNull();

    act(() => ice?.("disconnected"));
    expect(f.controller.getSnapshot().status).toBe("reconnecting");
    // The call is established; a flap must not drop it back to the pre-answer
    // hero preview that belongs to a call which never connected.
    expect(host.querySelector(".pmfa-calls-hero-preview")).toBeNull();
    f.controller.dispose();
  });

  it("announces a placed call only when one was actually placed", async () => {
    const placed: string[] = [];
    const ok = fixture();
    const host = mount(
      <PolymorfaProvider locale={createLocale("en")}>
        <DialPad
          controller={ok.controller}
          defaultValue="+12025550123"
          onPlaced={(to) => placed.push(to)}
        />
      </PolymorfaProvider>,
    );
    await act(async () => {
      (
        host.querySelector(
          "[aria-label='Place audio call']",
        ) as HTMLButtonElement
      ).click();
    });
    expect(placed).toEqual(["+12025550123"]);

    const badController = new CallsController(
      createSignalingCallsBackend({
        signaling: {
          offer: vi.fn(async () => ({ sdp: "v=0", iceServers: [] })),
          candidate: vi.fn(async () => undefined),
          candidates: vi.fn(async () => []),
          teardown: vi.fn(async () => undefined),
        },
        incoming: new IncomingCallRelay(),
        place: async () => {
          throw new Error("route down");
        },
      }),
      { open: vi.fn() } as unknown as CallMediaFactory,
    );
    badController.initialize();
    const failing = mount(
      <PolymorfaProvider locale={createLocale("en")}>
        <DialPad
          controller={badController}
          defaultValue="+15550100"
          onPlaced={(to) => placed.push(to)}
        />
      </PolymorfaProvider>,
    );
    await act(async () => {
      (
        failing.querySelector(
          "[aria-label='Place audio call']",
        ) as HTMLButtonElement
      ).click();
    });
    // place() resolves even on failure, so announcing on resolution alone told
    // the application a call had been placed when none had.
    expect(badController.getSnapshot().status).toBe("error");
    expect(placed).toEqual(["+12025550123"]);
    ok.controller.dispose();
    badController.dispose();
  });

  it("applies provider direction and dark theme classes", async () => {
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
    // The controls only render on an active call, so the assertions below say
    // nothing until it is answered.
    expect(host.querySelector(".pmfa-calls")).toBeNull();
    await act(async () => {
      await f.controller.answer();
    });
    const root = host.querySelector(".pmfa-calls") as HTMLElement;
    expect(root).not.toBeNull();
    expect(root.getAttribute("dir")).toBe("rtl");
    expect(root.className).toContain("pmfa-calls-dark");
    expect(root.style.getPropertyValue("--pmfa-color-primary")).toBe("#123456");
  });

  it("absorbs a dial against a disposed controller", async () => {
    const rejections = watchRejections();
    const f = fixture();
    const host = mount(
      <PolymorfaProvider locale={createLocale("en")}>
        <DialPad controller={f.controller} defaultValue="+12025550123" />
      </PolymorfaProvider>,
    );
    // A pad left mounted against a shared controller that has been disposed:
    // place() rejects out of #begin()'s assertActive, before the try block
    // that turns every other failure into a snapshot.
    f.controller.dispose();
    await act(async () => {
      (
        host.querySelector(
          "[aria-label='Place audio call']",
        ) as HTMLButtonElement
      ).click();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rejections).toEqual([]);
  });

  it("absorbs a hang-up against a disposed controller", async () => {
    const rejections = watchRejections();
    const f = fixture();
    const host = mount(
      <PolymorfaProvider locale={createLocale("en")}>
        <CallControls controller={f.controller} />
      </PolymorfaProvider>,
    );
    act(() => {
      f.relay.receive({ callId: "CALL-4", from: "+12025550123", video: false });
    });
    await act(async () => {
      await f.controller.answer();
    });
    const button = host.querySelector(
      "[aria-label='Hang up']",
    ) as HTMLButtonElement;
    // #finish transitions after its await, so a controller disposed under a
    // still-mounted dock makes hangup() reject.
    f.controller.dispose();
    await act(async () => {
      button.click();
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rejections).toEqual([]);
  });

  it("absorbs mute clicks against a disposed controller", async () => {
    const errors = watchErrors();
    const f = fixture();
    const host = mount(
      <PolymorfaProvider locale={createLocale("en")}>
        <CallControls controller={f.controller} />
      </PolymorfaProvider>,
    );
    act(() => {
      f.relay.receive({ callId: "CALL-5", from: "+12025550123", video: true });
    });
    await act(async () => {
      await f.controller.answer();
    });
    // setMuted asserts the controller is live and throws synchronously; the
    // dock stays mounted on the last snapshot, so its buttons stay clickable.
    f.controller.dispose();
    for (const label of ["Mute", "Turn camera off"]) {
      const button = host.querySelector(
        `[aria-label='${label}']`,
      ) as HTMLButtonElement | null;
      expect(() => button?.click()).not.toThrow();
    }
    expect(errors).toEqual([]);
  });

  it("formats call durations", () => {
    expect(formatDuration(3725)).toBe("1:02:05");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(0)).toBe("0:00");
  });
});

describe("failed call controls", () => {
  it.each(["Reject", "Hang up"])(
    "keeps %s visible and media alive until retry succeeds",
    async (label) => {
      const f = fixture();
      const host = mount(
        <PolymorfaProvider>
          <CallSurface controller={f.controller} popout={false} />
        </PolymorfaProvider>,
      );
      act(() =>
        f.relay.receive({
          callId: "CALL-RETRY",
          from: "+15550100",
          video: false,
        }),
      );
      if (label === "Hang up")
        await act(async () => {
          await f.controller.answer();
        });
      vi.mocked(f.signaling.teardown).mockRejectedValueOnce(
        new Error("temporarily unavailable"),
      );
      await act(async () => {
        (
          host.querySelector(`[aria-label='${label}']`) as HTMLButtonElement
        ).click();
      });
      expect(host.querySelector(`[aria-label='${label}']`)).not.toBeNull();
      expect(host.textContent).toContain("Could not end the call. Try again.");
      expect(f.session.close).not.toHaveBeenCalled();
      await act(async () => {
        (
          host.querySelector(`[aria-label='${label}']`) as HTMLButtonElement
        ).click();
      });
      expect(f.signaling.teardown).toHaveBeenCalledTimes(2);
      expect(f.controller.getSnapshot().status).toBe("ended");
      expect(f.controller.getSnapshot().error).toBeUndefined();
      expect(host.querySelector("[data-pmfa='call-surface']")).toBeNull();
      f.controller.dispose();
    },
  );
});

it("finishes pending media setup after a refused hangup", async () => {
  const f = fixture();
  let resolveMedia!: (session: CallMediaSession) => void;
  vi.mocked(f.media.open).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveMedia = resolve;
      }),
  );
  const host = mount(
    <PolymorfaProvider>
      <CallSurface controller={f.controller} popout={false} />
    </PolymorfaProvider>,
  );
  act(() =>
    f.relay.receive({
      callId: "CALL-PENDING",
      from: "+15550100",
      video: false,
    }),
  );
  let answer!: Promise<void>;
  await act(async () => {
    answer = f.controller.answer();
    await Promise.resolve();
  });
  vi.mocked(f.signaling.teardown).mockRejectedValueOnce(
    new Error("temporarily unavailable"),
  );
  await act(async () => {
    (host.querySelector("[aria-label='Hang up']") as HTMLButtonElement).click();
  });
  await act(async () => {
    resolveMedia(f.session);
    await answer;
  });
  expect(f.controller.localStream).toBe(f.session.localStream);
  expect(f.session.close).not.toHaveBeenCalled();
  expect(host.querySelector("[aria-label='Hang up']")).not.toBeNull();
  await act(async () => {
    await f.controller.hangup();
  });
  f.controller.dispose();
});

it("ends after successful remote hangup even when local media cleanup fails", async () => {
  const f = fixture();
  const host = mount(
    <PolymorfaProvider>
      <CallSurface controller={f.controller} popout={false} />
    </PolymorfaProvider>,
  );
  act(() =>
    f.relay.receive({
      callId: "CALL-CLOSE-FAIL",
      from: "+15550100",
      video: false,
    }),
  );
  await act(async () => {
    await f.controller.answer();
  });
  vi.mocked(f.signaling.teardown).mockRejectedValueOnce(new Error("try again"));
  await act(async () => {
    await f.controller.hangup();
  });
  vi.mocked(f.session.close).mockRejectedValueOnce(
    new Error("media close failed"),
  );
  await act(async () => {
    (host.querySelector("[aria-label='Hang up']") as HTMLButtonElement).click();
  });
  expect(f.controller.getSnapshot().status).toBe("ended");
  expect(f.controller.getSnapshot().error).toBeUndefined();
  expect(host.querySelector("[data-pmfa='call-surface']")).toBeNull();
  f.controller.dispose();
});

it("keeps the same status element while a control failure is visible", async () => {
  vi.useFakeTimers();
  const f = fixture();
  try {
    const host = mount(
      <PolymorfaProvider>
        <CallSurface
          controller={f.controller}
          popout={false}
          resolveName={() => "Casey Rivera"}
        />
      </PolymorfaProvider>,
    );
    act(() =>
      f.relay.receive({
        callId: "CALL-STATUS",
        from: "+15550100",
        video: false,
      }),
    );
    await act(async () => {
      await f.controller.answer();
    });
    act(() =>
      vi.mocked(f.media.open).mock.calls[0]![2].onConnectionState("connected"),
    );
    vi.mocked(f.signaling.teardown).mockRejectedValueOnce(
      new Error("try again"),
    );
    await act(async () => {
      await f.controller.hangup();
    });
    const status = host.querySelector("[role='status']");
    expect(status?.textContent).toContain("Could not end the call");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(host.querySelector("[role='status']")).toBe(status);
    await act(async () => {
      await f.controller.hangup();
    });
  } finally {
    f.controller.dispose();
    vi.useRealTimers();
  }
});
