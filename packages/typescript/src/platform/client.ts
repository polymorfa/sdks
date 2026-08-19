import {
  assertServerRuntime,
  validatePlatformApiKey,
  type PlatformClientOptions,
} from "../credentials.js";
import { RawClient } from "../raw.js";
import { HttpTransport } from "../transport/http.js";
import { AudiencesResource } from "./audiences.js";
import { MediaResource } from "./media.js";
import { OptOutsResource } from "./opt-outs.js";
import { OrganizationsResource } from "./organizations.js";
import { ProjectsResource } from "./projects.js";
import { PlatformSessionsResource } from "./sessions.js";

export class PlatformClient {
  readonly audiences: AudiencesResource;
  readonly organizations: OrganizationsResource;
  readonly media: MediaResource;
  readonly optOuts: OptOutsResource;
  readonly projects: ProjectsResource;
  readonly sessions: PlatformSessionsResource;
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
    this.audiences = new AudiencesResource(transport);
    this.organizations = new OrganizationsResource(transport);
    this.media = new MediaResource(transport);
    this.optOuts = new OptOutsResource(transport);
    this.projects = new ProjectsResource(transport);
    this.sessions = new PlatformSessionsResource(transport);
    this.raw = new RawClient(transport);
  }
}
