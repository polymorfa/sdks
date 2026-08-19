import type {
  RenderedTemplate,
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
    const definition = snapshot?.draft?.definition;
    if (definition?.header?.format === "text") {
      panel.append(
        textArea("Header text", definition.header.text, (value) =>
          this.configuredController<TemplateBuilderController>()?.updateDefinition(
            { header: { format: "text", text: value } },
          ),
        ),
      );
    }
    panel.append(
      textArea("Template body", definition?.body ?? "", (value) =>
        this.configuredController<TemplateBuilderController>()?.setBody(value),
      ),
    );
    if (definition?.footer !== undefined) {
      panel.append(
        textArea("Template footer", definition.footer, (value) =>
          this.configuredController<TemplateBuilderController>()?.updateDefinition(
            { footer: value },
          ),
        ),
      );
    }
    for (const variable of definition?.variables ?? []) {
      const field = document.createElement("input");
      field.value = variable.example;
      field.setAttribute("aria-label", `Variable ${variable.name} example`);
      field.addEventListener("input", () =>
        this.configuredController<TemplateBuilderController>()?.setVariableExample(
          variable.name,
          field.value,
        ),
      );
      panel.append(field);
    }
    for (const [index, templateButton] of (
      definition?.buttons ?? []
    ).entries()) {
      const field = document.createElement("input");
      field.value = templateButton.text ?? "";
      field.setAttribute("aria-label", `Button ${index + 1} text`);
      field.addEventListener("input", () => {
        const buttons = [...(definition?.buttons ?? [])];
        const current = buttons[index];
        if (current !== undefined)
          buttons[index] = { ...current, text: field.value };
        this.configuredController<TemplateBuilderController>()?.updateDefinition(
          {
            buttons,
          },
        );
      });
      panel.append(field);
    }
    for (const [index, card] of (definition?.carousel?.cards ?? []).entries()) {
      panel.append(
        textArea(`Carousel card ${index + 1} body`, card.body, (value) => {
          const cards = [...(definition?.carousel?.cards ?? [])];
          const current = cards[index];
          if (current !== undefined) cards[index] = { ...current, body: value };
          this.configuredController<TemplateBuilderController>()?.updateDefinition(
            {
              carousel: { cards },
            },
          );
        }),
      );
    }

    const save = button(
      "Save draft",
      "primary save",
      () => void this.configuredController<TemplateBuilderController>()?.save(),
    );
    save.disabled =
      snapshot?.draft === undefined || (snapshot.localIssues.length ?? 0) > 0;
    const preview = button(
      "Preview",
      "preview",
      () =>
        void this.configuredController<TemplateBuilderController>()?.refreshPreview(),
    );
    preview.disabled = snapshot?.templateId === undefined || snapshot.dirty;
    const submit = button(
      "Submit to Meta",
      "submit",
      () =>
        void this.configuredController<TemplateBuilderController>()?.submitToMeta(),
    );
    submit.disabled = snapshot?.templateId === undefined || snapshot.dirty;
    panel.append(save, preview, submit);

    if (snapshot?.preview !== undefined)
      panel.append(renderPreview(snapshot.preview.rendered));
    for (const issue of snapshot?.localIssues ?? [])
      panel.append(textElement("p", issue.message, "error"));
    return [panel];
  }
}

function textArea(
  label: string,
  value: string,
  onInput: (value: string) => void,
): HTMLTextAreaElement {
  const area = document.createElement("textarea");
  area.value = value;
  area.setAttribute("aria-label", label);
  area.addEventListener("input", () => onInput(area.value));
  return area;
}

function renderPreview(preview: RenderedTemplate): HTMLOutputElement {
  const output = document.createElement("output");
  output.setAttribute("part", "preview-output");
  if (preview.header?.text !== undefined)
    output.append(textElement("strong", preview.header.text));
  output.append(textElement("p", preview.body));
  if (preview.footer !== undefined)
    output.append(textElement("small", preview.footer));
  for (const templateButton of preview.buttons)
    output.append(textElement("span", templateButton.text, "preview-button"));
  for (const card of preview.cards) {
    const article = element("article", "preview-card");
    article.append(textElement("p", card.body));
    for (const templateButton of card.buttons)
      article.append(
        textElement("span", templateButton.text, "preview-button"),
      );
    output.append(article);
  }
  return output;
}
export function defineTemplateElements(
  registry: CustomElementRegistry = customElements,
): void {
  if (registry.get("pmfa-template-builder") === undefined)
    registry.define("pmfa-template-builder", PolymorfaTemplateBuilderElement);
}
