import { describe, expect, it, vi } from "vitest";
import { Client, MessagingClient } from "../src/index.js";
import { TEAM_API_KEY } from "./support/credentials.js";

describe("connection configuration", () => {
  it("binds defaults to the selected project and preserves resets and revisions", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ data: { effective: {}, revisions: { project: 2 } } }),
    );
    const client = new Client({
      credential: { type: "teamApiKey", value: TEAM_API_KEY },
      fetch,
    });
    await client.connectionConfiguration.retrieve();
    await client.project("project-a").connectionConfiguration.update({
      revision: 2,
      configuration: { reset: ["historySync.mode"] },
    });
    expect(String(fetch.mock.calls[0]?.[0])).toContain(
      "/platform/connection-configuration",
    );
    expect(JSON.parse(String(fetch.mock.calls[1]?.[1]?.body))).toEqual({
      projectId: "project-a",
      revision: 2,
      configuration: { reset: ["historySync.mode"] },
    });
  });
  it("exposes new creation only through QuickLink", () => {
    const client = new MessagingClient({
      credential: { type: "apiKey", value: TEAM_API_KEY },
    });
    expect(client.connections).not.toHaveProperty("create");
    expect(client.quickLinks.create).toBeTypeOf("function");
  });
});
