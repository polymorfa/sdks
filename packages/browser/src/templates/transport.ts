import { BrowserConfigurationError, BrowserHttpError } from "../errors.js";
import type { TemplateBuilderTransport } from "./controller.js";
import type {
  ProjectTemplateDocument,
  TemplateDraft,
  TemplatePreview,
  TemplateSurface,
} from "./types.js";

export interface SameOriginTemplateBuilderTransportOptions {
  readonly path?: string;
  readonly fetch?: typeof globalThis.fetch;
}

export function createSameOriginTemplateBuilderTransport(
  options: SameOriginTemplateBuilderTransportOptions = {},
): TemplateBuilderTransport {
  const path = options.path ?? "/api/polymorfa/templates";
  validatePath(path);
  const fetch = options.fetch ?? globalThis.fetch;

  const post = async (
    body: Readonly<Record<string, unknown>>,
    signal: AbortSignal,
  ): Promise<unknown> => {
    const response = await fetch(path, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });
    const value = await decodeJson(response);
    if (!response.ok) {
      throw new BrowserHttpError(errorMessage(value), {
        category: response.status >= 500 ? "server" : "http",
        status: response.status,
        details: value,
      });
    }
    return value;
  };

  return Object.freeze({
    async load(templateId: string, signal: AbortSignal) {
      return readTemplate(await post({ action: "load", templateId }, signal));
    },
    async save(
      templateId: string | undefined,
      draft: TemplateDraft,
      signal: AbortSignal,
    ) {
      return readTemplate(
        await post(
          {
            action: "save",
            ...(templateId === undefined ? {} : { templateId }),
            draft,
          },
          signal,
        ),
      );
    },
    async preview(
      templateId: string,
      values: Readonly<Record<string, string>> | undefined,
      surface: TemplateSurface | undefined,
      signal: AbortSignal,
    ) {
      return readPreview(
        await post(
          {
            action: "preview",
            templateId,
            ...(values === undefined ? {} : { values }),
            ...(surface === undefined ? {} : { surface }),
          },
          signal,
        ),
      );
    },
    async submitToMeta(templateId: string, signal: AbortSignal) {
      return readTemplate(await post({ action: "submit", templateId }, signal));
    },
    async delete(templateId: string, signal: AbortSignal) {
      const value = await post({ action: "delete", templateId }, signal);
      if (!isRecord(value) || value.deleted !== true) {
        throw invalidResponse();
      }
    },
  });
}

function validatePath(path: string): void {
  if (
    !path.startsWith("/") ||
    path.startsWith("//") ||
    path.includes("\\") ||
    URL.canParse(path)
  ) {
    throw new BrowserConfigurationError(
      "Template routes must be same-origin paths beginning with one slash.",
      "invalid_template_route",
    );
  }
}

async function decodeJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw invalidResponse();
  }
}

function readTemplate(value: unknown): ProjectTemplateDocument {
  const template = isRecord(value) ? value.template : undefined;
  if (
    !isRecord(template) ||
    typeof template.id !== "string" ||
    typeof template.name !== "string" ||
    typeof template.category !== "string" ||
    typeof template.language !== "string" ||
    typeof template.status !== "string" ||
    typeof template.kind !== "string" ||
    !isRecord(template.definition) ||
    !Array.isArray(template.cloudLinks) ||
    typeof template.createdAt !== "number" ||
    typeof template.updatedAt !== "number"
  ) {
    throw invalidResponse();
  }
  return template as unknown as ProjectTemplateDocument;
}

function readPreview(value: unknown): TemplatePreview {
  const preview = isRecord(value) ? value.preview : undefined;
  if (
    !isRecord(preview) ||
    preview.surface !== "preview" ||
    !isRecord(preview.rendered) ||
    typeof preview.rendered.body !== "string" ||
    !Array.isArray(preview.rendered.buttons) ||
    !Array.isArray(preview.rendered.cards)
  ) {
    throw invalidResponse();
  }
  return preview as unknown as TemplatePreview;
}

function errorMessage(value: unknown): string {
  const error =
    isRecord(value) && isRecord(value.error) ? value.error : undefined;
  return error !== undefined && typeof error.message === "string"
    ? error.message
    : "Template request failed.";
}

function invalidResponse(): BrowserConfigurationError {
  return new BrowserConfigurationError(
    "The application returned an invalid template response.",
    "invalid_template_response",
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
