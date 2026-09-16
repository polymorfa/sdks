import { describe, expect, it } from "vitest";
import { Client, MessagingClient } from "../src/index.js";
import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";

describe("private operation boundary", () => {
  it("does not expose console-only operations on machine clients", () => {
    const client = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    });
    const messaging = new MessagingClient({
      credential: { type: "projectToken", value: PROJECT_TOKEN },
    });
    expect(client).not.toHaveProperty("operations");
    expect(client.project("project")).not.toHaveProperty("operations");
    expect(messaging).not.toHaveProperty("operations");
  });
});
