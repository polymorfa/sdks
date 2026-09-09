import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { ClientOwner } from "./developer-types.js";
import { type DataEnvelope, unwrapResponse } from "./response.js";

export type QuickLinkTheme = "light" | "dark" | "system";
export type QuickLinkShape = "square" | "rounded" | "pill";
export type QuickLinkLogoMode = "none" | "custom" | "organization" | "project";
export type QuickLinkHistorySync = "ask" | "force_on" | "force_off";
export type QuickLinkMethod = "qr" | "pairing";

interface QuickLinkSettingsBase {
  readonly id: string;
  readonly enabled: boolean;
  readonly allowedRedirectUris: readonly string[];
  readonly businessName: string | null;
  readonly headline: string | null;
  readonly description: string | null;
  readonly successMessage: string | null;
  readonly supportUrl: string | null;
  readonly privacyUrl: string | null;
  readonly termsUrl: string | null;
  readonly accent: string | null;
  readonly theme: QuickLinkTheme;
  readonly hideWatermark: boolean;
  readonly shape: QuickLinkShape | null;
  readonly radiusPx: number | null;
  readonly logoMode: QuickLinkLogoMode;
  readonly logoStorageId: string | null;
  readonly logoSourceStorageId: string | null;
  readonly logoUrl: string | null;
  readonly historySync: QuickLinkHistorySync;
  readonly methods: readonly QuickLinkMethod[] | null;
  readonly defaultMethod: QuickLinkMethod | null;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface OrganizationQuickLinkSettings extends QuickLinkSettingsBase {
  readonly projectId: null;
}

export interface ProjectQuickLinkSettings extends QuickLinkSettingsBase {
  readonly projectId: string;
}

export interface UpdateQuickLinkSettingsInput {
  readonly enabled?: boolean;
  readonly allowedRedirectUris?: readonly string[];
  readonly businessName?: string | null;
  readonly headline?: string | null;
  readonly description?: string | null;
  readonly successMessage?: string | null;
  readonly supportUrl?: string | null;
  readonly privacyUrl?: string | null;
  readonly termsUrl?: string | null;
  readonly accent?: string | null;
  readonly theme?: QuickLinkTheme;
  readonly hideWatermark?: boolean;
  readonly shape?: QuickLinkShape | null;
  readonly radiusPx?: number | null;
  readonly logoMode?: QuickLinkLogoMode;
  readonly logoStorageId?: string | null;
  readonly logoSourceStorageId?: string | null;
  readonly historySync?: QuickLinkHistorySync;
  readonly methods?: readonly QuickLinkMethod[] | null;
  readonly defaultMethod?: QuickLinkMethod | null;
}

type QuickLinkSettingsFor<O extends ClientOwner> = O extends "project"
  ? ProjectQuickLinkSettings
  : OrganizationQuickLinkSettings;

/** Saved QuickLink configuration bound to the client's ownership context. */
export class QuickLinkSettingsResource<O extends ClientOwner> {
  constructor(
    private readonly transport: HttpTransport,
    private readonly projectId: O extends "project" ? string : null,
  ) {}

  retrieve(
    options: RequestOptions = {},
  ): Promise<ApiResponse<QuickLinkSettingsFor<O> | null>> {
    return this.transport
      .request<DataEnvelope<QuickLinkSettingsFor<O> | null>>({
        method: "GET",
        path: "/platform/quicklink",
        ...(this.projectId === null
          ? {}
          : { query: { projectId: this.projectId } }),
        ...options,
      })
      .then(unwrapResponse);
  }

  update(
    input: UpdateQuickLinkSettingsInput = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<QuickLinkSettingsFor<O>>> {
    const body =
      this.projectId === null ? input : { ...input, projectId: this.projectId };
    return this.transport
      .request<DataEnvelope<QuickLinkSettingsFor<O>>>({
        method: "PUT",
        path: "/platform/quicklink",
        body,
        ...options,
      })
      .then(unwrapResponse);
  }
}
