import {
  ObservableController,
  type ControllerSnapshot,
} from "../controller.js";
import type {
  ProjectTemplateDocument,
  TemplateDefinition,
  TemplateDraft,
  TemplateIssue,
  TemplatePreview,
  TemplateSurface,
} from "./types.js";

export interface TemplateBuilderTransport {
  load(
    templateId: string,
    signal: AbortSignal,
  ): Promise<ProjectTemplateDocument>;
  save(
    templateId: string | undefined,
    draft: TemplateDraft,
    signal: AbortSignal,
  ): Promise<ProjectTemplateDocument>;
  preview(
    templateId: string,
    values: Readonly<Record<string, string>> | undefined,
    surface: TemplateSurface | undefined,
    signal: AbortSignal,
  ): Promise<TemplatePreview>;
  submitToMeta(
    templateId: string,
    signal: AbortSignal,
  ): Promise<ProjectTemplateDocument>;
  delete(templateId: string, signal: AbortSignal): Promise<void>;
}

export interface TemplateBuilderError {
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
}

export interface TemplateBuilderSnapshot extends ControllerSnapshot {
  readonly status:
    | "idle"
    | "loading"
    | "ready"
    | "saving"
    | "previewing"
    | "submitting"
    | "submitted"
    | "deleting"
    | "deleted"
    | "error";
  readonly templateId?: string;
  readonly draft?: TemplateDraft;
  readonly dirty: boolean;
  readonly localIssues: readonly TemplateIssue[];
  readonly preview?: TemplatePreview;
  readonly submission?: ProjectTemplateDocument;
  readonly error?: TemplateBuilderError;
}

export interface TemplateBuilderOptions {
  readonly now?: () => number;
}

export class TemplateBuilderController extends ObservableController<TemplateBuilderSnapshot> {
  readonly #transport: TemplateBuilderTransport;
  #operation = 0;
  #abort = new AbortController();

  constructor(
    transport: TemplateBuilderTransport,
    options: TemplateBuilderOptions = {},
  ) {
    super({ status: "idle", dirty: false, localIssues: [] }, options.now);
    this.#transport = transport;
  }

  create(draft: TemplateDraft): void {
    this.assertActive();
    this.#cancelOperation();
    const copy = cloneDraft(draft);
    this.transition({
      status: "ready",
      draft: copy,
      dirty: true,
      localIssues: validateLocally(copy),
    });
  }

  async load(templateId: string): Promise<void> {
    const operation = this.#beginOperation();
    this.transition({
      status: "loading",
      templateId,
      dirty: false,
      localIssues: [],
    });
    try {
      const loaded = await this.#transport.load(templateId, this.#abort.signal);
      if (!this.#isCurrent(operation)) return;
      const draft = draftFromDocument(loaded);
      this.transition({
        status: "ready",
        templateId: loaded.id,
        draft,
        dirty: false,
        localIssues: validateLocally(draft),
      });
    } catch (cause) {
      this.#fail(cause, operation, templateId);
    }
  }

  setName(name: string): void {
    this.#edit((draft) => ({ ...draft, name }));
  }

  setBody(body: string): void {
    this.updateDefinition({ body });
  }

  updateDefinition(change: Partial<TemplateDefinition>): void {
    this.#edit((draft) => ({
      ...draft,
      definition: { ...draft.definition, ...change },
    }));
  }

  setVariableExample(name: string, example: string): void {
    this.#edit((draft) => ({
      ...draft,
      definition: {
        ...draft.definition,
        variables: draft.definition.variables.map((variable) =>
          variable.name === name ? { ...variable, example } : variable,
        ),
      },
      sampleValues: { ...draft.sampleValues, [name]: example },
    }));
  }

  async save(): Promise<void> {
    const current = this.getSnapshot();
    const draft = requiredDraft(current);
    if (current.localIssues.length > 0) {
      throw new Error("Resolve local validation issues before saving.");
    }
    const operation = this.#beginOperation();
    this.transition({ ...builderFields(current), status: "saving" });
    try {
      const saved = await this.#transport.save(
        current.templateId,
        draft,
        this.#abort.signal,
      );
      if (!this.#isCurrent(operation)) return;
      const savedDraft = draftFromDocument(saved);
      this.transition({
        status: "ready",
        templateId: saved.id,
        draft: savedDraft,
        dirty: false,
        localIssues: validateLocally(savedDraft),
      });
    } catch (cause) {
      this.#fail(cause, operation, current.templateId, draft, true);
    }
  }

  async refreshPreview(surface?: TemplateSurface): Promise<void> {
    const current = this.getSnapshot();
    const draft = requiredDraft(current);
    const templateId = requiredSavedId(current, "preview");
    if (current.dirty) throw new Error("Save the template before preview.");
    const operation = this.#beginOperation();
    this.transition({ ...builderFields(current), status: "previewing" });
    try {
      const preview = await this.#transport.preview(
        templateId,
        draft.sampleValues,
        surface,
        this.#abort.signal,
      );
      if (!this.#isCurrent(operation)) return;
      this.transition({
        ...builderFields(this.getSnapshot()),
        status: "ready",
        preview,
      });
    } catch (cause) {
      this.#fail(cause, operation, templateId, draft, current.dirty);
    }
  }

  async submitToMeta(): Promise<void> {
    const current = this.getSnapshot();
    const draft = requiredDraft(current);
    const templateId = requiredSavedId(current, "submission");
    if (current.dirty) throw new Error("Save the template before submission.");
    const operation = this.#beginOperation();
    this.transition({ ...builderFields(current), status: "submitting" });
    try {
      const submission = await this.#transport.submitToMeta(
        templateId,
        this.#abort.signal,
      );
      if (!this.#isCurrent(operation)) return;
      const submittedDraft = draftFromDocument(submission);
      this.transition({
        status: "submitted",
        templateId: submission.id,
        draft: submittedDraft,
        dirty: false,
        localIssues: validateLocally(submittedDraft),
        submission,
      });
    } catch (cause) {
      this.#fail(cause, operation, templateId, draft, false);
    }
  }

  async delete(): Promise<void> {
    const current = this.getSnapshot();
    const templateId = requiredSavedId(current, "deletion");
    const operation = this.#beginOperation();
    this.transition({ ...builderFields(current), status: "deleting" });
    try {
      await this.#transport.delete(templateId, this.#abort.signal);
      if (this.#isCurrent(operation)) {
        this.transition({ status: "deleted", dirty: false, localIssues: [] });
      }
    } catch (cause) {
      this.#fail(cause, operation, templateId, current.draft, current.dirty);
    }
  }

  protected override onDispose(): void {
    this.#cancelOperation();
  }

  #edit(update: (draft: TemplateDraft) => TemplateDraft): void {
    const current = this.getSnapshot();
    const draft = cloneDraft(update(requiredDraft(current)));
    this.#cancelOperation();
    this.transition({
      status: "ready",
      ...(current.templateId === undefined
        ? {}
        : { templateId: current.templateId }),
      draft,
      dirty: true,
      localIssues: validateLocally(draft),
    });
  }

  #beginOperation(): number {
    this.assertActive();
    this.#cancelOperation();
    this.#abort = new AbortController();
    return this.#operation;
  }

  #cancelOperation(): void {
    this.#operation += 1;
    this.#abort.abort();
  }

  #isCurrent(operation: number): boolean {
    return operation === this.#operation && !this.#abort.signal.aborted;
  }

  #fail(
    cause: unknown,
    operation: number,
    templateId?: string,
    draft?: TemplateDraft,
    dirty = false,
  ): void {
    if (!this.#isCurrent(operation)) return;
    this.transition({
      status: "error",
      ...(templateId === undefined ? {} : { templateId }),
      ...(draft === undefined ? {} : { draft }),
      dirty,
      localIssues: draft === undefined ? [] : validateLocally(draft),
      error: templateError(cause),
    });
  }
}

