import {
  PRIVACY_SETTING_VALUES,
  type PrivacySettingMutation,
  type PrivacySettingName,
} from "@polymorfa/sdk";

import { messaging } from "../../../../lib/polymorfa.js";
import {
  InputError,
  action,
  oneOf,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

const TIMERS = { off: 0, "24h": 86400, "7d": 604800, "90d": 7776000 } as const;

export const GET = route("admin", ({ body, sessionOf }) =>
  messaging().privacy.get(sessionOf(body)),
);

export const POST = route("admin", async ({ body, sessionOf }) => {
  const privacy = messaging().privacy;
  const session = sessionOf(body);
  switch (action(body)) {
    case "set":
      return privacy.set(session, mutation(body.setting, text(body, "value")));
    case "defaultTimer":
      return privacy.setDefaultDisappearingTimer(session, {
        durationSeconds:
          TIMERS[oneOf(body, "timer", ["off", "24h", "7d", "90d"])],
      });
    default:
      return unknownAction(action(body));
  }
});

function mutation(setting: unknown, value: string): PrivacySettingMutation {
  if (
    typeof setting !== "string" ||
    !Object.hasOwn(PRIVACY_SETTING_VALUES, setting)
  ) {
    throw new InputError("Unknown privacy setting.");
  }
  const name = setting as PrivacySettingName;
  const allowed: readonly string[] = PRIVACY_SETTING_VALUES[name];
  if (!allowed.includes(value)) {
    throw new InputError(`${name} does not accept ${value}.`);
  }
  // The table check above guarantees the pair is valid.
  return { setting: name, value } as PrivacySettingMutation;
}
