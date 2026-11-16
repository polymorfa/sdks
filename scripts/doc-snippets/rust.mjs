import { key, p } from "./recipes.mjs";
// Evidence: packages/rust/src/{messaging,business,models,platform}.rs,
// tests/{business,developer,transport}.rs and the public text request helper.
export function render(id, { client, request }) {
  const s = p("connection"),
    sid = p("connectionId");
  const m = "polymorfa_sdk::models",
    b = "polymorfa_sdk::business";
  const body = request.body,
    quote = JSON.stringify;
  const conv = `${m}::ConversationReference::id(${quote(body?.conversation?.id)})`;
  const queryId = quote(request.query?.id);
  const typing = { paused: "Paused", typing: "Typing", recording: "Recording" }[
    body?.state
  ];
  const catalog = `&${b}::BusinessCatalogParameters { id: ${queryId}.into(), after: None, limit: None, width: None, height: None }`;
  const calls = {
    sendMessage: `sdk.messages().send(${s}, &${m}::SendMessageRequest::text(${m}::ConversationReference::phone(${quote(body?.conversation?.phoneNumber)}), ${quote(body?.content?.text)}), Default::default())`,
    getMessageOperation: `sdk.messages().operation_status(${s}, ${p("operationId")}, Default::default())`,
    sendSeen: `sdk.messages().mark_seen(${s}, &${m}::SeenRequest { conversation: ${conv}, id: ${quote(body?.id)}.into() }, Default::default())`,
    setTyping: `sdk.messages().set_typing(${s}, &${m}::TypingRequest { conversation: ${conv}, id: None, state: ${m}::TypingState::${typing} }, Default::default())`,
    sendReaction: `sdk.messages().react(${s}, &${m}::ReactRequest { conversation: ${conv}, id: ${quote(body?.id)}.into(), reaction: ${quote(body?.reaction)}.into(), transport: None }, Default::default())`,
    starMessage: `sdk.messages().star(${s}, &${m}::StarRequest { conversation: ${conv}, id: ${quote(body?.id)}.into(), star: ${body?.star} }, Default::default())`,
    listPlatformConnections: "sdk.connections().list(Default::default())",
    getConnection: `sdk.connections().retrieve(${sid}, Default::default())`,
    getConnectionAccount: `sdk.connections().account(${sid}, Default::default())`,
    startPlatformConnection: `sdk.connections().start(${sid}, Default::default())`,
    stopPlatformConnection: `sdk.connections().stop(${sid}, Default::default())`,
    restartConnection: `sdk.connections().restart(${sid}, Default::default())`,
    logoutConnection: `sdk.connections().logout(${sid}, Default::default())`,
    deletePlatformConnection: `sdk.connections().delete(${sid}, Default::default())`,
    getOwnBusinessProfile: `sdk.business().get_profile(${s}, Default::default())`,
    getBusinessMerchantCompliance: `sdk.business().get_merchant_compliance(${s}, Default::default())`,
    getBusinessLinkedAccounts: `sdk.business().get_linked_accounts(${s}, Default::default())`,
    getBusinessEligibility: `sdk.business().get_eligibility(${s}, Default::default())`,
    getBusinessCatalog: `sdk.business().get_catalog(${s}, ${catalog}, Default::default())`,
    getBusinessProduct: `sdk.business().get_product(${s}, ${p("productId")}, ${queryId}, Default::default())`,
    getBusinessCollections: `sdk.business().list_collections(${s}, &${b}::BusinessCollectionsParameters { id: ${queryId}.into(), after: None, collection_limit: None, item_limit: None, width: None, height: None }, Default::default())`,
    getBusinessCollection: `sdk.business().get_collection(${s}, ${p("collectionId")}, ${catalog}, Default::default())`,
    createBusinessCatalog: `sdk.business().create_catalog(${s}, Default::default())`,
    createBusinessCollection: `sdk.business().create_collection(${s}, &${b}::BusinessCollectionCreateRequest { name: ${quote(body?.name)}.into(), product_ids: vec![${body?.productIds?.map((v) => `${quote(v)}.into()`).join(", ")}] }, Default::default())`,
    deleteBusinessCollection: `sdk.business().delete_collection(${s}, ${p("collectionId")}, Default::default())`,
    deleteBusinessProduct: `sdk.business().delete_product(${s}, ${p("productId")}, Default::default())`,
    deleteBusinessCoverPhoto: `sdk.business().delete_cover_photo(${s}, ${p("coverPhotoId")}, Default::default())`,
    setBusinessCartEnabled: `sdk.business().set_cart_enabled(${s}, &${b}::BusinessCartSettingRequest { enabled: ${body?.enabled} }, Default::default())`,
    setBusinessProductVisibility: `sdk.business().set_product_visibility(${s}, ${p("productId")}, &${b}::BusinessProductVisibilityRequest { hidden: ${body?.hidden} }, Default::default())`,
    listProjects: "sdk.projects().list(Default::default())",
    listProjectEvents: `sdk.events().list(&${m}::EventListParameters::default(), Default::default())`,
  };
  if (!calls[id]) return undefined;
  const type =
    client === "messaging"
      ? "MessagingClient"
      : client === "project"
        ? "ProjectClient"
        : "TeamClient";
  const project = client === "project" ? `, ${p("projectId")}` : "";
  return `use polymorfa_sdk::{${type}, ClientOptions, Credential};\n\n#[tokio::main(flavor = "current_thread")]\nasync fn main() -> Result<(), Box<dyn std::error::Error>> {\n    let sdk = ${type}::new(Credential::team_api_key(${key})?${project}, ClientOptions::default())?;\n    let result = ${calls[id]}.await?;\n    println!("{:?}", ${client === "project" ? "result.items" : "result"});\n    Ok(())\n}\n`;
}
