export type TemplateSurface = "cloud" | "whatsmeow" | "sandbox";
export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";
export type TemplateKind =
  "standard" | "carousel" | "authentication" | "limited_time_offer";
export type TemplateVariableType = "text" | "number" | "currency" | "date_time";

export interface TemplateVariable {
  readonly name: string;
  readonly type: TemplateVariableType;
  readonly example: string;
}

export type TemplateHeader =
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

export type TemplateButton =
  | { readonly type: "quick_reply"; readonly text: string }
  | { readonly type: "url"; readonly text: string; readonly url: string }
  | { readonly type: "phone"; readonly text: string; readonly phone: string }
  | {
      readonly type: "copy_code";
      readonly text?: string;
      readonly example?: string;
    };

export interface TemplateCarouselCard {
  readonly header: Extract<
    TemplateHeader,
    { readonly format: "image" | "video" | "document" }
  >;
  readonly body: string;
  readonly buttons?: readonly TemplateButton[];
}

export interface TemplateDefinition {
  readonly version: 1;
  readonly kind: TemplateKind;
  readonly category: TemplateCategory;
  readonly language: string;
  readonly header?: TemplateHeader;
  readonly body: string;
  readonly footer?: string;
  readonly buttons?: readonly TemplateButton[];
  readonly carousel?: { readonly cards: readonly TemplateCarouselCard[] };
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
  readonly variables: readonly TemplateVariable[];
}

export interface TemplateDraft {
  readonly name: string;
  readonly definition: TemplateDefinition;
  readonly sampleValues?: Readonly<Record<string, string>>;
}

export interface ProjectTemplateDocument {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly language: string;
  readonly status: string;
  readonly kind: string;
  readonly definition: TemplateDefinition;
  readonly sampleValues?: Readonly<Record<string, string>>;
  readonly cloudLinks: readonly unknown[];
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface RenderedButton {
  readonly type: TemplateButton["type"];
  readonly text: string;
  readonly value?: string;
}

export interface RenderedHeader {
  readonly format: Exclude<TemplateHeader["format"], "none">;
  readonly text?: string;
  readonly mediaUrl?: string;
  readonly filename?: string;
  readonly location?: {
    readonly latitude: number;
    readonly longitude: number;
    readonly name?: string;
    readonly address?: string;
  };
}

export interface RenderedCard {
  readonly header: RenderedHeader;
  readonly body: string;
  readonly buttons: readonly RenderedButton[];
}

export interface RenderedTemplate {
  readonly kind: TemplateKind;
  readonly category: TemplateCategory;
  readonly header?: RenderedHeader;
  readonly body: string;
  readonly footer?: string;
  readonly buttons: readonly RenderedButton[];
  readonly cards: readonly RenderedCard[];
  readonly authentication?: {
    readonly otpType: "copy_code" | "one_tap";
    readonly code: string;
  };
  readonly limitedTimeOffer?: {
    readonly text: string;
    readonly hasExpiration: boolean;
  };
}

export interface TemplatePreview {
  readonly surface: "preview";
  readonly rendered: RenderedTemplate;
}

export interface TemplateIssue {
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}
