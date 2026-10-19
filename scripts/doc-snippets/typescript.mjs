import { key, literal, p } from "./recipes.mjs";
// Evidence: packages/typescript/src/messaging/{messages,sessions,business}.ts,
// src/client.ts, src/platform/events.ts and the native wire tests.
export function render(id, { client, request }) {
  const s = p("session"),
    sid = p("sessionId");
  const b = request.body ? literal(request.body, "typescript") : "";
  const q = request.query ? literal(request.query, "typescript") : "";
  const calls = {
    sendMessage: `sdk.messages.send(${s}, ${b})`,
    getMessageOperation: `sdk.messages.operationStatus(${s}, ${p("operationId")})`,
    sendSeen: `sdk.messages.markSeen(${s}, ${b})`,
    setTyping: `sdk.messages.setTyping(${s}, ${b})`,
    sendReaction: `sdk.messages.react(${s}, ${b})`,
    starMessage: `sdk.messages.star(${s}, ${b})`,
    listPlatformSessions: "sdk.sessions.list()",
    getSession: `sdk.sessions.retrieve(${sid})`,
    getSessionAccount: `sdk.sessions.account(${sid})`,
    startPlatformSession: `sdk.sessions.start(${sid})`,
    stopPlatformSession: `sdk.sessions.stop(${sid})`,
    restartSession: `sdk.sessions.restart(${sid})`,
    logoutSession: `sdk.sessions.logout(${sid})`,
    deletePlatformSession: `sdk.sessions.delete(${sid})`,
    getOwnBusinessProfile: `sdk.business.getProfile(${s})`,
    getBusinessMerchantCompliance: `sdk.business.getMerchantCompliance(${s})`,
    getBusinessLinkedAccounts: `sdk.business.getLinkedAccounts(${s})`,
    getBusinessEligibility: `sdk.business.getEligibility(${s})`,
    getBusinessCatalog: `sdk.business.getCatalog(${s}, ${q})`,
    getBusinessProduct: `sdk.business.getProduct(${s}, ${p("productId")}, ${q})`,
    getBusinessCollections: `sdk.business.listCollections(${s}, ${q})`,
    getBusinessCollection: `sdk.business.getCollection(${s}, ${p("collectionId")}, ${q})`,
    createBusinessCatalog: `sdk.business.createCatalog(${s})`,
    createBusinessCollection: `sdk.business.createCollection(${s}, ${b})`,
    deleteBusinessCollection: `sdk.business.deleteCollection(${s}, ${p("collectionId")})`,
    deleteBusinessProduct: `sdk.business.deleteProduct(${s}, ${p("productId")})`,
    deleteBusinessCoverPhoto: `sdk.business.deleteCoverPhoto(${s}, ${p("coverPhotoId")})`,
    setBusinessCartEnabled: `sdk.business.setCartEnabled(${s}, ${b})`,
    setBusinessProductVisibility: `sdk.business.setProductVisibility(${s}, ${p("productId")}, ${b})`,
    listProjects: "sdk.projects.list()",
    listProjectEvents: "sdk.events.list()",
  };
  if (!calls[id]) return undefined;
  const type = client === "messaging" ? "MessagingClient" : "Client";
  const credentialType =
    client === "messaging" ? "apiKey" : "organizationApiKey";
  const project = client === "project" ? `, projectId: ${p("projectId")}` : "";
  return `import { ${type} } from "@polymorfa/sdk";\n\nasync function main(): Promise<void> {\n  const sdk = new ${type}({ credential: { type: "${credentialType}", value: ${key} }${project} });\n  const result = await ${calls[id]};\n  console.log(result);\n}\n\nmain().catch((error: unknown) => { console.error(error); process.exitCode = 1; });\n`;
}
