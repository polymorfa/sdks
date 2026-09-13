import { describe, expect, it } from "vitest";

import {
  DEFAULT_APPEARANCE,
  appearanceToCssVariables,
  createLocale,
  defineAppearance,
  mergeAppearance,
  redactDiagnostic,
  resolveMotionPreference,
} from "../src/index.js";

describe("appearance", () => {
  it("deep-merges variables, layout, and element parts without dropping defaults", () => {
    const base = defineAppearance({
      variables: { colorPrimary: "#0057ff", radiusMedium: "12px" },
      elements: { chatDrawer: { surface: "raised", className: "base" } },
    });
    const merged = mergeAppearance(base, {
      variables: { colorPrimary: "#7c3aed" },
      layout: { density: "compact" },
      elements: { chatDrawer: { className: "custom" } },
    });

    expect(merged.variables).toMatchObject({
      colorPrimary: "#7c3aed",
      colorBackground: DEFAULT_APPEARANCE.variables.colorBackground,
      radiusMedium: "12px",
    });
    expect(merged.layout).toMatchObject({
      density: "compact",
      direction: "auto",
    });
    expect(merged.elements.chatDrawer).toEqual({
      surface: "raised",
      className: "custom",
    });
  });

  it("projects documented variables to stable CSS custom properties", () => {
    const variables = appearanceToCssVariables(
      defineAppearance({
        variables: { colorPrimary: "rebeccapurple", spacingMedium: "14px" },
      }),
    );
    expect(variables["--pmfa-color-primary"]).toBe("rebeccapurple");
    expect(variables["--pmfa-spacing-medium"]).toBe("14px");
    expect(Object.keys(variables)).toEqual([...Object.keys(variables)].sort());
  });

  it("creates a partial locale with English fallback and inferred direction", () => {
    const locale = createLocale("ar-LB", { "common.cancel": "إلغاء" });
    expect(locale.direction).toBe("rtl");
    expect(locale.messages["common.cancel"]).toBe("إلغاء");
    expect(locale.messages["common.retry"]).toBe("Retry");
  });

  it("resolves system motion preference without changing explicit choices", () => {
    expect(resolveMotionPreference("system", true)).toBe("reduced");
    expect(resolveMotionPreference("system", false)).toBe("full");
    expect(resolveMotionPreference("full", true)).toBe("full");
  });

  it("returns deeply immutable snapshots", () => {
    const appearance = defineAppearance({
      elements: { composer: { className: "custom" } },
    });
    expect(Object.isFrozen(appearance)).toBe(true);
    expect(Object.isFrozen(appearance.variables)).toBe(true);
    expect(Object.isFrozen(appearance.elements.composer)).toBe(true);
    expect(() => {
      (appearance.variables as { colorPrimary: string }).colorPrimary = "red";
    }).toThrow();
  });
});

describe("diagnostic redaction", () => {
  it("redacts nested credentials, secrets, authorization, and message bodies", () => {
    expect(
      redactDiagnostic({
        requestId: "req_123",
        clientToken: "pmfa_ct_secret",
        headers: { authorization: "Bearer secret", accept: "application/json" },
        webhookSecret: "whsec_secret",
        payload: { messageBody: "private message", state: "ready" },
      }),
    ).toEqual({
      requestId: "req_123",
      clientToken: "[REDACTED]",
      headers: { authorization: "[REDACTED]", accept: "application/json" },
      webhookSecret: "[REDACTED]",
      payload: { messageBody: "[REDACTED]", state: "ready" },
    });
  });
});
