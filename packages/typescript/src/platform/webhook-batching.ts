import { PolymorfaValidationError } from "../errors.js";
import type { WebhookBatchingInput } from "./developer-types.js";

/** Validate only supplied settings; never infer a saved endpoint's format. */
export function validateWebhookBatching(input: {
  readonly format?: "native" | "meta";
  readonly batching?: WebhookBatchingInput;
}): void {
  if (input.batching === undefined) return;
  const b = input.batching;
  if (
    typeof b !== "object" ||
    b === null ||
    Array.isArray(b) ||
    typeof b.enabled !== "boolean" ||
    Object.keys(b).some(
      (key) => !["enabled", "maxEvents", "windowMs"].includes(key),
    )
  )
    throw new PolymorfaValidationError(
      "batching requires enabled and accepts only maxEvents and windowMs.",
    );
  if (
    b.maxEvents !== undefined &&
    (!Number.isInteger(b.maxEvents) || b.maxEvents < 2 || b.maxEvents > 100)
  )
    throw new PolymorfaValidationError(
      "batching.maxEvents must be an integer from 2 to 100.",
    );
  if (
    b.windowMs !== undefined &&
    (!Number.isInteger(b.windowMs) || b.windowMs < 100 || b.windowMs > 1000)
  )
    throw new PolymorfaValidationError(
      "batching.windowMs must be an integer from 100 to 1000.",
    );
  if (b.enabled && input.format === "meta")
    throw new PolymorfaValidationError(
      "Webhook batching supports native format only.",
    );
}
