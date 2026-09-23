import { describe, expect, it } from "vitest";
import {
  CallClaimedError,
  CallsApiError,
  CallsDisabledError,
} from "../src/index.js";
import { callsHttpError } from "../src/internal.js";

describe("callsHttpError", () => {
  it("maps the stable call refusals to their error classes", () => {
    expect(callsHttpError(409, "call_claimed", "Claimed")).toBeInstanceOf(
      CallClaimedError,
    );
    const disabled = callsHttpError(403, "calls_disabled", "Calling is off");
    expect(disabled).toBeInstanceOf(CallsDisabledError);
    expect(disabled).toMatchObject({
      status: 403,
      code: "calls_disabled",
      message: "Calling is off",
    });
    expect(new CallsDisabledError().message).toBe(
      "Calling is turned off for this number.",
    );
  });

  it("keeps other failures generic", () => {
    const denied = callsHttpError(403, "permission_denied", "No");
    expect(denied).toBeInstanceOf(CallsApiError);
    expect(denied).not.toBeInstanceOf(CallsDisabledError);
    expect(callsHttpError(500, undefined, "Down").code).toBe("http_500");
  });
});
