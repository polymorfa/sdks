import { describe, expect, it } from "vitest";

import {
  assertServerRuntime,
  validateClientCredential,
  validateMessagingCredential,
  validateOrganizationApiKey,
} from "../src/credentials.js";
import { PolymorfaConfigurationError } from "../src/errors.js";

import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";

describe("credential validation", () => {
  it("accepts an explicit Messaging server API key", () => {
    expect(
      validateMessagingCredential({
        type: "apiKey",
        value: ORGANIZATION_API_KEY,
      }),
    ).toEqual({
      type: "apiKey",
      value: ORGANIZATION_API_KEY,
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

  it("accepts the single project token format for Messaging routes", () => {
    expect(
      validateMessagingCredential({
        type: "projectToken",
        value: PROJECT_TOKEN,
      }),
    ).toEqual({ type: "projectToken", value: PROJECT_TOKEN });
  });

  it("rejects a mismatched Messaging credential discriminator", () => {
    expect(() =>
      validateMessagingCredential({ type: "apiKey", value: "pmfa_ct_example" }),
    ).toThrow(/Client and project tokens/);
    expect(() =>
      validateMessagingCredential({
        type: "clientToken",
        value: ORGANIZATION_API_KEY,
      }),
    ).toThrow(/Messaging client token/);
    expect(() =>
      validateMessagingCredential({
        type: "projectToken",
        value: ORGANIZATION_API_KEY,
      }),
    ).toThrow(/Messaging project token/);
  });

  it("rejects client, project, and listener tokens as organization keys", () => {
    expect(() => validateOrganizationApiKey("pmfa_ct_example")).toThrow(
      PolymorfaConfigurationError,
    );
    expect(() => validateOrganizationApiKey("pmfa_pt_example")).toThrow(
      /Client and project tokens/,
    );
    expect(() => validateOrganizationApiKey("pmfa_ls_example")).toThrow(
      /Listener credentials/,
    );
  });

  it("accepts the single opaque project token format", () => {
    expect(
      validateClientCredential({
        type: "projectToken",
        value: PROJECT_TOKEN,
      }),
    ).toEqual({ type: "projectToken", value: PROJECT_TOKEN });

    // Length varies with framing; canonical version 2 is the local shape gate.
    for (const length of [66, 67, 68, 200]) {
      const raw = Buffer.alloc(length);
      raw[0] = 2;
      const value = "pmfa_pt_" + raw.toString("base64url");
      expect(validateClientCredential({ type: "projectToken", value })).toEqual(
        { type: "projectToken", value },
      );
    }
  });

  it("rejects special-purpose credentials before transport", () => {
    for (const value of [
      `pmfa_at_${"A".repeat(69)}`,
      `pmfa_wst_${"A".repeat(68)}`,
      `pmfa_sd_${"A".repeat(69)}`,
    ]) {
      expect(() =>
        validateMessagingCredential({ type: "apiKey", value }),
      ).toThrow(PolymorfaConfigurationError);
      expect(() => validateOrganizationApiKey(value)).toThrow(
        PolymorfaConfigurationError,
      );
    }
  });

  it("rejects v1 and padded v2 credentials before transport", () => {
    expect(() =>
      validateOrganizationApiKey(`pmfa_${"A".repeat(72)}`),
    ).toThrow();
    expect(() =>
      validateClientCredential({
        type: "projectToken",
        value: `pmfa_pt_${"A".repeat(94)}`,
      }),
    ).toThrow();
    expect(() =>
      validateOrganizationApiKey(ORGANIZATION_API_KEY + "="),
    ).toThrow();
  });

  it("rejects malformed and non-canonical organization keys", () => {
    for (const value of [
      `pmfa_${"A".repeat(71)}`,
      `pmfa_${"A".repeat(73)}`,
      `pmfa_${"A".repeat(71)}+`,
    ]) {
      expect(() => validateOrganizationApiKey(value)).toThrow(
        PolymorfaConfigurationError,
      );
    }
  });

  it("rejects malformed and non-canonical project tokens", () => {
    for (const value of [
      `pmfa_pt_${"A".repeat(93)}`,
      `pmfa_pt_${"A".repeat(95)}`,
      `pmfa_pt_${"A".repeat(93)}+`,
      `pmfa_pt_${"A".repeat(93)}B`,
    ]) {
      expect(() =>
        validateClientCredential({ type: "projectToken", value }),
      ).toThrow(PolymorfaConfigurationError);
    }
  });

  it("rejects server API keys in a browser runtime", () => {
    expect(() => assertServerRuntime({ window: {} })).toThrow(
      /server credentials cannot be used in browser runtimes/,
    );
  });

  it("rejects server credentials in browser workers", () => {
    expect(() =>
      assertServerRuntime({ importScripts: () => undefined }),
    ).toThrow(/server credentials cannot be used in browser runtimes/);
    for (const name of [
      "DedicatedWorkerGlobalScope",
      "SharedWorkerGlobalScope",
      "ServiceWorkerGlobalScope",
    ]) {
      expect(() => assertServerRuntime({ constructor: { name } })).toThrow(
        /server credentials cannot be used in browser runtimes/,
      );
    }
  });

  it("allows Cloudflare server Workers but rejects incomplete or browser globals", () => {
    const worker = {
      constructor: { name: "ServiceWorkerGlobalScope" },
      navigator: { userAgent: "Cloudflare-Workers" },
      WebSocketPair: function WebSocketPair() {},
    };
    expect(() => assertServerRuntime(worker)).not.toThrow();
    expect(() =>
      assertServerRuntime({ ...worker, WebSocketPair: undefined }),
    ).toThrow(/server credentials cannot be used in browser runtimes/);
    expect(() =>
      assertServerRuntime({ ...worker, navigator: { userAgent: "browser" } }),
    ).toThrow(/server credentials cannot be used in browser runtimes/);
    expect(() => assertServerRuntime({ ...worker, registration: {} })).toThrow(
      /server credentials cannot be used in browser runtimes/,
    );
    expect(() => assertServerRuntime({ ...worker, clients: {} })).toThrow(
      /server credentials cannot be used in browser runtimes/,
    );
    expect(() =>
      assertServerRuntime({ ...worker, skipWaiting: () => undefined }),
    ).toThrow(/server credentials cannot be used in browser runtimes/);
    expect(() => assertServerRuntime({ ...worker, window: {} })).toThrow(
      /server credentials cannot be used in browser runtimes/,
    );
  });
});
