import {
  assertServerRuntime,
  validateMessagingCredential,
  type MessagingClientOptions,
} from "../credentials.js";
import { RawClient } from "../raw.js";
import { HttpTransport } from "../transport/http.js";
import { ChatsResource } from "./chats.js";
import { ClientTokensResource } from "./client-tokens.js";
import { ContactsResource } from "./contacts.js";
import { GroupsResource } from "./groups.js";
import { LabelsResource } from "./labels.js";
import { MessagingMediaResource } from "./media.js";
import { MessagesResource } from "./messages.js";
import { ObservationPoliciesResource } from "./observation-policies.js";
import { OperationsResource } from "./operations.js";
import { ProfileResource } from "./profile.js";
import { PrivacyResource } from "./privacy.js";
import { QuickRepliesResource } from "./quick-replies.js";
import { SessionsResource } from "./sessions.js";
import { TemplatesResource } from "./templates.js";
import { WebhooksResource } from "./webhooks.js";

export class MessagingClient {
  readonly chats: ChatsResource;
  readonly clientTokens: ClientTokensResource;
  readonly contacts: ContactsResource;
  readonly groups: GroupsResource;
  readonly labels: LabelsResource;
  readonly media: MessagingMediaResource;
  readonly observationPolicies: ObservationPoliciesResource;
  readonly sessions: SessionsResource;
  readonly messages: MessagesResource;
  readonly operations: OperationsResource;
  readonly profile: ProfileResource;
  readonly privacy: PrivacyResource;
  readonly quickReplies: QuickRepliesResource;
  readonly templates: TemplatesResource;
  readonly webhooks: WebhooksResource;
  readonly raw: RawClient;

  constructor(options: MessagingClientOptions) {
    const credential = validateMessagingCredential(options.credential);
    if (credential.type === "apiKey") assertServerRuntime();
    const transport = new HttpTransport({
      baseUrl: options.baseUrl ?? "https://api.polymorfa.com",
      authorization: `Bearer ${credential.value}`,
      timeoutMs: options.timeoutMs ?? 30_000,
      maxNetworkRetries: options.maxNetworkRetries ?? 2,
      ...(options.apiVersion === undefined
        ? {}
        : { apiVersion: options.apiVersion }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    });
    this.chats = new ChatsResource(transport);
    this.clientTokens = new ClientTokensResource(transport);
    this.contacts = new ContactsResource(transport);
    this.groups = new GroupsResource(transport);
    this.labels = new LabelsResource(transport);
    this.media = new MessagingMediaResource(transport);
    this.observationPolicies = new ObservationPoliciesResource(transport);
    this.sessions = new SessionsResource(transport);
    this.messages = new MessagesResource(transport);
    this.operations = new OperationsResource(transport);
    this.profile = new ProfileResource(transport);
    this.privacy = new PrivacyResource(transport);
    this.quickReplies = new QuickRepliesResource(transport);
    this.templates = new TemplatesResource(transport);
    this.webhooks = new WebhooksResource(transport);
    this.raw = new RawClient(transport);
  }
}
