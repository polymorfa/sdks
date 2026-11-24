import { PolymorfaValidationError } from "../errors.js";

const accounts: readonly unknown[] = [
  "whatsapp_app",
  "business_app",
  "meta_cloud",
  "meta_coexistence",
];
export function assertTestingModeFields(input: {
  accountType?: unknown;
  primaryPlatform?: unknown;
}): void {
  if (input.accountType !== undefined && !accounts.includes(input.accountType))
    throw new PolymorfaValidationError(
      "accountType must be whatsapp_app, business_app, meta_cloud or meta_coexistence.",
    );
  if (
    input.primaryPlatform !== undefined &&
    input.primaryPlatform !== "android" &&
    input.primaryPlatform !== "ios"
  )
    throw new PolymorfaValidationError(
      "primaryPlatform must be android or ios.",
    );
  if (input.accountType === "meta_cloud" && input.primaryPlatform !== undefined)
    throw new PolymorfaValidationError(
      "primaryPlatform is not accepted when accountType is meta_cloud.",
    );
}
export function assertTestingAccountMode(input: unknown): void {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new PolymorfaValidationError("Account mode must be an object.");
  const value = input as Record<string, unknown>;
  if (
    !Object.hasOwn(value, "accountType") ||
    value.accountType === undefined ||
    Object.keys(value).some(
      (key) => key !== "accountType" && key !== "primaryPlatform",
    )
  )
    throw new PolymorfaValidationError(
      "Account mode requires accountType and accepts only primaryPlatform alongside it.",
    );
  assertTestingModeFields(value);
}
