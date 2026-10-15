import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import {
  Client,
  MessagingClient,
  PolymorfaCancelledError,
  PolymorfaConfigurationError,
  PolymorfaConflictError,
  PolymorfaPaymentRequiredError,
  PolymorfaRateLimitError,
  PolymorfaServerError,
  type AudienceConsentAssertion,
  type AudienceFromCampaignResult,
  type AudienceProfile,
  type AudienceProfileImportJob,
  type CampaignLaunchApproval,
  type CampaignReplyFlow,
  type CampaignReplyFlowSend,
  type CampaignRecipientExportPage,
  type CampaignTestSend,
  type CreateCampaignReplyFlowRequest,
  type RequestOptions,
  type SignalCustodyDefault,
  type StopConfirmationSettings,
  type StopConfirmationSummary,
  type ApiResponse,
} from "../src/index.js";
import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const projectId = "018f0000-0000-7000-8000-000000000001";
const campaignId = "018f0000-0000-7000-8000-000000000002";
const flowId = "018f0000-0000-7000-8000-000000000003";
const sessionId = "018f0000-0000-7000-8000-000000000004";
const customerId = "018f0000-0000-7000-8000-000000000005";
const jobId = "018f0000-0000-7000-8000-000000000006";
const phone = "+15551234567";
const flow: CreateCampaignReplyFlowRequest = {
  name: "Product questions",
  definition: {
    entryNodeId: "ask",
    nodes: [
      {
        id: "ask",
        edges: [
          {
            match: { kind: "choice", replyKind: "button", id: "yes" },
            to: "done",
          },
        ],
      },
      {
        id: "done",
        send: { kind: "text", text: "Thank you.\nWe will contact you." },
        edges: [],
      },
    ],
  },
};
const profile = {
  tags: ["interested"],
  attributes: { plan: "pro", count: 1, enabled: false, empty: null },
};
const testSend = { sessionId, to: phone, variables: {} };
const custody: SignalCustodyDefault = {
  signalModeDefault: null,
  effectiveSignalMode: "standard",
  revision: 2,
};
const savedFlow: CampaignReplyFlow = {
  ...flow,
  id: flowId,
  flowKey: flowId,
  revision: 1,
  createdAt: 1,
};
const savedProfile: AudienceProfile = {
  ...profile,
  id: jobId,
  phone,
  revision: 1,
  provenance: null,
  createdAt: 1,
  updatedAt: 1,
};
const consent: AudienceConsentAssertion = {
  id: jobId,
  profileRevision: 1,
  source: "api",
  reference: "opt-in-1",
  purpose: "campaigns",
  allowed: true,
  assertedAt: 1,
  createdAt: 2,
};
const importJob: AudienceProfileImportJob = {
  id: jobId,
  state: "completed",
  totalValid: 1,
  invalidCount: 0,
  invalidSamples: [],
  conflictSamples: [],
  processedValid: 1,
  createdCount: 1,
  updatedCount: 0,
  conflictCount: 0,
  createdAt: 1,
  updatedAt: 2,
  completedAt: 2,
};
const retarget: AudienceFromCampaignResult = {
  id: jobId,
  name: "Read",
  source: "campaign",
  recipientCount: 1,
  fileId: null,
  columns: null,
  sampleRow: null,
  mapping: null,
  createdAt: 1,
  updatedAt: 1,
  sourceCampaignId: campaignId,
  outcome: "read",
  matchedCount: 1,
  optedOutCount: 0,
};
const approval: CampaignLaunchApproval = {
  id: jobId,
  campaignId,
  action: "launch",
  status: "pending",
  reasons: ["agent_request"],
  recipientCount: 1,
  scheduledAt: null,
  requestedBy: { type: "api_key", id: customerId },
  requestedAt: 1,
  expiresAt: 2,
  decidedBy: null,
  decidedAt: null,
  operationId: null,
};
const confirmationSettings: StopConfirmationSettings = {
  teamId: projectId,
  enabled: false,
  locale: null,
  revision: 0,
  textRevision: 1,
  acknowledgement: null,
  updatedAt: null,
};
const confirmationSummary: StopConfirmationSummary = {
  enabled: false,
  counts: { queued: 0, admitted: 0, completed: 0, failed: 0, unknown: 0 },
};

