import { describe, expect, it, vi } from "vitest";
import { MessagingClient } from "../../typescript/src/index.js";
import {
  createClientTokenRoute,
  createMessagingClientTokenMint,
  createTemplateBuilderRoute,
  readVerifiedWebhook,
} from "../src/index.js";

describe("createClientTokenRoute", () => {
  it("authorizes before minting and returns a non-cacheable browser token", async () => {
    const mint = vi.fn(async () => ({
      value: "pmfa_ct_fixture",
      audience: "browser" as const,
      expiresAt: Date.now() + 60_000,
    }));
    const route = createClientTokenRoute({
      authorize: async () => ({ userId: "user_1" }),
      mint,
    });
    const response = await route(
      new Request("https://app.test/token", { method: "POST" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mint).toHaveBeenCalledWith(
      { userId: "user_1" },
      expect.any(Request),
    );
  });

  it("fails closed without leaking mint errors", async () => {
    const route = createClientTokenRoute({
      authorize: () => ({ userId: "user_1" }),
      mint: async () => {
        throw new Error("database password");
      },
    });
    const response = await route(
      new Request("https://app.test/token", { method: "POST" }),
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("database password");
  });
});

describe("createMessagingClientTokenMint", () => {
  it("maps the server SDK envelope to normalized browser claims", async () => {
    const mint = vi.fn(async () => ({
      data: {
        success: true as const,
        data: {
          token: "pmfa_ct_fixture",
          expiresAt: "2026-08-19T20:00:00.000Z",
        },
      },
    }));
    const resolve = vi.fn(async () => ({
      session: "support",
      ephemeralId: "user-1-tab-1",
      ttlSeconds: 600,
    }));
    const adapter = createMessagingClientTokenMint({
      clientTokens: { mint },
      resolve,
    });
    const request = new Request("https://app.test/token", { method: "POST" });

    await expect(adapter({ userId: "user-1" }, request)).resolves.toEqual({
      value: "pmfa_ct_fixture",
      audience: "browser",
      expiresAt: Date.parse("2026-08-19T20:00:00.000Z"),
    });
    expect(resolve).toHaveBeenCalledWith({ userId: "user-1" }, request);
    expect(mint).toHaveBeenCalledWith(
      {
        session: "support",
        ephemeralId: "user-1-tab-1",
        ttlSeconds: 600,
      },
      { signal: request.signal },
    );
  });

  it("fails closed when the SDK returns malformed token data", async () => {
    const adapter = createMessagingClientTokenMint({
      clientTokens: {
        mint: async () => ({
          data: {
            success: true,
            data: {
              token: "server-secret",
              expiresAt: "not-a-date",
            },
          },
        }),
      },
      resolve: async () => ({
        session: "support",
        ephemeralId: "user-1-tab-1",
      }),
    });

    await expect(
      adapter(
        { userId: "user-1" },
        new Request("https://app.test/token", { method: "POST" }),
      ),
    ).rejects.toThrow("invalid client token response");
  });
});

describe("createTemplateBuilderRoute", () => {
  it("accepts the handwritten server SDK templates resource without an adapter", () => {
    const messaging = new MessagingClient({
      credential: { type: "apiKey", value: "pmfa_fixture" },
    });
    expect(() =>
      createTemplateBuilderRoute({
        templates: messaging.templates,
        authorize: () => ({ userId: "user_1" }),
        resolveProjectSlug: () => "support",
        resolveSubmissionSession: () => "cloud",
      }),
    ).not.toThrow();
  });

  it("keeps project scope and the submission session under application control", async () => {
    const createdTemplate = {
      id: "tpl_1",
      name: "order_ready",
      category: "UTILITY",
      language: "en_US",
      status: "draft",
      kind: "standard",
      definition: {
        version: 1 as const,
        kind: "standard",
        category: "UTILITY",
        language: "en_US",
        body: "Hello {{name}}",
        variables: [{ name: "name", type: "text", example: "Ada" }],
      },
      sampleValues: { name: "Ada" },
      cloudLinks: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const create = vi.fn(async () => ({
      data: { success: true as const, data: createdTemplate },
    }));
    const submit = vi.fn(async () => ({
      data: {
        success: true as const,
        data: { ...createdTemplate, status: "PENDING" },
      },
    }));
    const route = createTemplateBuilderRoute({
      authorize: async () => ({ userId: "user_1", projectId: "project_1" }),
      resolveProjectSlug: async () => "support/eu",
      resolveSubmissionSession: async () => "cloud/support",
      templates: {
        create,
        retrieve: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        preview: vi.fn(),
        submit,
      },
    });

    const saveResponse = await route(
      new Request("https://app.test/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "save",
          projectSlug: "attacker-controlled",
          draft: {
            name: "order_ready",
            definition: createdTemplate.definition,
            sampleValues: { name: "Ada" },
          },
        }),
      }),
    );
    const submitResponse = await route(
      new Request("https://app.test/api/templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "submit",
          templateId: "tpl_1",
          session: "attacker-controlled",
        }),
      }),
    );

    expect(saveResponse.status).toBe(200);
    expect(saveResponse.headers.get("cache-control")).toContain("no-store");
    await expect(saveResponse.json()).resolves.toEqual({
      template: createdTemplate,
    });
    expect(create).toHaveBeenCalledWith(
      "support/eu",
      {
        name: "order_ready",
        definition: createdTemplate.definition,
        sampleValues: { name: "Ada" },
      },
      { signal: expect.any(AbortSignal) },
    );
    expect(submitResponse.status).toBe(200);
    expect(submit).toHaveBeenCalledWith(
      "support/eu",
      "tpl_1",
      { session: "cloud/support" },
      { signal: expect.any(AbortSignal) },
    );
  });

  it("authorizes before SDK access and does not leak server failures", async () => {
    const retrieve = vi.fn(async () => {
      throw new Error("pmfa_secret_database_password");
    });
    const templates = {
      create: vi.fn(),
      retrieve,
      update: vi.fn(),
      delete: vi.fn(),
      preview: vi.fn(),
      submit: vi.fn(),
    };
    const unauthorized = createTemplateBuilderRoute({
      authorize: async () => null,
      resolveProjectSlug: async () => "support",
      resolveSubmissionSession: async () => "cloud",
      templates,
    });
    const denied = await unauthorized(
      new Request("https://app.test/api/templates", {
        method: "POST",
        body: JSON.stringify({ action: "load", templateId: "tpl_1" }),
      }),
    );
    expect(denied.status).toBe(401);
    expect(retrieve).not.toHaveBeenCalled();

    const failing = createTemplateBuilderRoute({
      authorize: async () => ({ userId: "user_1" }),
      resolveProjectSlug: async () => "support",
      resolveSubmissionSession: async () => "cloud",
      templates,
    });
    const failed = await failing(
      new Request("https://app.test/api/templates", {
        method: "POST",
        body: JSON.stringify({ action: "load", templateId: "tpl_1" }),
      }),
    );
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain("pmfa_secret_database_password");
  });
});

describe("readVerifiedWebhook", () => {
  it("passes untouched raw bytes, the signature, and secret to the SDK verifier", async () => {
    const constructEvent = vi.fn(
      async (body: ArrayBuffer, signature: string, secret: string) => {
        void body;
        void signature;
        void secret;
        return { event: "message.received" };
      },
    );
    const request = new Request("https://app.test/webhook", {
      method: "POST",
      headers: { "x-webhook-signature": "sha256=fixture" },
      body: '{"exact": "bytes"}',
    });
    await expect(
      readVerifiedWebhook(request, { constructEvent, secret: "secret" }),
    ).resolves.toEqual({ event: "message.received" });
    const body = constructEvent.mock.calls[0]?.[0];
    expect(new TextDecoder().decode(body)).toBe('{"exact": "bytes"}');
    expect(constructEvent).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      "sha256=fixture",
      "secret",
    );
  });
});
