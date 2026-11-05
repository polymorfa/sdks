import {
  contractFields,
  contractInteger,
  contractObject,
} from "./campaign-contract-validation.js";
import { PolymorfaConfigurationError } from "./errors.js";

const own = (v: object, key: string): boolean => Object.hasOwn(v, key);
function invalid(field: string): never {
  throw new PolymorfaConfigurationError(
    "Invalid session configuration field.",
    field,
  );
}
function history(value: unknown, quickLink = false): boolean {
  const v = contractFields(
    value,
    ["mode", "requestFull", "delivery", ...(quickLink ? ["consent"] : [])],
    [],
    "historySync",
  );
  if (
    own(v, "mode") &&
    !["metadata_only", "deliver"].includes(v.mode as string)
  )
    invalid("historySync.mode");
  if (own(v, "requestFull") && typeof v.requestFull !== "boolean")
    invalid("historySync.requestFull");
  if (own(v, "delivery") && v.delivery !== "descriptor")
    invalid("historySync.delivery");
  if (
    own(v, "consent") &&
    !["ask", "force_on", "force_off"].includes(v.consent as string)
  )
    invalid("historySync.consent");
  return own(v, "delivery");
}
export function configurationIntent(input: unknown): boolean {
  const v = contractFields(
    input,
    ["configuration", "revision"],
    ["configuration", "revision"],
    "body",
  );
  contractInteger(v.revision, "revision", 0);
  const patch = contractFields(
    v.configuration,
    ["set", "reset"],
    [],
    "configuration",
  );
  let intent = false;
  if (own(patch, "set")) {
    const set = contractFields(
      patch.set,
      ["observation", "historySync", "hms"],
      [],
      "configuration.set",
    );
    if (own(set, "historySync")) intent = history(set.historySync);
  }
  if (own(patch, "reset")) {
    if (
      !Array.isArray(patch.reset) ||
      !patch.reset.every(
        (v) =>
          typeof v === "string" &&
          [
            "historySync",
            "historySync.mode",
            "historySync.requestFull",
            "historySync.delivery",
            "hms",
            "observation",
            "observation.presenceMode",
            "observation.typingMode",
            "observation.labelMode",
            "observation.quickReplyMode",
          ].includes(v),
      )
    )
      invalid("configuration.reset");
    intent ||= patch.reset.includes("historySync.delivery");
  }
  return intent;
}
export function quickLinkIntent(input: unknown): boolean {
  const v = contractFields(
    input,
    [
      "purpose",
      "signalMode",
      "session",
      "addConnection",
      "connectionGoal",
      "projectId",
      "customerId",
      "externalId",
      "billingControls",
      "configuration",
    ],
    [],
    "body",
  );
  if (
    own(v, "signalMode") &&
    !["standard", "zero_knowledge"].includes(v.signalMode as string)
  )
    invalid("signalMode");
  if (v.purpose === "add_connection") {
    if (
      typeof v.session !== "string" ||
      !v.session ||
      !["linked_devices", "official_api"].includes(v.addConnection as string) ||
      v.connectionGoal === "single" ||
      ["signalMode", "customerId", "externalId", "billingControls"].some(
        (key) => own(v, key),
      )
    )
      invalid("purpose");
  } else if (
    (own(v, "purpose") && v.purpose !== "initial") ||
    own(v, "session") ||
    own(v, "addConnection")
  )
    invalid("purpose");
  let intent = own(v, "signalMode");
  if (own(v, "configuration")) {
    const config = contractFields(
      v.configuration,
      [
        "observation",
        "hms",
        "testing",
        "connectionPreference",
        "connectionEnforcement",
        "methods",
        "defaultMethod",
        "prefillPhone",
        "allowPhoneChange",
        "historySync",
      ],
      [],
      "configuration",
    );
    if (own(config, "historySync"))
      intent = history(config.historySync, true) || intent;
  }
  // Ensure a non-object cannot be silently stripped by JSON serialization.
  contractObject(v, "body");
  return intent;
}
