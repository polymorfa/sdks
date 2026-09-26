import { describe, expect, it, vi } from "vitest";
import type { BrowserCalls, BrowserCallsOptions } from "../src/calls/client.js";
import {
  createNumberConnection,
  hasActiveCall,
} from "../../../examples/calls-example/src/numbers.js";

describe("Calls example Number credential boundaries", () => {
  it("keeps each token provider bound to its Number and clears only the disconnected provider", async () => {
    const options: BrowserCallsOptions[] = [];
    const create = (input: BrowserCallsOptions): BrowserCalls => {
      options.push(input);
      return {
        connected: true,
        connect: vi.fn(() => Promise.resolve()),
        dispose: vi.fn(() => Promise.resolve()),
        controller: {
          getSnapshot: () => ({ status: "ready" }),
        } as BrowserCalls["controller"],
      };
    };
    const first = createNumberConnection(
      {
        session: "support",
        label: "Support",
        token: "pmfa_ct_support",
        baseUrl: "https://api.example",
      },
      {},
      create,
    );
    const second = createNumberConnection(
      {
        session: "sales",
        label: "Sales",
        token: "pmfa_ct_sales",
        baseUrl: "https://api.example",
      },
      {},
      create,
    );
    expect(options.map(({ session }) => session)).toEqual(["support", "sales"]);
    expect(await options[0]!.getClientToken()).toBe("pmfa_ct_support");
    expect(await options[1]!.getClientToken()).toBe("pmfa_ct_sales");
    expect(hasActiveCall([first, second])).toBe(false);
    await first.dispose();
    await expect(options[0]!.getClientToken()).rejects.toThrow(
      "Number disconnected",
    );
    expect(await options[1]!.getClientToken()).toBe("pmfa_ct_sales");
    expect(second.calls.dispose).not.toHaveBeenCalled();
  });
  it("refuses server keys before constructing a Calls client", () => {
    const create = vi.fn();
    expect(() =>
      createNumberConnection(
        {
          session: "support",
          label: "Support",
          token: "pmfa_secret_server",
          baseUrl: "https://api.example",
        },
        {},
        create,
      ),
    ).toThrow("browser client token");
    expect(create).not.toHaveBeenCalled();
  });
});
