import { desk } from "../../../../lib/desk/data.js";
import type { ContactPatch } from "../../../../lib/desk/types.js";
import {
  InputError,
  action,
  object,
  optionalFlag,
  optionalText,
  route,
  text,
  texts,
  unknownAction,
  type Body,
} from "../../../../lib/route.js";

export const GET = route(
  "agent",
  async ({ url }) =>
    (await desk()).listContacts(url.searchParams.get("search") ?? undefined),
  { demo: "handler" },
);

export const POST = route(
  "agent",
  async ({ body }) => {
    const data = await desk();
    switch (action(body)) {
      case "update":
        return data.updateContact(text(body, "contactId"), patch(body));
      case "import": {
        const rows = body.rows;
        if (!Array.isArray(rows) || rows.length > 5000) {
          throw new InputError("rows must be an array of up to 5000 contacts.");
        }
        return data.importContacts(
          rows.map((row: unknown) => {
            const entry = (row ?? {}) as Body;
            return {
              name:
                typeof entry.name === "string" ? entry.name.slice(0, 80) : "",
              phone:
                typeof entry.phone === "string"
                  ? entry.phone.replace(/[\s()-]/g, "")
                  : "",
            };
          }),
        );
      }
      default:
        return unknownAction(action(body));
    }
  },
  { demo: "handler" },
);

function patch(body: Body): ContactPatch {
  const name = optionalText(body, "name");
  const notes =
    typeof body.notes === "string" ? body.notes.slice(0, 2000) : undefined;
  const blocked = optionalFlag(body, "blocked");
  const muted = optionalFlag(body, "muted");
  let customFields: Record<string, string> | undefined;
  if (body.customFields !== undefined) {
    const fields = object(body, "customFields");
    customFields = {};
    for (const [key, value] of Object.entries(fields)) {
      if (typeof value !== "string") {
        throw new InputError("customFields values must be strings.");
      }
      customFields[key.slice(0, 40)] = value.slice(0, 200);
    }
  }
  return {
    ...(name === undefined ? {} : { name }),
    ...(notes === undefined ? {} : { notes }),
    ...(blocked === undefined ? {} : { blocked }),
    ...(muted === undefined ? {} : { muted }),
    ...(body.tags === undefined
      ? {}
      : {
          tags:
            Array.isArray(body.tags) && body.tags.length === 0
              ? []
              : texts(body, "tags"),
        }),
    ...(customFields === undefined ? {} : { customFields }),
  };
}
