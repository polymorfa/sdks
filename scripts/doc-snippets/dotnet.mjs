import { key, p } from "./recipes.mjs";
// Evidence: packages/dotnet/src/Polymorfa.Sdk/{MessagingClient,Business,
// PlatformClients,Models,BusinessModels}.cs and native tests/Program.cs.
export function render(id, { client }) {
  const s = p("session"),
    sid = p("sessionId");
  const conv = 'new ConversationReference(Id: "42")';
  const calls = {
    sendMessage: `sdk.Messages.SendAsync(${s}, new SendMessageRequest(new ConversationReference(PhoneNumber: "+15550001111"), new TextContent("Hello")))`,
    getMessageOperation: `sdk.Messages.OperationStatusAsync(${s}, ${p("operationId")})`,
    sendSeen: `sdk.Messages.MarkSeenAsync(${s}, new SeenRequest(${conv}, "43"))`,
    setTyping: `sdk.Messages.SetTypingAsync(${s}, new TypingRequest(${conv}, "paused"))`,
    sendReaction: `sdk.Messages.ReactAsync(${s}, new ReactRequest(${conv}, "43", "👍"))`,
    starMessage: `sdk.Messages.StarAsync(${s}, new StarRequest(${conv}, "43", false))`,
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
    getBusinessCatalog: `sdk.Business.GetCatalogAsync(${s}, new BusinessCatalogParameters("42"))`,
    getBusinessProduct: `sdk.Business.GetProductAsync(${s}, ${p("productId")}, "42")`,
    getBusinessCollections: `sdk.Business.ListCollectionsAsync(${s}, new BusinessCollectionsParameters("42"))`,
    getBusinessCollection: `sdk.Business.GetCollectionAsync(${s}, ${p("collectionId")}, new BusinessCatalogParameters("42"))`,
    createBusinessCatalog: `sdk.Business.CreateCatalogAsync(${s})`,
    createBusinessCollection: `sdk.Business.CreateCollectionAsync(${s}, new BusinessCollectionCreateRequest("Featured", new[] { "product-id" }))`,
    deleteBusinessCollection: `sdk.Business.DeleteCollectionAsync(${s}, ${p("collectionId")})`,
    deleteBusinessProduct: `sdk.Business.DeleteProductAsync(${s}, ${p("productId")})`,
    deleteBusinessCoverPhoto: `sdk.Business.DeleteCoverPhotoAsync(${s}, ${p("coverPhotoId")})`,
    setBusinessCartEnabled: `sdk.Business.SetCartEnabledAsync(${s}, true)`,
    setBusinessProductVisibility: `sdk.Business.SetProductVisibilityAsync(${s}, ${p("productId")}, true)`,
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
