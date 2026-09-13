import { describe, expect, it } from "vitest";

describe("@polymorfa/elements package boundary", () => {
  it("can be imported before a DOM is installed", async () => {
    const module = await import("../src/index.js");
    expect(module.definePolymorfaElements).toBeTypeOf("function");
  });
});
