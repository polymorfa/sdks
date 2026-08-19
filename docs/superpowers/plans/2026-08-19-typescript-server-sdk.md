# TypeScript Server SDK Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a self-contained `@polymorfa/sdk` development package that gives the CLI typed Messaging and Platform clients, resilient transport behavior, webhook verification, pagination primitives, response metadata, and a raw-request escape hatch.

**Architecture:** The package uses a small dependency-free Node.js transport shared by two credential-specific clients. Handwritten resource classes own curated endpoint paths and public request/response types; OpenAPI is used only by a coverage ledger checker that reports uncovered operations. Resource calls return decoded data together with immutable response metadata.

**Tech Stack:** TypeScript 5, ESM, Node.js 20+, native `fetch`, native `node:crypto`, Vitest, ESLint, npm pack

**Spec:** `docs/superpowers/specs/2026-08-19-polymorfa-sdks-design.md`

## Global Constraints

- The contract source is monorepo commit `f9b4473a0bf65c946565e9be6c85fee130fad2dd`, Messaging path `apps/api/docs/openapi.json`, Platform path `apps/api/docs/openapi.management.json`.
- Graph-compatible APIs are excluded.
- Runtime code is handwritten; OpenAPI must not generate runtime client source.
- The package has no runtime dependency, private or public.
- Messaging credentials accept explicit server API keys or client tokens; Platform credentials accept server API keys only.
- Unsafe methods retry only when the caller supplies an idempotency key.
- Browser runtimes must reject server API-key initialization.
- Public types needed by the CLI are re-exported from the package root.
- No registry publish, GitHub release, or tag is created by this plan.
- Tracked files contain no case-insensitive reference to the retired product name.

---

### Task 1: Package boundary and credential validation

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `packages/typescript/src/credentials.ts`
- Create: `packages/typescript/src/version.ts`
- Create: `packages/typescript/test/credentials.test.ts`

**Interfaces:**
- Produces: `MessagingCredential`, `MessagingClientOptions`, `PlatformClientOptions`, `validateMessagingCredential()`, `validatePlatformApiKey()`, `SDK_VERSION`.

- [ ] **Step 1: Write credential tests that fail because the package does not exist**

```ts
import { describe, expect, it } from "vitest";
import { validateMessagingCredential, validatePlatformApiKey } from "../src/credentials.js";

describe("credential validation", () => {
  it("accepts an explicit Messaging client token", () => {
    expect(validateMessagingCredential({ type: "clientToken", value: "pmfa_ct_example" })).toEqual({
      type: "clientToken",
      value: "pmfa_ct_example",
    });
  });

  it("rejects a project token as a Platform server key", () => {
    expect(() => validatePlatformApiKey("pmfa_pt_example")).toThrow(/server API key/);
  });
});
```

- [ ] **Step 2: Run `npm test -- packages/typescript/test/credentials.test.ts` and verify module resolution fails**
- [ ] **Step 3: Add the package configuration and minimal validation implementation**

```ts
export type MessagingCredential =
  | { readonly type: "apiKey"; readonly value: string }
  | { readonly type: "clientToken"; readonly value: string };

export function validatePlatformApiKey(value: string): string {
  if (!value.startsWith("pmfa_") || value.startsWith("pmfa_ct_") || value.startsWith("pmfa_pt_")) {
    throw new PolymorfaConfigurationError("Platform requires a pmfa_ server API key.", "apiKey");
  }
  return value;
}
```

- [ ] **Step 4: Run the focused test, then `npm run typecheck`**
- [ ] **Step 5: Commit with `feat: establish TypeScript SDK package boundary`**

### Task 2: Typed errors, metadata, cancellation, and transport

**Files:**
- Create: `packages/typescript/src/errors.ts`
- Create: `packages/typescript/src/transport/types.ts`
- Create: `packages/typescript/src/transport/body.ts`
- Create: `packages/typescript/src/transport/retry.ts`
- Create: `packages/typescript/src/transport/http.ts`
- Create: `packages/typescript/test/transport.test.ts`
- Create: `packages/typescript/test/support/http-server.ts`

