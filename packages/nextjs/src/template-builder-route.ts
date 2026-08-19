export interface TemplateRouteSubject {
  readonly userId: string;
  readonly projectId?: string;
  readonly organizationId?: string;
}

export type TemplateRouteHeader =
  | { readonly format: "none" }
  | { readonly format: "text"; readonly text: string }
  | {
      readonly format: "image" | "video" | "document";
      readonly example?: string;
      readonly filename?: string;
    }
  | {
      readonly format: "location";
      readonly example?: {
        readonly latitude: number;
        readonly longitude: number;
        readonly name?: string;
        readonly address?: string;
      };
    };

export type TemplateRouteButton =
  | { readonly type: "quick_reply"; readonly text: string }
  | { readonly type: "url"; readonly text: string; readonly url: string }
  | { readonly type: "phone"; readonly text: string; readonly phone: string }
  | {
      readonly type: "copy_code";
      readonly text?: string;
      readonly example?: string;
    };

export interface TemplateRouteDefinition {
  readonly version: 1;
  readonly kind:
    "standard" | "carousel" | "authentication" | "limited_time_offer";
  readonly category: "MARKETING" | "UTILITY" | "AUTHENTICATION";
  readonly language: string;
  readonly header?: TemplateRouteHeader;
  readonly body: string;
  readonly footer?: string;
  readonly buttons?: readonly TemplateRouteButton[];
  readonly carousel?: {
    readonly cards: readonly {
      readonly header: Extract<
        TemplateRouteHeader,
        { readonly format: "image" | "video" | "document" }
      >;
      readonly body: string;
      readonly buttons?: readonly TemplateRouteButton[];
    }[];
  };
  readonly authentication?: {
    readonly otpType: "copy_code" | "one_tap";
    readonly codeExample?: string;
    readonly addSecurityRecommendation?: boolean;
    readonly codeExpirationMinutes?: number;
  };
  readonly limitedTimeOffer?: {
    readonly text: string;
    readonly hasExpiration: boolean;
  };
  readonly variables: readonly {
    readonly name: string;
    readonly type: "text" | "number" | "currency" | "date_time";
    readonly example: string;
  }[];
}

export interface TemplateRouteDraft {
  readonly name: string;
  readonly definition: TemplateRouteDefinition;
  readonly sampleValues?: Readonly<Record<string, string>>;
}

interface SdkResponse<T> {
  readonly data: { readonly success: boolean; readonly data: T };
}

export interface TemplateRouteResource {
  create(
    projectSlug: string,
    body: TemplateRouteDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<SdkResponse<unknown>>;
  retrieve(
    projectSlug: string,
    templateId: string,
    options: { readonly signal: AbortSignal },
  ): Promise<SdkResponse<unknown>>;
  update(
    projectSlug: string,
    templateId: string,
    body: TemplateRouteDraft,
    options: { readonly signal: AbortSignal },
  ): Promise<SdkResponse<unknown>>;
  delete(
    projectSlug: string,
    templateId: string,
    options: { readonly signal: AbortSignal },
  ): Promise<unknown>;
  preview(
    projectSlug: string,
    templateId: string,
    body: {
      readonly values?: Readonly<Record<string, string>>;
      readonly surface?: "cloud" | "whatsmeow" | "sandbox";
    },
    options: { readonly signal: AbortSignal },
  ): Promise<SdkResponse<unknown>>;
  submit(
    projectSlug: string,
    templateId: string,
    body: { readonly session: string },
    options: { readonly signal: AbortSignal },
  ): Promise<SdkResponse<unknown>>;
}

export interface TemplateBuilderRouteOptions {
  readonly templates: TemplateRouteResource;
  readonly authorize: (
    request: Request,
  ) => TemplateRouteSubject | null | Promise<TemplateRouteSubject | null>;
  readonly resolveProjectSlug: (
    subject: TemplateRouteSubject,
    request: Request,
  ) => string | Promise<string>;
  readonly resolveSubmissionSession: (
    subject: TemplateRouteSubject,
    request: Request,
  ) => string | Promise<string>;
}

type TemplateRouteAction =
  | { readonly action: "load"; readonly templateId: string }
  | {
      readonly action: "save";
      readonly templateId?: string;
      readonly draft: TemplateRouteDraft;
    }
  | {
      readonly action: "preview";
      readonly templateId: string;
      readonly values?: Readonly<Record<string, string>>;
      readonly surface?: "cloud" | "whatsmeow" | "sandbox";
    }
  | { readonly action: "submit"; readonly templateId: string }
  | { readonly action: "delete"; readonly templateId: string };

/** Creates a Next.js App Router-compatible, application-mediated template route. */
export function createTemplateBuilderRoute(
  options: TemplateBuilderRouteOptions,
): (request: Request) => Promise<Response> {
  validateOptions(options);

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return jsonError(
        405,
        "method_not_allowed",
        "Use POST for template builder actions.",
        { Allow: "POST" },
      );
    }

