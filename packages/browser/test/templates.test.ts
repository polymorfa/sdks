import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TemplateBuilderController,
  type TemplateBuilderTransport,
  type TemplateDraft,
} from "../src/index.js";

const draft: TemplateDraft = {
  name: "order_update",
  language: "en",
  category: "utility",
  components: [{ id: "body", type: "body", text: "Hello {{name}}" }],
  variables: { name: "Ada" },
};

function fixtureTransport(): TemplateBuilderTransport {
  return {
    load: vi.fn(async () => ({ id: "tpl-1", draft })),
    validate: vi.fn(async () => ({ valid: true, issues: [] })),
    preview: vi.fn(async () => ({ text: "Hello Ada" })),
    submit: vi.fn(async () => ({ id: "tpl-1", status: "pending" as const })),
  };
}

afterEach(() => vi.useRealTimers());

describe("TemplateBuilderController", () => {
  it("loads, edits components and variables, and tracks dirty state", async () => {
    const controller = new TemplateBuilderController(fixtureTransport());
    await controller.load("tpl-1");
    expect(controller.getSnapshot()).toMatchObject({
      status: "ready",
      dirty: false,
      templateId: "tpl-1",
    });
    controller.updateComponent("body", { text: "Hi {{name}}" });
    controller.setVariable("name", "Grace");
    expect(controller.getSnapshot()).toMatchObject({
      dirty: true,
      localIssues: [],
    });
    expect(controller.getSnapshot().draft?.components[0]?.text).toBe(
      "Hi {{name}}",
    );
  });

  it("runs local validation before debounced server validation and preview", async () => {
    vi.useFakeTimers();
    const transport = fixtureTransport();
    const controller = new TemplateBuilderController(transport, {
      validationDelayMs: 50,
    });
    controller.create({ ...draft, name: "" });
    expect(controller.getSnapshot().localIssues[0]?.code).toBe("name_required");
    await vi.advanceTimersByTimeAsync(60);
    expect(transport.validate).not.toHaveBeenCalled();
    controller.setName("valid_name");
    await vi.advanceTimersByTimeAsync(60);
    expect(transport.validate).toHaveBeenCalledTimes(1);
    await controller.refreshPreview();
    expect(controller.getSnapshot().preview).toEqual({ text: "Hello Ada" });
  });

  it("rejects stale validation responses", async () => {
    let firstResolve!: (value: { valid: boolean; issues: [] }) => void;
    const first = new Promise<{ valid: boolean; issues: [] }>(
      (resolve) => (firstResolve = resolve),
    );
    const transport = fixtureTransport();
    vi.mocked(transport.validate)
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ valid: true, issues: [] });
    const controller = new TemplateBuilderController(transport, {
      validationDelayMs: 10_000,
    });
    controller.create(draft);
    const firstValidation = controller.validate();
    controller.setVariable("name", "New");
    const secondValidation = controller.validate();
    await secondValidation;
    firstResolve({ valid: false, issues: [] });
    await firstValidation;
    expect(controller.getSnapshot().validation?.valid).toBe(true);
  });

  it("submits create/update drafts and exposes recoverable errors", async () => {
    const transport = fixtureTransport();
    const controller = new TemplateBuilderController(transport);
    controller.create(draft);
    await controller.submit();
    expect(transport.submit).toHaveBeenCalledWith(
      undefined,
      draft,
      expect.any(AbortSignal),
    );
    expect(controller.getSnapshot()).toMatchObject({
      status: "submitted",
      templateId: "tpl-1",
      dirty: false,
    });
    vi.mocked(transport.submit).mockRejectedValueOnce(new Error("offline"));
    controller.setVariable("name", "Lin");
    await controller.submit();
    expect(controller.getSnapshot()).toMatchObject({
      status: "error",
      error: { recoverable: true },
    });
  });
});
