import { PolymorfaValidationError } from "../errors.js";

export type StopConfirmationLocale = "en" | "pt-BR" | "es";
export type StopConfirmationStatus =
  "queued" | "admitted" | "completed" | "failed" | "unknown";

export interface StopConfirmationSettings {
  readonly teamId: string;
  readonly enabled: boolean;
  readonly locale: StopConfirmationLocale | null;
  readonly revision: number;
  readonly textRevision: 1;
  readonly acknowledgement: string | null;
  readonly updatedAt: number | null;
}

/** Counts cover 30 days. Completed means provider acceptance, not delivery. */
export interface StopConfirmationSummary {
  readonly enabled: boolean;
  readonly counts: Readonly<Record<StopConfirmationStatus, number>>;
}

type Preference = { readonly teamId: string; readonly revision: number };
/** Use the team and revision returned by the settings read. */
export type UpdateStopConfirmationSettingsRequest = Preference &
  (
    | { readonly enabled: true; readonly locale: StopConfirmationLocale }
    | {
        readonly enabled: false;
        readonly locale: StopConfirmationLocale | null;
      }
  );

export function validateStopConfirmationPreference(
  input: UpdateStopConfirmationSettingsRequest,
): void {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some(
      (key) => !["teamId", "enabled", "locale", "revision"].includes(key),
    ) ||
    typeof input.teamId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.teamId,
    ) ||
    typeof input.enabled !== "boolean" ||
    !Number.isSafeInteger(input.revision) ||
    input.revision < 0 ||
    input.revision >= 2147483647 ||
    (input.locale !== null && !["en", "pt-BR", "es"].includes(input.locale)) ||
    (input.enabled && input.locale === null)
  ) {
    throw new PolymorfaValidationError(
      "Confirmation settings require the observed team and revision, a boolean preference and an explicit supported language when enabled.",
      { code: "invalid_parameter" },
    );
  }
}
