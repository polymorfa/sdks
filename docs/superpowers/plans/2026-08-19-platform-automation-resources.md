# Platform Automation Resources Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 27 organization-API-key-compatible campaign automation operations to the handwritten TypeScript Platform client while excluding ten dashboard-only template and flow operations honestly.

**Architecture:** Four focused resource classes share the existing dependency-free `HttpTransport` and expose open `PlatformPayload` objects where the OpenAPI contract itself is open. `PlatformClient` owns each resource, the package root re-exports every public type, and the coverage ledger maps only methods proven by request-shape tests.

**Tech Stack:** TypeScript 6, ESM, Node.js 20+, native `fetch`, Vitest, JSON OpenAPI coverage ledger

**Spec:** `docs/superpowers/specs/2026-08-19-platform-automation-resources-design.md`

## Global Constraints

- Contract source is `titan-api/titan@f156af2dda13e62b6b106a542fdedb39524bdb66`, path `apps/api/docs/openapi.management.json`.
- Graph-compatible APIs remain excluded.
- Runtime client code is handwritten; OpenAPI does not generate runtime source.
- `PlatformClient` accepts only organization server API keys.
- Dashboard-only templates and flows are excluded from this server client.
- Open request and response objects remain `Readonly<Record<string, unknown>>`; do not invent fields absent from the contract.
- Unsafe methods retry only when a caller supplies an idempotency key.
- No npm publish, tag, GitHub release, SDK `main` change, or monorepo edit is authorized.

---

### Task 1: Open Platform payload and media resource

**Files:**

- Modify: `packages/typescript/src/platform/types.ts`
- Create: `packages/typescript/src/platform/media.ts`
- Modify: `packages/typescript/src/platform/client.ts`
- Modify: `packages/typescript/src/index.ts`
- Test: `packages/typescript/test/platform-automation.test.ts`

**Interfaces:**

- Produces: `PlatformPayload`, `MediaResource`, `PlatformClient.media`.
- `MediaResource.retrieve(mediaId, options?)`, `delete(mediaId, options?)`, and `createUpload(body?, options?)` each return `Promise<ApiResponse<DataEnvelope<PlatformPayload>>>`.

- [ ] **Step 1: Write the failing media request-shape test**

```ts
it("maps media URL, delete, and upload operations", async () => {
  const { client, requests } = await platformServer();
  await client.media.retrieve("media/a");
  await client.media.delete("media/a");
  await client.media.createUpload(
    { projectId: "project_1", contentType: "image/png" },
    { idempotencyKey: "upload-1" },
  );
  expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
    "GET /v1/media/media%2Fa",
    "DELETE /v1/media/media%2Fa",
    "POST /v1/media/uploads",
  ]);
  expect(requests[2]?.headers["idempotency-key"]).toBe("upload-1");
});
```

- [ ] **Step 2: Run `npx vitest run packages/typescript/test/platform-automation.test.ts` and verify TypeScript fails because `client.media` does not exist**
- [ ] **Step 3: Add the honest open payload type and minimal media resource**

```ts
export type PlatformPayload = Readonly<Record<string, unknown>>;

export class MediaResource {
  constructor(private readonly transport: HttpTransport) {}

  retrieve(mediaId: string, options: RequestOptions = {}) {
    return this.transport.request<DataEnvelope<PlatformPayload>>({
      method: "GET",
      path: `/v1/media/${encodeURIComponent(mediaId)}`,
      ...options,
    });
  }
}
```

- [ ] **Step 4: Attach `media` to `PlatformClient`, export the class and type from the package root, then run the focused test and `npm run typecheck`**
- [ ] **Step 5: Commit with `feat: add Platform media resource`**

### Task 2: Opt-out resource

**Files:**

- Create: `packages/typescript/src/platform/opt-outs.ts`
- Modify: `packages/typescript/src/platform/client.ts`
- Modify: `packages/typescript/src/index.ts`
- Test: `packages/typescript/test/platform-automation.test.ts`

