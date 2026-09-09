import {
  assertServerRuntime,
  validateClientCredential,
  type ClientOptions,
  type OrganizationClientOptions,
  type ProjectScopedClientOptions,
} from "./credentials.js";
import { PolymorfaConfigurationError } from "./errors.js";
import {
  ConfinedProjectRawClient,
  RawClient,
  type ProjectScopedRawClient,
} from "./raw.js";
import { HttpTransport } from "./transport/http.js";
import { ApiKeysResource } from "./platform/api-keys.js";
import { AudiencesResource } from "./platform/audiences.js";
import { AuditLogsResource } from "./platform/audit-logs.js";
import { BillingResource } from "./platform/billing.js";
import { BanSafeResource } from "./platform/bansafe.js";
import { CampaignsResource } from "./platform/campaigns.js";
import { CustomersResource } from "./platform/customers.js";
import {
  EventsResource,
  OperationsResourceV2,
  WebhookDeliveriesResource,
  WebhooksResource,
} from "./platform/developer-resources.js";
import type { ClientOwner } from "./platform/developer-types.js";
import { MediaResource } from "./platform/media.js";
import { MembersResource } from "./platform/members.js";
import { OptOutsResource } from "./platform/opt-outs.js";
import { OrganizationsResource } from "./platform/organizations.js";
import { ProjectTokensResource } from "./platform/project-tokens.js";
import { ProjectsResource } from "./platform/projects.js";
import { QuickLinkSettingsResource } from "./platform/quicklink-settings.js";
import { SecurityIncidentsResource } from "./platform/security-incidents.js";
import { SessionBansResource } from "./platform/session-bans.js";
import { PlatformSessionsResource } from "./platform/sessions.js";

export type EventsResourceFor<O extends ClientOwner> = EventsResource<O>;
export type WebhooksResourceFor<O extends ClientOwner> = WebhooksResource<O>;
export type WebhookDeliveriesResourceFor<O extends ClientOwner> =
  WebhookDeliveriesResource<O>;
export type OperationsResourceFor<O extends ClientOwner> =
  OperationsResourceV2<O>;
export type RawResourceFor<O extends ClientOwner> = O extends "project"
  ? ProjectScopedRawClient
  : RawClient;

export interface ClientBase<O extends ClientOwner> {
  readonly owner: O;
  readonly projectId: O extends "project" ? string : null;
  readonly events: EventsResourceFor<O>;
  readonly webhooks: WebhooksResourceFor<O>;
  readonly webhookDeliveries: WebhookDeliveriesResourceFor<O>;
  readonly operations: OperationsResourceFor<O>;
  readonly quickLinkSettings: QuickLinkSettingsResource<O>;
  readonly raw: RawResourceFor<O>;
  project(projectId: string): Client<"project">;
}

export interface OrganizationControlPlaneResources {
  readonly apiKeys: ApiKeysResource;
  readonly audiences: AudiencesResource;
  readonly auditLogs: AuditLogsResource;
  readonly billing: BillingResource;
  readonly banSafe: BanSafeResource;
  readonly campaigns: CampaignsResource;
  readonly customers: CustomersResource;
  readonly members: MembersResource;
  readonly organizations: OrganizationsResource;
  readonly media: MediaResource;
  readonly optOuts: OptOutsResource;
  readonly projects: ProjectsResource;
  readonly projectTokens: ProjectTokensResource;
  readonly securityIncidents: SecurityIncidentsResource;
  readonly sessionBans: SessionBansResource;
  readonly sessions: PlatformSessionsResource;
}

export type Client<O extends ClientOwner = "organization"> = ClientBase<O> &
  (O extends "organization" ? OrganizationControlPlaneResources : object);

export interface ClientConstructor {
  new (options: OrganizationClientOptions): Client<"organization">;
  new (options: ProjectScopedClientOptions): Client<"project">;
}

