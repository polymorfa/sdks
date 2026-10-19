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
  it("accepts varying canonical client bodies and rejects malformed encoding", () => {
    for (const length of [100, 200, 512]) {
      const value = "pmfa_ct_" + Buffer.alloc(length).toString("base64url");
      expect(
        validateMessagingCredential({ type: "clientToken", value }).value,
      ).toBe(value);
    }
    for (const value of [
      "pmfa_ct_A",
      "pmfa_ct_AA=",
      "pmfa_ct_++",
      "pmfa_ct_A A",
      "pmfa_ct_AA\n",
    ]) {
      expect(() =>
        validateMessagingCredential({ type: "clientToken", value }),
      ).toThrow(PolymorfaConfigurationError);
    }
  });
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
        value: "pmfa_ct_ZXhhbXBsZQ",
      }),
    ).toEqual({
      type: "clientToken",
      value: "pmfa_ct_ZXhhbXBsZQ",
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
      validateMessagingCredential({
        type: "apiKey",
        value: "pmfa_ct_ZXhhbXBsZQ",
      }),
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

  it("rejects client, project, and listener tokens as team keys", () => {
    expect(() => validateOrganizationApiKey("pmfa_ct_ZXhhbXBsZQ")).toThrow(
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

    // Future secret lengths remain acceptable to shape validation when CRC is valid.
    for (const length of [20, 21, 32, 200]) {
      const raw = Buffer.alloc(length + 4);
      let crc = 0xffffffff;
      for (const byte of raw.subarray(0, length)) {
        crc ^= byte;
        for (let i = 0; i < 8; i++)
          crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
      raw.writeUInt32BE((crc ^ 0xffffffff) >>> 0, length);
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

  it("rejects legacy and padded credentials before transport", () => {
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

  it("rejects malformed and non-canonical team keys", () => {
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
