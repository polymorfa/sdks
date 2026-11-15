import { describe, expect, it, vi } from "vitest";
import type {
  BrowserCalls,
  BrowserCallsOptions,
} from "../../src/browser/calls/client.js";
import {
  createCallingConnection,
  hasActiveCall,
  type CallingConnection,
} from "../../../../examples/calls-example/src/connections.js";

describe("Calls example Connection credential boundaries", () => {
  it("keeps each token provider bound to its Connection and clears only the disconnected provider", async () => {
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
    const first = createCallingConnection(
      {
        connection: "support",
        label: "Support",
        token: "pmfa_ct_c3VwcG9ydA",
        baseUrl: "https://api.example",
      },
      {},
      create,
    );
    const second = createCallingConnection(
      {
        connection: "sales",
        label: "Sales",
        token: "pmfa_ct_c2FsZXM",
        baseUrl: "https://api.example",
      },
      {},
      create,
    );
    expect(options.map(({ connection }) => connection)).toEqual(["support", "sales"]);
    expect(await options[0]!.getClientToken()).toBe("pmfa_ct_c3VwcG9ydA");
    expect(await options[1]!.getClientToken()).toBe("pmfa_ct_c2FsZXM");
    expect(hasActiveCall([first, second])).toBe(false);
    await first.dispose();
    await expect(options[0]!.getClientToken()).rejects.toThrow(
      "Connection disconnected",
    );
    expect(await options[1]!.getClientToken()).toBe("pmfa_ct_c2FsZXM");
    expect(second.calls.dispose).not.toHaveBeenCalled();
  });
  it("refuses server keys before constructing a Calls client", () => {
    const create = vi.fn();
    expect(() =>
      createCallingConnection(
        {
          connection: "support",
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
  it("blocks Number changes while placement is pending without a call ID", () => {
    let placing = true;
    const connection = {
      id: "support",
      label: "Support",
      calls: {
        controller: {
          getSnapshot: () => ({ status: "ready", placing }),
        },
      } as BrowserCalls,
      dispose: vi.fn(() => Promise.resolve()),
    } satisfies CallingConnection;
    expect(hasActiveCall([connection])).toBe(true);
    placing = false;
    expect(hasActiveCall([connection])).toBe(false);
  });
});