**Interfaces:**

- Consumes: `PlatformPayload`, `HttpTransport`, `RequestOptions`.
- Produces: `OptOutsResource`, `PlatformClient.optOuts`.
- Methods: `list(options?)`, `create(body?, options?)`, `createBatch(body?, options?)`, `delete(phone, options?)`.

- [ ] **Step 1: Add a failing test for all four paths, including encoded phone numbers and distinct single/batch bodies**

```ts
await client.optOuts.list();
await client.optOuts.create({ phone: "+1 555" });
await client.optOuts.createBatch({ phones: ["+1 555", "+44 20"] });
await client.optOuts.delete("+1/555");
expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
  "GET /v1/optouts",
  "POST /v1/optouts",
  "POST /v1/optouts/batch",
  "DELETE /v1/optouts/%2B1%2F555",
]);
```

- [ ] **Step 2: Run the focused test and verify failure because `optOuts` is absent**
- [ ] **Step 3: Implement `OptOutsResource` with four explicit public methods and no generic action string**
- [ ] **Step 4: Attach and export the resource, then run the focused test, existing Platform tests, and typecheck**
- [ ] **Step 5: Commit with `feat: add Platform opt-out resource`**

### Task 3: Audience resource

**Files:**

- Create: `packages/typescript/src/platform/audiences.ts`
- Modify: `packages/typescript/src/platform/client.ts`
- Modify: `packages/typescript/src/index.ts`
- Test: `packages/typescript/test/platform-automation.test.ts`

**Interfaces:**

- Produces: `AudiencesResource`, `PlatformClient.audiences`.
- Methods: `list(options?)`, `create(body?, options?)`, `retrieve(listId, options?)`, `delete(listId, options?)`, `createUpload(body?, options?)`.

- [ ] **Step 1: Add a failing test for the five audience operations**

```ts
await client.audiences.list();
await client.audiences.create({ name: "August" });
await client.audiences.retrieve("list/a");
await client.audiences.delete("list/a");
await client.audiences.createUpload({ filename: "audience.csv" });
expect(requests.map(({ path }) => path)).toEqual([
  "/v1/audiences",
  "/v1/audiences",
  "/v1/audiences/list%2Fa",
  "/v1/audiences/list%2Fa",
  "/v1/audiences/uploads",
]);
```

- [ ] **Step 2: Run the focused test and verify failure because `audiences` is absent**
- [ ] **Step 3: Implement, attach, and export `AudiencesResource`, preserving optional bodies exactly**
- [ ] **Step 4: Run the focused test, existing Platform tests, and typecheck**
- [ ] **Step 5: Commit with `feat: add Platform audience resource`**

### Task 4: Campaign resource

**Files:**

- Create: `packages/typescript/src/platform/campaigns.ts`
- Modify: `packages/typescript/src/platform/types.ts`
- Modify: `packages/typescript/src/platform/client.ts`
- Modify: `packages/typescript/src/index.ts`
- Test: `packages/typescript/test/platform-automation.test.ts`

**Interfaces:**

- Produces: `ListCampaignsParams`, `CampaignsResource`, `PlatformClient.campaigns`.
- Methods: `list(params, options?)`, `create(body?, options?)`, `retrieve(campaignId, options?)`, `update(campaignId, body?, options?)`, `delete(campaignId, options?)`, `launch`, `pause`, `resume`, `stop`, `archive`, `duplicate`, `requeue`, `analytics`, `events`, and `recipients`.

- [ ] **Step 1: Add a failing test for collection, item, and query behavior**

```ts
await client.campaigns.list({ projectId: "project/a", projectSlug: "support" });
await client.campaigns.create({ projectId: "project/a", name: "August" });
await client.campaigns.retrieve("campaign/a");
await client.campaigns.update("campaign/a", { name: "September" });
await client.campaigns.delete("campaign/a");
expect(requests.map(({ path }) => path)).toEqual([
  "/v1/campaigns?projectId=project%2Fa&projectSlug=support",
  "/v1/campaigns",
  "/v1/campaigns/campaign%2Fa",
  "/v1/campaigns/campaign%2Fa",
  "/v1/campaigns/campaign%2Fa",
]);
```

