import { describe, expect, it } from "vitest";

import {
  COMPONENT_SLOTS,
  COMPONENT_STYLES,
  DEFAULT_APPEARANCE,
  appearanceToCssVariables,
  formatDayLabel,
  formatFileSize,
  layoutMessages,
  slotPartName,
  safeAttachmentUrl,
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

  it("emits dark color overrides beside the light variables", () => {
    const appearance = defineAppearance({
      variables: { colorPrimary: "#0057ff" },
      darkVariables: {
        colorPrimary: "#8ab4ff",
        colorBackground: "#000000",
        radiusMedium: "2px",
      },
    });
    const variables = appearanceToCssVariables(appearance);
    expect(variables["--pmfa-color-primary"]).toBe("#0057ff");
    expect(variables["--pmfa-dark-color-primary"]).toBe("#8ab4ff");
    expect(variables["--pmfa-dark-color-background"]).toBe("#000000");
    // Only colors have a dark counterpart.
    expect(
      Object.keys(variables).filter((name) => name.startsWith("--pmfa-dark-")),
    ).toEqual(["--pmfa-dark-color-background", "--pmfa-dark-color-primary"]);
    expect(Object.keys(variables)).toEqual([...Object.keys(variables)].sort());
    expect(
      Object.keys(appearanceToCssVariables(defineAppearance())).some((name) =>
        name.startsWith("--pmfa-dark-"),
      ),
    ).toBe(false);
  });

  it("merges dark variables and the unstyled flag", () => {
    const merged = mergeAppearance(
      defineAppearance({
        darkVariables: { colorPrimary: "#111111", colorMuted: "#222222" },
        unstyled: true,
      }),
      { darkVariables: { colorPrimary: "#333333" } },
    );
    expect(merged.darkVariables).toEqual({
      colorPrimary: "#333333",
      colorMuted: "#222222",
    });
    expect(merged.unstyled).toBe(true);
    expect(mergeAppearance(merged, { unstyled: false }).unstyled).toBe(false);
    expect(defineAppearance().unstyled).toBeUndefined();
  });

  it("wraps the shared stylesheet in the polymorfa layer and reads dark tokens", () => {
    expect(COMPONENT_STYLES.trimStart().startsWith("@layer polymorfa {")).toBe(
      true,
    );
    expect(COMPONENT_STYLES).toContain(
      "--pmfa-c-bg: var(--pmfa-dark-color-background, #17161c)",
    );
  });

  it("lays out chat messages with day separators and direction groups", () => {
    const day = new Date(2026, 0, 5, 9).getTime();
    const entries = layoutMessages([
      { id: "c", createdAt: day + 120_000, direction: "outbound" as const },
      { id: "a", createdAt: day, direction: "inbound" as const },
      { id: "b", createdAt: day + 60_000, direction: "inbound" as const },
      { id: "d", createdAt: day + 86_400_000, direction: "outbound" as const },
    ]);
    expect(
      entries.map((entry) =>
        entry.kind === "date"
          ? entry.key
          : `${entry.key}:${entry.groupStart ? "s" : ""}${entry.groupEnd ? "e" : ""}`,
      ),
    ).toEqual(["date:2026-1-5", "a:s", "b:e", "c:se", "date:2026-1-6", "d:se"]);
    const labels = { today: "Today", yesterday: "Yesterday" };
    expect(formatDayLabel(day, "en", labels, day + 1000)).toBe("Today");
    expect(formatDayLabel(day, "en", labels, day + 86_400_000)).toBe(
      "Yesterday",
    );
    expect(formatDayLabel(day, "en-US", labels, day + 5 * 86_400_000)).toBe(
      "Mon, Jan 5",
    );
    expect(formatFileSize(512, "en")).toBe("512 bytes");
    expect(formatFileSize(1536, "en")).toBe("1.5 kB");
    expect(formatFileSize(25 * 1024 * 1024, "en")).toBe("25 MB");
    expect(slotPartName("messageMeta")).toBe("message-meta");
    expect(slotPartName("preview")).toBe("preview-panel");
    expect(COMPONENT_SLOTS).toContain("composerAttach");
  });

  it("allows only http, https, and blob attachment URLs", () => {
    expect(safeAttachmentUrl("https://cdn.example/a.png")).toBe(
      "https://cdn.example/a.png",
    );
    expect(safeAttachmentUrl("http://cdn.example/a.pdf")).toBe(
      "http://cdn.example/a.pdf",
    );
    expect(safeAttachmentUrl("blob:https://app.example/1234")).toBe(
      "blob:https://app.example/1234",
    );
    for (const unsafe of [
      "javascript:alert(1)",
      " JavaScript:alert(1)",
      "java\tscript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "vbscript:msgbox(1)",
      "file:///etc/passwd",
      "/relative/path.png",
      "not a url",
      "",
      undefined,
    ])
      expect(safeAttachmentUrl(unsafe)).toBeUndefined();
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
