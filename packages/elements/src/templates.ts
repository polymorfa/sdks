import type {
  RenderedTemplate,
  TemplateBuilderController,
  TemplateBuilderSnapshot,
} from "@polymorfa/browser";
import type { ComponentSlot } from "@polymorfa/ui";
import { PolymorfaElement, button, element, textElement } from "./base.js";

interface BuilderShell {
  readonly generation: number;
  readonly panel: HTMLElement;
  readonly form: HTMLElement;
  readonly aside: HTMLElement;
  readonly issues: HTMLElement;
  /** Issue nodes keyed by code and path, so an alert is announced once. */
  readonly issueNodes: Map<string, HTMLElement>;
}

export class PolymorfaTemplateBuilderElement extends PolymorfaElement<TemplateBuilderSnapshot> {
  #shell: BuilderShell | undefined;

  /**
   * The panel, form, and issue list persist across renders; only the fields
   * and actions inside them are rebuilt.
   */
  #shellFor(): BuilderShell {
    if (this.#shell !== undefined && this.#shell.generation === this.generation)
      return this.#shell;
    const panel = element("section", "panel template-builder");
    panel.className = this.rootClass("pmfa-tb");
    const title = textElement("h2", this.text("templates.title"), "title");
    title.className = "pmfa-tb-title";
    const grid = element("div");
    grid.className = "pmfa-tb-grid";
    const form = element("div", "form");
    form.className = "pmfa-tb-form";
    const aside = element("div", "preview-panel");
    aside.className = "pmfa-tb-aside";
    const issues = element("div", "issues");
    issues.className = "pmfa-tb-issues";
    grid.append(form, aside);
    panel.append(title, grid);
    this.decorate(panel, "templateBuilder");
    this.decorate(aside, "preview");
    this.#shell = {
      generation: this.generation,
      panel,
      form,
      aside,
      issues,
      issueNodes: new Map(),
    };
    return this.#shell;
  }

  #syncIssues(
    shell: BuilderShell,
    snapshot: TemplateBuilderSnapshot | undefined,
  ) {
    const entries: (readonly [string, string])[] = (
      snapshot?.localIssues ?? []
    ).map((issue) => [
      `issue:${issue.code}:${issue.path ?? ""}`,
      issue.message,
    ]);
    if (snapshot?.error !== undefined)
      entries.push([`error:${snapshot.error.code}`, snapshot.error.message]);
    const keys = new Set(entries.map(([key]) => key));
    for (const [key, node] of shell.issueNodes)
      if (!keys.has(key)) {
        node.remove();
        shell.issueNodes.delete(key);
      }
    const nodes = entries.map(([key, message]) => {
      let node = shell.issueNodes.get(key);
      if (node === undefined) {
        node = this.decorate(alert(message), "error");
        shell.issueNodes.set(key, node);
      } else if (node.textContent !== message) node.textContent = message;
      return node;
    });
    reconcileInPlace(shell.issues, nodes);
  }

  protected renderContent(
    snapshot: TemplateBuilderSnapshot | undefined,
  ): readonly Node[] {
    const focus = focusedField(this.root);
    const controller = () =>
      this.configuredController<TemplateBuilderController>();
    const shell = this.#shellFor();
    const { panel, aside } = shell;
    const fields: HTMLElement[] = [];
    const form = {
      append: (...nodes: HTMLElement[]) => fields.push(...nodes),
    };

    const name = input(
      "name",
      undefined,
      snapshot?.draft?.name ?? "",
      (value) => controller()?.setName(value),
    );
    form.append(field(this.text("templates.name"), name));
    const definition = snapshot?.draft?.definition;
    if (definition?.header?.format === "text") {
      form.append(
        field(
          this.text("templates.header"),
          input("header", undefined, definition.header.text, (value) =>
            controller()?.updateDefinition({
              header: { format: "text", text: value },
            }),
          ),
        ),
      );
    }
    const body = textArea("body", undefined, definition?.body ?? "", (value) =>
      controller()?.setBody(value),
    );
    body.rows = 4;
    form.append(field(this.text("templates.body"), body));
    if (definition?.footer !== undefined) {
      form.append(
        field(
          this.text("templates.footer"),
          input("footer", undefined, definition.footer, (value) =>
            controller()?.updateDefinition({ footer: value }),
          ),
        ),
      );
    }
    if ((definition?.variables.length ?? 0) > 0) {
      const pairs = group(form, this.text("templates.variables"));
      for (const variable of definition?.variables ?? [])
        pairs.append(
          pair(
            `{{${variable.name}}}`,
            input(
              `variable:${variable.name}`,
              this.text("templates.variableExample", { name: variable.name }),
              variable.example,
              (value) => controller()?.setVariableExample(variable.name, value),
            ),
          ),
        );
    }
    if ((definition?.buttons?.length ?? 0) > 0) {
      const pairs = group(form, this.text("templates.buttons"));
      for (const [index, templateButton] of (
        definition?.buttons ?? []
      ).entries()) {
        pairs.append(
          pair(
            templateButton.type.replace("_", " "),
            input(
              `button:${index}`,
              this.text("templates.buttonText", { index: String(index + 1) }),
              templateButton.text ?? "",
              (value) => {
                const buttons = [...(definition?.buttons ?? [])];
                const current = buttons[index];
                if (current !== undefined)
                  buttons[index] = { ...current, text: value };
                controller()?.updateDefinition({ buttons });
              },
            ),
          ),
        );
      }
    }
    if ((definition?.carousel?.cards.length ?? 0) > 0) {
      const cards = group(form, this.text("templates.cards"));
      cards.className = "pmfa-tb-form";
      for (const [index, card] of (
        definition?.carousel?.cards ?? []
      ).entries()) {
        cards.append(
          textArea(
            `card:${index}`,
            this.text("templates.cardBody", { index: String(index + 1) }),
            card.body,
            (value) => {
              const next = [...(definition?.carousel?.cards ?? [])];
              const current = next[index];
              if (current !== undefined)
                next[index] = { ...current, body: value };
              controller()?.updateDefinition({ carousel: { cards: next } });
            },
          ),
        );
      }
    }
    this.#syncIssues(shell, snapshot);

    const busy =
      snapshot?.status === "saving" ||
      snapshot?.status === "previewing" ||
      snapshot?.status === "submitting";
    const unsaved = snapshot?.templateId === undefined || snapshot.dirty;
    const save = button(
      this.text("templates.save"),
      "primary save",
      () => void controller()?.save(),
      "pmfa-btn pmfa-btn-primary",
    );
    save.disabled =
      busy ||
      snapshot?.draft === undefined ||
      (snapshot.localIssues.length ?? 0) > 0;
    const preview = button(
      this.text("templates.preview"),
      "preview",
      () => void controller()?.refreshPreview(),
    );
    preview.disabled = busy || unsaved;
    const submit = button(
      this.text("templates.submit"),
      "submit",
      () => void controller()?.submitToMeta(),
    );
    submit.disabled = busy || unsaved;
    const actions = element("div", "actions");
    actions.className = "pmfa-actions";
    actions.append(save, preview, submit);

    if (snapshot?.preview !== undefined)
      aside.replaceChildren(renderPreview(snapshot.preview.rendered));
    else {
      const hint = textElement("p", this.text("templates.previewHint"));
      hint.className = "pmfa-hint";
      aside.replaceChildren(hint);
    }
    const slots: readonly (readonly [string, ComponentSlot])[] = [
      [".pmfa-field", "field"],
      [".pmfa-label", "label"],
      [".pmfa-input", "input"],
      [".pmfa-actions", "actions"],
    ];
    for (const root of [...fields, actions])
      for (const [selector, slot] of slots) {
        if (root.matches(selector)) this.decorate(root, slot);
        for (const node of root.querySelectorAll(selector))
          this.decorate(node, slot);
      }
    this.decorate(save, "primaryButton");
    this.decorate(preview, "button");
    this.decorate(submit, "button");
    reconcileInPlace(shell.form, [...fields, shell.issues, actions]);
    if (focus !== undefined)
      queueMicrotask(() => {
        const target = this.root.querySelector<
          HTMLInputElement | HTMLTextAreaElement
        >(`[data-field="${CSS.escape(focus.field)}"]`);
        target?.focus();
        target?.setSelectionRange(focus.start, focus.end);
      });
    return [panel];
  }
}

