import { key, p } from "./recipes.mjs";
// Evidence: packages/go/{messaging,client,business,platform}.go and
// operations_test.go, business_test.go, collection_wire_test.go.
export function render(id, { client, request }) {
  const s = p("session"),
    sid = p("sessionId"),
    b = request.body;
  const quote = JSON.stringify;
  const conv = `sdk.ConversationReference{ID: ${quote(b?.conversation?.id)}}`;
  const queryId = quote(request.query?.id);
  const calls = {
    sendMessage: `api.Messages().Send(ctx, ${s}, sdk.SendMessageRequest{Conversation: sdk.ConversationReference{PhoneNumber: ${quote(b?.conversation?.phoneNumber)}}, Content: sdk.MessageContent{Text: &text}})`,
    getMessageOperation: `api.Messages().OperationStatus(ctx, ${s}, ${p("operationId")})`,
    sendSeen: `api.Messages().MarkSeen(ctx, ${s}, sdk.SeenRequest{Conversation: ${conv}, ID: ${JSON.stringify(b?.id)}})`,
    setTyping: `api.Messages().SetTyping(ctx, ${s}, sdk.TypingRequest{Conversation: ${conv}, State: ${quote(b?.state)}})`,
    sendReaction: `api.Messages().React(ctx, ${s}, sdk.ReactionRequest{Conversation: ${conv}, ID: ${JSON.stringify(b?.id)}, Reaction: ${quote(b?.reaction)}})`,
    starMessage: `api.Messages().Star(ctx, ${s}, sdk.StarRequest{Conversation: ${conv}, ID: ${JSON.stringify(b?.id)}, Star: ${b?.star}})`,
    listPlatformSessions: "api.Sessions().List(ctx)",
    getSession: `api.Sessions().Retrieve(ctx, ${sid})`,
    getSessionAccount: `api.Sessions().Account(ctx, ${sid})`,
    startPlatformSession: `api.Sessions().Start(ctx, ${sid})`,
    stopPlatformSession: `api.Sessions().Stop(ctx, ${sid})`,
    restartSession: `api.Sessions().Restart(ctx, ${sid})`,
    logoutSession: `api.Sessions().Logout(ctx, ${sid})`,
    deletePlatformSession: `api.Sessions().Delete(ctx, ${sid})`,
    getOwnBusinessProfile: `api.Business().GetProfile(ctx, ${s})`,
    getBusinessMerchantCompliance: `api.Business().GetMerchantCompliance(ctx, ${s})`,
    getBusinessLinkedAccounts: `api.Business().GetLinkedAccounts(ctx, ${s})`,
    getBusinessEligibility: `api.Business().GetEligibility(ctx, ${s})`,
    getBusinessCatalog: `api.Business().GetCatalog(ctx, ${s}, sdk.BusinessCatalogParams{ID: ${queryId}})`,
    getBusinessProduct: `api.Business().GetProduct(ctx, ${s}, ${p("productId")}, ${queryId})`,
    getBusinessCollections: `api.Business().ListCollections(ctx, ${s}, sdk.BusinessCollectionsParams{ID: ${queryId}})`,
    getBusinessCollection: `api.Business().GetCollection(ctx, ${s}, ${p("collectionId")}, sdk.BusinessCollectionParams{ID: ${queryId}})`,
    createBusinessCatalog: `api.Business().CreateCatalog(ctx, ${s})`,
    createBusinessCollection: `api.Business().CreateCollection(ctx, ${s}, sdk.BusinessCollectionCreateRequest{Name: ${quote(b?.name)}, ProductIDs: []string{${b?.productIds?.map(quote).join(", ")}}})`,
    deleteBusinessCollection: `api.Business().DeleteCollection(ctx, ${s}, ${p("collectionId")})`,
    deleteBusinessProduct: `api.Business().DeleteProduct(ctx, ${s}, ${p("productId")})`,
    deleteBusinessCoverPhoto: `api.Business().DeleteCoverPhoto(ctx, ${s}, ${p("coverPhotoId")})`,
    setBusinessCartEnabled: `api.Business().SetCartEnabled(ctx, ${s}, ${b?.enabled})`,
    setBusinessProductVisibility: `api.Business().SetProductVisibility(ctx, ${s}, ${p("productId")}, ${b?.hidden})`,
    listProjects: "api.Projects().List(ctx)",
    listProjectEvents: "api.Events().List(ctx, sdk.ListEventsParams{})",
  };
  if (!calls[id]) return undefined;
  const ctor =
    client === "messaging"
      ? "NewMessagingClient"
      : client === "project"
        ? "NewProjectClient"
        : "NewOrganizationClient";
  const project = client === "project" ? `, ${p("projectId")}` : "";
  return `package main\n\nimport (\n  "context"\n  "fmt"\n  "log"\n  sdk "github.com/polymorfa/sdks/packages/go"\n)\n\nfunc main() {\n  ctx := context.Background()\n  api, err := sdk.${ctor}(sdk.Config{Credential: sdk.Credential{Kind: sdk.OrganizationAPIKey, Value: ${key}}}${project})\n  if err != nil { log.Fatal(err) }\n${id === "sendMessage" ? `  text := ${quote(b.content.text)}\n` : ""}  result, err := ${calls[id]}\n  if err != nil { log.Fatal(err) }\n  fmt.Println(result)\n}\n`;
}