**Interfaces:**
- Consumes: validated credential strings and `SDK_VERSION`.
- Produces: `ApiResponse<T>`, `ResponseMetadata`, `RequestOptions`, `RawRequest`, `HttpTransport`, typed `PolymorfaError` subclasses.

- [ ] **Step 1: Write transport tests for headers, response metadata, JSON/text/empty decoding, error mapping, timeout, caller cancellation, retry eligibility, `Retry-After`, and idempotency**

```ts
it("does not retry an unsafe request without an idempotency key", async () => {
  const server = await sequenceServer([503, 200]);
  const transport = makeTransport(server.url, { maxNetworkRetries: 2 });
  await expect(transport.request({ method: "POST", path: "/messages", body: { text: "hello" } }))
    .rejects.toBeInstanceOf(PolymorfaServerError);
  expect(server.requests).toHaveLength(1);
});

it("retries an unsafe request carrying an idempotency key", async () => {
  const server = await sequenceServer([503, 200]);
  const response = await makeTransport(server.url, { maxNetworkRetries: 2 }).request({
    method: "POST",
    path: "/messages",
    body: { text: "hello" },
    idempotencyKey: "send-42",
  });
  expect(response.metadata.attempts).toBe(2);
  expect(server.requests[1]?.headers["idempotency-key"]).toBe("send-42");
});
```

- [ ] **Step 2: Run the transport tests and verify they fail on missing modules**
- [ ] **Step 3: Implement immutable response metadata and the typed error hierarchy**
- [ ] **Step 4: Implement request encoding, composed timeout/caller abort signals, and native fetch injection**
- [ ] **Step 5: Implement bounded exponential retry with jitter injection; retry GET, HEAD, and OPTIONS plus requests with an idempotency key**
- [ ] **Step 6: Run the focused transport tests and typecheck, then refactor only while green**
- [ ] **Step 7: Commit with `feat: add resilient HTTP transport`**

### Task 3: Raw request escape hatch and pagination primitives

**Files:**
- Create: `packages/typescript/src/raw.ts`
- Create: `packages/typescript/src/pagination.ts`
- Create: `packages/typescript/test/raw.test.ts`
- Create: `packages/typescript/test/pagination.test.ts`

**Interfaces:**
- Consumes: `HttpTransport.request<T>(request: RawRequest): Promise<ApiResponse<T>>`.
- Produces: `RawClient.request<T>()`, `RawClient.paginate<T>()`, `CursorPage<T>`, `PageResult<T>`.

- [ ] **Step 1: Write a failing raw-request test proving path, query, body, API-version override, request headers, and response metadata are preserved**

```ts
const response = await raw.request<{ ok: true }>({
  method: "POST",
  path: "/v1/custom",
  query: { projectId: "project_1", include: ["members", "keys"] },
  body: { enabled: true },
  apiVersion: "2026-08-19",
  headers: { "X-Trace": "cli" },
  idempotencyKey: "custom-1",
});
expect(response.data).toEqual({ ok: true });
expect(response.metadata.requestId).toBe("req_raw");
```

- [ ] **Step 2: Run the raw test and confirm the missing export is the failure**
- [ ] **Step 3: Implement `RawClient` as a typed public facade over transport without route rewriting**
- [ ] **Step 4: Write failing pagination tests for single-page iteration, cursor propagation, all-item iteration, and cancellation**
- [ ] **Step 5: Implement `CursorPage<T>` with `items`, `nextCursor`, `hasMore`, `nextPage()`, and `AsyncIterable<T>`**
- [ ] **Step 6: Run both focused files and typecheck**
- [ ] **Step 7: Commit with `feat: add raw requests and pagination primitives`**

### Task 4: Messaging client and handwritten resources

