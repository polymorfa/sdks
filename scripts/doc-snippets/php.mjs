import { key, literal, p } from "./recipes.mjs";
// Evidence: packages/php/src/Resources/{Messages,Connections,Business,Events}.php,
// src/{Client,ProjectClient,MessagingClient}.php, tests/existing_contract_types.php.
export function render(id, { client, request }) {
  const s = p("connection"),
    sid = p("connectionId");
  const b = request.body ? literal(request.body, "php") : "";
  const q = request.query ? literal(request.query, "php") : "";
  const calls = {
    sendMessage: `$sdk->messages->send(${s}, ${b})`,
    getMessageOperation: `$sdk->messages->operationStatus(${s}, ${p("operationId")})`,
    sendSeen: `$sdk->messages->markSeen(${s}, ${b})`,
    setTyping: `$sdk->messages->setTyping(${s}, ${b})`,
    sendReaction: `$sdk->messages->react(${s}, ${b})`,
    starMessage: `$sdk->messages->star(${s}, ${b})`,
    listPlatformConnections: "$sdk->connections->list()",
    getConnection: `$sdk->connections->retrieve(${sid})`,
    getConnectionAccount: `$sdk->connections->account(${sid})`,
    startPlatformConnection: `$sdk->connections->start(${sid})`,
    stopPlatformConnection: `$sdk->connections->stop(${sid})`,
    restartConnection: `$sdk->connections->restart(${sid})`,
    logoutConnection: `$sdk->connections->logout(${sid})`,
    deletePlatformConnection: `$sdk->connections->delete(${sid})`,
    getOwnBusinessProfile: `$sdk->business->getProfile(${s})`,
    getBusinessMerchantCompliance: `$sdk->business->getMerchantCompliance(${s})`,
    getBusinessLinkedAccounts: `$sdk->business->getLinkedAccounts(${s})`,
    getBusinessEligibility: `$sdk->business->getEligibility(${s})`,
    getBusinessCatalog: `$sdk->business->getCatalog(${s}, ${q})`,
    getBusinessProduct: `$sdk->business->getProduct(${s}, ${p("productId")}, ${q})`,
    getBusinessCollections: `$sdk->business->listCollections(${s}, ${q})`,
    getBusinessCollection: `$sdk->business->getCollection(${s}, ${p("collectionId")}, ${q})`,
    createBusinessCatalog: `$sdk->business->createCatalog(${s})`,
    createBusinessCollection: `$sdk->business->createCollection(${s}, ${b})`,
    deleteBusinessCollection: `$sdk->business->deleteCollection(${s}, ${p("collectionId")})`,
    deleteBusinessProduct: `$sdk->business->deleteProduct(${s}, ${p("productId")})`,
    deleteBusinessCoverPhoto: `$sdk->business->deleteCoverPhoto(${s}, ${p("coverPhotoId")})`,
    setBusinessCartEnabled: `$sdk->business->setCartEnabled(${s}, ${b})`,
    setBusinessProductVisibility: `$sdk->business->setProductVisibility(${s}, ${p("productId")}, ${b})`,
    listProjects: "$sdk->projects->list()",
    listProjectEvents: "$sdk->events->list()",
  };
  if (!calls[id]) return undefined;
  const type = client === "messaging" ? "MessagingClient" : "Client";
  const project = client === "project" ? `->project(${p("projectId")})` : "";
  return `<?php\ndeclare(strict_types=1);\n\nrequire __DIR__ . "/vendor/autoload.php";\n\nuse Polymorfa\\${type};\nuse Polymorfa\\Credential;\n\n$sdk = (new ${type}(Credential::teamApiKey(${key})))${project};\n$result = ${calls[id]};\necho json_encode($result->${client === "project" ? "items" : "data"}, JSON_THROW_ON_ERROR), PHP_EOL;\n`;
}
