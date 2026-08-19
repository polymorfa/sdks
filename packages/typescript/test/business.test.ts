import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  BusinessResource,
  MessagingClient,
  type ApiResponse,
  type GetBusinessEligibilityResponse,
  type GetOwnBusinessProfileResponse,
} from "../src/index.js";
import {
  startTestServer,
  type RecordedRequest,
  type TestServer,
} from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function businessServer(): Promise<{
  client: MessagingClient;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer(() => ({
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_business",
    },
    body: '{"success":true,"data":{}}',
  }));
  servers.push(server);
  return {
    requests: server.requests,
    client: new MessagingClient({
      credential: { type: "apiKey", value: "pmfa_example" },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
  };
}

const mutationOptions = { idempotencyKey: "business-action-1" };

describe("MessagingClient business", () => {
  it("maps profile, compliance, linked-account, and eligibility operations", async () => {
    const { client, requests } = await businessServer();
    const business = client.business;
    const session = "sales/eu";

    const profile = await business.getProfile(session);
    await business.updateProfile(
      session,
      {
        address: "12 Market Street",
        email: "care@example.com",
        description: "Tea shop",
        websites: ["https://example.com"],
        hours: {
          timeZone: "Asia/Beirut",
          days: [
            {
              dayOfWeek: "mon",
              mode: "specific_hours",
              openTime: 540,
              closeTime: 1020,
            },
          ],
        },
      },
      mutationOptions,
    );
    await business.setCoverPhoto(
      session,
      { url: "https://cdn.example/cover.jpg" },
      mutationOptions,
    );
    await business.deleteCoverPhoto(session, "cover/100", mutationOptions);
    const compliance = {
      entityName: "Example Tea SARL",
      entityType: "PRIVATE_COMPANY",
      isRegistered: true,
      entityTypeCustom: "",
      customerCare: {
        email: "care@example.com",
        landlineNumber: "+9611000000",
        mobileNumber: "+96170000000",
      },
      grievanceOfficer: {
        name: "A. Example",
        email: "grievance@example.com",
        landlineNumber: "+9611000000",
        mobileNumber: "+96170000000",
      },
    } as const;
    await business.getMerchantCompliance(session);
    await business.setMerchantCompliance(session, compliance, mutationOptions);
    await business.getLinkedAccounts(session);
    const eligibility = await business.getEligibility(session);

    expectTypeOf<
      MessagingClient["business"]
    >().toEqualTypeOf<BusinessResource>();
    expectTypeOf(profile).toEqualTypeOf<
      ApiResponse<GetOwnBusinessProfileResponse>
    >();
    expectTypeOf(eligibility).toEqualTypeOf<
      ApiResponse<GetBusinessEligibilityResponse>
    >();
    expect(profile.metadata.requestId).toBe("req_business");
    expect(eligibility.metadata.requestId).toBe("req_business");
    expect(
      requests.map(({ method, path, body }) => ({ method, path, body })),
    ).toEqual([
      { method: "GET", path: "/api/sales%2Feu/business/profile", body: "" },
      {
        method: "PATCH",
        path: "/api/sales%2Feu/business/profile",
        body: '{"address":"12 Market Street","email":"care@example.com","description":"Tea shop","websites":["https://example.com"],"hours":{"timeZone":"Asia/Beirut","days":[{"dayOfWeek":"mon","mode":"specific_hours","openTime":540,"closeTime":1020}]}}',
      },
      {
        method: "PUT",
        path: "/api/sales%2Feu/business/profile/cover-photo",
        body: '{"url":"https://cdn.example/cover.jpg"}',
      },
      {
        method: "DELETE",
        path: "/api/sales%2Feu/business/profile/cover-photo/cover%2F100",
        body: "",
      },
      {
        method: "GET",
        path: "/api/sales%2Feu/business/compliance",
        body: "",
      },
      {
        method: "PUT",
        path: "/api/sales%2Feu/business/compliance",
        body: JSON.stringify(compliance),
      },
      {
        method: "GET",
        path: "/api/sales%2Feu/business/linked-accounts",
        body: "",
      },
      {
        method: "GET",
        path: "/api/sales%2Feu/business/eligibility",
        body: "",
      },
    ]);
  });

  it("maps catalog and product reads and mutations without inventing uploads", async () => {
    const { client, requests } = await businessServer();
    const business = client.business;
    const session = "sales/eu";
    const jid = "15551234567@s.whatsapp.net";
    const productId = "tea/1";

    await business.getCatalog(session, {
      jid,
      after: "next page",
      limit: 25,
      width: 640,
      height: 480,
    });
    await business.createCatalog(session, mutationOptions);
    await business.setCartEnabled(session, { enabled: false }, mutationOptions);
    await business.getProduct(session, productId, { jid });
    await business.createProduct(
      session,
      {
        name: "Mint tea",
        currency: "USD",
        price: "12000",
        images: [{ url: "https://cdn.example/tea.jpg" }],
      },
      mutationOptions,
    );
    await business.updateProduct(
      session,
      productId,
      {
        name: "Mint tea",
        hidden: true,
        images: [
          { base64: "aW1hZ2U=" },
          { mediaUrl: "https://lookaside.facebook.com/tea.jpg" },
        ],
      },
      mutationOptions,
    );
    await business.deleteProduct(session, productId, mutationOptions);
    await business.setProductVisibility(
      session,
      productId,
      { hidden: false },
      mutationOptions,
    );
    await business.appealProduct(
      session,
      productId,
      { reason: "Incorrect rejection" },
      mutationOptions,
    );

    expect(
      requests.map(({ method, path, body }) => ({ method, path, body })),
    ).toEqual([
      {
        method: "GET",
        path: "/api/sales%2Feu/business/catalog?jid=15551234567%40s.whatsapp.net&after=next+page&limit=25&width=640&height=480",
        body: "",
      },
      {
        method: "POST",
        path: "/api/sales%2Feu/business/catalog",
        body: "",
      },
      {
        method: "PATCH",
        path: "/api/sales%2Feu/business/catalog/cart",
        body: '{"enabled":false}',
      },
      {
        method: "GET",
        path: "/api/sales%2Feu/business/products/tea%2F1?jid=15551234567%40s.whatsapp.net",
        body: "",
      },
      {
        method: "POST",
        path: "/api/sales%2Feu/business/products",
        body: '{"name":"Mint tea","currency":"USD","price":"12000","images":[{"url":"https://cdn.example/tea.jpg"}]}',
      },
      {
        method: "PUT",
        path: "/api/sales%2Feu/business/products/tea%2F1",
        body: '{"name":"Mint tea","hidden":true,"images":[{"base64":"aW1hZ2U="},{"mediaUrl":"https://lookaside.facebook.com/tea.jpg"}]}',
      },
      {
        method: "DELETE",
        path: "/api/sales%2Feu/business/products/tea%2F1",
        body: "",
      },
      {
        method: "PATCH",
        path: "/api/sales%2Feu/business/products/tea%2F1/visibility",
        body: '{"hidden":false}',
      },
      {
        method: "POST",
        path: "/api/sales%2Feu/business/products/tea%2F1/appeal",
        body: '{"reason":"Incorrect rejection"}',
      },
    ]);
  });

  it("maps collection cursors, mutations, and authenticated order lookup", async () => {
    const { client, requests } = await businessServer();
    const business = client.business;
    const session = "sales/eu";
    const jid = "15551234567@lid";
    const collectionId = "summer/1";

    await business.listCollections(session, {
      jid,
      after: "collections next",
      collectionLimit: 10,
      itemLimit: 50,
      width: 512,
      height: 512,
    });
    await business.getCollection(session, collectionId, {
      jid,
      after: "items next",
      limit: 20,
      width: 320,
      height: 240,
    });
    await business.createCollection(
      session,
      { name: "Summer", productIds: ["tea/1"] },
      mutationOptions,
    );
    await business.updateCollection(
      session,
      collectionId,
      {
        name: "Cold drinks",
        addProductIds: ["coffee/1"],
        removeProductIds: ["tea/1"],
      },
      mutationOptions,
    );
    await business.deleteCollection(session, collectionId, mutationOptions);
    await business.reorderCollections(
      session,
      {
        moves: [{ collectionId, fromIndex: 2, toIndex: 0 }],
      },
      mutationOptions,
    );
    await business.appealCollection(
      session,
      collectionId,
      { reason: "Products comply" },
      mutationOptions,
    );
    await business.getOrder(
      session,
      "order/1",
      { token: "opaque order token" },
      mutationOptions,
    );

    expect(
      requests.map(({ method, path, body }) => ({ method, path, body })),
    ).toEqual([
      {
        method: "GET",
        path: "/api/sales%2Feu/business/collections?jid=15551234567%40lid&after=collections+next&collectionLimit=10&itemLimit=50&width=512&height=512",
        body: "",
      },
      {
        method: "GET",
        path: "/api/sales%2Feu/business/collections/summer%2F1?jid=15551234567%40lid&after=items+next&limit=20&width=320&height=240",
        body: "",
      },
      {
        method: "POST",
        path: "/api/sales%2Feu/business/collections",
        body: '{"name":"Summer","productIds":["tea/1"]}',
      },
      {
        method: "PATCH",
        path: "/api/sales%2Feu/business/collections/summer%2F1",
        body: '{"name":"Cold drinks","addProductIds":["coffee/1"],"removeProductIds":["tea/1"]}',
      },
      {
        method: "DELETE",
        path: "/api/sales%2Feu/business/collections/summer%2F1",
        body: "",
      },
      {
        method: "POST",
        path: "/api/sales%2Feu/business/collections/reorder",
        body: '{"moves":[{"collectionId":"summer/1","fromIndex":2,"toIndex":0}]}',
      },
      {
        method: "POST",
        path: "/api/sales%2Feu/business/collections/summer%2F1/appeal",
        body: '{"reason":"Products comply"}',
      },
      {
        method: "POST",
        path: "/api/sales%2Feu/business/orders/order%2F1/lookup",
        body: '{"token":"opaque order token"}',
      },
    ]);
  });

  it("preserves idempotency on every non-GET Business App operation", async () => {
    const { client, requests } = await businessServer();
    const business = client.business;
    const session = "sales";

    await business.updateProfile(session, { address: "" }, mutationOptions);
    await business.setCoverPhoto(
      session,
      { base64: "aW1hZ2U=" },
      mutationOptions,
    );
    await business.deleteCoverPhoto(session, "cover", mutationOptions);
    await business.createCatalog(session, mutationOptions);
    await business.setCartEnabled(session, { enabled: true }, mutationOptions);
    await business.createProduct(
      session,
      { name: "Tea", images: [{ base64: "aW1hZ2U=" }] },
      mutationOptions,
    );
    await business.updateProduct(
      session,
      "tea",
      { name: "Tea", images: [{ base64: "aW1hZ2U=" }] },
      mutationOptions,
    );
    await business.deleteProduct(session, "tea", mutationOptions);
    await business.setProductVisibility(
      session,
      "tea",
      { hidden: true },
      mutationOptions,
    );
    await business.appealProduct(
      session,
      "tea",
      { reason: "Review" },
      mutationOptions,
    );
    await business.createCollection(
      session,
      { name: "Tea", productIds: ["tea"] },
      mutationOptions,
    );
    await business.updateCollection(
      session,
      "tea",
      { name: "Tea" },
      mutationOptions,
    );
    await business.deleteCollection(session, "tea", mutationOptions);
    await business.reorderCollections(
      session,
      { moves: [{ collectionId: "tea", fromIndex: 0, toIndex: 1 }] },
      mutationOptions,
    );
    await business.appealCollection(
      session,
      "tea",
      { reason: "Review" },
      mutationOptions,
    );
    await business.getOrder(
      session,
      "order",
      { token: "token" },
      mutationOptions,
    );
    await business.setMerchantCompliance(
      session,
      {
        entityName: "Tea",
        entityType: "SOLE_PROPRIETORSHIP",
        isRegistered: false,
        entityTypeCustom: "",
        customerCare: {
          email: "",
          landlineNumber: "",
          mobileNumber: "",
        },
        grievanceOfficer: {
          name: "",
          email: "",
          landlineNumber: "",
          mobileNumber: "",
        },
      },
      mutationOptions,
    );

    expect(requests).toHaveLength(17);
    expect(requests.map(({ headers }) => headers["idempotency-key"])).toEqual(
      Array.from({ length: 17 }, () => "business-action-1"),
    );
    expect(requests.every(({ method }) => method !== "GET")).toBe(true);
  });
});
