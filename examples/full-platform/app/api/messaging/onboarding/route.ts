import { messaging } from "../../../../lib/polymorfa.js";
import { env } from "../../../../lib/env.js";
import {
  action,
  object,
  optionalFlag,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

export const POST = route("admin", async ({ body }) => {
  switch (action(body)) {
    case "advanceCloudSignup": {
      // Continues an issued Cloud API QuickLink after Meta Embedded Signup.
      const result = object(body, "result");
      const coexistence = optionalFlag(result, "coexistence");
      return messaging().cloudOnboarding.advance({
        quicklinkId: text(body, "quicklinkId"),
        result: {
          code: text(result, "code"),
          wabaId: text(result, "wabaId"),
          phoneNumberId: text(result, "phoneNumberId"),
          ...(coexistence === undefined ? {} : { coexistence }),
        },
      });
    }
    case "historyFixture":
      // Simulated history for testing sessions. Never use real content.
      return messaging().testing.createHistoryFixture(env.projectId(), {
        messages: [
          {
            id: "fixture-1",
            senderPhone: "+15550100",
            text: "Hi, where is my order?",
            timestamp: Date.now() - 60_000,
            fromMe: false,
          },
          {
            id: "fixture-2",
            senderPhone: "+15550100",
            text: "It ships tomorrow.",
            timestamp: Date.now(),
            fromMe: true,
          },
        ],
      });
    case "testingQuickLink": {
      // A QuickLink that opens a simulated testing session.
      const response = await messaging().quickLinks.create({
        configuration: {
          testing: {
            country: "US",
            configuration: {
              profile: { name: "Acme Test" },
              accountType: "business",
              replyBehavior: "echo",
            },
            editable: ["profile.name", "replyBehavior"],
          },
        },
      });
      return { url: response.data.data.url };
    }
    default:
      return unknownAction(action(body));
  }
});
