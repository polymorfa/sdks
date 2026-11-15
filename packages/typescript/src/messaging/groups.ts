import { requestContract } from "../campaign-contract-response.js";
import { existingOptions } from "../campaign-existing-validation.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  CreateGroupRequest,
  CreateGroupResponse,
  GetGroupInviteCodeResponse,
  GetGroupJoinInfoResponse,
  GetGroupParticipantsResponse,
  GetGroupResponse,
  GetGroupCapabilitiesResponse,
  GroupAdminOnlySettingRequest,
  GroupJoinApprovalRequest,
  GroupMemberAddModeRequest,
  GroupParticipantsRequest,
  JoinGroupRequest,
  ListGroupsResponse,
  RevokeGroupInviteCodeResponse,
  SetGroupFieldRequest,
  SetGroupPictureRequest,
  SuccessResponse,
} from "./types.js";

export class GroupsResource {
  constructor(private readonly transport: HttpTransport) {}

  list(
    connection: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListGroupsResponse>> {
    return this.get(groupsPath(connection), options);
  }

  create(
    connection: string,
    body: CreateGroupRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CreateGroupResponse>> {
    return this.mutate("POST", groupsPath(connection), body, options);
  }

  getJoinInfo(
    connection: string,
    code: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetGroupJoinInfoResponse>> {
    return this.transport.request({
      method: "GET",
      path: `${groupsPath(connection)}/join-info`,
      query: { code },
      ...options,
    });
  }

  join(
    connection: string,
    body: JoinGroupRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.mutate("POST", `${groupsPath(connection)}/join`, body, options);
  }

  retrieve(
    connection: string,
    groupId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetGroupResponse>> {
    return this.get(groupPath(connection, groupId), options);
  }

  /** Enrolled number-capabilities beta. Unknown until a group sync; no chat open. */
  getCapabilities(
    connection: string,
    groupId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetGroupCapabilitiesResponse>> {
    return requestContract(
      this.transport,
      {
        ...existingOptions(options),
        method: "GET",
        path: `${groupPath(connection, groupId)}/capabilities`,
      },
      "groupCapabilities",
      true,
    );
  }

  delete(
    connection: string,
    groupId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.mutate(
      "DELETE",
      groupPath(connection, groupId),
      undefined,
      options,
    );
  }

  leave(
    connection: string,
    groupId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.mutate(
      "POST",
      `${groupPath(connection, groupId)}/leave`,
      undefined,
      options,
    );
  }

  setSubject(
    connection: string,
    groupId: string,
    body: SetGroupFieldRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.putGroupSubresource(connection, groupId, "subject", body, options);
  }

  setDescription(
    connection: string,
    groupId: string,
    body: SetGroupFieldRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.putGroupSubresource(
      connection,
      groupId,
      "description",
      body,
      options,
    );
  }

  getInviteCode(
    connection: string,
    groupId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetGroupInviteCodeResponse>> {
    return this.get(`${groupPath(connection, groupId)}/invite-code`, options);
  }

  revokeInviteCode(
    connection: string,
    groupId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<RevokeGroupInviteCodeResponse>> {
    return this.mutate(
      "POST",
      `${groupPath(connection, groupId)}/invite-code/revoke`,
      undefined,
      options,
    );
  }

  listParticipants(
    connection: string,
    groupId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetGroupParticipantsResponse>> {
    return this.get(`${groupPath(connection, groupId)}/participants`, options);
  }

  addParticipants(
    connection: string,
    groupId: string,
    body: GroupParticipantsRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.participantAction(connection, groupId, "add", body, options);
  }

  removeParticipants(
    connection: string,
    groupId: string,
    body: GroupParticipantsRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.participantAction(connection, groupId, "remove", body, options);
  }

  promoteParticipants(
    connection: string,
    groupId: string,
    body: GroupParticipantsRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.adminAction(connection, groupId, "promote", body, options);
  }

  demoteParticipants(
    connection: string,
    groupId: string,
    body: GroupParticipantsRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.adminAction(connection, groupId, "demote", body, options);
  }

  setPicture(
    connection: string,
    groupId: string,
    body: SetGroupPictureRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.putGroupSubresource(connection, groupId, "picture", body, options);
  }

  setInfoEditing(
    connection: string,
    groupId: string,
    body: GroupAdminOnlySettingRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.putGroupSubresource(
      connection,
      groupId,
      "settings/info-edit",
      body,
      options,
    );
  }

  setMessaging(
    connection: string,
    groupId: string,
    body: GroupAdminOnlySettingRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.putGroupSubresource(
      connection,
      groupId,
      "settings/messages",
      body,
      options,
    );
  }

  setMemberAddMode(
    connection: string,
    groupId: string,
    body: GroupMemberAddModeRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.putGroupSubresource(
      connection,
      groupId,
      "settings/member-add",
      body,
      options,
    );
  }

  setJoinApproval(
    connection: string,
    groupId: string,
    body: GroupJoinApprovalRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.putGroupSubresource(
      connection,
      groupId,
      "settings/join-approval",
      body,
      options,
    );
  }

  private get<T>(
    path: string,
    options: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.transport.request({ method: "GET", path, ...options });
  }

  private putGroupSubresource<TBody>(
    connection: string,
    groupId: string,
    resource:
      | "subject"
      | "description"
      | "picture"
      | "settings/info-edit"
      | "settings/messages"
      | "settings/member-add"
      | "settings/join-approval",
    body: TBody,
    options: RequestOptions,
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.mutate(
      "PUT",
      `${groupPath(connection, groupId)}/${resource}`,
      body,
      options,
    );
  }

  private participantAction(
    connection: string,
    groupId: string,
    action: "add" | "remove",
    body: GroupParticipantsRequest,
    options: RequestOptions,
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.mutate(
      "POST",
      `${groupPath(connection, groupId)}/participants/${action}`,
      body,
      options,
    );
  }

  private adminAction(
    connection: string,
    groupId: string,
    action: "promote" | "demote",
    body: GroupParticipantsRequest,
    options: RequestOptions,
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.mutate(
      "POST",
      `${groupPath(connection, groupId)}/admin/${action}`,
      body,
      options,
    );
  }

  private mutate<T>(
    method: "POST" | "PUT" | "DELETE",
    path: string,
    body: unknown,
    options: RequestOptions,
  ): Promise<ApiResponse<T>> {
    return this.transport.request({ method, path, body, ...options });
  }
}

function groupsPath(connection: string): string {
  return `/messaging/${encodeURIComponent(connection)}/groups`;
}

function groupPath(connection: string, groupId: string): string {
  return `${groupsPath(connection)}/${encodeURIComponent(groupId)}`;
}