    try {
      const subject = await options.authorize(request);
      if (subject === null) {
        return jsonError(401, "unauthorized", "Authentication is required.");
      }
      if (typeof subject.userId !== "string" || subject.userId.length === 0) {
        throw new RouteInputError("invalid_subject", "userId is required.");
      }

      const action = await readAction(request);
      const projectSlug = await options.resolveProjectSlug(subject, request);
      requireString(projectSlug, "project_slug_required");
      const signalOptions = { signal: request.signal };

      switch (action.action) {
        case "load": {
          const response = await options.templates.retrieve(
            projectSlug,
            action.templateId,
            signalOptions,
          );
          return json({ template: responseData(response) });
        }
        case "save": {
          const response =
            action.templateId === undefined
              ? await options.templates.create(
                  projectSlug,
                  action.draft,
                  signalOptions,
                )
              : await options.templates.update(
                  projectSlug,
                  action.templateId,
                  action.draft,
                  signalOptions,
                );
          return json({ template: responseData(response) });
        }
        case "preview": {
          const response = await options.templates.preview(
            projectSlug,
            action.templateId,
            {
              ...(action.values === undefined ? {} : { values: action.values }),
              ...(action.surface === undefined
                ? {}
                : { surface: action.surface }),
            },
            signalOptions,
          );
          return json({ preview: responseData(response) });
        }
        case "submit": {
          const session = await options.resolveSubmissionSession(
            subject,
            request,
          );
          requireString(session, "submission_session_required");
          const response = await options.templates.submit(
            projectSlug,
            action.templateId,
            { session },
            signalOptions,
          );
          return json({ template: responseData(response) });
        }
        case "delete":
          await options.templates.delete(
            projectSlug,
            action.templateId,
            signalOptions,
          );
          return json({ deleted: true });
      }
    } catch (error) {
      if (error instanceof RouteInputError) {
        return jsonError(400, error.code, error.message);
      }
      return jsonError(
        500,
        "template_action_failed",
        "Unable to complete the template action.",
      );
    }
  };
}

async function readAction(request: Request): Promise<TemplateRouteAction> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new RouteInputError(
      "invalid_json",
      "A JSON request body is required.",
    );
  }
  if (!isRecord(value) || typeof value.action !== "string") {
    throw new RouteInputError(
      "invalid_action",
      "A template action is required.",
    );
  }

  if (value.action === "save") {
    const draft = readDraft(value.draft);
    const templateId = optionalString(value.templateId, "template_id_invalid");
    return {
      action: "save",
      draft,
      ...(templateId === undefined ? {} : { templateId }),
    };
  }

  if (
    value.action !== "load" &&
    value.action !== "preview" &&
    value.action !== "submit" &&
    value.action !== "delete"
  ) {
    throw new RouteInputError("invalid_action", "Unknown template action.");
  }
  const templateId = requireString(value.templateId, "template_id_required");
  if (value.action === "preview") {
    return {
      action: "preview",
      templateId,
      ...(value.values === undefined
        ? {}
        : { values: readValues(value.values) }),
      ...(value.surface === undefined
        ? {}
        : { surface: readSurface(value.surface) }),
    };
  }
  return { action: value.action, templateId };
}

function readDraft(value: unknown): TemplateRouteDraft {
  if (!isRecord(value)) {
    throw new RouteInputError(
      "draft_required",
      "A template draft is required.",
    );
  }
  const name = requireString(value.name, "template_name_required");
  if (!isRecord(value.definition)) {
    throw new RouteInputError(
      "template_definition_required",
      "A template definition is required.",
    );
  }
  return {
    name,
    definition: value.definition as unknown as TemplateRouteDefinition,
    ...(value.sampleValues === undefined
      ? {}
      : { sampleValues: readValues(value.sampleValues) }),
  };
}

function readValues(value: unknown): Readonly<Record<string, string>> {
  if (
    !isRecord(value) ||
    Object.values(value).some((item) => typeof item !== "string")
  ) {
    throw new RouteInputError(
      "template_values_invalid",
      "Template values must be strings.",
    );
  }
  return value as Readonly<Record<string, string>>;
}

function readSurface(value: unknown): "cloud" | "whatsmeow" | "sandbox" {
  if (value !== "cloud" && value !== "whatsmeow" && value !== "sandbox") {
    throw new RouteInputError(
      "template_surface_invalid",
      "Unknown template surface.",
    );
  }
  return value;
}

function responseData(response: SdkResponse<unknown>): unknown {
  if (!response?.data?.success || response.data.data === undefined) {
    throw new TypeError(
      "The server SDK returned an invalid template response.",
    );
  }
  return response.data.data;
}

function validateOptions(options: TemplateBuilderRouteOptions): void {
  if (
    typeof options.authorize !== "function" ||
    typeof options.resolveProjectSlug !== "function" ||
    typeof options.resolveSubmissionSession !== "function" ||
    typeof options.templates?.create !== "function" ||
    typeof options.templates?.retrieve !== "function" ||
    typeof options.templates?.update !== "function" ||
    typeof options.templates?.delete !== "function" ||
    typeof options.templates?.preview !== "function" ||
    typeof options.templates?.submit !== "function"
  ) {
    throw new TypeError("Template route options are incomplete.");
  }
}

function requireString(value: unknown, code: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RouteInputError(code, "A non-empty string is required.");
  }
  return value;
}

function optionalString(value: unknown, code: string): string | undefined {
  return value === undefined ? undefined : requireString(value, code);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const privateHeaders = {
  "Cache-Control": "no-store, private",
  Vary: "Cookie, Authorization",
};

function json(value: unknown): Response {
  return Response.json(value, { status: 200, headers: privateHeaders });
}

function jsonError(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { ...privateHeaders, ...headers } },
  );
}

class RouteInputError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
