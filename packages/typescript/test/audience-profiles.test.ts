import { readFileSync } from "node:fs";
import { afterEach, expect, expectTypeOf, it } from "vitest";
import {
  Client,
  PolymorfaConflictError,
  type ListAudienceProfilesParams,
  type PutAudienceProfileRequest,
} from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});
const phone = "+14155550123";
const id = "018f0000-0000-7000-8000-000000000001";
const job = {
  id,
  state: "queued",
  totalValid: 0,
  invalidCount: 0,
  invalidSamples: [],
  conflictSamples: [],
  processedValid: 0,
  createdCount: 0,
  updatedCount: 0,
  conflictCount: 0,
  createdAt: 0,
  updatedAt: 0,
  completedAt: null,
};
const profile = {
  id: "018f0000-0000-7000-8000-000000000001",
  phone,
  revision: 2,
  tags: ["vip"],
  attributes: { name: "Ada", active: true, score: 3, empty: null },
  provenance: null,
  createdAt: 1,
  updatedAt: 2,
};
async function setup(status = 200) {
  const server = await startTestServer((request) => ({
    status,
    body: JSON.stringify(
      status === 200
        ? request.path.includes("/audience-profile-imports")
          ? { data: job }
          : request.method === "DELETE"
            ? { data: { deleted: true, phone, revision: 3 } }
            : request.path.includes("/consent")
              ? { data: [], page: { nextCursor: null, hasMore: false } }
              : request.method === "GET" &&
                  request.path.split("?")[0] === "/platform/audience-profiles"
                ? { data: [profile], page: { nextCursor: id, hasMore: true } }
                : { data: profile }
        : { error: "Unavailable" },
    ),
  }));
  servers.push(server);
  return {
    server,
    resource: new Client({
      baseUrl: server.url,
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      maxNetworkRetries: 0,
    }).audienceProfiles,
  };
}
it("sends combined list filters and retains them on cursor continuation", async () => {
  const { server, resource } = await setup();
  const params = {
    tag: "é vip",
    phonePrefix: "+44",
    limit: 2,
  } satisfies ListAudienceProfilesParams;
  const first = await resource.list(params);
  await resource.list({ ...params, cursor: first.data.page.nextCursor! });
  for (const request of server.requests) {
    const url = new URL(request.path, "https://example.com");
    expect(url.pathname).toBe("/platform/audience-profiles");
    expect(url.searchParams.get("tag")).toBe("é vip");
    expect(url.searchParams.get("phonePrefix")).toBe("+44");
    expect(url.searchParams.get("limit")).toBe("2");
    expect(request.path).toContain("%2B44");
  }
  expect(
    new URL(server.requests[1]!.path, "https://example.com").searchParams.get(
      "cursor",
    ),
  ).toBe(id);
});
it.each([{ tag: "vip" }, { phonePrefix: "+1" }, {}])(
  "sends only supplied filters: %j",
  async (params) => {
    const { server, resource } = await setup();
    await resource.list(params);
    const query = new URL(server.requests[0]!.path, "https://example.com")
      .searchParams;
    expect(Object.fromEntries(query)).toEqual(params);
  },
);
it("supports encoded profile paths, replacement revisions, deletion and consent paging", async () => {
  const { server, resource } = await setup();
  const body = {
    tags: [],
    attributes: {},
    expectedRevision: 2,
  } satisfies PutAudienceProfileRequest;
  await resource.retrieve(phone);
  await resource.put(phone, body);
  await resource.delete(phone, 2);
  await resource.listConsent(phone, { cursor: id, limit: 3 });
  expect(server.requests.map((r) => r.method)).toEqual([
    "GET",
    "PUT",
    "DELETE",
    "GET",
  ]);
  expect(server.requests[0]!.path).toBe(
    "/platform/audience-profiles/%2B14155550123",
  );
  expect(JSON.parse(server.requests[1]!.body)).toEqual(body);
  expect(server.requests[2]!.path).toContain("expectedRevision=2");
  expect(server.requests[3]!.path).toContain(`/consent?cursor=${id}&limit=3`);
});
it("encodes UTF-8 CSV with replay identity and mapping, then polls and cancels", async () => {
  const { server, resource } = await setup();
  const csv = 'phone,tags,attributes\n+14155550123,vip,"é"\n';
  const mapping = { phone: "phone", tags: "tags", attributes: "attributes" };
  await resource.imports.create({
    replayKey: "import-1",
    csvBase64: Buffer.from(csv).toString("base64"),
    mapping,
  });
  await resource.imports.create({
    replayKey: "import-1",
    csvBase64: Buffer.from(csv).toString("base64"),
    mapping,
  });
  await resource.imports.retrieve(id);
  await resource.imports.cancel(id);
  expect(server.requests[0]!.body).toBe(server.requests[1]!.body);
  expect(JSON.parse(server.requests[0]!.body)).toEqual({
    replayKey: "import-1",
    mapping,
    csvBase64: Buffer.from(csv).toString("base64"),
  });
  expect(server.requests.slice(2).map((r) => [r.method, r.path])).toEqual([
    ["GET", `/platform/audience-profile-imports/${id}`],
    ["DELETE", `/platform/audience-profile-imports/${id}`],
  ]);
});
it("rejects malformed phones and unsafe revisions before sending", async () => {
  const { server, resource } = await setup();
  expect(() => resource.retrieve("4155550123")).toThrow();
  expect(() => resource.delete(phone, 0)).toThrow();
  expect(() => resource.delete(phone, Number.MAX_SAFE_INTEGER + 1)).toThrow();
  expect(server.requests).toHaveLength(0);
});
it("preserves API revision conflicts", async () => {
  const { resource } = await setup(409);
  await expect(
    resource.put(phone, { tags: [], attributes: {} }),
  ).rejects.toBeInstanceOf(PolymorfaConflictError);
});
it("restricts the resource to organization clients", () => {
  const project = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
  }).project("project-1");
  expect("audienceProfiles" in project).toBe(false);
  expectTypeOf<ListAudienceProfilesParams["phonePrefix"]>().toEqualTypeOf<
    string | undefined
  >();
});
it("pins all eight operations and the exact filter contract", () => {
  const contract = JSON.parse(
    readFileSync(
      new URL("../../../contracts/audience-profiles.json", import.meta.url),
      "utf8",
    ),
  );
  const operations = Object.values(contract.paths).flatMap((path) =>
    Object.values(path as Record<string, { operationId: string }>).map(
      (op) => op.operationId,
    ),
  );
  expect(operations.sort()).toEqual(
    [
      "listAudienceProfiles",
      "getAudienceProfile",
      "putAudienceProfile",
      "deleteAudienceProfile",
      "listAudienceProfileConsent",
      "createAudienceProfileImport",
      "getAudienceProfileImport",
      "cancelAudienceProfileImport",
    ].sort(),
  );
  const params = contract.paths["/platform/audience-profiles"].get.parameters;
  expect(
    params.find((p: { name: string }) => p.name === "tag").schema[
      "x-polymorfa-max-utf8-bytes"
    ],
  ).toBe(48);
  expect(
    params.find((p: { name: string }) => p.name === "phonePrefix").schema
      .pattern,
  ).toBe("^\\+[0-9]{1,15}$");
});

it("uses the portable candidate filter boundary without broadening consent", async () => {
  const fixture = JSON.parse(
    readFileSync(
      new URL(
        "../../../contracts/fixtures/audience-profile-list.v1.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const { server, resource } = await setup();
  for (const params of fixture.validFilters) await resource.list(params);
  const sent = server.requests.length;
  for (const params of [
    ...fixture.invalidFilters,
    { tag: null },
    { phonePrefix: null },
    { phonePrefix: "+1\n" },
  ])
    expect(() => resource.list(params)).toThrow();
  for (const cursor of fixture.invalidCursors)
    expect(() => resource.list({ cursor })).toThrow();
  expect(() =>
    resource.listConsent(phone, JSON.parse('{"tag":"vip"}')),
  ).toThrow();
  expect(server.requests.length).toBe(sent);
  const dynamic = JSON.parse('{"tag":"null"}');
  Object.defineProperty(dynamic, "phonePrefix", {
    value: undefined,
    enumerable: true,
  });
  await resource.list(dynamic);
  expect(
    new URL(
      server.requests.at(-1)!.path,
      "https://example.test",
    ).searchParams.get("tag"),
  ).toBe("null");
  expect(server.requests.at(-1)!.path).not.toContain("phonePrefix");
});
