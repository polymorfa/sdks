import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { MessagingClient } from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
const f = JSON.parse(
  readFileSync(
    new URL(
      "../../../contracts/fixtures/passkeys.candidate.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const operations = [
  {
    method: "POST",
    suffix: "/challenge",
    body: f.issue,
    reply: f.ticket,
    call: (c: MessagingClient) => c.passkeys.issueChallenge(f.session, f.issue),
  },
  {
    method: "GET",
    suffix: "/challenge/ticket%2F%3F",
    body: undefined,
    reply: f.ticket,
    call: (c: MessagingClient) =>
      c.passkeys.getChallenge(f.session, f.ticketId),
  },
  {
    method: "POST",
    suffix: "/assertion",
    body: f.assertion,
    reply: f.assertionResult,
    call: (c: MessagingClient) =>
      c.passkeys.submitAssertion(f.session, f.assertion),
  },
  {
    method: "GET",
    suffix: "/confirmation",
    body: undefined,
    reply: {
      status: "code_available",
      ticketId: f.ticketId,
      code: "ABCD-EF12",
      skipHandoffUX: false,
    },
    call: (c: MessagingClient) => c.passkeys.getConfirmation(f.session),
  },
  {
    method: "POST",
    suffix: "/confirmation",
    body: f.confirm,
    reply: { status: "waiting_for_pairing" },
    call: (c: MessagingClient) => c.passkeys.confirm(f.session, f.confirm),
  },
];
describe("five direct passkey operations", () => {
  for (const [i, op] of operations.entries())
    it("wire " + i, async () => {
      const c = new MessagingClient({
        credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
        baseUrl: "https://api.example",
        fetch: async (url, init) => {
          expect(String(url)).toBe(
            "https://api.example/messaging/desk%2F1/passkey" + op.suffix,
          );
          expect(init?.method).toBe(op.method);
          expect(new Headers(init?.headers).get("authorization")).toBe(
            "Bearer " + ORGANIZATION_API_KEY,
          );
          expect(new Headers(init?.headers).get("polymorfa-version")).toBe(
            "2026-09-22",
          );
          expect(
            init?.body === undefined
              ? undefined
              : JSON.parse(String(init.body)),
          ).toEqual(op.body);
          return new Response(
            JSON.stringify({ success: true, data: op.reply }),
            { headers: { "content-type": "application/json" } },
          );
        },
      });
      expect((await op.call(c)).data).toEqual({
        success: true,
        data: op.reply,
      });
    });
  it("never retries uncertain writes even with an idempotency key", async () => {
    for (const kind of ["issue", "assertion", "confirm"]) {
      let calls = 0;
      const c = new MessagingClient({
        credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
        maxNetworkRetries: 3,
        fetch: async () => {
          calls++;
          return new Response(
            JSON.stringify({
              error: {
                code: "future_passkey_failure",
                message: "Unknown outcome",
              },
            }),
            { status: 503, headers: { "content-type": "application/json" } },
          );
        },
      });
      const options = { maxNetworkRetries: 3, idempotencyKey: "caller-key" };
      const invoke = () =>
        kind === "issue"
          ? c.passkeys.issueChallenge("s", f.issue, options)
          : kind === "assertion"
            ? c.passkeys.submitAssertion("s", f.assertion, options)
            : c.passkeys.confirm("s", f.confirm, options);
      await expect(invoke()).rejects.toMatchObject({
        code: "future_passkey_failure",
      });
      expect(calls).toBe(1);
    }
  });
  it("preserves all confirmation statuses and optional absence", async () => {
    for (const status of f.statuses) {
      const c = new MessagingClient({
        credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
        fetch: async () =>
          new Response(JSON.stringify({ success: true, data: { status } }), {
            headers: { "content-type": "application/json" },
          }),
      });
      expect((await c.passkeys.getConfirmation("s")).data.data).toEqual({
        status,
      });
    }
  });
  it("refuses client tokens and oversized bodies before I/O", () => {
    let calls = 0;
    const c = new MessagingClient({
      credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
      fetch: async () => {
        calls++;
        throw Error("unexpected");
      },
    });
    expect(() =>
      c.passkeys.submitAssertion("s", {
        ...f.assertion,
        assertion: {
          ...f.assertion.assertion,
          response: {
            ...f.assertion.assertion.response,
            signatureB64: "x".repeat(1048576),
          },
        },
      }),
    ).toThrow();
    expect(() =>
      c.passkeys.submitAssertion("s", {
        ...f.assertion,
        assertion: { ...f.assertion.assertion, id: "x".repeat(1365) },
      }),
    ).toThrow();
    expect(() =>
      c.passkeys.confirm("s", { ticketId: "x", code: "abcd-1234" }),
    ).toThrow();
    const browser = new MessagingClient({
      credential: { type: "clientToken", value: "pmfa_ct_Zml4dHVyZQ" },
      fetch: async () => {
        calls++;
        throw Error("unexpected");
      },
    });
    expect(() => browser.passkeys.getConfirmation("s")).toThrow();
    expect(calls).toBe(0);
  });
});

it("preserves refusal statuses, non-JSON errors and uncertain upload without duplicate POST", async () => {
  for (const status of f.errors) {
    let calls = 0;
    const c = new MessagingClient({
      credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
      fetch: async () => {
        calls++;
        return new Response(
          JSON.stringify({
            error: { code: "future_code", message: "refused" },
          }),
          { status, headers: { "content-type": "application/json" } },
        );
      },
    });
    await expect(
      c.passkeys.confirm("s", f.confirm, {
        maxNetworkRetries: 3,
        idempotencyKey: "caller",
      }),
    ).rejects.toMatchObject({ status, code: "future_code" });
    expect(calls).toBe(1);
  }
  for (const mode of ["non-json", "network"]) {
    for (const kind of ["issue", "assertion", "confirm"]) {
      let calls = 0;
      const c = new MessagingClient({
        credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
        fetch: async () => {
          calls++;
          if (mode === "network")
            throw new TypeError("connection lost after upload");
          return new Response("<html>unavailable</html>", {
            status: 502,
            headers: { "content-type": "text/html" },
          });
        },
      });
      const o = { maxNetworkRetries: 3, idempotencyKey: "caller" };
      await expect(
        kind === "issue"
          ? c.passkeys.issueChallenge("s", f.issue, o)
          : kind === "assertion"
            ? c.passkeys.submitAssertion("s", f.assertion, o)
            : c.passkeys.confirm("s", f.confirm, o),
      ).rejects.toBeDefined();
      expect(calls).toBe(1);
    }
  }
});
it("omits optional inputs and keeps maximum credential/user-handle wire strings", async () => {
  const bodies: unknown[] = [];
  const c = new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    fetch: async (_, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return new Response(
        JSON.stringify({ success: true, data: { status: "none" } }),
        { headers: { "content-type": "application/json" } },
      );
    },
  });
  await c.passkeys.issueChallenge("s");
  await c.passkeys.confirm("s", { ticketId: "ticket" });
  const max = {
    ...f.assertion,
    assertion: {
      ...f.assertion.assertion,
      id: "x".repeat(1364),
      rawIdB64Url: "x".repeat(1364),
      response: {
        ...f.assertion.assertion.response,
        userHandleB64: "x".repeat(86),
      },
    },
  };
  await c.passkeys.submitAssertion("s", max);
  expect(bodies).toEqual([{}, { ticketId: "ticket" }, max]);
  expect("verify" in c.passkeys).toBe(false);
  expect("submitQuickLinkPasskey" in c.passkeys).toBe(false);
});
