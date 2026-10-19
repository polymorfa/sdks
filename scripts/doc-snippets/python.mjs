import { key, literal, p } from "./recipes.mjs";
// Evidence: packages/python/src/polymorfa/{client,messaging,business,platform}.py
// and tests/test_{operations,business,collection_wire}.py.
export function render(id, { client, request }) {
  const s = p("session"),
    sid = p("sessionId");
  const b = request.body ? literal(request.body, "python") : "";
  const q = request.query ? literal(request.query, "python") : "";
  const calls = {
    sendMessage: `sdk.messages.send(${s}, ${b})`,
    getMessageOperation: `sdk.messages.operation_status(${s}, ${p("operationId")})`,
    sendSeen: `sdk.messages.mark_seen(${s}, ${b})`,
    setTyping: `sdk.messages.set_typing(${s}, ${b})`,
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
    getOwnBusinessProfile: `sdk.business.get_profile(${s})`,
    getBusinessMerchantCompliance: `sdk.business.get_merchant_compliance(${s})`,
    getBusinessLinkedAccounts: `sdk.business.get_linked_accounts(${s})`,
    getBusinessEligibility: `sdk.business.get_eligibility(${s})`,
    getBusinessCatalog: `sdk.business.get_catalog(${s}, ${q})`,
    getBusinessProduct: `sdk.business.get_product(${s}, ${p("productId")}, ${q})`,
    getBusinessCollections: `sdk.business.list_collections(${s}, ${q})`,
    getBusinessCollection: `sdk.business.get_collection(${s}, ${p("collectionId")}, ${q})`,
    createBusinessCatalog: `sdk.business.create_catalog(${s})`,
    createBusinessCollection: `sdk.business.create_collection(${s}, ${b})`,
    deleteBusinessCollection: `sdk.business.delete_collection(${s}, ${p("collectionId")})`,
    deleteBusinessProduct: `sdk.business.delete_product(${s}, ${p("productId")})`,
    deleteBusinessCoverPhoto: `sdk.business.delete_cover_photo(${s}, ${p("coverPhotoId")})`,
    setBusinessCartEnabled: `sdk.business.set_cart_enabled(${s}, ${b})`,
    setBusinessProductVisibility: `sdk.business.set_product_visibility(${s}, ${p("productId")}, ${b})`,
    listProjects: "sdk.projects.list()",
    listProjectEvents: "sdk.events.list()",
  };
  if (!calls[id]) return undefined;
  const type =
    client === "messaging"
      ? "AsyncMessagingClient"
      : client === "project"
        ? "AsyncProjectClient"
        : "AsyncClient";
  const project = client === "project" ? `, ${p("projectId")}` : "";
  return `import asyncio\nfrom polymorfa import ${type}, Credential\n\n\nasync def main() -> None:\n    async with ${type}(Credential("organization_api_key", ${key})${project}) as sdk:\n        result = await ${calls[id]}\n        print(result)\n\n\nif __name__ == "__main__":\n    asyncio.run(main())\n`;
}
