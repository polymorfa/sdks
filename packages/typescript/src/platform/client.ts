import {
  assertServerRuntime,
  validatePlatformApiKey,
  type PlatformClientOptions,
} from "../credentials.js";
import { RawClient } from "../raw.js";
import { HttpTransport } from "../transport/http.js";
import { AudiencesResource } from "./audiences.js";
import { ApiKeysResource } from "./api-keys.js";
import { AuditLogsResource } from "./audit-logs.js";
import { BillingResource } from "./billing.js";
import { CampaignsResource } from "./campaigns.js";
import { CustomersResource } from "./customers.js";
import { MediaResource } from "./media.js";
import { MembersResource } from "./members.js";
import { OptOutsResource } from "./opt-outs.js";
import { PlatformOperationsResource } from "./operations.js";
import { OrganizationsResource } from "./organizations.js";
import { ProjectTokensResource } from "./project-tokens.js";
import { ProjectsResource } from "./projects.js";
import { SecurityIncidentsResource } from "./security-incidents.js";
import { SessionBansResource } from "./session-bans.js";
import { PlatformSessionsResource } from "./sessions.js";
import { WidgetSettingsResource } from "./widget-settings.js";

export class PlatformClient {
  readonly apiKeys: ApiKeysResource;
  readonly audiences: AudiencesResource;
  readonly auditLogs: AuditLogsResource;
  readonly billing: BillingResource;
  readonly campaigns: CampaignsResource;
  readonly customers: CustomersResource;
  readonly members: MembersResource;
  readonly organizations: OrganizationsResource;
  readonly media: MediaResource;
  readonly optOuts: OptOutsResource;
  readonly operations: PlatformOperationsResource;
  readonly projects: ProjectsResource;
  readonly projectTokens: ProjectTokensResource;
  readonly securityIncidents: SecurityIncidentsResource;
  readonly sessionBans: SessionBansResource;
  readonly sessions: PlatformSessionsResource;
  readonly widgetSettings: WidgetSettingsResource;
  readonly raw: RawClient;

  constructor(options: PlatformClientOptions) {
    const apiKey = validatePlatformApiKey(options.apiKey);
    assertServerRuntime();
    const transport = new HttpTransport({
      baseUrl: options.baseUrl ?? "https://api.polymorfa.com",
      authorization: `Bearer ${apiKey}`,
      timeoutMs: options.timeoutMs ?? 30_000,
      maxNetworkRetries: options.maxNetworkRetries ?? 2,
      ...(options.apiVersion === undefined
        ? {}
        : { apiVersion: options.apiVersion }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
    this.apiKeys = new ApiKeysResource(transport);
    this.audiences = new AudiencesResource(transport);
    this.auditLogs = new AuditLogsResource(transport);
    this.billing = new BillingResource(transport);
    this.campaigns = new CampaignsResource(transport);
    this.customers = new CustomersResource(transport);
    this.members = new MembersResource(transport);
    this.organizations = new OrganizationsResource(transport);
    this.media = new MediaResource(transport);
    this.optOuts = new OptOutsResource(transport);
    this.operations = new PlatformOperationsResource(transport);
    this.projects = new ProjectsResource(transport);
    this.projectTokens = new ProjectTokensResource(transport);
    this.securityIncidents = new SecurityIncidentsResource(transport);
    this.sessionBans = new SessionBansResource(transport);
    this.sessions = new PlatformSessionsResource(transport);
    this.widgetSettings = new WidgetSettingsResource(transport);
    this.raw = new RawClient(transport);
  }
}
