import { key, p } from "./recipes.mjs";
// Evidence: packages/dotnet/src/Polymorfa.Sdk/{MessagingClient,Business,
// PlatformClients,Models,BusinessModels}.cs and native tests/Program.cs.
export function render(id, { client, request }) {
  const s = p("session"),
    sid = p("sessionId");
  const b = request.body,
    quote = JSON.stringify;
  const conv = `new ConversationReference(Id: ${quote(b?.conversation?.id)})`;
  const queryId = quote(request.query?.id);
  const calls = {
    sendMessage: `sdk.Messages.SendAsync(${s}, new SendMessageRequest(new ConversationReference(PhoneNumber: ${quote(b?.conversation?.phoneNumber)}), new TextContent(${quote(b?.content?.text)})))`,
    getMessageOperation: `sdk.Messages.OperationStatusAsync(${s}, ${p("operationId")})`,
    sendSeen: `sdk.Messages.MarkSeenAsync(${s}, new SeenRequest(${conv}, ${quote(b?.id)}))`,
    setTyping: `sdk.Messages.SetTypingAsync(${s}, new TypingRequest(${conv}, ${quote(b?.state)}))`,
    sendReaction: `sdk.Messages.ReactAsync(${s}, new ReactRequest(${conv}, ${quote(b?.id)}, ${quote(b?.reaction)}))`,
    starMessage: `sdk.Messages.StarAsync(${s}, new StarRequest(${conv}, ${quote(b?.id)}, ${b?.star}))`,
    listPlatformSessions: "sdk.Sessions.ListAsync()",
    getSession: `sdk.Sessions.RetrieveAsync(${sid})`,
    getSessionAccount: `sdk.Sessions.AccountAsync(${sid})`,
    startPlatformSession: `sdk.Sessions.StartAsync(${sid})`,
    stopPlatformSession: `sdk.Sessions.StopAsync(${sid})`,
    restartSession: `sdk.Sessions.RestartAsync(${sid})`,
    logoutSession: `sdk.Sessions.LogoutAsync(${sid})`,
    deletePlatformSession: `sdk.Sessions.DeleteAsync(${sid})`,
    getOwnBusinessProfile: `sdk.Business.GetProfileAsync(${s})`,
    getBusinessMerchantCompliance: `sdk.Business.GetMerchantComplianceAsync(${s})`,
    getBusinessLinkedAccounts: `sdk.Business.GetLinkedAccountsAsync(${s})`,
    getBusinessEligibility: `sdk.Business.GetEligibilityAsync(${s})`,
    getBusinessCatalog: `sdk.Business.GetCatalogAsync(${s}, new BusinessCatalogParameters(${queryId}))`,
    getBusinessProduct: `sdk.Business.GetProductAsync(${s}, ${p("productId")}, ${queryId})`,
    getBusinessCollections: `sdk.Business.ListCollectionsAsync(${s}, new BusinessCollectionsParameters(${queryId}))`,
    getBusinessCollection: `sdk.Business.GetCollectionAsync(${s}, ${p("collectionId")}, new BusinessCatalogParameters(${queryId}))`,
    createBusinessCatalog: `sdk.Business.CreateCatalogAsync(${s})`,
    createBusinessCollection: `sdk.Business.CreateCollectionAsync(${s}, new BusinessCollectionCreateRequest(${quote(b?.name)}, new[] { ${b?.productIds?.map(quote).join(", ")} }))`,
    deleteBusinessCollection: `sdk.Business.DeleteCollectionAsync(${s}, ${p("collectionId")})`,
    deleteBusinessProduct: `sdk.Business.DeleteProductAsync(${s}, ${p("productId")})`,
    deleteBusinessCoverPhoto: `sdk.Business.DeleteCoverPhotoAsync(${s}, ${p("coverPhotoId")})`,
    setBusinessCartEnabled: `sdk.Business.SetCartEnabledAsync(${s}, ${b?.enabled})`,
    setBusinessProductVisibility: `sdk.Business.SetProductVisibilityAsync(${s}, ${p("productId")}, ${b?.hidden})`,
    listProjects: "sdk.Projects.ListAsync()",
    listProjectEvents: "sdk.Events.ListAsync()",
  };
  if (!calls[id]) return undefined;
  const type =
    client === "messaging"
      ? "MessagingClient"
      : client === "project"
        ? "ProjectClient"
        : "OrganizationClient";
  const project = client === "project" ? `, ${p("projectId")}` : "";
  return `using System;\nusing Polymorfa.Sdk;\n\nusing var sdk = new ${type}(Credential.OrganizationApiKey(${key})${project});\nvar result = await ${calls[id]};\nConsole.WriteLine(result);\n`;
}
