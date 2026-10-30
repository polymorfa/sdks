import { describe, expect, it } from "vitest";

describe("@polymorfa/ui-kit/web-components package boundary", () => {
  it("can be imported before a DOM is installed", async () => {
    const module = await import("../../src/web-components/index.js");
    expect(module.definePolymorfaElements).toBeTypeOf("function");
  });
});