**Files:**
- Create: `packages/typescript/src/messaging/types.ts`
- Create: `packages/typescript/src/messaging/sessions.ts`
- Create: `packages/typescript/src/messaging/messages.ts`
- Create: `packages/typescript/src/messaging/webhooks.ts`
- Create: `packages/typescript/src/messaging/client.ts`
- Create: `packages/typescript/test/messaging.test.ts`

**Interfaces:**
- Consumes: `HttpTransport`, `RawClient`, `RequestOptions`.
- Produces: `MessagingClient`, `SessionsResource`, `MessagesResource`, `WebhooksResource`, and all public Messaging request/response types.

- [ ] **Step 1: Write failing request-shape tests against a real local HTTP server for session list/create/retrieve/update/start/stop/restart/logout/delete/account**

```ts
const response = await client.sessions.create(
  { projectId: "project_1", sessionId: "support", start: true },
  { idempotencyKey: "session-support" },
);
expect(response.data).toEqual({ success: true, data: { sessionId: "support" } });
expect(server.lastRequest.method).toBe("POST");
expect(server.lastRequest.path).toBe("/api/sessions");
```

- [ ] **Step 2: Run the focused test and verify the missing client/resource failure**
- [ ] **Step 3: Implement session types and resource methods with encoded path parameters**
- [ ] **Step 4: Write failing tests for send, seen, typing, reaction, and star message operations**
- [ ] **Step 5: Implement a discriminated `SendMessageRequest` union plus message response types and resource methods**
- [ ] **Step 6: Write failing webhook CRUD request-shape tests and implement the resource**
- [ ] **Step 7: Verify client tokens use bearer authentication while server-only configuration rejects them before construction**
- [ ] **Step 8: Run all Messaging tests and typecheck**
- [ ] **Step 9: Commit with `feat: add Messaging client resources`**

### Task 5: Platform client and handwritten resources

**Files:**
- Create: `packages/typescript/src/platform/types.ts`
- Create: `packages/typescript/src/platform/organizations.ts`
- Create: `packages/typescript/src/platform/projects.ts`
- Create: `packages/typescript/src/platform/sessions.ts`
- Create: `packages/typescript/src/platform/client.ts`
- Create: `packages/typescript/test/platform.test.ts`

**Interfaces:**
- Consumes: `HttpTransport`, `RawClient`, `RequestOptions`.
- Produces: `PlatformClient`, `OrganizationsResource`, `ProjectsResource`, `PlatformSessionsResource`, and public Platform request/response types.

- [ ] **Step 1: Write failing tests for organization retrieve/update and project list/create**

```ts
const projects = await client.projects.list({ signal: controller.signal });
expect(projects.data).toEqual({ data: [{ id: "project_1", name: "Support" }] });
expect(server.lastRequest.path).toBe("/v1/projects");
```

- [ ] **Step 2: Run the test and confirm failure on missing Platform client**
- [ ] **Step 3: Implement organization and project types/resources**
- [ ] **Step 4: Write failing tests for production-enrollment request/approve/cancel and implement encoded paths**
- [ ] **Step 5: Write failing tests for platform session list/stop/delete/tier override/testing session and implement the resource**
- [ ] **Step 6: Prove Platform construction rejects client and project tokens without issuing a request**
- [ ] **Step 7: Run all Platform tests and typecheck**
- [ ] **Step 8: Commit with `feat: add Platform client resources`**

### Task 6: Raw-body webhook verification and typed events

**Files:**
- Create: `packages/typescript/src/webhooks/events.ts`
- Create: `packages/typescript/src/webhooks/verify.ts`
- Create: `packages/typescript/test/webhooks.test.ts`

**Interfaces:**
- Produces: `WebhookEvent`, `KnownWebhookEvent`, `UnknownWebhookEvent`, `WebhookSignatureError`, `verifyWebhookSignature()`, `constructWebhookEvent()`, `isEvent()`.

- [ ] **Step 1: Write failing tests with hand-computed HMAC-SHA256 fixtures for valid raw bytes, mutated bytes, malformed hex, wrong secret, and `sha256=` compatibility**