/**
 * The element re-renders on every edit, which replaces the field being typed
 * in. Remember it so focus and the caret survive the re-render.
 */
function focusedField(
  root: ShadowRoot,
): { field: string; start: number; end: number } | undefined {
  const active = root.activeElement;
  if (!(
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
  ))
    return undefined;
  const field = active.dataset.field;
  if (field === undefined) return undefined;
  return {
    field,
    start: active.selectionStart ?? active.value.length,
    end: active.selectionEnd ?? active.value.length,
  };
}

function field(label: string, control: HTMLElement): HTMLLabelElement {
  const wrapper = document.createElement("label");
  wrapper.className = "pmfa-field";
  const caption = textElement("span", label);
  caption.className = "pmfa-label";
  wrapper.append(caption, control);
  return wrapper;
}

/**
 * Put `nodes` into `parent` in order. Stale children are removed first, so a
 * node that stays is never detached and its live-region state survives.
 */
function reconcileInPlace(parent: Element, nodes: readonly Node[]): void {
  const keep = new Set(nodes);
  for (const child of [...parent.childNodes])
    if (!keep.has(child)) child.remove();
  nodes.forEach((node, index) => {
    const current = parent.childNodes[index];
    if (current !== node) parent.insertBefore(node, current ?? null);
  });
}

