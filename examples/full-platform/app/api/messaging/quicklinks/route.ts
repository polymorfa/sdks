import { messaging } from "../../../../lib/polymorfa.js";
import {
  action,
  idempotencyKey,
  optionalText,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

// QuickLink is a hosted page. Create a link here and send the person to its
// `url`; nothing is embedded in this application.
export const POST = route("admin", async ({ body, request }) => {
  const quickLinks = messaging().quickLinks;
  switch (action(body)) {
    case "create": {
      const externalId = optionalText(body, "externalId");
      const phone = optionalText(body, "phone");
      const response = await quickLinks.create(
        {
          ...(externalId === undefined ? {} : { externalId }),
          configuration: {
            connectionPreference: "both",
            methods: ["qr", "pairing"],
            historySync: { consent: "ask", mode: "metadata_only" },
            ...(phone === undefined ? {} : { prefillPhone: phone }),
          },
        },
        { idempotencyKey: idempotencyKey(request) },
      );
      const { id, url, session, expiresAt } = response.data.data;
      return { id, url, session, expiresAt };
    }
    case "retrieve":
      return quickLinks.retrieve(text(body, "id"));
    case "cancel":
      return quickLinks.cancel(text(body, "id"));
    default:
      return unknownAction(action(body));
  }
});