function successFixture(operation: string): unknown {
  const page = (data: readonly unknown[]) => ({
    data,
    page: { nextCursor: null, hasMore: false },
  });
  let data: unknown;
  switch (operation) {
    case "getCampaignReplyFlow":
    case "createCampaignReplyFlow":
    case "getPlatformCampaignReplyFlow":
    case "createPlatformCampaignReplyFlow":
      data = savedFlow;
      break;
    case "setCampaignReplyFlow":
    case "setPlatformCampaignReplyFlow":
      data = { campaignId, replyFlowId: null };
      break;
    case "testSendCampaign":
    case "testSendPlatformCampaign":
      data = {
        id: jobId,
        campaignId,
        status: "sent",
        from: { sessionId, phone },
        to: phone,
        messageId: null,
        variables: {},
        createdAt: 1,
      } satisfies CampaignTestSend;
      break;
    case "getProjectCampaignLinks":
    case "getCampaignLinks":
      data = [
        {
          key: "learn",
          url: "https://example.com/product",
          uniqueOpens: 1,
          totalOpens: 2,
        },
      ];
      break;
    case "listCampaignLaunchApprovals":
      data = [approval];
      break;
    case "getCampaignSettings":
      data = { launchApproval: { recipientThreshold: null } };
      break;
    case "listAudienceProfiles":
      return page([savedProfile]);
    case "listAudienceProfileConsent":
      return page([consent]);
    case "getAudienceProfile":
    case "putAudienceProfile":
      data = savedProfile;
      break;
    case "deleteAudienceProfile":
      data = { deleted: true, phone, revision: 10 };
      break;
    case "createAudienceProfileImport":
    case "getAudienceProfileImport":
    case "cancelAudienceProfileImport":
      data = importJob;
      break;
    case "createAudienceFromCampaign":
      data = retarget;
      break;
    case "getStopConfirmationSettings":
    case "updateStopConfirmationSettings":
      data = confirmationSettings;
      break;
    case "getStopConfirmationSummary":
      data = confirmationSummary;
      break;
    case "getProjectSignalCustody":
    case "updateProjectSignalCustody":
    case "getCustomerSignalCustody":
    case "updateCustomerSignalCustody":
      data = custody;
      break;
    default:
      throw new Error(`Missing contract fixture for ${operation}`);
  }
  return [
    "getCampaignReplyFlow",
    "createCampaignReplyFlow",
    "setCampaignReplyFlow",
    "testSendCampaign",
    "getProjectCampaignLinks",
  ].includes(operation)
    ? { success: true, data }
    : { data };
}
const csv = 'phone,note\r\n+15551234567,"\'=1+1"\r\n';
const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function clients(baseUrl: string) {
  const organization = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl,
  });
  const project = organization.project(projectId);
  const messaging = new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl,
  });
  return { organization, project, messaging };
}
type Clients = ReturnType<typeof clients>;
interface WireCase {
  readonly name: string;
  readonly method: string;
  readonly path: string;
  readonly body?: unknown;
  readonly call: (
    clients: Clients,
    options: RequestOptions,
  ) => Promise<ApiResponse<unknown>>;
}
const cases: readonly WireCase[] = [
  {
    name: "getCampaignReplyFlow",
    method: "GET",
    path: `/messaging/projects/launch%2Feu/campaign-reply-flows/${flowId}`,
    call: (c, o) => c.messaging.campaigns.getReplyFlow("launch/eu", flowId, o),
  },
  {
    name: "createCampaignReplyFlow",
    method: "POST",
    path: "/messaging/projects/launch%2Feu/campaign-reply-flows",
    body: flow,
    call: (c, o) => c.messaging.campaigns.createReplyFlow("launch/eu", flow, o),
  },
  {
    name: "setCampaignReplyFlow",
    method: "PUT",
    path: `/messaging/projects/launch%2Feu/campaigns/${campaignId}/reply-flow`,
    body: { replyFlowId: null },
    call: (c, o) =>
      c.messaging.campaigns.setReplyFlow(
        "launch/eu",
        campaignId,
        { replyFlowId: null },
        o,
      ),
  },
  {
    name: "testSendCampaign",
    method: "POST",
    path: `/messaging/projects/launch%2Feu/campaigns/${campaignId}/test-send`,
    body: testSend,
    call: (c, o) =>
      c.messaging.campaigns.testSend("launch/eu", campaignId, testSend, o),
  },
  {
    name: "getProjectCampaignLinks",
    method: "GET",
    path: `/messaging/projects/launch%2Feu/campaigns/${campaignId}/links`,
    call: (c, o) => c.messaging.campaigns.links("launch/eu", campaignId, o),
  },
  {
    name: "exportProjectCampaignRecipients",
    method: "GET",
    path: `/messaging/projects/launch%2Feu/campaigns/${campaignId}/recipients/export?cursor=next%2Fpage&limit=1000`,
    call: (c, o) =>
      c.messaging.campaigns.exportRecipients(
        "launch/eu",
        campaignId,
        { cursor: "next/page", limit: 1000 },
        o,
      ),
  },
  {
    name: "getPlatformCampaignReplyFlow",
    method: "GET",
    path: `/platform/campaign-reply-flows/${flowId}?projectId=${projectId}`,
    call: (c, o) =>
      c.organization.campaigns.getReplyFlow(flowId, { projectId }, o),
  },
  {
    name: "createPlatformCampaignReplyFlow",
    method: "POST",
    path: "/platform/campaign-reply-flows",
    body: { ...flow, projectId },
    call: (c, o) =>
      c.organization.campaigns.createReplyFlow({ ...flow, projectId }, o),
  },
  {
    name: "setPlatformCampaignReplyFlow",
    method: "PUT",
    path: `/platform/campaigns/${campaignId}/reply-flow`,
    body: { replyFlowId: null, projectId },
    call: (c, o) =>
      c.organization.campaigns.setReplyFlow(
        campaignId,
        { replyFlowId: null, projectId },
        o,
      ),
  },
  {
    name: "testSendPlatformCampaign",
    method: "POST",
    path: `/platform/campaigns/${campaignId}/test-send`,
    body: { ...testSend, projectId },
    call: (c, o) =>
      c.organization.campaigns.testSend(
        campaignId,
        { ...testSend, projectId },
        o,
      ),
  },
  {
    name: "listCampaignLaunchApprovals",
    method: "GET",
    path: `/platform/campaigns/${campaignId}/approvals?projectId=${projectId}`,
    call: (c, o) =>
      c.organization.campaigns.listLaunchApprovals(
        campaignId,
        { projectId },
        o,
      ),
  },
  {
    name: "getCampaignLinks",
    method: "GET",
    path: `/platform/campaigns/${campaignId}/links?projectId=${projectId}`,
    call: (c, o) =>
      c.organization.campaigns.links(campaignId, { projectId }, o),
  },
  {
    name: "exportCampaignRecipients",
    method: "GET",
    path: `/platform/campaigns/${campaignId}/recipients/export?limit=1000&projectId=${projectId}`,
    call: (c, o) =>
      c.organization.campaigns.exportRecipients(
        campaignId,
        { projectId, limit: 1000 },
        o,
      ),
  },
  {
    name: "getCampaignSettings",
    method: "GET",
    path: "/platform/campaign-settings",
    call: (c, o) => c.organization.campaigns.getSettings(o),
  },
  {
    name: "listAudienceProfiles",
    method: "GET",
    path: `/platform/audience-profiles?cursor=${jobId}&limit=100`,
    call: (c, o) =>
      c.organization.audienceProfiles.list({ cursor: jobId, limit: 100 }, o),
  },
  {
    name: "getAudienceProfile",
    method: "GET",
    path: `/platform/audience-profiles/%2B15551234567`,
    call: (c, o) => c.organization.audienceProfiles.retrieve(phone, o),
  },
  {
    name: "putAudienceProfile",
    method: "PUT",
    path: `/platform/audience-profiles/%2B15551234567`,
    body: profile,
    call: (c, o) => c.organization.audienceProfiles.put(phone, profile, o),
  },
  {
    name: "deleteAudienceProfile",
    method: "DELETE",
    path: "/platform/audience-profiles/%2B15551234567?expectedRevision=9",
    call: (c, o) => c.organization.audienceProfiles.delete(phone, 9, o),
  },
  {
    name: "listAudienceProfileConsent",
    method: "GET",
    path: "/platform/audience-profiles/%2B15551234567/consent?limit=2",
    call: (c, o) =>
      c.organization.audienceProfiles.listConsent(phone, { limit: 2 }, o),
  },
  {
    name: "createAudienceProfileImport",
    method: "POST",
    path: "/platform/audience-profile-imports",
    body: {
      replayKey: "import-1",
      csvBase64: btoa("phone,tags,attributes\r\n"),
    },
    call: (c, o) =>
      c.organization.audienceProfiles.imports.create(
        { replayKey: "import-1", csvBase64: btoa("phone,tags,attributes\r\n") },
        o,
      ),
  },
  {
    name: "getAudienceProfileImport",
    method: "GET",
    path: `/platform/audience-profile-imports/${jobId}`,
    call: (c, o) => c.organization.audienceProfiles.imports.retrieve(jobId, o),
  },
  {
    name: "cancelAudienceProfileImport",
    method: "DELETE",
    path: `/platform/audience-profile-imports/${jobId}`,
    call: (c, o) => c.organization.audienceProfiles.imports.cancel(jobId, o),
  },
  {
    name: "createAudienceFromCampaign",
    method: "POST",
    path: "/platform/audiences/from-campaign",
    body: { name: "Read", campaignId, outcome: "read", projectId },
    call: (c, o) =>
      c.organization.audiences.createFromCampaign(
        { name: "Read", campaignId, outcome: "read", projectId },
        o,
      ),
  },
  {
    name: "getStopConfirmationSettings",
    method: "GET",
    path: "/platform/optouts/confirmation-settings",
    call: (c, o) => c.organization.optOuts.getConfirmationSettings(o),
  },
  {
    name: "updateStopConfirmationSettings",
    method: "PUT",
    path: "/platform/optouts/confirmation-settings",
    body: { teamId: projectId, revision: 0, enabled: false, locale: null },
    call: (c, o) =>
      c.organization.optOuts.updateConfirmationSettings(
        { teamId: projectId, revision: 0, enabled: false, locale: null },
        o,
      ),
  },
  {
    name: "getStopConfirmationSummary",
    method: "GET",
    path: "/platform/optouts/confirmation-summary",
    call: (c, o) => c.organization.optOuts.getConfirmationSummary(o),
  },
  {
    name: "getProjectSignalCustody",
    method: "GET",
    path: `/platform/projects/${projectId}/signal-custody`,
    call: (c, o) => c.project.signalCustody.retrieve(o),
  },
  {
    name: "updateProjectSignalCustody",
    method: "PUT",
    path: `/platform/projects/${projectId}/signal-custody`,
    body: { expectedRevision: 0, signalModeDefault: "standard" },
    call: (c, o) =>
      c.project.signalCustody.update(
        { expectedRevision: 0, signalModeDefault: "standard" },
        o,
      ),
  },
  {
    name: "getCustomerSignalCustody",
    method: "GET",
    path: `/platform/projects/${projectId}/customers/${customerId}/signal-custody`,
    call: (c, o) => c.project.signalCustody.retrieveCustomer(customerId, o),
  },
  {
    name: "updateCustomerSignalCustody",
    method: "PUT",
    path: `/platform/projects/${projectId}/customers/${customerId}/signal-custody`,
    body: { expectedRevision: 2, signalModeDefault: null },
    call: (c, o) =>
      c.project.signalCustody.updateCustomer(
        customerId,
        { expectedRevision: 2, signalModeDefault: null },
        o,
      ),
  },
];