function requiredDraft(snapshot: TemplateBuilderSnapshot): TemplateDraft {
  if (snapshot.draft === undefined)
    throw new Error("A template draft is required.");
  return snapshot.draft;
}

function requiredSavedId(
  snapshot: TemplateBuilderSnapshot,
  action: string,
): string {
  if (snapshot.templateId === undefined) {
    throw new Error(`Save the template before ${action}.`);
  }
  return snapshot.templateId;
}

function builderFields(
  snapshot: TemplateBuilderSnapshot,
): Omit<TemplateBuilderSnapshot, "revision" | "updatedAt" | "status"> {
  return {
    ...(snapshot.templateId === undefined
      ? {}
      : { templateId: snapshot.templateId }),
    ...(snapshot.draft === undefined ? {} : { draft: snapshot.draft }),
    dirty: snapshot.dirty,
    localIssues: snapshot.localIssues,
    ...(snapshot.preview === undefined ? {} : { preview: snapshot.preview }),
    ...(snapshot.submission === undefined
      ? {}
      : { submission: snapshot.submission }),
    ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
  };
}

function draftFromDocument(document: ProjectTemplateDocument): TemplateDraft {
  return cloneDraft({
    name: document.name,
    definition: document.definition,
    ...(document.sampleValues === undefined
      ? {}
      : { sampleValues: document.sampleValues }),
  });
}

function cloneDraft(draft: TemplateDraft): TemplateDraft {
  return cloneJson(draft);
}

function cloneJson<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneJson) as T;
  if (typeof value !== "object" || value === null) return value;
  const copy: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value))
    copy[key] = cloneJson(child);
  return copy as T;
}

function validateLocally(draft: TemplateDraft): readonly TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  if (draft.name.trim() === "") {
    issues.push({
      code: "name_required",
      message: "Template name is required.",
      path: "name",
    });
  } else if (!/^[a-z0-9_]+$/.test(draft.name)) {
    issues.push({
      code: "name_invalid",
      message:
        "Template name must contain lowercase letters, numbers, and underscores.",
      path: "name",
    });
  }
  if (draft.definition.body.trim() === "") {
    issues.push({
      code: "body_required",
      message: "Template body is required.",
      path: "definition.body",
    });
  }

  const declared = new Set(draft.definition.variables.map(({ name }) => name));
  for (const variable of referencedVariables(draft.definition)) {
    if (!declared.has(variable)) {
      issues.push({
        code: "variable_undeclared",
        message: `Declare the ${variable} variable before using it.`,
        path: "definition.body",
      });
    }
  }
  return issues;
}

function referencedVariables(
  definition: TemplateDefinition,
): readonly string[] {
  const text = [
    definition.body,
    definition.header?.format === "text" ? definition.header.text : "",
    ...(definition.buttons ?? []).map((button) =>
      button.type === "url" ? button.url : "",
    ),
    ...(definition.carousel?.cards ?? []).map(({ body }) => body),
  ].join("\n");
  return [...text.matchAll(/{{\s*([a-zA-Z0-9_]+)\s*}}/g)].flatMap((match) =>
    match[1] === undefined ? [] : [match[1]],
  );
}

function templateError(cause: unknown): TemplateBuilderError {
  return {
    code: "template_request_failed",
    message:
      cause instanceof Error ? cause.message : "Template request failed.",
    recoverable: true,
  };
}
