import { describe, expect, it, vi } from "vitest";

import {
  POLYMORFA_ERROR_CODES,
  PolymorfaError,
  PolymorfaRateLimitError,
  PolymorfaValidationError,
  isKnownPolymorfaErrorCode,
  type PolymorfaErrorCode,
} from "../src/index.js";
import { HttpTransport } from "../src/transport/http.js";
import { PENDING_ERROR_CODES } from "./support/pending-contract.js";

const REQUEST_ID = "5f0c2a8e-3b1d-4c6f-9e2a-7d4b1c8f6a30";
const LOG_URL = `https://www.polymorfa.com/console/acme/support-bot/logs/api?request_id=${REQUEST_ID}`;

function transportReturning(response: () => Response): HttpTransport {
  return new HttpTransport({
    baseUrl: "https://api.example.com",
    authorization: "Bearer pmfa_example",
    timeoutMs: 500,
    maxNetworkRetries: 0,
    sleep: async () => undefined,
    random: () => 0,
    fetch: vi.fn<typeof globalThis.fetch>(async () => response()),
  });
}

async function failure(response: () => Response): Promise<PolymorfaError> {
  try {
    await transportReturning(response).request({
      method: "POST",
      path: "/messaging/sales/messages",
      body: {},
    });
  } catch (error) {
    return error as PolymorfaError;
  }
  throw new Error("expected a failure");
}

function publicError(
  status: number,
  code: string,
  extra: Record<string, unknown> = {},
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    {
      error: {
        type: "invalid_request_error",
        code,
        message: "Readable message.",
        param: null,
        ...extra,
      },
      data: null,
      docs: `https://docs.polymorfa.com/api/errors#${code.replaceAll("_", "-")}`,
    },
    { status, headers: { "x-request-id": REQUEST_ID, ...headers } },
  );
}

describe("error body fields", () => {
  it("exposes the request ID, log link, doc URL, and code", async () => {
    const error = await failure(() =>
      publicError(400, "conversation_window_closed", {
        request_id: REQUEST_ID,
        request_log_url: LOG_URL,
      }),
    );
    expect(error).toBeInstanceOf(PolymorfaValidationError);
    expect(error).toMatchObject({
      status: 400,
      code: "conversation_window_closed",
      message: "Readable message.",
      requestId: REQUEST_ID,
      requestLogUrl: LOG_URL,
      docUrl:
        "https://docs.polymorfa.com/api/errors#conversation-window-closed",
    });
    expect(error.metadata?.requestId).toBe(REQUEST_ID);
  });

  it("prefers the body request ID and falls back to the header", async () => {
    const fromBody = await failure(() =>
      publicError(404, "resource_not_found", { request_id: "req_body" }),
    );
    expect(fromBody.requestId).toBe("req_body");

    const fromHeader = await failure(() =>
      publicError(404, "resource_not_found"),
    );
    expect(fromHeader.requestId).toBe(REQUEST_ID);
    expect(fromHeader.requestLogUrl).toBeUndefined();
  });

  it("reads the rate-limit reason and keeps 413 a validation error", async () => {
    const limited = await failure(() =>
      publicError(
        429,
        "whatsapp_rate_limited",
        { request_id: REQUEST_ID },
        { "polymorfa-ratelimit-reason": "whatsapp", "retry-after": "5" },
      ),
    );
    expect(limited).toBeInstanceOf(PolymorfaRateLimitError);
    expect(limited.rateLimitReason).toBe("whatsapp");
    expect(limited.metadata?.headers["polymorfa-ratelimit-reason"]).toBe(
      "whatsapp",
    );

    const tooLarge = await failure(() =>
      publicError(413, "media_too_large", { param: "content.image.url" }),
    );
    expect(tooLarge).toBeInstanceOf(PolymorfaValidationError);
    expect(tooLarge.code).toBe("media_too_large");
  });

  it("still reads the older flat error shape", async () => {
    const error = await failure(() =>
      Response.json(
        { error: "legacy", code: "bansafe_cold_blocked" },
        { status: 403, headers: { "x-request-id": "req_legacy" } },
      ),
    );
    expect(error).toMatchObject({
      code: "bansafe_cold_blocked",
      requestId: "req_legacy",
      message: "legacy",
    });
    expect(error.docUrl).toBeUndefined();
  });
});

describe("error codes", () => {
  it("lists the WhatsApp and BanSafe codes the API documents", () => {
    for (const code of [
      "recipient_not_on_whatsapp",
      "conversation_window_closed",
      "template_not_approved",
      "media_too_large",
      "whatsapp_rate_limited",
      "new_chat_limit_reached",
      "whatsapp_account_restricted",
      "bansafe_throttled",
      "session_not_ready",
    ]) {
      expect(isKnownPolymorfaErrorCode(code), code).toBe(true);
    }
    expect(new Set(POLYMORFA_ERROR_CODES).size).toBe(
      POLYMORFA_ERROR_CODES.length,
    );
    expect(isKnownPolymorfaErrorCode("not_a_code")).toBe(false);
  });

  it("matches the pinned Messaging and Platform error code contracts", async () => {
    const { readFile } = await import("node:fs/promises");
    const read = async (name: string) =>
      JSON.parse(
        await readFile(
          new URL(`../../../contracts/${name}`, import.meta.url),
          "utf8",
        ),
      ) as {
        components: {
          schemas: Record<
            string,
            {
              properties: {
                error: { properties: { code: { enum: string[] } } };
              };
            }
          >;
        };
      };
    const messaging = await read("openapi.messaging.json");
    const platform = await read("openapi.platform.json");
    const platformText = await readFile(
      new URL("../../../contracts/openapi.platform.json", import.meta.url),
      "utf8",
    );
    // Platform operations document these codes in prose rather than an enum.
    const documentedInProse = ["payg_required", "premium_required"];
    for (const code of documentedInProse) {
      expect(platformText).toContain(`code \`${code}\``);
    }
    const published = new Set([
      ...messaging.components.schemas.PublicError!.properties.error.properties
        .code.enum,
      ...platform.components.schemas.PlatformAccessPublicError!.properties.error
        .properties.code.enum,
      ...documentedInProse,
    ]);
    for (const code of PENDING_ERROR_CODES) {
      // Remove the code from pending-contract.ts once a snapshot publishes it.
      expect(published.has(code), code).toBe(false);
    }
    expect([...POLYMORFA_ERROR_CODES].sort()).toEqual(
      [...published, ...PENDING_ERROR_CODES].sort(),
    );
  });

  it("accepts codes added by a newer API", () => {
    const code: PolymorfaErrorCode = "a_future_code";
    expect(new PolymorfaError("x", { code }).code).toBe("a_future_code");
  });
});
