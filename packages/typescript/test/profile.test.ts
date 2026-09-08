import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  MessagingClient,
  ProfileResource,
  type ApiResponse,
  type DeleteProfilePictureResponse,
  type GetProfileResponse,
  type ProfileData,
  type SetProfileNameRequest,
  type SetProfileNameResponse,
  type SetProfilePictureRequest,
  type SetProfilePictureResponse,
  type SetProfileStatusRequest,
  type SetProfileStatusResponse,
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

async function profileServer(): Promise<{
  client: MessagingClient;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer((request) => ({
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_profile",
    },
    body:
      request.method === "GET"
        ? '{"success":true,"data":{"name":"Polymorfa","status":"Available","profilePicUrl":"https://cdn.example/profile.jpg"}}'
        : '{"success":true,"message":"updated"}',
  }));
  servers.push(server);
  return {
    requests: server.requests,
    client: new MessagingClient({
      credential: {
        type: "apiKey",
        value: ORGANIZATION_API_KEY,
      },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
  };
}

describe("MessagingClient profile", () => {
  it("exports the exact public profile request and response shapes", () => {
    expectTypeOf<ProfileData>().toEqualTypeOf<{
      readonly name: string;
      readonly status: string;
      readonly profilePicUrl?: string;
    }>();
    expectTypeOf<SetProfileNameRequest>().toEqualTypeOf<{
      readonly name: string;
    }>();
    expectTypeOf<SetProfileStatusRequest>().toEqualTypeOf<{
      readonly status: string;
    }>();
    expectTypeOf<SetProfilePictureRequest>().toEqualTypeOf<{
      readonly url?: string;
      readonly base64?: string;
    }>();
    expectTypeOf<MessagingClient["profile"]>().toEqualTypeOf<ProfileResource>();
  });

  it("gets the session profile with metadata and an encoded session", async () => {
    const { client, requests } = await profileServer();

    const result = await client.profile.get("support/eu", {
      apiVersion: "next",
      headers: { "x-cli-command": "profile view" },
    });

    expectTypeOf(result).toEqualTypeOf<ApiResponse<GetProfileResponse>>();
    expect(result.data).toEqual({
      success: true,
      data: {
        name: "Polymorfa",
        status: "Available",
        profilePicUrl: "https://cdn.example/profile.jpg",
      },
    });
    expect(result.metadata.requestId).toBe("req_profile");
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /api/support%2Feu/profile",
    ]);
    expect(requests[0]?.headers["polymorfa-version"]).toBe("next");
    expect(requests[0]?.headers["x-cli-command"]).toBe("profile view");
  });

  it("maps every profile mutation to its exact JSON route with idempotency", async () => {
    const { client, requests } = await profileServer();
    const profile = client.profile;
    const options = { idempotencyKey: "profile-change" } as const;

    const name = await profile.setName(
      "support/eu",
      { name: "Support" },
      options,
    );
    const status = await profile.setStatus(
      "support/eu",
      { status: "Available" },
      options,
    );
    const picture = await profile.setPicture(
      "support/eu",
      {
        url: "https://cdn.example/profile.jpg",
        base64: "cHJvZmlsZQ==",
      },
      options,
    );
    const deleted = await profile.deletePicture("support/eu", options);

    expectTypeOf(name).toEqualTypeOf<ApiResponse<SetProfileNameResponse>>();
    expectTypeOf(status).toEqualTypeOf<ApiResponse<SetProfileStatusResponse>>();
    expectTypeOf(picture).toEqualTypeOf<
      ApiResponse<SetProfilePictureResponse>
    >();
    expectTypeOf(deleted).toEqualTypeOf<
      ApiResponse<DeleteProfilePictureResponse>
    >();

    expect(
      requests.map(({ method, path, body }) => ({ method, path, body })),
    ).toEqual([
      {
        method: "PUT",
        path: "/api/support%2Feu/profile/name",
        body: '{"name":"Support"}',
      },
      {
        method: "PUT",
        path: "/api/support%2Feu/profile/status",
        body: '{"status":"Available"}',
      },
      {
        method: "PUT",
        path: "/api/support%2Feu/profile/picture",
        body: '{"url":"https://cdn.example/profile.jpg","base64":"cHJvZmlsZQ=="}',
      },
      {
        method: "DELETE",
        path: "/api/support%2Feu/profile/picture",
        body: "",
      },
    ]);
    expect(requests.map(({ headers }) => headers["idempotency-key"])).toEqual([
      "profile-change",
      "profile-change",
      "profile-change",
      "profile-change",
    ]);
  });
});
