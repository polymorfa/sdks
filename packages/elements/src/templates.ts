import type {
  TemplateBuilderController,
  TemplateBuilderSnapshot,
} from "@polymorfa/browser";
import { PolymorfaElement, button, element, textElement } from "./base.js";

export class PolymorfaTemplateBuilderElement extends PolymorfaElement<TemplateBuilderSnapshot> {
  protected renderContent(
    snapshot: TemplateBuilderSnapshot | undefined,
  ): readonly Node[] {
    const panel = element("section", "panel template-builder");
    panel.append(textElement("h2", "Template builder", "title"));
    const name = document.createElement("input");
    name.value = snapshot?.draft?.name ?? "";
    name.setAttribute("aria-label", "Template name");
    name.addEventListener("input", () =>
      this.configuredController<TemplateBuilderController>()?.setName(
        name.value,
      ),
    );
    panel.append(name);
    for (const component of snapshot?.draft?.components ?? []) {
      const area = document.createElement("textarea");
      area.value = component.text ?? "";
      area.setAttribute("aria-label", `${component.type} content`);
      area.addEventListener("input", () =>
        this.configuredController<TemplateBuilderController>()?.updateComponent(
          component.id,
          { text: area.value },
        ),
      );
      panel.append(area);
    }
    panel.append(
      button(
        "Preview",
        "preview",
        () =>
          void this.configuredController<TemplateBuilderController>()?.refreshPreview(),
      ),
      button(
        "Submit",
        "primary submit",
        () =>
          void this.configuredController<TemplateBuilderController>()?.submit(),
      ),
    );
    if (snapshot?.preview !== undefined)
      panel.append(
        textElement("output", snapshot.preview.text, "preview-output"),
      );
    for (const issue of snapshot?.localIssues ?? [])
      panel.append(textElement("p", issue.message, "error"));
    return [panel];
  }
}
export function defineTemplateElements(
  registry: CustomElementRegistry = customElements,
): void {
  if (registry.get("pmfa-template-builder") === undefined)
    registry.define("pmfa-template-builder", PolymorfaTemplateBuilderElement);
}
