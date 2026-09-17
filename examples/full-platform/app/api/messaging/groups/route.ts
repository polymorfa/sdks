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
import { env } from "../../../../lib/env.js";

export const GET = route("agent", () => messaging().groups.list(env.session()));

export const POST = route("agent", async ({ body, sessionOf }) => {
  const groups = messaging().groups;
  const session = sessionOf(body);
  const name = action(body);
  switch (name) {
    case "create":
      return groups.create(session, {
        name: text(body, "name"),
        participants: texts(body, "participants"),
      });
    case "joinInfo":
      return groups.getJoinInfo(session, text(body, "code"));
    case "join":
      return groups.join(session, { code: text(body, "code") });
  }

  const groupId = text(body, "groupId");
  const participants = () => ({ participants: texts(body, "participants") });
  switch (name) {
    case "retrieve":
      return groups.retrieve(session, groupId);
    case "delete":
      return groups.delete(session, groupId);
    case "leave":
      return groups.leave(session, groupId);
    case "setSubject":
      return groups.setSubject(session, groupId, {
        value: text(body, "value"),
      });
    case "setDescription":
      return groups.setDescription(session, groupId, {
        value: text(body, "value"),
      });
    case "inviteCode":
      return groups.getInviteCode(session, groupId);
    case "revokeInviteCode":
      return groups.revokeInviteCode(session, groupId);
    case "participants":
      return groups.listParticipants(session, groupId);
    case "addParticipants":
      return groups.addParticipants(session, groupId, participants());
    case "removeParticipants":
      return groups.removeParticipants(session, groupId, participants());
    case "promoteParticipants":
      return groups.promoteParticipants(session, groupId, participants());
    case "demoteParticipants":
      return groups.demoteParticipants(session, groupId, participants());
    case "setPicture":
      return groups.setPicture(session, groupId, { url: text(body, "url") });
    case "setInfoEditing":
      return groups.setInfoEditing(session, groupId, {
        adminsOnly: flag(body, "adminsOnly"),
      });
    case "setMessaging":
      return groups.setMessaging(session, groupId, {
        adminsOnly: flag(body, "adminsOnly"),
      });
    case "setMemberAddMode":
      return groups.setMemberAddMode(session, groupId, {
        mode: oneOf(body, "mode", ["admin_add", "all_member_add"]),
      });
    case "setJoinApproval":
      return groups.setJoinApproval(session, groupId, {
        required: flag(body, "required"),
      });
    default:
      return unknownAction(name);
  }
});
