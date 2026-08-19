import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  CreateGroupRequest,
  CreateGroupResponse,
  GetGroupInviteCodeResponse,
  GetGroupJoinInfoResponse,
  GetGroupParticipantsResponse,
  GetGroupResponse,
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
    session: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<ListGroupsResponse>> {
    return this.get(groupsPath(session), options);
  }

  create(
    session: string,
    body: CreateGroupRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<CreateGroupResponse>> {
    return this.mutate("POST", groupsPath(session), body, options);
  }

  getJoinInfo(
    session: string,
    code: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetGroupJoinInfoResponse>> {
    return this.transport.request({
      method: "GET",
      path: `${groupsPath(session)}/join-info`,
      query: { code },
      ...options,
    });
  }

  join(
    session: string,
    body: JoinGroupRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.mutate("POST", `${groupsPath(session)}/join`, body, options);
  }

  retrieve(
    session: string,
    groupId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetGroupResponse>> {
    return this.get(groupPath(session, groupId), options);
  }

  delete(
    session: string,
    groupId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.mutate(
      "DELETE",
      groupPath(session, groupId),
      undefined,
      options,
    );
  }

  leave(
    session: string,
    groupId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.mutate(
      "POST",
      `${groupPath(session, groupId)}/leave`,
      undefined,
      options,
    );
  }

  setSubject(
    session: string,
    groupId: string,
    body: SetGroupFieldRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.putGroupSubresource(session, groupId, "subject", body, options);
  }

  setDescription(
    session: string,
    groupId: string,
    body: SetGroupFieldRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.putGroupSubresource(
      session,
      groupId,
      "description",
      body,
      options,
    );
  }

  getInviteCode(
    session: string,
    groupId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetGroupInviteCodeResponse>> {
    return this.get(`${groupPath(session, groupId)}/invite-code`, options);
  }

  revokeInviteCode(
    session: string,
    groupId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<RevokeGroupInviteCodeResponse>> {
    return this.mutate(
      "POST",
      `${groupPath(session, groupId)}/invite-code/revoke`,
      undefined,
      options,
    );
  }

  listParticipants(
    session: string,
    groupId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<GetGroupParticipantsResponse>> {
    return this.get(`${groupPath(session, groupId)}/participants`, options);
  }

  addParticipants(
    session: string,
    groupId: string,
    body: GroupParticipantsRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.participantAction(session, groupId, "add", body, options);
  }

  removeParticipants(
    session: string,
    groupId: string,
    body: GroupParticipantsRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.participantAction(session, groupId, "remove", body, options);
  }

  promoteParticipants(
    session: string,
    groupId: string,
    body: GroupParticipantsRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.adminAction(session, groupId, "promote", body, options);
  }

  demoteParticipants(
    session: string,
    groupId: string,
    body: GroupParticipantsRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.adminAction(session, groupId, "demote", body, options);
  }

  setPicture(
    session: string,
    groupId: string,
    body: SetGroupPictureRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.putGroupSubresource(session, groupId, "picture", body, options);
  }

  setInfoEditing(
    session: string,
    groupId: string,
    body: GroupAdminOnlySettingRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.putGroupSubresource(
      session,
      groupId,
      "settings/info-edit",
      body,
      options,
    );
  }

  setMessaging(
    session: string,
    groupId: string,
    body: GroupAdminOnlySettingRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.putGroupSubresource(
      session,
      groupId,
      "settings/messages",
      body,
      options,
    );
  }

  setMemberAddMode(
    session: string,
    groupId: string,
    body: GroupMemberAddModeRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.putGroupSubresource(
      session,
      groupId,
      "settings/member-add",
      body,
      options,
    );
  }

  setJoinApproval(
    session: string,
    groupId: string,
    body: GroupJoinApprovalRequest,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.putGroupSubresource(
      session,
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
    session: string,
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
      `${groupPath(session, groupId)}/${resource}`,
      body,
      options,
    );
  }

  private participantAction(
    session: string,
    groupId: string,
    action: "add" | "remove",
    body: GroupParticipantsRequest,
    options: RequestOptions,
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.mutate(
      "POST",
      `${groupPath(session, groupId)}/participants/${action}`,
      body,
      options,
    );
  }

  private adminAction(
    session: string,
    groupId: string,
    action: "promote" | "demote",
    body: GroupParticipantsRequest,
    options: RequestOptions,
  ): Promise<ApiResponse<SuccessResponse>> {
    return this.mutate(
      "POST",
      `${groupPath(session, groupId)}/admin/${action}`,
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

function groupsPath(session: string): string {
  return `/api/${encodeURIComponent(session)}/groups`;
}

function groupPath(session: string, groupId: string): string {
  return `${groupsPath(session)}/${encodeURIComponent(groupId)}`;
}
