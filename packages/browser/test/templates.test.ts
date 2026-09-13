import { describe, expect, it, vi } from "vitest";

import {
  BrowserConfigurationError,
  TemplateBuilderController,
  createSameOriginTemplateBuilderTransport,
  type ProjectTemplateDocument,
  type TemplateBuilderTransport,
  type TemplateDraft,
} from "../src/index.js";

const draft: TemplateDraft = {
  name: "order_update",
  definition: {
    version: 1,
    kind: "standard",
    category: "UTILITY",
    language: "en_US",
    header: { format: "text", text: "Order {{order_id}}" },
    body: "Hello {{name}}",
    buttons: [
      {
        type: "url",
        text: "Track order",
        url: "https://example.test/orders/{{order_id}}",
      },
    ],
    variables: [
      { name: "order_id", type: "text", example: "A-100" },
      { name: "name", type: "text", example: "Ada" },
    ],
  },
  sampleValues: { order_id: "A-100", name: "Ada" },
};

const document: ProjectTemplateDocument = {
  id: "tpl-1",
  name: draft.name,
  category: "UTILITY",
  language: "en_US",
  status: "draft",
  kind: "standard",
  definition: draft.definition,
  sampleValues: { order_id: "A-100", name: "Ada" },
  cloudLinks: [],
  createdAt: 1,
  updatedAt: 2,
};

function fixtureTransport(): TemplateBuilderTransport {
  return {
    load: vi.fn(async () => document),
    save: vi.fn(async () => document),
    preview: vi.fn(async () => ({
      surface: "preview" as const,
      rendered: {
        kind: "standard" as const,
        category: "UTILITY" as const,
        header: { format: "text" as const, text: "Order A-100" },
        body: "Hello Ada",
        buttons: [
          {
            type: "url" as const,
            text: "Track order",
            value: "https://example.test/orders/A-100",
          },
        ],
        cards: [],
      },
    })),
    submitToMeta: vi.fn(async () => ({ ...document, status: "PENDING" })),
    delete: vi.fn(async () => undefined),
  };
}

describe("TemplateBuilderController", () => {
  it("edits the canonical definition and validates names, bodies, and variables locally", () => {
    const controller = new TemplateBuilderController(fixtureTransport());
    controller.create(draft);
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      dirty: true,
      localIssues: [],
    });

    controller.setBody("Hi {{name}}, order {{missing}} is ready");
    controller.setVariableExample("name", "Grace");
    expect(controller.getSnapshot().draft?.definition.body).toBe(
      "Hi {{name}}, order {{missing}} is ready",
    );
    expect(
      controller
        .getSnapshot()
        .draft?.definition.variables.find(({ name }) => name === "name")
        ?.example,
    ).toBe("Grace");
    expect(controller.getSnapshot().localIssues).toEqual([
      expect.objectContaining({
        code: "variable_undeclared",
        path: "definition.body",
      }),
    ]);

    controller.setName("");
    expect(controller.getSnapshot().localIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "name_required", path: "name" }),
      ]),
    );
  });

  it("keeps save and Meta submission separate and refuses to submit dirty state", async () => {
    const transport = fixtureTransport();
    const controller = new TemplateBuilderController(transport);
    controller.create(draft);

    await controller.save();
    expect(transport.save).toHaveBeenCalledWith(
      undefined,
      draft,
      expect.any(AbortSignal),
    );
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      templateId: "tpl-1",
      dirty: false,
    });

    controller.setBody("A changed body");
    await expect(controller.refreshPreview()).rejects.toThrow(
      "Save the template before preview",
    );
    await expect(controller.submitToMeta()).rejects.toThrow(
      "Save the template before submission",
    );
    expect(transport.submitToMeta).not.toHaveBeenCalled();

    await controller.save();
    await controller.submitToMeta();
    expect(transport.submitToMeta).toHaveBeenCalledWith(
      "tpl-1",
      expect.any(AbortSignal),
    );
    expect(controller.getSnapshot()).toMatchObject({
      status: "submitted",
      dirty: false,
      submission: { status: "PENDING" },
    });
  });

  it("previews only saved templates and ignores stale load responses", async () => {
    let resolveFirst!: (value: ProjectTemplateDocument) => void;
    const first = new Promise<ProjectTemplateDocument>((resolve) => {
      resolveFirst = resolve;
    });
    const transport = fixtureTransport();
    vi.mocked(transport.load)
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ ...document, id: "tpl-2", name: "newer" });
    const controller = new TemplateBuilderController(transport);

    const stale = controller.load("tpl-1");
    await controller.load("tpl-2");
    resolveFirst(document);
    await stale;
    expect(controller.getSnapshot()).toMatchObject({
      templateId: "tpl-2",
      draft: { name: "newer" },
    });

    await controller.refreshPreview();
    expect(transport.preview).toHaveBeenCalledWith(
      "tpl-2",
      document.sampleValues,
      undefined,
      expect.any(AbortSignal),
    );
    expect(controller.getSnapshot().preview?.rendered.body).toBe("Hello Ada");
  });
});

describe("createSameOriginTemplateBuilderTransport", () => {
  it("posts typed actions to the application route without server credentials", async () => {
    const bodies: unknown[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { action: string };
      bodies.push(body);
      if (body.action === "preview") {
        return Response.json({
          preview: {
            surface: "preview",
            rendered: {
              kind: "standard",
              category: "UTILITY",
              body: "Hello Ada",
              buttons: [],
              cards: [],
            },
          },
        });
      }
      if (body.action === "delete") return Response.json({ deleted: true });
      return Response.json({ template: document });
    });
    const transport = createSameOriginTemplateBuilderTransport({
      path: "/api/polymorfa/templates",
      fetch,
    });
    const signal = new AbortController().signal;

    await transport.load("tpl-1", signal);
    await transport.save(undefined, draft, signal);
    await transport.preview("tpl-1", draft.sampleValues, undefined, signal);
    await transport.submitToMeta("tpl-1", signal);
    await transport.delete("tpl-1", signal);

    expect(bodies).toEqual([
      { action: "load", templateId: "tpl-1" },
      { action: "save", draft },
      {
        action: "preview",
        templateId: "tpl-1",
        values: draft.sampleValues,
      },
      { action: "submit", templateId: "tpl-1" },
      { action: "delete", templateId: "tpl-1" },
    ]);
    for (const call of fetch.mock.calls) {
      const headers = new Headers(call[1]?.headers);
      expect(headers.has("authorization")).toBe(false);
      expect(call[1]?.credentials).toBe("same-origin");
    }
  });

  it("rejects cross-origin route paths before fetching", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(() =>
      createSameOriginTemplateBuilderTransport({
        path: "https://evil.example/templates",
        fetch,
      }),
    ).toThrow(BrowserConfigurationError);
    expect(fetch).not.toHaveBeenCalled();
  });
});
