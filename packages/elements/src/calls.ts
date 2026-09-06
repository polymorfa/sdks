import type { CallsController, CallsSnapshot } from "@polymorfa/browser";
import type { Locale } from "@polymorfa/ui";
import { PolymorfaElement, button, element, textElement } from "./base.js";

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
    // `idle` and `ready` have nothing to announce, and this region is
    // assertive — a raw status identifier would be read out untranslated.
    const heading =
      status === "incoming"
        ? messages["calls.incoming"]
        : status === "ringing"
          ? messages["calls.ringing"]
          : status === "connecting" || status === "accepted"
            ? messages["calls.connecting"]
            : status === "connected"
              ? messages["calls.connected"]
              : status === "reconnecting"
                ? messages["calls.reconnecting"]
                : status === "ended"
                  ? messages["calls.ended"]
                  : status === "error"
                    ? messages["calls.failed"]
                    : undefined;
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
        button(
          messages["calls.answer"],
          "primary answer",
          () => void controller?.answer(),
        ),
        button(
          messages["calls.reject"],
          "reject",
          () => void controller?.reject(),
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
            () => controller?.setMuted({ audio: !snapshot.audioMuted }),
          ),
        );
      if (snapshot.capabilities.video && snapshot.video)
        panel.append(
          button(
            snapshot.videoMuted
              ? messages["calls.cameraOn"]
              : messages["calls.cameraOff"],
            "camera",
            () => controller?.setMuted({ video: !snapshot.videoMuted }),
          ),
        );
      panel.append(
        button(
          messages["calls.hangup"],
          "hangup",
          () => void controller?.hangup(),
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
