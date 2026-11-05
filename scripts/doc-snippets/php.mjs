import { key, literal, p } from "./recipes.mjs";
// Evidence: packages/php/src/Resources/{Messages,Sessions,Business,Events}.php,
// src/{Client,ProjectClient,MessagingClient}.php, tests/existing_contract_types.php.
export function render(id, { client, request }) {
  const s = p("session"),
    sid = p("sessionId");
  const b = request.body ? literal(request.body, "php") : "";
  const q = request.query ? literal(request.query, "php") : "";
  const calls = {
    sendMessage: `$sdk->messages->send(${s}, ${b})`,
    getMessageOperation: `$sdk->messages->operationStatus(${s}, ${p("operationId")})`,
    sendSeen: `$sdk->messages->markSeen(${s}, ${b})`,
    setTyping: `$sdk->messages->setTyping(${s}, ${b})`,
    sendReaction: `$sdk->messages->react(${s}, ${b})`,
    starMessage: `$sdk->messages->star(${s}, ${b})`,
    listPlatformSessions: "$sdk->sessions->list()",
    getSession: `$sdk->sessions->retrieve(${sid})`,
    getSessionAccount: `$sdk->sessions->account(${sid})`,
    startPlatformSession: `$sdk->sessions->start(${sid})`,
    stopPlatformSession: `$sdk->sessions->stop(${sid})`,
    restartSession: `$sdk->sessions->restart(${sid})`,
    logoutSession: `$sdk->sessions->logout(${sid})`,
    deletePlatformSession: `$sdk->sessions->delete(${sid})`,
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
  return `<?php\ndeclare(strict_types=1);\n\nrequire __DIR__ . "/vendor/autoload.php";\n\nuse Polymorfa\\${type};\nuse Polymorfa\\Credential;\n\n$sdk = (new ${type}(Credential::organizationApiKey(${key})))${project};\n$result = ${calls[id]};\necho json_encode($result->${client === "project" ? "items" : "data"}, JSON_THROW_ON_ERROR), PHP_EOL;\n`;
}
