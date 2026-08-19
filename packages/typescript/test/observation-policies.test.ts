import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  MessagingClient,
  ObservationPoliciesResource,
  type ApiResponse,
  type ProjectObservationPolicy,
  type SessionObservationPolicy,
  type UpdateProjectObservationPolicyRequest,
  type UpdateSessionObservationPolicyRequest,
} from "../src/index.js";
import {
  startTestServer,
  type RecordedRequest,
  type TestServer,
} from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

const projectPolicy: ProjectObservationPolicy = {
  projectId: "00000000-0000-4000-8000-000000000001",
  presenceMode: "events",
  typingMode: "cache",
  labelMode: "project",
  quickReplyMode: "off",
};

const sessionPolicy: SessionObservationPolicy = {
  sessionName: "support",
  projectId: projectPolicy.projectId,
  project: {
    presenceMode: "events",
    typingMode: "cache",
    labelMode: "project",
  },
  override: {
    presenceMode: "inherit",
    typingMode: "off",
    labelMode: "cache",
  },
  effective: {
    presenceMode: "events",
    typingMode: "off",
    labelMode: "cache",
  },
};

async function policiesServer(): Promise<{
  client: MessagingClient;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer((request) => ({
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_policy",
    },
    body: JSON.stringify({
      success: true,
      data: request.path.includes("/projects/") ? projectPolicy : sessionPolicy,
    }),
  }));
  servers.push(server);
  return {
    requests: server.requests,
    client: new MessagingClient({
      credential: { type: "apiKey", value: "pmfa_example" },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
  };
}

describe("MessagingClient observation policies", () => {
  it("exports exact project, session, and update shapes", () => {
    expectTypeOf<ProjectObservationPolicy>().toEqualTypeOf<{
      readonly projectId: string;
      readonly presenceMode: "off" | "events" | "cache";
      readonly typingMode: "off" | "events" | "cache";
      readonly labelMode: "off" | "events" | "cache" | "project";
      readonly quickReplyMode?: "off" | "events" | "cache";
    }>();
    expectTypeOf<SessionObservationPolicy["override"]>().toEqualTypeOf<{
      readonly presenceMode: "inherit" | "off" | "events" | "cache";
      readonly typingMode: "inherit" | "off" | "events" | "cache";
      readonly labelMode: "inherit" | "off" | "events" | "cache" | "project";
      readonly quickReplyMode?: "inherit" | "off" | "events" | "cache";
    }>();
    expectTypeOf<UpdateProjectObservationPolicyRequest>().toEqualTypeOf<{
      readonly presenceMode: "off" | "events" | "cache";
      readonly typingMode: "off" | "events" | "cache";
      readonly labelMode?: "off" | "events" | "cache" | "project";
    }>();
    expectTypeOf<UpdateSessionObservationPolicyRequest>().toEqualTypeOf<{
      readonly presenceMode: "inherit" | "off" | "events" | "cache";
      readonly typingMode: "inherit" | "off" | "events" | "cache";
      readonly labelMode?: "inherit" | "off" | "events" | "cache" | "project";
    }>();
    expectTypeOf<
      MessagingClient["observationPolicies"]
    >().toEqualTypeOf<ObservationPoliciesResource>();
  });

  it("maps project and session reads with encoded identifiers and metadata", async () => {
    const { client, requests } = await policiesServer();

    const project = await client.observationPolicies.retrieveForProject(
      "00000000-0000-4000-8000-000000000001",
      { apiVersion: "next" },
    );
    const session =
      await client.observationPolicies.retrieveForSession("support/eu");

    expectTypeOf(project).toEqualTypeOf<
      ApiResponse<{
        readonly success: true;
        readonly data: ProjectObservationPolicy;
      }>
    >();
    expect(project.metadata.requestId).toBe("req_policy");
    expect(session.data.data.sessionName).toBe("support");
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /api/projects/00000000-0000-4000-8000-000000000001/observation-policy",
      "GET /api/support%2Feu/observation-policy",
    ]);
    expect(requests[0]?.headers["polymorfa-version"]).toBe("next");
  });

  it("maps exact policy replacements and preserves idempotency", async () => {
    const { client, requests } = await policiesServer();
    const options = { idempotencyKey: "policy-change" } as const;

    await client.observationPolicies.updateForProject(
      "00000000-0000-4000-8000-000000000001",
      {
        presenceMode: "events",
        typingMode: "cache",
        labelMode: "project",
      },
      options,
    );
    await client.observationPolicies.updateForSession(
      "support/eu",
      {
        presenceMode: "inherit",
        typingMode: "off",
        labelMode: "cache",
      },
      options,
    );

    expect(
      requests.map(({ method, path, body }) => ({ method, path, body })),
    ).toEqual([
      {
        method: "PUT",
        path: "/api/projects/00000000-0000-4000-8000-000000000001/observation-policy",
        body: '{"presenceMode":"events","typingMode":"cache","labelMode":"project"}',
      },
      {
        method: "PUT",
        path: "/api/support%2Feu/observation-policy",
        body: '{"presenceMode":"inherit","typingMode":"off","labelMode":"cache"}',
      },
    ]);
    expect(requests.map(({ headers }) => headers["idempotency-key"])).toEqual([
      "policy-change",
      "policy-change",
    ]);
  });
});
