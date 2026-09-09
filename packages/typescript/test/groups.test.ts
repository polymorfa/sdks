import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  MessagingClient,
  type ApiResponse,
  type CreateGroupRequest,
  type Group,
  type GroupAdminOnlySettingRequest,
  type GroupInviteInfo,
  type GroupJoinApprovalRequest,
  type GroupMemberAddModeRequest,
  type GroupParticipant,
  type GroupParticipantsRequest,
  type JoinGroupRequest,
  type ListGroupsResponse,
  type SetGroupFieldRequest,
  type SetGroupPictureRequest,
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

async function groupsServer(): Promise<{
  client: MessagingClient;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer(() => ({
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_groups",
    },
    body: '{"success":true,"data":[]}',
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

describe("MessagingClient groups", () => {
  it("exports the exact group and request shapes from the pinned contract", () => {
    expectTypeOf<GroupParticipant>().toEqualTypeOf<{
      readonly lid: string;
      readonly phoneNumber?: string;
      readonly isAdmin: boolean;
      readonly isSuperAdmin: boolean;
      readonly id?: string;
      readonly username?: string;
    }>();
    expectTypeOf<Group>().toEqualTypeOf<{
      readonly id: string;
      readonly name: string;
      readonly description: string;
      readonly ownerLid: string;
      readonly createdAt: number;
      readonly participants: readonly GroupParticipant[];
      readonly ownerId?: string;
    }>();
    expectTypeOf<GroupInviteInfo>().toEqualTypeOf<{
      readonly id: string;
      readonly subject: string;
      readonly creatorLid: string;
      readonly createdAt: number;
      readonly size: number;
      readonly participants: readonly GroupParticipant[];
      readonly creatorId?: string;
    }>();
    expectTypeOf<CreateGroupRequest>().toEqualTypeOf<{
      readonly name: string;
      readonly participants: readonly string[];
    }>();
    expectTypeOf<GroupParticipantsRequest>().toEqualTypeOf<{
      readonly participants: readonly string[];
    }>();
    expectTypeOf<SetGroupFieldRequest>().toEqualTypeOf<{
      readonly value: string;
    }>();
    expectTypeOf<SetGroupPictureRequest>().toEqualTypeOf<{
      readonly url?: string;
      readonly base64?: string;
    }>();
    expectTypeOf<JoinGroupRequest>().toEqualTypeOf<{
      readonly code: string;
    }>();
    expectTypeOf<GroupAdminOnlySettingRequest>().toEqualTypeOf<{
      readonly adminsOnly: boolean;
    }>();
    expectTypeOf<GroupMemberAddModeRequest>().toEqualTypeOf<{
      readonly mode: "admin_add" | "all_member_add";
    }>();
    expectTypeOf<GroupJoinApprovalRequest>().toEqualTypeOf<{
      readonly required: boolean;
    }>();
  });

  it("maps every group read with encoded identifiers and response metadata", async () => {
    const { client, requests } = await groupsServer();
    const session = "support/eu";
    const groupId = "120363/group@g.us";

    const listed = await client.groups.list(session, { apiVersion: "next" });
    await client.groups.retrieve(session, groupId);
    await client.groups.getJoinInfo(session, "invite/code");
    await client.groups.getInviteCode(session, groupId);
    await client.groups.listParticipants(session, groupId);

    expectTypeOf(listed).toEqualTypeOf<ApiResponse<ListGroupsResponse>>();
    expect(listed.metadata.requestId).toBe("req_groups");
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /messaging/support%2Feu/groups",
      "GET /messaging/support%2Feu/groups/120363%2Fgroup%40g.us",
      "GET /messaging/support%2Feu/groups/join-info?code=invite%2Fcode",
      "GET /messaging/support%2Feu/groups/120363%2Fgroup%40g.us/invite-code",
      "GET /messaging/support%2Feu/groups/120363%2Fgroup%40g.us/participants",
    ]);
    expect(requests[0]?.headers["polymorfa-version"]).toBe("next");
  });

  it("maps group lifecycle mutations and preserves idempotency options", async () => {
    const { client, requests } = await groupsServer();
    const session = "support/eu";
    const groupId = "120363/group@g.us";
    const options = { idempotencyKey: "group-lifecycle" } as const;

    await client.groups.create(
      session,
      { name: "Support", participants: ["15551234567"] },
      options,
    );
    await client.groups.join(session, { code: "invite/code" }, options);
    await client.groups.delete(session, groupId, options);
    await client.groups.leave(session, groupId, options);

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /messaging/support%2Feu/groups",
      "POST /messaging/support%2Feu/groups/join",
      "DELETE /messaging/support%2Feu/groups/120363%2Fgroup%40g.us",
      "POST /messaging/support%2Feu/groups/120363%2Fgroup%40g.us/leave",
    ]);
    expect(requests.map(({ body }) => body)).toEqual([
      '{"name":"Support","participants":["15551234567"]}',
      '{"code":"invite/code"}',
      "",
      "",
    ]);
    expect(requests.map(({ headers }) => headers["idempotency-key"])).toEqual([
      "group-lifecycle",
      "group-lifecycle",
      "group-lifecycle",
      "group-lifecycle",
    ]);
  });

  it("maps participant administration with exact request bodies", async () => {
    const { client, requests } = await groupsServer();
    const session = "support";
    const groupId = "120363@g.us";
    const body = { participants: ["15551234567", "15557654321"] } as const;
    const options = { idempotencyKey: "group-participants" } as const;

    await client.groups.addParticipants(session, groupId, body, options);
    await client.groups.removeParticipants(session, groupId, body, options);
    await client.groups.promoteParticipants(session, groupId, body, options);
    await client.groups.demoteParticipants(session, groupId, body, options);

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /messaging/support/groups/120363%40g.us/participants/add",
      "POST /messaging/support/groups/120363%40g.us/participants/remove",
      "POST /messaging/support/groups/120363%40g.us/admin/promote",
      "POST /messaging/support/groups/120363%40g.us/admin/demote",
    ]);
    expect(requests.map(({ body: requestBody }) => requestBody)).toEqual([
      '{"participants":["15551234567","15557654321"]}',
      '{"participants":["15551234567","15557654321"]}',
      '{"participants":["15551234567","15557654321"]}',
      '{"participants":["15551234567","15557654321"]}',
    ]);
  });

  it("maps group profile, invite, and permission mutations", async () => {
    const { client, requests } = await groupsServer();
    const session = "support";
    const groupId = "120363@g.us";
    const options = { idempotencyKey: "group-settings" } as const;

    await client.groups.setSubject(
      session,
      groupId,
      { value: "Support" },
      options,
    );
    await client.groups.setDescription(
      session,
      groupId,
      { value: "Customer support" },
      options,
    );
    await client.groups.revokeInviteCode(session, groupId, options);
    await client.groups.setPicture(
      session,
      groupId,
      { url: "https://cdn.example.test/group.jpg" },
      options,
    );
    await client.groups.setInfoEditing(
      session,
      groupId,
      { adminsOnly: true },
      options,
    );
    await client.groups.setMessaging(
      session,
      groupId,
      { adminsOnly: false },
      options,
    );
    await client.groups.setMemberAddMode(
      session,
      groupId,
      { mode: "all_member_add" },
      options,
    );
    await client.groups.setJoinApproval(
      session,
      groupId,
      { required: true },
      options,
    );

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "PUT /messaging/support/groups/120363%40g.us/subject",
      "PUT /messaging/support/groups/120363%40g.us/description",
      "POST /messaging/support/groups/120363%40g.us/invite-code/revoke",
      "PUT /messaging/support/groups/120363%40g.us/picture",
      "PUT /messaging/support/groups/120363%40g.us/settings/info-edit",
      "PUT /messaging/support/groups/120363%40g.us/settings/messages",
      "PUT /messaging/support/groups/120363%40g.us/settings/member-add",
      "PUT /messaging/support/groups/120363%40g.us/settings/join-approval",
    ]);
    expect(requests.map(({ body }) => body)).toEqual([
      '{"value":"Support"}',
      '{"value":"Customer support"}',
      "",
      '{"url":"https://cdn.example.test/group.jpg"}',
      '{"adminsOnly":true}',
      '{"adminsOnly":false}',
      '{"mode":"all_member_add"}',
      '{"required":true}',
    ]);
    expect(requests.map(({ headers }) => headers["idempotency-key"])).toEqual([
      "group-settings",
      "group-settings",
      "group-settings",
      "group-settings",
      "group-settings",
      "group-settings",
      "group-settings",
      "group-settings",
    ]);
  });
});
