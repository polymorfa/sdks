import { organization } from "../../../../lib/polymorfa.js";
import type { CreateAudienceRequest } from "@polymorfa/sdk";

import {
  action,
  object,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

// Audience creation and membership are typed; the remaining audience payloads
// stay open in the contract, so `payload` is forwarded.
export const GET = route("admin", () => organization().audiences.list());

export const POST = route("admin", async ({ body }) => {
  const audiences = organization().audiences;
  switch (action(body)) {
    case "create":
      return audiences.create(
        object(body, "payload") as unknown as CreateAudienceRequest,
      );
    case "retrieve":
      return audiences.retrieve(text(body, "listId"));
    case "delete":
      return audiences.delete(text(body, "listId"));
    case "createUpload":
      return audiences.createUpload(object(body, "payload"));
    case "addMembers":
      return audiences.addMembers(text(body, "listId"), {
        members: [],
        ...object(body, "payload"),
      } as Parameters<typeof audiences.addMembers>[1]);
    case "listMembers":
      return audiences.listMembers(text(body, "listId"));
    case "deleteMember":
      return audiences.deleteMember(
        text(body, "listId"),
        text(body, "phone"),
      );
    default:
      return unknownAction(action(body));
  }
});
