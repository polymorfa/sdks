import type { CallsController, CallsSnapshot } from "@polymorfa/browser";
import { PolymorfaElement, button, element, textElement } from "./base.js";

export class PolymorfaCallElement extends PolymorfaElement<CallsSnapshot> {
  protected renderContent(
    snapshot: CallsSnapshot | undefined,
  ): readonly Node[] {
    const panel = element("section", "panel call");
    panel.setAttribute("aria-live", "assertive");
    panel.append(textElement("h2", snapshot?.status ?? "ready", "status"));
    if (snapshot?.status === "incoming")
      panel.append(
        button(
          "Answer",
          "primary answer",
          () => void this.configuredController<CallsController>()?.answer(),
        ),
        button(
          "Reject",
          "reject",
          () => void this.configuredController<CallsController>()?.reject(),
        ),
      );
    if (
      ["connected", "accepted", "connecting", "ringing"].includes(
        snapshot?.status ?? "",
      )
    ) {
      panel.append(
        button(snapshot?.audioMuted ? "Unmute" : "Mute", "mute", () =>
          this.configuredController<CallsController>()?.setMuted({
            audio: !(snapshot?.audioMuted ?? false),
          }),
        ),
        button(
          "Hang up",
          "hangup",
          () => void this.configuredController<CallsController>()?.hangup(),
        ),
      );
    }
    if (snapshot?.peer !== undefined)
      panel.append(textElement("p", snapshot.peer, "peer"));
    return [panel];
  }
}
export function defineCallElements(
  registry: CustomElementRegistry = customElements,
): void {
  if (registry.get("pmfa-call") === undefined)
    registry.define("pmfa-call", PolymorfaCallElement);
}