- [ ] **Step 2: Run the focused test and verify failure because `campaigns` is absent**
- [ ] **Step 3: Add a second failing test for seven mutation actions and three read subresources**

```ts
for (const action of [
  "launch",
  "pause",
  "resume",
  "stop",
  "archive",
  "duplicate",
  "requeue",
] as const) {
  await client.campaigns[action]("campaign/a", { reason: action });
}
await client.campaigns.analytics("campaign/a");
await client.campaigns.events("campaign/a");
await client.campaigns.recipients("campaign/a");
```

- [ ] **Step 4: Implement explicit methods; use a private `action()` helper only for the seven fixed action methods**
- [ ] **Step 5: Attach and export the resource and types, then run focused tests, existing Platform tests, and typecheck**
- [ ] **Step 6: Commit with `feat: add Platform campaign resource`**

### Task 5: Coverage mappings and dashboard-only exclusions

**Files:**

- Modify: `contracts/coverage.json`
- Test: `packages/typescript/test/coverage.test.ts`
- Test: `packages/typescript/test/exports.test.ts`

**Interfaces:**

- Consumes: the four public resource classes and methods from Tasks 1-4.
- Produces: 27 new `covered` mappings, ten new credential-boundary exclusions, expected totals of 59 covered, 212 missing, 60 excluded, and zero changed.

- [ ] **Step 1: Add failing coverage assertions for the expected totals and representative exact mappings**

```ts
expect(report).toMatchObject({
  total: 331,
  covered: 59,
  missing: 212,
  excluded: 60,
  changed: 0,
});
expect(mapping("createPlatformCampaign").typescript).toEqual({
  status: "covered",
  method: "PlatformClient.campaigns.create",
});
expect(mapping("createFlow").typescript.status).toBe("excluded");
```

- [ ] **Step 2: Run the focused coverage test and verify it fails with the old 32/249/50 totals**
- [ ] **Step 3: Change the 27 API-key operations to exact covered mappings and the ten dashboard-only operations to exclusions with this reason: `This dashboard-only route does not accept the organization server API key used by PlatformClient.`**
- [ ] **Step 4: Extend root export type assertions for `PlatformPayload` and each resource class**
- [ ] **Step 5: Run `npm run check:coverage`, focused coverage/export tests, and `npm run check:names`**
- [ ] **Step 6: Commit with `chore: record Platform automation coverage`**

### Task 6: Documentation and release-grade verification

**Files:**

- Modify: `README.md`
- Modify: `packages/typescript/README.md`
- Modify: `CHANGELOG.md`

**Interfaces:**

- Documents: all four resources, open payload typing, API-key scopes, dashboard-only template/flow boundary, coverage totals, and raw-request fallback.

- [ ] **Step 1: Update the root resource inventory and examples without claiming full parity**
- [ ] **Step 2: Add a TypeScript package example that creates a campaign with an explicit idempotency key and reads response metadata**
- [ ] **Step 3: Update the changelog with customer-visible typed resource additions and the credential-boundary correction**
- [ ] **Step 4: Run `npx prettier --write README.md packages/typescript/README.md CHANGELOG.md`**
- [ ] **Step 5: Run the complete local gate**

```bash
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
npm run build:workspaces
npm run check:coverage
npm run check:names
npm pack --dry-run --ignore-scripts
npm pack --dry-run --workspaces --ignore-scripts
npm audit --omit=dev
```

- [ ] **Step 6: Verify `git diff --check`, review the branch diff, and commit with `docs: document Platform automation resources`**
- [ ] **Step 7: Fetch `origin/dev`, push only if fast-forward, and wait for both hosted Node 20 and Node 22 CI jobs**
