import { describe, expect, it } from "vitest";

import {
  assertServerRuntime,
  validateClientCredential,
  validateMessagingCredential,
  validateOrganizationApiKey,
} from "../src/credentials.js";
import { PolymorfaConfigurationError } from "../src/errors.js";

describe("credential validation", () => {
  it("accepts an explicit Messaging server API key", () => {
    expect(
      validateMessagingCredential({ type: "apiKey", value: "pmfa_example" }),
    ).toEqual({
      type: "apiKey",
      value: "pmfa_example",
    });
  });

  it("accepts an explicit Messaging client token", () => {
    expect(
      validateMessagingCredential({
        type: "clientToken",
        value: "pmfa_ct_example",
      }),
    ).toEqual({
      type: "clientToken",
      value: "pmfa_ct_example",
    });
  });

  it("rejects a mismatched Messaging credential discriminator", () => {
    expect(() =>
      validateMessagingCredential({ type: "apiKey", value: "pmfa_ct_example" }),
    ).toThrow(/Messaging API key/);
    expect(() =>
      validateMessagingCredential({
        type: "clientToken",
        value: "pmfa_example",
      }),
    ).toThrow(/Messaging client token/);
  });

  it("rejects client, project, and listener tokens as organization keys", () => {
    expect(() => validateOrganizationApiKey("pmfa_ct_example")).toThrow(
      PolymorfaConfigurationError,
    );
    expect(() => validateOrganizationApiKey("pmfa_pt_example")).toThrow(
      /Organization server API key/,
    );
    expect(() => validateOrganizationApiKey("pmfa_ls_example")).toThrow(
      /Listener credentials/,
    );
  });

  it("accepts the single opaque project token format", () => {
    expect(
      validateClientCredential({
        type: "projectToken",
        value: "pmfa_pt_example",
      }),
    ).toEqual({ type: "projectToken", value: "pmfa_pt_example" });
  });

  it("rejects server API keys in a browser runtime", () => {
    expect(() => assertServerRuntime({ window: {} })).toThrow(
      /server API keys cannot be used in browsers/,
    );
  });
});
