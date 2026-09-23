import { organization, project } from "../../../../lib/polymorfa.js";
import {
  action,
  integer,
  optionalText,
  route,
  unknownAction,
} from "../../../../lib/route.js";

// Session configuration defaults and saved QuickLink branding, for the team
// (organization view) and for this project (project view).
export const GET = route("admin", async () => {
  const [teamConfig, projectConfig, teamLinks, projectLinks] =
    await Promise.all([
      organization().sessionConfiguration.retrieve(),
      project().sessionConfiguration.retrieve(),
      organization().quickLinkSettings.retrieve(),
      project().quickLinkSettings.retrieve(),
    ]);
  return {
    sessionConfiguration: {
      team: teamConfig.data,
      project: projectConfig.data,
    },
    quickLinkSettings: { team: teamLinks.data, project: projectLinks.data },
  };
});

export const POST = route("admin", async ({ body }) => {
  switch (action(body)) {
    case "projectObservation":
      // `revision` must match the value last read, or the API rejects the write.
      return project().sessionConfiguration.update({
        configuration: {
          set: {
            observation: { presenceMode: "cache", typingMode: "events" },
          },
        },
        revision: integer(body, "revision"),
      });
    case "projectQuickLink": {
      const successCallbackUrl = optionalText(body, "successCallbackUrl");
      return project().quickLinkSettings.update({
        enabled: true,
        businessName: "Acme Support",
        headline: "Connect your WhatsApp number",
        theme: "system",
        accent: "#5b4bf7",
        methods: ["qr", "pairing"],
        defaultMethod: "qr",
        historySync: "ask",
        allowPhoneChange: false,
        ...(successCallbackUrl === undefined ? {} : { successCallbackUrl }),
      });
    }
    case "teamQuickLink":
      return organization().quickLinkSettings.update({ theme: "dark" });
    default:
      return unknownAction(action(body));
  }
});
