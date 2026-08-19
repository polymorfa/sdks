import {
  ObservableController,
  type ControllerSnapshot,
} from "../controller.js";

export type TemplateCategory = "marketing" | "utility" | "authentication";
export type TemplateComponentType = "header" | "body" | "footer" | "buttons";

export interface TemplateComponent {
  readonly id: string;
  readonly type: TemplateComponentType;
  readonly text?: string;
}

export interface TemplateDraft {
  readonly name: string;
  readonly language: string;
  readonly category: TemplateCategory;
  readonly components: readonly TemplateComponent[];
  readonly variables: Readonly<Record<string, string>>;
}

export interface TemplateIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface TemplateValidation {
  readonly valid: boolean;
  readonly issues: readonly TemplateIssue[];
}

export interface TemplatePreview {
  readonly text: string;
  readonly mediaUrl?: string;
}

export interface TemplateSubmission {
  readonly id: string;
  readonly status: "draft" | "pending" | "approved" | "rejected";
}

export interface TemplateBuilderTransport {
  load(
    templateId: string,
    signal: AbortSignal,
  ): Promise<{ readonly id: string; readonly draft: TemplateDraft }>;
  validate(
    draft: TemplateDraft,
    signal: AbortSignal,
  ): Promise<TemplateValidation>;
  preview(draft: TemplateDraft, signal: AbortSignal): Promise<TemplatePreview>;
  submit(
    templateId: string | undefined,
    draft: TemplateDraft,
    signal: AbortSignal,
  ): Promise<TemplateSubmission>;
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
    | "validating"
    | "previewing"
    | "submitting"
    | "submitted"
    | "error";
  readonly templateId?: string;
  readonly draft?: TemplateDraft;
  readonly dirty: boolean;
  readonly localIssues: readonly TemplateIssue[];
  readonly validation?: TemplateValidation;
  readonly preview?: TemplatePreview;
  readonly submission?: TemplateSubmission;
  readonly error?: TemplateBuilderError;
}

export interface TemplateBuilderOptions {
  readonly validationDelayMs?: number;
  readonly now?: () => number;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
}

export class TemplateBuilderController extends ObservableController<TemplateBuilderSnapshot> {
  readonly #transport: TemplateBuilderTransport;
  readonly #validationDelayMs: number;
  readonly #setTimeout: typeof globalThis.setTimeout;
  readonly #clearTimeout: typeof globalThis.clearTimeout;
  #abort = new AbortController();
  #validationTimer: ReturnType<typeof setTimeout> | undefined;
  #validationOperation = 0;
  #operation = 0;

  constructor(
    transport: TemplateBuilderTransport,
    options: TemplateBuilderOptions = {},
  ) {
    super({ status: "idle", dirty: false, localIssues: [] }, options.now);
    this.#transport = transport;
    this.#validationDelayMs = options.validationDelayMs ?? 300;
    this.#setTimeout = options.setTimeout ?? globalThis.setTimeout;
    this.#clearTimeout = options.clearTimeout ?? globalThis.clearTimeout;
  }

