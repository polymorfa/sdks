import { organization } from "../../../../lib/polymorfa.js";
import {
  action,
  integer,
  object,
  optionalInteger,
  optionalText,
  route,
  text,
  texts,
  unknownAction,
  InputError,
  type Body,
} from "../../../../lib/route.js";

/** Reads the blocked country codes and the first page of the do-not-call list. */
export const GET = route("admin", async ({ url }) => {
  const client = organization();
  const cursor = url.searchParams.get("cursor");
  const [policy, page] = await Promise.all([
    client.callPolicy.retrieve(),
    client.callOptOuts.list({
      limit: 50,
      ...(cursor === null ? {} : { cursor }),
    }),
  ]);
  return {
    policy: policy.data,
    optOuts: page.items,
    nextCursor: page.nextCursor ?? null,
  };
});

export const POST = route("admin", async ({ body }) => {
  const client = organization();
  switch (action(body)) {
    case "setBlockedCountryCodes":
      return client.callPolicy.update({
        blockedCountryCodes: texts(body, "blockedCountryCodes"),
        ...(optionalInteger(body, "expectedRevision") === undefined
          ? {}
          : { expectedRevision: integer(body, "expectedRevision") }),
      });
    case "addOptOut": {
      // The API answers 201 for a new entry and 200 for one already listed.
      const added = await client.callOptOuts.create(optOutInput(body));
      return { entry: added.data, created: added.metadata.status === 201 };
    }
    case "importOptOuts": {
      const entries = body["entries"];
      if (!Array.isArray(entries)) {
        throw new InputError("entries must be an array.");
      }
      return client.callOptOuts.import({
        entries: entries.map((entry) =>
          optOutInput(object({ entry }, "entry")),
        ),
      });
    }
    case "removeOptOut":
      return client.callOptOuts.delete(text(body, "optOutId"));
    default:
      return unknownAction(action(body));
  }
});

/** Exactly one of phoneNumber (E.164) or bsuid, with an optional note. */
function optOutInput(body: Body) {
  const phoneNumber = optionalText(body, "phoneNumber");
  const bsuid = optionalText(body, "bsuid");
  const note = optionalText(body, "note");
  if ((phoneNumber === undefined) === (bsuid === undefined)) {
    throw new InputError("Supply exactly one of phoneNumber or bsuid.");
  }
  return phoneNumber === undefined
    ? { bsuid: bsuid!, ...(note === undefined ? {} : { note }) }
    : { phoneNumber, ...(note === undefined ? {} : { note }) };
}
