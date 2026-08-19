import type {
  QuickLinkController,
  QuickLinkSnapshot,
} from "@polymorfa/browser";
import { PolymorfaElement, button, element, textElement } from "./base.js";

export class PolymorfaQuickLinkElement extends PolymorfaElement<QuickLinkSnapshot> {
  protected renderContent(
    snapshot: QuickLinkSnapshot | undefined,
  ): readonly Node[] {
    const panel = element("section", "panel quicklink");
    panel.setAttribute("aria-live", "polite");
    const status = snapshot?.status ?? "idle";
    panel.append(textElement("p", status, "status"));
    if (snapshot?.qrCode !== undefined)
      panel.append(textElement("pre", snapshot.qrCode, "qr-code"));
    if (snapshot?.link !== undefined) {
      const link = textElement("a", snapshot.link, "link") as HTMLAnchorElement;
      link.href = snapshot.link;
      panel.append(link);
    }
    const label =
      status === "expired" || status === "error"
        ? "Retry"
        : status === "idle" || status === "cancelled"
          ? "Connect"
          : "Cancel";
    panel.append(
      button(label, "primary action", () => {
        const controller = this.configuredController<QuickLinkController>();
        if (controller === undefined) return;
        const action =
          status === "expired" || status === "error"
            ? controller.retry()
            : status === "idle" || status === "cancelled"
              ? controller.launch()
              : controller.cancel();
        void action.catch((error: unknown) =>
          this.dispatchEvent(
            new CustomEvent("pmfa-error", {
              detail: error,
              bubbles: true,
              composed: true,
            }),
          ),
        );
      }),
    );
    return [panel];
  }
}

export function defineQuickLinkElement(
  registry: CustomElementRegistry = customElements,
): void {
  if (registry.get("pmfa-quicklink") === undefined)
    registry.define("pmfa-quicklink", PolymorfaQuickLinkElement);
}
