import type { CallsController, CallsSnapshot } from "@polymorfa/browser";
import type { Locale } from "@polymorfa/ui";
import { PolymorfaElement, button, element, textElement } from "./base.js";

/**
 * Run a synchronous controller call from a DOM handler. The controller's
 * mutators throw once it is disposed, and a disposed controller keeps its last
 * snapshot — so this element stays rendered with clickable buttons. The call
 * they belonged to is gone; there is nothing to report.
 */
function ignoreDisposed(run: () => void): void {
  try {
    run();
  } catch {
    // Disposed controller — no snapshot left to change.
  }
}

const HEADINGS: Partial<
  Record<CallsSnapshot["status"], keyof Locale["messages"]>
> = {
  incoming: "calls.incoming",
  ringing: "calls.ringing",
  accepted: "calls.connecting",
  connecting: "calls.connecting",
  connected: "calls.connected",
  reconnecting: "calls.reconnecting",
  ended: "calls.ended",
  error: "calls.failed",
};

const ACTIVE = new Set<CallsSnapshot["status"]>([
  "ringing",
  "accepted",
  "connecting",
  "connected",
  "reconnecting",
]);

/**
 * Portable call surface: incoming card (answer/reject) and the active call
 * controls (mute, camera when the line carries video, hang up). The React
 * package carries the full official-window layout; this element keeps the
 * same controller contract for React-free hosts.
 */
export class PolymorfaCallElement extends PolymorfaElement<CallsSnapshot> {
  protected renderContent(
    snapshot: CallsSnapshot | undefined,
    locale: Locale,
  ): readonly Node[] {
    const messages = locale.messages;
    const panel = element("section", "panel call");
    const status = snapshot?.status ?? "ready";
    // idle and ready are absent on purpose: nothing to announce, and this
    // region is assertive — a raw status identifier would be read out.
    const key = HEADINGS[status];
    const heading = key === undefined ? undefined : messages[key];
    if (heading !== undefined) {
      // Assertive on the heading, not the panel: this element re-renders
      // wholesale on every snapshot, so a panel-wide live region made a mute
      // toggle re-announce the peer number and every control with it.
      const status = textElement("h2", heading, "status");
      status.setAttribute("aria-live", "assertive");
      panel.append(status);
    }
    if (snapshot?.peer !== undefined)
      panel.append(textElement("p", snapshot.peer, "peer"));
    const controller = this.configuredController<CallsController>();
    if (status === "incoming")
      panel.append(
        // Both reject when a remote hang-up lands between the render and the
        // click, because the call is no longer incoming. The snapshot already
        // says so, so this only keeps the rejection from going unhandled —
        // the same handling the React card uses.
        button(
          messages["calls.answer"],
          "primary answer",
          () => void controller?.answer().catch(() => undefined),
        ),
        button(
          messages["calls.reject"],
          "reject",
          () => void controller?.reject().catch(() => undefined),
        ),
      );
    if (snapshot !== undefined && ACTIVE.has(status)) {
      // Gated like the camera: the element takes any controller, and one that
      // reports a line without mute must not be offered the control.
      if (snapshot.capabilities.mute)
        panel.append(
          button(
            snapshot.audioMuted
              ? messages["calls.unmute"]
              : messages["calls.mute"],
            "mute",
            () =>
              ignoreDisposed(() =>
                controller?.setMuted({ audio: !snapshot.audioMuted }),
              ),
          ),
        );
      // On a video call the button mutes the outgoing track; on an audio call
      // over a video-capable line it upgrades, as the React dock's does.
      // Without the second case an audio call could never reach video here.
      // The upgrade needs a media session, which exists only once the call is
      // connected — offered earlier the button would do nothing at all. The
      // mute branch is unaffected, and `connectedAt` is no use as the test
      // because it survives `reconnecting`.
      if (
        snapshot.capabilities.video &&
        (snapshot.video ||
          (status === "connected" && controller?.canEnableVideo === true))
      )
        panel.append(
          snapshot.video
            ? button(
                snapshot.videoMuted
                  ? messages["calls.cameraOn"]
                  : messages["calls.cameraOff"],
                "camera",
                () =>
                  ignoreDisposed(() =>
                    controller?.setMuted({ video: !snapshot.videoMuted }),
                  ),
              )
            : button(messages["calls.cameraOn"], "camera", () => {
                // Rejects on a denied camera or a failed re-offer; the upgrade
                // rolls itself back, so the audio call carries on.
                void controller?.enableVideo?.().catch(() => undefined);
              }),
        );
      panel.append(
        button(
          messages["calls.hangup"],
          "hangup",
          () => void controller?.hangup().catch(() => undefined),
        ),
      );
    }
    return [panel];
  }
}

export function defineCallElements(
  registry: CustomElementRegistry = customElements,
): void {
  if (registry.get("pmfa-call") === undefined)
    registry.define("pmfa-call", PolymorfaCallElement);
}
