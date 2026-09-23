import type {
  TemplateRouteDraft,
  TemplateRouteResource,
} from "@polymorfa/nextjs";

interface StoredTemplate {
  readonly id: string;
  readonly draft: TemplateRouteDraft;
  status: string;
  readonly createdAt: number;
  updatedAt: number;
}

const templates = new Map<string, StoredTemplate>();

function document(template: StoredTemplate) {
  const { draft } = template;
  return {
    id: template.id,
    name: draft.name,
    category: draft.definition.category,
    language: draft.definition.language,
    status: template.status,
    kind: draft.definition.kind,
    definition: draft.definition,
    ...(draft.sampleValues === undefined
      ? {}
      : { sampleValues: draft.sampleValues }),
    cloudLinks: [],
    createdAt: template.createdAt,
    updatedAt: template.updatedAt,
  };
}

function ok(data: unknown) {
  return Promise.resolve({ data: { success: true, data } });
}

function find(templateId: string): StoredTemplate {
  const template = templates.get(templateId);
  if (template === undefined) throw new Error("Template not found.");
  return template;
}

/**
 * In-memory stand-in for `MessagingClient.templates`, so the TemplateBuilder
 * route helper runs unchanged in demo mode.
 */
export const demoTemplateResource: TemplateRouteResource = {
  create(_slug, draft) {
    const now = Date.now();
    const template: StoredTemplate = {
      id: `tpl_${crypto.randomUUID().slice(0, 8)}`,
      draft,
      status: "DRAFT",
      createdAt: now,
      updatedAt: now,
    };
    templates.set(template.id, template);
    return ok(document(template));
  },
  retrieve(_slug, templateId) {
    return ok(document(find(templateId)));
  },
  update(_slug, templateId, draft) {
    const current = find(templateId);
    const next = { ...current, draft, updatedAt: Date.now() };
    templates.set(templateId, next);
    return ok(document(next));
  },
  delete(_slug, templateId) {
    templates.delete(templateId);
    return Promise.resolve({ success: true });
  },
  preview(_slug, templateId, body) {
    const { definition, sampleValues } = find(templateId).draft;
    const values = { ...sampleValues, ...body.values };
    const fill = (text: string) =>
      text.replace(
        /\{\{\s*(\w+)\s*\}\}/g,
        (match, name: string) => values[name] ?? match,
      );
    const header = definition.header;
    return ok({
      surface: "preview",
      rendered: {
        kind: definition.kind,
        category: definition.category,
        ...(header === undefined || header.format === "none"
          ? {}
          : {
              header:
                header.format === "text"
                  ? { format: "text", text: fill(header.text) }
                  : { format: header.format },
            }),
        body: fill(definition.body),
        ...(definition.footer === undefined
          ? {}
          : { footer: definition.footer }),
        buttons: (definition.buttons ?? []).map((button) => ({
          type: button.type,
          text: button.text ?? "Copy code",
          ...("url" in button ? { value: button.url } : {}),
        })),
        cards: [],
      },
    });
  },
  submit(_slug, templateId) {
    const template = find(templateId);
    template.status = "PENDING";
    template.updatedAt = Date.now();
    return ok(document(template));
  },
};
