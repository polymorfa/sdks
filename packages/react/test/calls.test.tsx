// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CallsController,
  IncomingCallRelay,
  createSignalingCallsBackend,
  type CallMediaFactory,
  type CallLifecycleEvent,
  type CallMediaSession,
  type CallsSignaling,
  type RemoteVideo,
  type CallsSnapshot,
} from "@polymorfa/browser/internal";
import { createLocale } from "@polymorfa/ui";
import {
  CallControls,
  CallStage,
  CallSurface,
  DialPad,
  IncomingCallCard,
  ParticipantList,
  ParticipantVideoGrid,
  PolymorfaProvider,
  formatDuration,
  useCallDuration,
} from "../src/index.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function fixture() {
  const relay = new IncomingCallRelay();
  const signaling = {
    offer: vi.fn(async () => ({ sdp: "v=0", iceServers: [] })),
    candidate: vi.fn(async () => undefined),
    candidates: vi.fn(async () => []),
    accept: vi.fn(async () => ({
      answered: true,
      answeredBy: "client:self",
      exclusive: false,
    })),
    reject: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
    end: vi.fn(async () => undefined),
  } satisfies CallsSignaling;
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
    expect(f.signaling.reject).toHaveBeenCalledWith(
      "CALL-1",
      expect.any(AbortSignal),
    );
    expect(f.signaling.end).not.toHaveBeenCalled();
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
      { devices: {}, connectionId: expect.any(String) },
    );
    expect(
      host.querySelector("[aria-label='End call for everyone']"),
    ).not.toBeNull();
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
        host.querySelector(
          "[aria-label='End call for everyone']",
        ) as HTMLButtonElement
      ).click();
    });
    expect(f.signaling.end).toHaveBeenCalledWith(
      "CALL-2",
      expect.any(AbortSignal),
    );
    expect(host.querySelector("[data-pmfa='call-surface']")).toBeNull();
  });

  it("dials audio or video, and audio only when video is not allowed", async () => {
    const f = fixture();
    const host = mount(
      <PolymorfaProvider>
        <DialPad controller={f.controller} defaultValue="+1202555" />
        <DialPad
          controller={f.controller}
          allowVideo={false}
          className="cloud"
        />
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
      status: "ringing",
      peer: "+12025550",
      direction: "outgoing",
      video: true,
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
    expect(f.controller.getSnapshot().status).toBe("ringing");
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
          leave: vi.fn(async () => undefined),
          end: vi.fn(async () => undefined),
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
      "[aria-label='End call for everyone']",
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
  it.each(["Reject", "End call for everyone"])(
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
      if (label !== "Reject")
        await act(async () => {
          await f.controller.answer();
        });
      const control = label === "Reject" ? f.signaling.reject : f.signaling.end;
      control.mockRejectedValueOnce(new Error("temporarily unavailable"));
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
      expect(control).toHaveBeenCalledTimes(2);
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
  f.signaling.end.mockRejectedValueOnce(new Error("temporarily unavailable"));
  await act(async () => {
    (
      host.querySelector(
        "[aria-label='End call for everyone']",
      ) as HTMLButtonElement
    ).click();
  });
  await act(async () => {
    resolveMedia(f.session);
    await answer;
  });
  expect(f.controller.localStream).toBe(f.session.localStream);
  expect(f.session.close).not.toHaveBeenCalled();
  expect(
    host.querySelector("[aria-label='End call for everyone']"),
  ).not.toBeNull();
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
  f.signaling.end.mockRejectedValueOnce(new Error("try again"));
  await act(async () => {
    await f.controller.hangup();
  });
  vi.mocked(f.session.close).mockRejectedValueOnce(
    new Error("media close failed"),
  );
  await act(async () => {
    (
      host.querySelector(
        "[aria-label='End call for everyone']",
      ) as HTMLButtonElement
    ).click();
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
    f.signaling.end.mockRejectedValueOnce(new Error("try again"));
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

describe("unified calls UI", () => {
  function feedFixture() {
    const listeners = new Set<(event: CallLifecycleEvent) => void>();
    const base = fixture();
    const controller = new CallsController(
      createSignalingCallsBackend({
        signaling: base.signaling,
        incoming: {
          subscribe: (listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          },
        },
      }),
      base.media,
    );
    controller.initialize();
    base.controller.dispose();
    return {
      ...base,
      controller,
      emit: (event: CallLifecycleEvent) =>
        act(() => {
          for (const listener of [...listeners]) listener(event);
        }),
    };
  }

  it("answers without a claim by default and claims when exclusive is set", async () => {
    for (const exclusive of [undefined, true]) {
      const f = feedFixture();
      const host = mount(
        <PolymorfaProvider>
          <CallSurface
            controller={f.controller}
            popout={false}
            {...(exclusive === undefined ? {} : { exclusive })}
          />
        </PolymorfaProvider>,
      );
      f.emit({
        type: "incomingCall",
        call: { callId: "CALL-X", from: "+15550100", video: false },
      });
      await act(async () => {
        (
          host.querySelector("[aria-label='Answer']") as HTMLButtonElement
        ).click();
      });
      expect(f.signaling.accept).toHaveBeenCalledWith(
        "CALL-X",
        { exclusive: exclusive === true, video: false },
        expect.any(AbortSignal),
      );
      f.controller.dispose();
    }
  });

  it("shows Join for a shared call and Dismiss, never Reject, for a claimed one", async () => {
    const f = feedFixture();
    const host = mount(
      <PolymorfaProvider>
        <IncomingCallCard
          controller={f.controller}
          resolveName={(peer) => (peer === "+15550101" ? "Dana" : undefined)}
        />
      </PolymorfaProvider>,
    );
    f.emit({
      type: "incomingCall",
      call: { callId: "A", from: "+15550100", video: false },
    });
    f.emit({
      type: "incomingCall",
      call: { callId: "B", from: "+15550101", video: false },
    });
    // The second call is listed, not declined.
    const others = host.querySelector(
      "[aria-label='Other incoming calls']",
    ) as HTMLElement;
    expect(others.textContent).toContain("Dana");
    expect(f.signaling.reject).not.toHaveBeenCalled();

    f.emit({
      type: "accepted",
      callId: "A",
      answeredBy: "client:other",
      exclusive: true,
    });
    expect(host.textContent).toContain("Answered by another participant");
    expect(host.querySelector("[aria-label='Reject']")).toBeNull();
    expect(host.querySelector("[aria-label='Answer']")).toBeNull();
    expect(host.querySelector("[aria-label='Dismiss']")).not.toBeNull();

    f.emit({ type: "accepted", callId: "B", answeredBy: "client:other" });
    act(() => {
      (
        host.querySelector("[aria-label='Dismiss']") as HTMLButtonElement
      ).click();
    });
    expect(host.textContent).toContain("Call in progress. You can join.");
    expect(host.querySelector("[aria-label='Reject']")).toBeNull();
    await act(async () => {
      (host.querySelector("[aria-label='Join']") as HTMLButtonElement).click();
    });
    expect(f.signaling.accept).toHaveBeenCalledWith(
      "B",
      { exclusive: false, video: false },
      expect.any(AbortSignal),
    );
    expect(f.signaling.reject).not.toHaveBeenCalled();
    f.controller.dispose();
  });

  it("renders one labelled video tile per remote participant with stable keys", async () => {
    const f = feedFixture();
    const streams = new Map<string, MediaStream>();
    const video = (
      key: string,
      source: number,
      owner: Partial<RemoteVideo>,
    ): RemoteVideo => {
      const stream = streams.get(key) ?? new MediaStream();
      streams.set(key, stream);
      return { key, source, mid: String(source), stream, ...owner };
    };
    const host = mount(
      <PolymorfaProvider>
        <CallStage
          controller={f.controller}
          labelVideo={(info) =>
            info.connectionId === "agent-conn-1" ? "Support agent" : undefined
          }
        />
      </PolymorfaProvider>,
    );
    f.emit({
      type: "incomingCall",
      call: { callId: "V", from: "+15550100", video: true },
    });
    await act(async () => {
      await f.controller.answer();
    });
    const callbacks = vi.mocked(f.media.open).mock.calls[0]![2];
    const participant = {
      id: "123",
      phoneNumber: "+15550100",
      audioMuted: false,
      video: true,
      state: "connected" as const,
    };
    act(() =>
      callbacks.onRemoteVideos?.([
        video("participant:123", 4, { participant }),
        video("connection:agent-conn-1", 7, { connectionId: "agent-conn-1" }),
        video("connection:tab-conn-2", 8, {
          connectionId: "tab-conn-2",
          connectionParticipant: "client:tab-2",
        }),
        video("connection:tab-conn-3", 10, { connectionId: "tab-conn-3" }),
      ]),
    );
    const grid = host.querySelector(
      "[aria-label='Participant video']",
    ) as HTMLElement;
    expect(grid.getAttribute("data-count")).toBe("4");
    const tiles = [...grid.querySelectorAll("li")];
    // Application label, then the connection's participant reference, then
    // the generic label.
    expect(tiles.map((tile) => tile.textContent)).toEqual([
      "+15550100",
      "Support agent",
      "client:tab-2",
      "Participant",
    ]);
    const first = tiles[0]!.querySelector("video") as HTMLVideoElement;
    expect(first.getAttribute("aria-label")).toBe("Video from +15550100");
    expect(first.muted).toBe(true);
    expect(first.srcObject).toBe(streams.get("participant:123"));

    // A source change for the same participant keeps the same tile element.
    act(() =>
      callbacks.onRemoteVideos?.([
        video("participant:123", 9, { participant }),
      ]),
    );
    const after = host.querySelector("[aria-label='Participant video'] video");
    expect(after).toBe(first);
    expect(
      host.querySelectorAll("[aria-label='Participant video'] li"),
    ).toHaveLength(1);

    act(() => callbacks.onRemoteVideos?.([]));
    expect(host.querySelector("[aria-label='Participant video']")).toBeNull();
    f.controller.dispose();
  });

  it("renders nothing from the grid without remote video", () => {
    const f = feedFixture();
    const host = mount(
      <PolymorfaProvider>
        <ParticipantVideoGrid controller={f.controller} />
      </PolymorfaProvider>,
    );
    expect(host.innerHTML).toBe("");
    f.controller.dispose();
  });

  it("lists participants with their state", () => {
    const f = feedFixture();
    const host = mount(
      <PolymorfaProvider>
        <ParticipantList controller={f.controller} />
      </PolymorfaProvider>,
    );
    f.emit({
      type: "incomingCall",
      call: { callId: "P", from: "+15550100", video: false },
    });
    f.emit({
      type: "participant",
      callId: "P",
      participant: {
        id: "p1",
        phoneNumber: "+15550101",
        audioMuted: true,
        video: false,
        state: "connected",
      },
    });
    f.emit({
      type: "participant",
      callId: "P",
      participant: {
        id: "p2",
        audioMuted: false,
        video: false,
        state: "ringing",
      },
    });
    const list = host.querySelector("ul") as HTMLElement;
    expect(list.getAttribute("aria-labelledby")).toBeTruthy();
    expect(
      [...list.querySelectorAll("li")].map((li) => li.textContent),
    ).toEqual(["+15550101In call · Muted", "p2Ringing"]);
    f.emit({ type: "participantLeft", callId: "P", participantId: "p1" });
    expect(host.querySelectorAll("li")).toHaveLength(1);
    f.controller.dispose();
  });

  it("offers Leave on shared calls and leaves without ending the call", async () => {
    const f = feedFixture();
    const host = mount(
      <PolymorfaProvider>
        <CallControls controller={f.controller} />
      </PolymorfaProvider>,
    );
    f.emit({
      type: "incomingCall",
      call: { callId: "L", from: "+15550100", video: false },
    });
    await act(async () => {
      await f.controller.answer();
    });
    expect(
      host.querySelector("[aria-label='End call for everyone']"),
    ).not.toBeNull();
    await act(async () => {
      (
        host.querySelector("[aria-label='Leave call']") as HTMLButtonElement
      ).click();
    });
    expect(f.session.close).toHaveBeenCalledWith({ leave: true });
    expect(f.signaling.end).not.toHaveBeenCalled();
    expect(f.controller.getSnapshot()).toMatchObject({
      status: "ended",
      endReason: "left",
    });
    f.controller.dispose();
  });

  it("disables answer controls while an answer is in flight, including for another selected call", async () => {
    const f = feedFixture();
    let finish!: () => void;
    f.signaling.accept.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              answered: true,
              answeredBy: "client:self",
              exclusive: false,
            });
        }),
    );
    const host = mount(
      <PolymorfaProvider>
        <CallSurface controller={f.controller} popout={false} />
      </PolymorfaProvider>,
    );
    f.emit({
      type: "incomingCall",
      call: { callId: "A", from: "+15550100", video: false },
    });
    f.emit({
      type: "incomingCall",
      call: { callId: "B", from: "+15550101", video: false },
    });
    const control = (label: string) =>
      host.querySelector(`[aria-label='${label}']`) as HTMLButtonElement;
    await act(async () => {
      control("Answer").click();
    });
    expect(control("Answer").disabled).toBe(true);
    expect(control("Reject").disabled).toBe(true);
    await act(async () => {
      f.controller.select("B");
    });
    expect(f.controller.getSnapshot().callId).toBe("B");
    expect(control("Answer").disabled).toBe(true);
    expect(control("Reject").disabled).toBe(true);
    await act(async () => {
      finish();
    });
    // The answered call is displayed with its in-call controls.
    await vi.waitFor(() =>
      expect(f.controller.getSnapshot()).toMatchObject({
        callId: "A",
        answering: false,
      }),
    );
    expect(
      control("Hang up") ?? control("End call for everyone"),
    ).not.toBeNull();
    f.controller.dispose();
  });

  it("shows a waiting call after an answer fails, with a notice", async () => {
    const f = feedFixture();
    vi.mocked(f.media.open).mockRejectedValueOnce(new Error("denied"));
    const host = mount(
      <PolymorfaProvider>
        <CallSurface controller={f.controller} popout={false} />
      </PolymorfaProvider>,
    );
    f.emit({
      type: "incomingCall",
      call: { callId: "A", from: "+15550100", video: false },
    });
    f.emit({
      type: "incomingCall",
      call: { callId: "B", from: "+15550101", video: false },
    });
    await act(async () => {
      await f.controller.answer();
    });
    expect(f.controller.getSnapshot().callId).toBe("B");
    const card = host.querySelector("[role='alertdialog']") as HTMLElement;
    expect(card.getAttribute("aria-label")).toBe(
      "Incoming call from +15550101",
    );
    const notice = host.querySelector(
      ".pmfa-calls-subtitle[role='status']",
    ) as HTMLElement;
    expect(notice.textContent).toBe(
      "The previous call could not be connected.",
    );
    expect(
      (host.querySelector("[aria-label='Answer']") as HTMLButtonElement)
        .disabled,
    ).toBe(false);
    f.controller.dispose();
  });

  it("disables the pre-answer camera and microphone choices while answering", async () => {
    const f = feedFixture();
    f.signaling.accept.mockImplementationOnce(() => new Promise(() => {}));
    const host = mount(
      <PolymorfaProvider>
        <CallSurface controller={f.controller} popout={false} />
      </PolymorfaProvider>,
    );
    f.emit({
      type: "incomingCall",
      call: { callId: "V", from: "+15550100", video: true },
    });
    const control = (label: string) =>
      host.querySelector(`[aria-label='${label}']`) as HTMLButtonElement;
    expect(control("Answer muted").disabled).toBe(false);
    expect(control("Answer without camera").disabled).toBe(false);
    await act(async () => {
      control("Answer").click();
    });
    // The pending answer already captured these choices.
    expect(control("Answer muted").disabled).toBe(true);
    expect(control("Answer without camera").disabled).toBe(true);
    f.controller.dispose();
  });

  it("does not apply an answered call's pre-answer choices to the call shown after it ended", async () => {
    const f = feedFixture();
    let finish!: () => void;
    f.signaling.accept.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () =>
            resolve({
              answered: true,
              answeredBy: "client:self",
              exclusive: false,
            });
        }),
    );
    const host = mount(
      <PolymorfaProvider>
        <CallSurface controller={f.controller} popout={false} />
      </PolymorfaProvider>,
    );
    f.emit({
      type: "incomingCall",
      call: { callId: "A", from: "+15550100", video: true },
    });
    f.emit({
      type: "incomingCall",
      call: { callId: "B", from: "+15550101", video: true },
    });
    const control = (label: string) =>
      host.querySelector(`[aria-label='${label}']`) as HTMLButtonElement;
    await act(async () => {
      control("Answer muted").click();
    });
    await act(async () => {
      control("Answer").click();
    });
    // A ends while its answer is in flight; B is shown.
    f.emit({ type: "ended", callId: "A", reason: "remote_hangup" });
    expect(f.controller.getSnapshot().callId).toBe("B");
    await act(async () => {
      finish();
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(f.controller.getSnapshot()).toMatchObject({
      callId: "B",
      status: "incoming",
      audioMuted: false,
      videoMuted: false,
      answering: false,
    });
    f.controller.dispose();
  });

  it("applies pre-answer choices to the call that was answered", async () => {
    const f = feedFixture();
    const host = mount(
      <PolymorfaProvider>
        <CallSurface controller={f.controller} popout={false} />
      </PolymorfaProvider>,
    );
    f.emit({
      type: "incomingCall",
      call: { callId: "A", from: "+15550100", video: true },
    });
    const control = (label: string) =>
      host.querySelector(`[aria-label='${label}']`) as HTMLButtonElement;
    await act(async () => {
      control("Answer muted").click();
    });
    await act(async () => {
      control("Answer").click();
    });
    await vi.waitFor(() =>
      expect(f.controller.getSnapshot()).toMatchObject({
        callId: "A",
        audioMuted: true,
      }),
    );
    f.controller.dispose();
  });

  it("shows Ringing only while a placed call rings, without a shared call model", async () => {
    const f = fixture(); // signaling backend: no getCall
    const host = mount(
      <PolymorfaProvider>
        <CallStage controller={f.controller} />
      </PolymorfaProvider>,
    );
    await act(async () => {
      await f.controller.place("+12025550123");
    });
    expect(f.controller.call).toBeUndefined();
    expect(f.controller.getSnapshot().status).toBe("ringing");
    expect(host.textContent).toContain("Ringing +12025550123");
    act(() => f.relay.accepted("call-out"));
    expect(f.controller.getSnapshot().status).toBe("connecting");
    expect(host.textContent).not.toContain("Ringing");
    f.controller.dispose();
  });

  it("stops showing Ringing once a shared call reports the callee answered", async () => {
    const base = fixture();
    const relay = new IncomingCallRelay();
    const shared = { state: "ringing", participants: [], ended: false };
    const controller = new CallsController(
      {
        ...createSignalingCallsBackend({
          signaling: base.signaling,
          incoming: relay,
          place: async () => "call-out",
        }),
        getCall: () => shared as never,
      },
      base.media,
    );
    controller.initialize();
    base.controller.dispose();
    const host = mount(
      <PolymorfaProvider>
        <CallStage controller={controller} />
      </PolymorfaProvider>,
    );
    await act(async () => {
      await controller.place("+12025550123");
    });
    expect(controller.getSnapshot().status).toBe("ringing");
    expect(host.textContent).toContain("Ringing +12025550123");
    shared.state = "connecting";
    act(() => relay.accepted("call-out"));
    expect(controller.getSnapshot().status).toBe("connecting");
    expect(host.textContent).not.toContain("Ringing");
    controller.dispose();
  });

  it("offers only Hang up on a placed call until it connects", async () => {
    const f = fixture();
    const host = mount(
      <PolymorfaProvider>
        <CallControls controller={f.controller} showLeave />
      </PolymorfaProvider>,
    );
    await act(async () => {
      await f.controller.place("+12025550123");
    });
    expect(f.controller.getSnapshot().exclusive).toBe(false);
    // Leaving would drop this connection while the callee keeps ringing.
    expect(host.querySelector("[aria-label='Leave call']")).toBeNull();
    const hangup = host.querySelector(
      "[aria-label='Hang up']",
    ) as HTMLButtonElement;
    expect(hangup.title).toBe("Hang up");
    await act(async () => {
      hangup.click();
    });
    expect(f.signaling.end).toHaveBeenCalledWith(
      "call-out",
      expect.any(AbortSignal),
    );
    expect(f.signaling.leave).not.toHaveBeenCalled();
    f.controller.dispose();
  });

  it("hides Leave on a claimed call unless asked", async () => {
    const f = feedFixture();
    f.signaling.accept.mockResolvedValue({
      answered: true,
      answeredBy: "client:self",
      exclusive: true,
    });
    const host = mount(
      <PolymorfaProvider>
        <CallControls controller={f.controller} />
      </PolymorfaProvider>,
    );
    f.emit({
      type: "incomingCall",
      call: { callId: "E", from: "+15550100", video: false },
    });
    await act(async () => {
      await f.controller.answer({ exclusive: true });
    });
    expect(host.querySelector("[aria-label='Leave call']")).toBeNull();
    expect(host.querySelector("[aria-label='Hang up']")).not.toBeNull();
    f.controller.dispose();
  });
});

it("shows direct remote mute without changing local capture", async () => {
  const f = fixture();
  await act(async () => {
    await f.controller.place("+15550100");
  });
  const host = mount(
    <PolymorfaProvider>
      <CallStage controller={f.controller} />
    </PolymorfaProvider>,
  );
  const callbacks = vi.mocked(f.media.open).mock.calls[0]![2];
  act(() => callbacks.onRemoteMute?.(true));
  expect(host.textContent).toContain("Their microphone is muted");
  expect(f.session.setMuted).not.toHaveBeenCalled();
  act(() => callbacks.onRemoteMute?.(null));
  expect(host.textContent).not.toContain("Their microphone is muted");
  await act(async () => {
    await f.controller.dispose();
  });
});