```ts
const raw = Buffer.from('{"type":"message.received","session":"support","timestamp":"2026-08-19T10:00:00Z","payload":{"id":"m1"}}');
const signature = "6a58f9f6a2ecf7ce7fb8f55d8b92343d72893d87f9996b9d2c684d09f26a49d1";
await expect(verifyWebhookSignature(raw, signature, "fixture-secret")).resolves.toBe(true);
```

- [ ] **Step 2: Run the tests and verify failure on missing verification functions**
- [ ] **Step 3: Implement constant-time comparison over raw bytes with no JSON normalization**
- [ ] **Step 4: Write failing event tests for known-event narrowing, unknown-event preservation, invalid envelope rejection, and invalid UTF-8/JSON**
- [ ] **Step 5: Implement the event union and `constructWebhookEvent()` that verifies before parsing**
- [ ] **Step 6: Run webhook tests and typecheck**
- [ ] **Step 7: Commit with `feat: add typed webhook verification`**

### Task 7: Public exports, documentation, package integrity, and contract coverage

**Files:**
- Create: `packages/typescript/src/index.ts`
- Create: `README.md`
- Create: `packages/typescript/README.md`
- Create: `contracts/coverage.json`
- Create: `scripts/check-coverage.mjs`
- Create: `scripts/check-retired-name.mjs`
- Create: `packages/typescript/test/exports.test.ts`
- Create: `packages/typescript/test/coverage.test.ts`
- Create: `packages/typescript/test/package.test.ts`
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: all previous public modules and the two pinned OpenAPI inputs supplied as checker arguments.
- Produces: package-root public API, CLI installation instructions, auditable coverage gaps, clean tarball.

- [ ] **Step 1: Write a failing compile-time export test importing every CLI dependency from `@polymorfa/sdk`**

```ts
import {
  MessagingClient,
  PlatformClient,
  PolymorfaError,
  CursorPage,
  constructWebhookEvent,
  type ApiResponse,
  type RequestOptions,
  type SendMessageRequest,
} from "@polymorfa/sdk";
void [MessagingClient, PlatformClient, PolymorfaError, CursorPage, constructWebhookEvent];
```

- [ ] **Step 2: Run typecheck and verify missing root exports fail**
- [ ] **Step 3: Add explicit package-root exports; do not use an unreviewed wildcard barrel**
- [ ] **Step 4: Document configuration, credential boundaries, API versions, request options, metadata, retries, pagination, webhooks, raw requests, and the GitHub development install**
- [ ] **Step 5: Add a coverage ledger marking the implemented curated operations `covered`, Graph `excluded`, and every other Messaging/Platform operation `missing` with a concrete milestone**
- [ ] **Step 6: Write and run a behavioral coverage test that loads both pinned specs, validates unique method/path mappings, and fails if an operation is absent from the ledger**
- [ ] **Step 7: Write and run a package smoke test that invokes `npm pack --json`, installs the tarball into a temporary consumer, imports the package, and constructs both clients**
- [ ] **Step 8: Add CI for Node.js 20 and 22 running format check, lint, typecheck, tests, coverage ledger validation, retired-name scan, build, and pack smoke test**
- [ ] **Step 9: Run `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm run check:coverage`, `npm run check:names`, and `npm pack --dry-run`**
- [ ] **Step 10: Commit with `docs: publish TypeScript SDK contract`**

### Task 8: Development-branch handoff

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Produces: exact commit, version, Git install command, verification evidence, and explicit coverage gaps for the CLI task.

- [ ] **Step 1: Set the development version to `0.1.0-dev.0` and record the usable contract in `CHANGELOG.md`**
- [ ] **Step 2: Run the complete verification matrix from Task 7 again from a clean tree**
- [ ] **Step 3: Inspect `npm pack --json` and confirm the tarball has no runtime dependency or unintended file**
- [ ] **Step 4: Commit with `chore: prepare TypeScript SDK development channel`**
- [ ] **Step 5: Push `dev`, record the exact commit SHA, and send the CLI task the SHA, branch, install command, evidence, and coverage gaps**

