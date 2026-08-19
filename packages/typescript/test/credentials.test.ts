import { describe, expect, it } from "vitest";

import {
  assertServerRuntime,
  validateMessagingCredential,
  validatePlatformApiKey,
} from "../src/credentials.js";
import { PolymorfaConfigurationError } from "../src/errors.js";

describe("credential validation", () => {
  it("accepts an explicit Messaging server API key", () => {
    expect(validateMessagingCredential({ type: "apiKey", value: "pmfa_example" })).toEqual({
      type: "apiKey",
      value: "pmfa_example",
    });
  });

  it("accepts an explicit Messaging client token", () => {
    expect(validateMessagingCredential({ type: "clientToken", value: "pmfa_ct_example" })).toEqual({
      type: "clientToken",
      value: "pmfa_ct_example",
    });
  });

  it("rejects a mismatched Messaging credential discriminator", () => {
    expect(() => validateMessagingCredential({ type: "apiKey", value: "pmfa_ct_example" })).toThrow(
      /Messaging API key/,
    );
    expect(() => validateMessagingCredential({ type: "clientToken", value: "pmfa_example" })).toThrow(
      /Messaging client token/,
    );
  });

  it("rejects client and project tokens as Platform server keys", () => {
    expect(() => validatePlatformApiKey("pmfa_ct_example")).toThrow(PolymorfaConfigurationError);
    expect(() => validatePlatformApiKey("pmfa_pt_example")).toThrow(/Platform server API key/);
  });

  it("rejects server API keys in a browser runtime", () => {
    expect(() => assertServerRuntime({ window: {} })).toThrow(/server API keys cannot be used in browsers/);
  });
});
