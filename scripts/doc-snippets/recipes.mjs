// Requests come from the pinned OpenAPI and existing native wire fixtures.
// Calls are handwritten in the language modules. Never derive arguments from
// contracts/coverage.json's display-only method names.
export const sourceCommit = "f0f14eae81388deab96d62439f8505156b33b860";
export const apiVersion = "2026-09-22";
export const languages = [
  "typescript",
  "go",
  "python",
  "php",
  "dotnet",
  "rust",
];
export const packages = {
  typescript: { name: "@polymorfa/sdk", version: "0.1.0-dev.0" },
  go: { name: "github.com/polymorfa/sdks/packages/go", version: "0.1.0-dev.0" },
  python: { name: "polymorfa-sdk", version: "0.1.0.dev0" },
  php: { name: "polymorfa/sdk", version: "0.1.0-dev.0" },
  dotnet: { name: "Polymorfa.Sdk", version: "0.1.0-dev.0" },
  rust: { name: "polymorfa-sdk", version: "0.1.0-dev.0" },
};
const conversation = { id: "42" };
const recipient = { phoneNumber: "+15550001111" };
const messaging = (request = {}) => ({ client: "messaging", request });
export const recipes = {
  sendMessage: messaging({
    body: { conversation: recipient, content: { text: "Hello" } },
  }),
  getMessageOperation: messaging(),
  sendSeen: messaging({ body: { conversation, id: "43" } }),
  setTyping: messaging({ body: { conversation, state: "paused" } }),
  sendReaction: messaging({ body: { conversation, id: "43", reaction: "👍" } }),
  starMessage: messaging({ body: { conversation, id: "43", star: false } }),
  listPlatformSessions: messaging(),
  getSession: messaging(),
  getSessionAccount: messaging(),
  startPlatformSession: messaging(),
  stopPlatformSession: messaging(),
  restartSession: messaging(),
  logoutSession: messaging(),
  deletePlatformSession: messaging(),
  getOwnBusinessProfile: messaging(),
  getBusinessMerchantCompliance: messaging(),
  getBusinessLinkedAccounts: messaging(),
  getBusinessEligibility: messaging(),
  getBusinessCatalog: messaging({ query: { id: "42" } }),
  getBusinessProduct: messaging({ query: { id: "42" } }),
  getBusinessCollections: messaging({ query: { id: "42" } }),
  getBusinessCollection: messaging({ query: { id: "42" } }),
  createBusinessCatalog: messaging(),
  createBusinessCollection: messaging({
    body: { name: "Featured", productIds: ["product-id"] },
  }),
  deleteBusinessCollection: messaging(),
  deleteBusinessProduct: messaging(),
  deleteBusinessCoverPhoto: messaging(),
  setBusinessCartEnabled: messaging({ body: { enabled: true } }),
  setBusinessProductVisibility: messaging({ body: { hidden: true } }),
  listProjects: { client: "organization", request: {} },
  listProjectEvents: { client: "project", request: {} },
};
export const p = (name) => JSON.stringify(`{{${name}}}`);
export const key = p("POLYMORFA_API_KEY");
export function literal(value, language) {
  if (typeof value === "string") return JSON.stringify(value);
  if (value === null) return language === "python" ? "None" : "null";
  if (typeof value === "boolean")
    return language === "python" ? (value ? "True" : "False") : String(value);
  if (Array.isArray(value))
    return `[${value.map((v) => literal(v, language)).join(", ")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value).map(
      ([k, v]) =>
        `${JSON.stringify(k)}${language === "php" ? " => " : ": "}${literal(v, language)}`,
    );
    return language === "php"
      ? `[${entries.join(", ")}]`
      : `{${entries.join(", ")}}`;
  }
  return String(value);
}
