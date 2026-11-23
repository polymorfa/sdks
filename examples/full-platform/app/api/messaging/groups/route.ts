import { messaging } from "../../../../lib/polymorfa.js";
import {
  action,
  flag,
  oneOf,
  route,
  text,
  texts,
  unknownAction,
} from "../../../../lib/route.js";

export const GET = route("agent", ({ body, connectionOf }) =>
  messaging().groups.list(connectionOf(body)),
);

export const POST = route("agent", async ({ body, connectionOf }) => {
  const groups = messaging().groups;
  const connection = connectionOf(body);
  const name = action(body);
  switch (name) {
    case "create":
      return groups.create(connection, {
        name: text(body, "name"),
        participants: texts(body, "participants"),
      });
    case "joinInfo":
      return groups.getJoinInfo(connection, text(body, "code"));
    case "join":
      return groups.join(connection, { code: text(body, "code") });
  }

  const groupId = text(body, "groupId");
  const participants = () => ({ participants: texts(body, "participants") });
  switch (name) {
    case "retrieve":
      return groups.retrieve(connection, groupId);
    case "delete":
      return groups.delete(connection, groupId);
    case "leave":
      return groups.leave(connection, groupId);
    case "setSubject":
      return groups.setSubject(connection, groupId, {
        value: text(body, "value"),
      });
    case "setDescription":
      return groups.setDescription(connection, groupId, {
        value: text(body, "value"),
      });
    case "inviteCode":
      return groups.getInviteCode(connection, groupId);
    case "revokeInviteCode":
      return groups.revokeInviteCode(connection, groupId);
    case "participants":
      return groups.listParticipants(connection, groupId);
    case "addParticipants":
      return groups.addParticipants(connection, groupId, participants());
    case "removeParticipants":
      return groups.removeParticipants(connection, groupId, participants());
    case "promoteParticipants":
      return groups.promoteParticipants(connection, groupId, participants());
    case "demoteParticipants":
      return groups.demoteParticipants(connection, groupId, participants());
    case "setPicture":
      return groups.setPicture(connection, groupId, { url: text(body, "url") });
    case "setInfoEditing":
      return groups.setInfoEditing(connection, groupId, {
        adminsOnly: flag(body, "adminsOnly"),
      });
    case "setMessaging":
      return groups.setMessaging(connection, groupId, {
        adminsOnly: flag(body, "adminsOnly"),
      });
    case "setMemberAddMode":
      return groups.setMemberAddMode(connection, groupId, {
        mode: oneOf(body, "mode", ["admin_add", "all_member_add"]),
      });
    case "setJoinApproval":
      return groups.setJoinApproval(connection, groupId, {
        required: flag(body, "required"),
      });
    default:
      return unknownAction(name);
  }
});
