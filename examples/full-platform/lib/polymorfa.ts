import {
  BridgeClient,
  Client,
  MessagingClient,
  SystemClient,
  assertServerRuntime,
  type SharedClientOptions,
} from "@polymorfa/sdk";

import { env } from "./env.js";

// Clients are created lazily so a missing variable fails the request that
// needs it, not the whole build.
let messagingClient: MessagingClient | undefined;
let organizationClient: Client | undefined;
let projectClient: Client<"project"> | undefined;
let bridgeClient: BridgeClient | undefined;

function shared(): SharedClientOptions {
  const baseUrl = env.baseUrl();
  return {
    apiVersion: "2026-03-20",
    ...(baseUrl === undefined ? {} : { baseUrl }),
  };
}

/** Project-scoped Messaging API client (sessions, messages, templates, calls, ...). */
export function messaging(): MessagingClient {
  assertServerRuntime();
  messagingClient ??= new MessagingClient({
    ...shared(),
    credential: { type: "projectToken", value: env.projectToken() },
  });
  return messagingClient;
}

/** Organization management client for the admin area. */
export function organization(): Client {
  assertServerRuntime();
  organizationClient ??= new Client({
    ...shared(),
    credential: {
      type: "organizationApiKey",
      value: env.organizationApiKey(),
    },
  });
  return organizationClient;
}

/** Project view of the management client, bound to the project token's project. */
export function project(): Client<"project"> {
  assertServerRuntime();
  projectClient ??= new Client({
    ...shared(),
    credential: { type: "projectToken", value: env.projectToken() },
    projectId: env.projectId(),
  });
  return projectClient;
}

/** Regional Bridge route discovery. Accepts only a project token. */
export function bridge(): BridgeClient {
  assertServerRuntime();
  bridgeClient ??= new BridgeClient({
    ...shared(),
    credential: { type: "projectToken", value: env.projectToken() },
  });
  return bridgeClient;
}

/** Credential-free status and health routes. */
export function system(): SystemClient {
  return new SystemClient(shared());
}