class ClientImplementation implements ClientBase<ClientOwner> {
  readonly owner: ClientOwner;
  readonly projectId: string | null;
  readonly events: EventsResource<ClientOwner>;
  readonly webhooks: WebhooksResource<ClientOwner>;
  readonly webhookDeliveries: WebhookDeliveriesResource<ClientOwner>;
  readonly operations: OperationsResourceV2<ClientOwner>;
  readonly quickLinkSettings: QuickLinkSettingsResource<ClientOwner>;
  readonly raw: RawClient | ProjectScopedRawClient;
  readonly #transport: HttpTransport;
  readonly #credential: ClientOptions["credential"];

  constructor(options: ClientOptions, transport?: HttpTransport) {
    const credential = validateClientCredential(options.credential);
    assertServerRuntime();
    const projectId =
      options.projectId === undefined
        ? null
        : validateProjectId(options.projectId);
    if (credential.type === "projectToken" && projectId === null) {
      throw new PolymorfaConfigurationError(
        "Project tokens require an explicit projectId.",
        "projectId",
      );
    }
    this.owner = projectId === null ? "organization" : "project";
    this.projectId = projectId;
    this.#credential = credential;
    this.#transport =
      transport ??
      new HttpTransport({
        baseUrl: options.baseUrl ?? "https://api.polymorfa.com",
        authorization: `Bearer ${credential.value}`,
        timeoutMs: options.timeoutMs ?? 30_000,
        maxNetworkRetries: options.maxNetworkRetries ?? 2,
        ...(options.apiVersion === undefined
          ? {}
          : { apiVersion: options.apiVersion }),
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      });
    const prefix =
      projectId === null
        ? "/v1"
        : `/v1/projects/${encodeURIComponent(projectId)}`;
    this.events = new EventsResource(this.#transport, prefix);
    this.webhooks = new WebhooksResource(this.#transport, prefix);
    this.webhookDeliveries = new WebhookDeliveriesResource(
      this.#transport,
      prefix,
    );
    this.operations = new OperationsResourceV2(this.#transport, prefix);
    this.quickLinkSettings = new QuickLinkSettingsResource(
      this.#transport,
      projectId,
    );
    this.raw =
      projectId === null
        ? new RawClient(this.#transport)
        : new ConfinedProjectRawClient(this.#transport, projectId);

    if (this.owner === "organization") {
      Object.assign(this, {
        apiKeys: new ApiKeysResource(this.#transport),
        audiences: new AudiencesResource(this.#transport),
        auditLogs: new AuditLogsResource(this.#transport),
        billing: new BillingResource(this.#transport),
        banSafe: new BanSafeResource(this.#transport),
        campaigns: new CampaignsResource(this.#transport),
        customers: new CustomersResource(this.#transport),
        members: new MembersResource(this.#transport),
        organizations: new OrganizationsResource(this.#transport),
        media: new MediaResource(this.#transport),
        optOuts: new OptOutsResource(this.#transport),
        projects: new ProjectsResource(this.#transport),
        projectTokens: new ProjectTokensResource(this.#transport),
        securityIncidents: new SecurityIncidentsResource(this.#transport),
        sessionBans: new SessionBansResource(this.#transport),
        sessions: new PlatformSessionsResource(this.#transport),
      });
    }
    Object.freeze(this);
  }

  project(projectId: string): Client<"project"> {
    const validated = validateProjectId(projectId);
    if (this.#credential.type === "projectToken") {
      if (this.projectId !== validated) {
        throw new PolymorfaConfigurationError(
          "A project token cannot be rebound to another project.",
          "projectId",
        );
      }
      return this as Client<"project">;
    }
    if (this.owner === "project" && this.projectId === validated) {
      return this as Client<"project">;
    }
    return new ClientImplementation(
      { credential: this.#credential, projectId: validated },
      this.#transport,
    ) as Client<"project">;
  }
}

function validateProjectId(projectId: unknown): string {
  if (typeof projectId !== "string" || projectId.trim().length === 0) {
    throw new PolymorfaConfigurationError(
      "A non-empty projectId is required for project-scoped clients.",
      "projectId",
    );
  }
  return projectId;
}

export const Client = ClientImplementation as unknown as ClientConstructor;
