import { describe, expect, it, vi } from "vitest";
import { MessagingClient, PolymorfaValidationError } from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";

describe("placement recipient serialization", () => {
  it.each([
    { to: " +15550100" },
    { to: "+15550100 " },
    { participants: [" +15550100", "+15550101"] },
    { participants: ["+15550100", "+15550101\n"] },
    { participants: ["+15550100", " +15550100"] },
  ])("refuses surrounding whitespace before any transport: %j", (targets) => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = new MessagingClient({
      credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
      fetch,
    });
    expect(() => client.voip.place({ session: "support", ...targets })).toThrow(
      PolymorfaValidationError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