describe("2026-10-14 typed campaign and custody consumers", () => {
  it("accounts for exactly the thirty pinned source operations without advancing the baseline", () => {
    const contract = JSON.parse(
      readFileSync(
        new URL(
          "../../../contracts/campaign-custody-20261014.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as {
      commit: string;
      published: boolean;
      apiVersion: string;
      sources: Record<
        string,
        {
          sourcePath: string;
          sourceSha256: string;
          paths: Record<string, Record<string, { operationId: string }>>;
        }
      >;
    };
    expect(contract.commit).toBe("f97ad78b172e80788c33bdc0fcf28f75db9283ec");
    expect(contract.published).toBe(false);
    expect(contract.apiVersion).toBe("2026-10-14");
    const operations = Object.values(contract.sources).flatMap((source) =>
      Object.values(source.paths).flatMap((methods) =>
        Object.values(methods).map((operation) => operation.operationId),
      ),
    );
    expect(operations.sort()).toEqual(cases.map((row) => row.name).sort());
    expect(new Set(operations).size).toBe(30);
    for (const source of Object.values(contract.sources))
      expect(source.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    const baseline = JSON.parse(
      readFileSync(
        new URL("../../../contracts/source.json", import.meta.url),
        "utf8",
      ),
    ) as { commit: string };
    expect(baseline.commit).toBe("171a9683ff45d11a4b5d3917dc428ad2722b0d99");
  });

  it("preserves every send variant and accepted whitespace labels without rewriting the graph", async () => {
    const server = await startTestServer(() => ({
      body: JSON.stringify({ data: savedFlow }),
    }));
    servers.push(server);
    const c = clients(server.url).project;
    const sends: readonly CampaignReplyFlowSend[] = [
      { kind: "text", text: "Line 1\nLine 2\tend" },
      {
        kind: "buttons",
        body: "Choose",
        footer: " ",
        buttons: [{ id: "yes", text: " " }],
      },
      {
        kind: "list",
        body: "Choose",
        buttonText: " ",
        footer: " ",
        rows: [{ id: "yes", title: " ", description: " " }],
      },
      {
        kind: "flow_form",
        flowId,
        body: "Choose",
        buttonText: " ",
        footer: " ",
        screen: "START",
      },
    ];
    for (const send of sends) {
      const body = {
        name: "Details",
        definition: {
          entryNodeId: "ask",
          nodes: [
            {
              id: "ask",
              edges: [
                {
                  match: { kind: "keyword" as const, value: "details" },
                  to: "done",
                },
              ],
            },
            { id: "done", send, edges: [] },
          ],
        },
      };
      await c.campaigns.createReplyFlow(body);
      expect(JSON.parse(server.requests.at(-1)!.body)).toEqual({
        ...body,
        projectId,
      });
    }
    expect(server.requests).toHaveLength(4);
  });
  it.each(cases)(
    "$name preserves route/body and absent-only version default",
    async (row) => {
      const server = await startTestServer((request) =>
        request.path.includes("/export")
          ? {
              headers: {
                "content-type": "text/csv; charset=utf-8",
                "content-disposition": 'attachment; filename="recipients.csv"',
                "polymorfa-next-cursor": "after-1",
              },
              body: csv,
            }
          : { body: JSON.stringify(successFixture(row.name)) },
      );
      servers.push(server);
      const c = clients(server.url);
      const first = await row.call(c, {});
      const override = await row.call(c, { apiVersion: "2026-10-15" });
      if (!row.path.includes("/export")) {
        const expected = successFixture(row.name);
        const expectedData = row.name.endsWith("SignalCustody")
          ? (expected as { data: unknown }).data
          : expected;
        expect(first.data).toEqual(expectedData);
        expect(override.data).toEqual(expectedData);
      }
      expect(server.requests).toHaveLength(2);
      for (const [index, request] of server.requests.entries()) {
        expect(request).toMatchObject({ method: row.method, path: row.path });
        expect(request.headers["polymorfa-version"]).toBe(
          index === 0 ? "2026-10-14" : "2026-10-15",
        );
        expect(request.headers.authorization).toBe(
          `Bearer ${ORGANIZATION_API_KEY}`,
        );
        expect(
          request.body === "" ? undefined : JSON.parse(request.body),
        ).toEqual(row.body);
        if (row.path.endsWith("/test-send"))
          expect(request.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
        else expect(request.headers["idempotency-key"]).toBeUndefined();
      }
    },
  );

  it("keeps unrelated methods at the existing global revision", async () => {
    const server = await startTestServer(() => ({ body: '{"data":[]}' }));
    servers.push(server);
    const c = clients(server.url);
    await c.organization.campaigns.list({ projectId });
    expect(server.requests[0]?.headers["polymorfa-version"]).toBe("2026-09-22");
  });

  it("confines every bound campaign selector for both supported credential kinds", async () => {
    const server = await startTestServer(() => ({ body: '{"data":[]}' }));
    servers.push(server);
    const organization = clients(server.url).organization;
    const direct = new Client({
      credential: { type: "projectToken", value: PROJECT_TOKEN },
      projectId,
      baseUrl: server.url,
    });
    for (const project of [organization.project(projectId), direct]) {
      await project.campaigns.getReplyFlow(flowId);
      await project.campaigns.createReplyFlow(flow);
      await project.campaigns.setReplyFlow(campaignId, { replyFlowId: null });
      await project.campaigns.testSend(campaignId, testSend);
      await project.campaigns.listLaunchApprovals(campaignId);
      await project.campaigns.links(campaignId);
      expect(project).not.toHaveProperty("audienceProfiles");
      expect(project.campaigns).not.toHaveProperty("getSettings");
      expect(project.campaigns).not.toHaveProperty("create");
      expect(() =>
        project.campaigns.createReplyFlow({
          ...flow,
          projectId: customerId,
        } as never),
      ).toThrow(PolymorfaConfigurationError);
      expect(() =>
        project.campaigns.testSend(campaignId, {
          ...testSend,
          projectId: customerId,
        } as never),
      ).toThrow(PolymorfaConfigurationError);
      expect(() =>
        project.campaigns.setReplyFlow(campaignId, {
          replyFlowId: null,
          projectId: customerId,
        } as never),
      ).toThrow(PolymorfaConfigurationError);
      expect(() =>
        project.campaigns.exportRecipients(campaignId, {
          projectId: customerId,
        } as never),
      ).toThrow(PolymorfaConfigurationError);
      expect(() =>
        project.campaigns.links(campaignId, {
          path: "/platform/audience-profiles",
        } as never),
      ).toThrow(PolymorfaConfigurationError);
      expect(() =>
        project.campaigns.links(campaignId, {
          query: { projectId: customerId },
        } as never),
      ).toThrow(PolymorfaConfigurationError);
    }
    expect(server.requests).toHaveLength(12);
    for (const request of server.requests) {
      const url = new URL(request.path, server.url);
      expect(
        request.method === "GET"
          ? url.searchParams.get("projectId")
          : JSON.parse(request.body).projectId,
      ).toBe(projectId);
    }
    const invalid = () => {
      const project = organization.project(projectId);
      // @ts-expect-error project clients cannot read organization settings
      void project.campaigns.getSettings;
      // @ts-expect-error project clients cannot import organization profiles
      void project.audienceProfiles;
      // @ts-expect-error a bound project's body has no selector
      project.campaigns.testSend(campaignId, { ...testSend, projectId });
      // @ts-expect-error organization GET requires a project selector
      organization.campaigns.links(campaignId);
      project.signalCustody.update({
        expectedRevision: 0,
        // @ts-expect-error project custody cannot inherit
        signalModeDefault: null,
      });
      // @ts-expect-error enabled confirmations require a locale
      organization.optOuts.updateConfirmationSettings({
        teamId: projectId,
        revision: 0,
        enabled: true,
        locale: null,
      });
    };
    expect(invalid).toBeTypeOf("function");
  });

  it("preserves raw CSV pages, filenames and response metadata without fetching a next page", async () => {
    const server = await startTestServer(() => ({
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition":
          "attachment; filename*=UTF-8''recipient%20export.csv",
        "polymorfa-next-cursor": "second-page",
        "x-request-id": "export-request",
      },
      body: csv,
    }));
    servers.push(server);
    const result = await clients(server.url).project.campaigns.exportRecipients(
      campaignId,
    );
    expectTypeOf(result.data).toEqualTypeOf<CampaignRecipientExportPage>();
    expect(result.data).toEqual({
      csv,
      filename: "recipient export.csv",
      nextCursor: "second-page",
    });
    expect(result.metadata.requestId).toBe("export-request");
    expect(result.metadata.headers["content-disposition"]).toContain(
      "filename*",
    );
    expect(server.requests).toHaveLength(1);
  });

  it.each(["text/html", "application/json"])(
    "rejects a successful %s proxy response without exposing its content",
    async (contentType) => {
      const server = await startTestServer(() => ({
        headers: { "content-type": contentType },
        body: "private proxy diagnostics",
      }));
      servers.push(server);
      const result = clients(server.url).project.campaigns.exportRecipients(
        campaignId,
      );
      await expect(result).rejects.toMatchObject({ code: "invalid_response" });
      await expect(result).rejects.toHaveProperty("details", undefined);
      await expect(result).rejects.not.toHaveProperty(
        "message",
        expect.stringContaining("private proxy"),
      );
    },
  );

  it("captures the original test-send key and body through an uncertain retry", async () => {
    const mutable = { ...testSend, variables: { name: "first" } };
    const bodies: string[] = [];
    const keys: string[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (_url, init) => {
      bodies.push(String(init?.body));
      keys.push(new Headers(init?.headers).get("idempotency-key") ?? "");
      if (bodies.length === 1) {
        mutable.variables.name = "changed";
        return Response.json(
          { error: { message: "unavailable", code: "service_unavailable" } },
          { status: 503, headers: { "retry-after": "0" } },
        );
      }
      return Response.json({
        data: {
          ...testSend,
          id: jobId,
          campaignId,
          status: "sent",
          from: { sessionId, phone },
          messageId: null,
          createdAt: 1,
        },
      });
    });
    const c = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      fetch,
    }).project(projectId);
    const result = await c.campaigns.testSend(campaignId, mutable, {
      maxNetworkRetries: 1,
    });
    expectTypeOf(result.data.data).toEqualTypeOf<CampaignTestSend>();
    expect(bodies).toHaveLength(2);
    expect(bodies[0]).toBe(bodies[1]);
    expect(JSON.parse(bodies[1]!).variables.name).toBe("first");
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(keys[1]).toBe(keys[0]);
    expect(result.data.data.messageId).toBeNull();
  });

  it("does not automatically retry an import create even when the caller supplies a header key", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        { error: { message: "unavailable", code: "service_unavailable" } },
        { status: 503 },
      ),
    );
    const c = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      fetch,
    });
    await expect(
      c.audienceProfiles.imports.create(
        {
          replayKey: "body-identity",
          csvBase64: btoa("phone,tags,attributes\n"),
        },
        { idempotencyKey: "not-an-import-replay-contract" },
      ),
    ).rejects.toBeInstanceOf(PolymorfaServerError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [402, "insufficient_funds", PolymorfaPaymentRequiredError],
    [409, "idempotency_conflict", PolymorfaConflictError],
    [429, "new_server_code", PolymorfaRateLimitError],
    [504, "unknown", PolymorfaServerError],
  ] as const)(
    "retains %s errors and request metadata",
    async (status, code, ErrorType) => {
      const server = await startTestServer(() => ({
        status,
        headers: {
          "content-type": "application/json",
          "x-request-id": "failed-request",
          "retry-after": "3",
          "x-trace-id": "trace-1",
          "idempotent-replayed": "true",
        },
        body: JSON.stringify({
          error: { code, message: "Refused", param: "sessionId" },
        }),
      }));
      servers.push(server);
      const result = clients(server.url).project.campaigns.testSend(
        campaignId,
        testSend,
        { maxNetworkRetries: 0 },
      );
      await expect(result).rejects.toBeInstanceOf(ErrorType);
      await expect(result).rejects.toMatchObject({
        code,
        requestId: "failed-request",
        param: "sessionId",
        metadata: {
          headers: {
            "retry-after": "3",
            "x-trace-id": "trace-1",
            "idempotent-replayed": "true",
          },
        },
      });
      expect(server.requests).toHaveLength(1);
    },
  );

  it("stops a cancelled CSV reader without fetching another page", async () => {
    const server = await startTestServer(() => ({
      headers: { "content-type": "text/csv", "polymorfa-next-cursor": "next" },
      body: csv,
      bodyDelayMs: 500,
    }));
    servers.push(server);
    let markHeadersReceived: () => void = () => {};
    const receivedHeaders = new Promise<void>((resolve) => {
      markHeadersReceived = resolve;
    });
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const response = await globalThis.fetch(input, init);
      markHeadersReceived();
      return response;
    };
    const c = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
      fetch,
    }).project(projectId);
    const controller = new AbortController();
    const result = c.campaigns.exportRecipients(
      campaignId,
      {},
      { signal: controller.signal },
    );
    await receivedHeaders;
    controller.abort();
    await expect(result).rejects.toBeInstanceOf(PolymorfaCancelledError);
    expect(server.requests).toHaveLength(1);
  });

  it("validates required/null, finite numbers, UTF-8, base64 and revision limits before transport", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const c = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      fetch,
    });
    const badCalls = [
      () => c.campaigns.createReplyFlow({ ...flow } as never),
      () =>
        c
          .project(projectId)
          .campaigns.createReplyFlow({ ...flow, name: "é".repeat(65) }),
      () =>
        c.project(projectId).campaigns.setReplyFlow(campaignId, {} as never),
      () =>
        c.project(projectId).campaigns.testSend(campaignId, {
          ...testSend,
          variables: { count: Infinity },
        }),
      () =>
        c.project(projectId).campaigns.exportRecipients(campaignId, {
          status: "failed",
          cursor: "next",
        }),
      () =>
        c.project(projectId).campaigns.exportRecipients(campaignId, {
          reason: "other",
          limit: 10,
        }),
      () =>
        c.audienceProfiles.put(phone, {
          ...profile,
          attributes: { unsupported: {} },
        } as never),
      () =>
        c.audienceProfiles.put(phone, { ...profile, tags: ["é".repeat(25)] }),
      () =>
        c.audienceProfiles.put(phone, {
          ...profile,
          provenance: null,
        } as never),
      () => c.audienceProfiles.delete(phone, Number.MAX_SAFE_INTEGER + 1),
      () => c.audienceProfiles.list({ cursor: "opaque-but-not-uuid" }),
      () =>
        c.audienceProfiles.imports.create({
          replayKey: "key",
          csvBase64: "YQ",
        }),
      () =>
        c.audienceProfiles.imports.create({
          replayKey: "key",
          csvBase64: "YR==",
        }),
      () =>
        c.audienceProfiles.imports.create({
          replayKey: "key",
          csvBase64: "/w==",
        }),
      () =>
        c.audienceProfiles.imports.create({
          replayKey: "key",
          csvBase64: "AA==",
        }),
      () =>
        c.audienceProfiles.imports.create({
          replayKey: "key",
          csvBase64: btoa("phone,tags,attributes\n"),
          mapping: { phone: "phone", tags: "phone", attributes: "attributes" },
        }),
      () =>
        c.audienceProfiles.imports.create({
          replayKey: "key",
          csvBase64: btoa("phone,tags,attributes\n"),
          mapping: {
            phone: "phone",
            tags: "custom\u0085column",
            attributes: "attributes",
          },
        }),
      () =>
        c.project(projectId).signalCustody.update({
          expectedRevision: 0,
          signalModeDefault: null,
        } as never),
      () =>
        c.optOuts.updateConfirmationSettings({
          teamId: projectId,
          revision: 0,
          enabled: true,
          locale: null,
        } as never),
      () =>
        c.optOuts.updateConfirmationSettings({
          teamId: projectId,
          revision: 2_147_483_647,
          enabled: false,
          locale: null,
        }),
    ];
    for (const call of badCalls)
      expect(call).toThrow(PolymorfaConfigurationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shares custody aliases without changing selector placement or null inheritance", async () => {
    const server = await startTestServer(() => ({
      body: JSON.stringify({ data: custody }),
    }));
    servers.push(server);
    const c = clients(server.url);
    const bound = await c.project.signalCustody.retrieve();
    const alias = await c.organization.projects.getSignalCustody(projectId);
    expect(bound.data).toEqual(alias.data.data);
    await c.organization.projects.updateSignalCustody(projectId, {
      expectedRevision: 0,
      signalModeDefault: "zero_knowledge",
    });
    await c.organization.customers.getSignalCustody(customerId, projectId);
    await c.organization.customers.updateSignalCustody(customerId, projectId, {
      expectedRevision: 2,
      signalModeDefault: null,
    });
    expect(
      server.requests.every((request) => !request.path.includes("?")),
    ).toBe(true);
    expect(JSON.parse(server.requests[4]!.body)).toEqual({
      expectedRevision: 2,
      signalModeDefault: null,
    });
  });
});