function group(
  form: { append(...nodes: HTMLElement[]): void },
  legend: string,
): HTMLElement {
  const fieldset = document.createElement("fieldset");
  fieldset.className = "pmfa-field";
  fieldset.append(textElement("legend", legend));
  const pairs = element("div");
  pairs.className = "pmfa-pairs";
  fieldset.append(pairs);
  form.append(fieldset);
  return pairs;
}

function pair(caption: string, control: HTMLElement): HTMLLabelElement {
  const wrapper = document.createElement("label");
  wrapper.className = "pmfa-pair";
  wrapper.append(textElement("span", caption), control);
  return wrapper;
}

function alert(message: string): HTMLElement {
  const value = textElement("p", message, "error");
  value.className = "pmfa-error";
  value.setAttribute("role", "alert");
  return value;
}

function input(
  key: string,
  label: string | undefined,
  value: string,
  onInput: (value: string) => void,
): HTMLInputElement {
  const field = document.createElement("input");
  field.className = "pmfa-input";
  field.value = value;
  field.dataset.field = key;
  if (label !== undefined) field.setAttribute("aria-label", label);
  field.addEventListener("input", () => onInput(field.value));
  return field;
}

function textArea(
  key: string,
  label: string | undefined,
  value: string,
  onInput: (value: string) => void,
): HTMLTextAreaElement {
  const area = document.createElement("textarea");
  area.className = "pmfa-input";
  area.value = value;
  area.dataset.field = key;
  if (label !== undefined) area.setAttribute("aria-label", label);
  area.addEventListener("input", () => onInput(area.value));
  return area;
}

function renderPreview(preview: RenderedTemplate): HTMLOutputElement {
  const output = document.createElement("output");
  output.setAttribute("part", "preview-output");
  output.className = "pmfa-preview";
  const bubble = element("div");
  bubble.className = "pmfa-preview-bubble";
  if (preview.header?.text !== undefined) {
    const header = textElement("strong", preview.header.text);
    header.className = "pmfa-preview-header";
    bubble.append(header);
  }
  const body = textElement("p", preview.body);
  body.className = "pmfa-preview-body";
  bubble.append(body);
  if (preview.footer !== undefined) {
    const footer = textElement("small", preview.footer);
    footer.className = "pmfa-preview-footer";
    bubble.append(footer);
  }
  output.append(bubble);
  for (const templateButton of preview.buttons)
    output.append(previewButton(templateButton.text));
  if (preview.cards.length > 0) {
    const cards = element("div");
    cards.className = "pmfa-preview-cards";
    for (const card of preview.cards) {
      const article = element("article", "preview-card");
      article.className = "pmfa-preview-card";
      const cardBody = textElement("p", card.body);
      cardBody.className = "pmfa-preview-body";
      article.append(cardBody);
      for (const templateButton of card.buttons)
        article.append(previewButton(templateButton.text));
      cards.append(article);
    }
    output.append(cards);
  }
  return output;
}

function previewButton(text: string): HTMLElement {
  const value = textElement("span", text, "preview-button");
  value.className = "pmfa-preview-button";
  return value;
}

export function defineTemplateElements(
  registry: CustomElementRegistry = customElements,
): void {
  if (registry.get("pmfa-template-builder") === undefined)
    registry.define("pmfa-template-builder", PolymorfaTemplateBuilderElement);
}
