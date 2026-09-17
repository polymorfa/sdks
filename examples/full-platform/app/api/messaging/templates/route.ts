import { messaging } from "../../../../lib/polymorfa.js";
import { env } from "../../../../lib/env.js";
import { action, route, text, unknownAction } from "../../../../lib/route.js";

// Listing and status changes. Create, load, update, preview, submit and delete
// run through the TemplateBuilder route at /api/polymorfa/templates.
export const GET = route("agent", () =>
  messaging().templates.list(env.projectSlug()),
);

export const POST = route("admin", async ({ body }) => {
  const templates = messaging().templates;
  const slug = env.projectSlug();
  const templateId = text(body, "templateId");
  switch (action(body)) {
    case "retrieve":
      return templates.retrieve(slug, templateId);
    case "rename":
      return templates.update(slug, templateId, { name: text(body, "name") });
    case "preview":
      return templates.preview(slug, templateId, {
        values: { name: "Ada" },
        surface: "sandbox",
      });
    case "submit":
      return templates.submit(slug, templateId, {
        session: env.templateSession(),
      });
    case "delete":
      return templates.delete(slug, templateId);
    default:
      return unknownAction(action(body));
  }
});