  create(draft: TemplateDraft): void {
    this.assertActive();
    const copy = cloneDraft(draft);
    this.transition({
      status: "ready",
      draft: copy,
      dirty: false,
      localIssues: validateLocally(copy),
    });
    this.#scheduleValidation();
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
      if (operation !== this.#operation) return;
      const draft = cloneDraft(loaded.draft);
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

  setVariable(name: string, value: string): void {
    this.#edit((draft) => ({
      ...draft,
      variables: { ...draft.variables, [name]: value },
    }));
  }

  updateComponent(
    id: string,
    change: Partial<Omit<TemplateComponent, "id" | "type">>,
  ): void {
    this.#edit((draft) => ({
      ...draft,
      components: draft.components.map((component) =>
        component.id === id ? { ...component, ...change } : component,
      ),
    }));
  }

  async validate(): Promise<void> {
    const current = this.getSnapshot();
    if (current.draft === undefined || current.localIssues.length > 0) return;
    const operation = ++this.#validationOperation;
    const draft = current.draft;
    this.transition({ ...builderFields(current), status: "validating" });
    try {
      const validation = await this.#transport.validate(
        draft,
        this.#abort.signal,
      );
      if (
        operation !== this.#validationOperation ||
        draft !== this.getSnapshot().draft
      )
        return;
      this.transition({
        ...builderFields(this.getSnapshot()),
        status: "ready",
        validation,
      });
    } catch (cause) {
      if (operation === this.#validationOperation) this.#transitionError(cause);
    }
  }

  async refreshPreview(): Promise<void> {
    const current = this.getSnapshot();
    if (current.draft === undefined)
      throw new Error("A template draft is required.");
    const operation = ++this.#operation;
    const draft = current.draft;
    this.transition({ ...builderFields(current), status: "previewing" });
    try {
      const preview = await this.#transport.preview(draft, this.#abort.signal);
      if (operation === this.#operation && draft === this.getSnapshot().draft)
        this.transition({
          ...builderFields(this.getSnapshot()),
          status: "ready",
          preview,
        });
    } catch (cause) {
      if (operation === this.#operation) this.#transitionError(cause);
    }
  }

  async submit(): Promise<void> {
    const current = this.getSnapshot();
    if (current.draft === undefined)
      throw new Error("A template draft is required.");
    if (current.localIssues.length > 0)
      throw new Error("Resolve local validation issues before submission.");
    const operation = ++this.#operation;
    this.transition({ ...builderFields(current), status: "submitting" });
    try {
      const submission = await this.#transport.submit(
        current.templateId,
        current.draft,
        this.#abort.signal,
      );
      if (operation !== this.#operation) return;
      this.transition({
        ...builderFields(this.getSnapshot()),
        status: "submitted",
        templateId: submission.id,
        dirty: false,
        submission,
      });
    } catch (cause) {
      if (operation === this.#operation) this.#transitionError(cause);
    }
  }

  protected override onDispose(): void {
    this.#abort.abort();
    if (this.#validationTimer !== undefined)
      this.#clearTimeout(this.#validationTimer);
  }

  #edit(update: (draft: TemplateDraft) => TemplateDraft): void {
    const current = this.getSnapshot();
    if (current.draft === undefined)
      throw new Error("A template draft is required.");
    const draft = cloneDraft(update(current.draft));
    this.#validationOperation += 1;
    this.transition({
      ...builderFields(current),
      status: "ready",
      draft,
      dirty: true,
      localIssues: validateLocally(draft),
    });
    this.#scheduleValidation();
  }

  #scheduleValidation(): void {
    if (this.#validationTimer !== undefined)
      this.#clearTimeout(this.#validationTimer);
    this.#validationTimer = this.#setTimeout(() => {
      this.#validationTimer = undefined;
      void this.validate();
    }, this.#validationDelayMs);
  }

  #beginOperation(): number {
    this.assertActive();
    this.#operation += 1;
    this.#abort.abort();
    this.#abort = new AbortController();
    return this.#operation;
  }

  #fail(cause: unknown, operation: number, templateId?: string): void {
    if (operation !== this.#operation || this.#abort.signal.aborted) return;
    this.transition({
      status: "error",
      ...(templateId === undefined ? {} : { templateId }),
      dirty: false,
      localIssues: [],
      error: templateError(cause),
    });
  }

  #transitionError(cause: unknown): void {
    this.transition({
      ...builderFields(this.getSnapshot()),
      status: "error",
      error: templateError(cause),
    });
  }
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
    ...(snapshot.validation === undefined
      ? {}
      : { validation: snapshot.validation }),
    ...(snapshot.preview === undefined ? {} : { preview: snapshot.preview }),
    ...(snapshot.submission === undefined
      ? {}
      : { submission: snapshot.submission }),
    ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
  };
}

function cloneDraft(draft: TemplateDraft): TemplateDraft {
  return {
    ...draft,
    components: draft.components.map((component) => ({ ...component })),
    variables: { ...draft.variables },
  };
}

function validateLocally(draft: TemplateDraft): readonly TemplateIssue[] {
  const issues: TemplateIssue[] = [];
  if (draft.name.trim() === "")
    issues.push({
      code: "name_required",
      message: "Template name is required.",
      path: "name",
    });
  if (!/^[a-z0-9_]+$/.test(draft.name) && draft.name !== "")
    issues.push({
      code: "name_invalid",
      message:
        "Template name must contain lowercase letters, numbers, and underscores.",
      path: "name",
    });
  if (!draft.components.some(({ type }) => type === "body"))
    issues.push({
      code: "body_required",
      message: "A body component is required.",
      path: "components",
    });
  return issues;
}

function templateError(cause: unknown): TemplateBuilderError {
  return {
    code: "template_request_failed",
    message:
      cause instanceof Error ? cause.message : "Template request failed.",
    recoverable: true,
  };
}
