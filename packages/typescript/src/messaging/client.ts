import { CloudOnboardingResource, TestingResource } from "./onboarding.js";
import {
  assertServerRuntime,
  validateMessagingCredential,
  type MessagingClientOptions,
} from "../credentials.js";
import { RawClient } from "../raw.js";
import { HttpTransport } from "../transport/http.js";
import { ChatsResource } from "./chats.js";
import { MessagingBanSafeResource } from "./bansafe.js";
import { BusinessResource } from "./business.js";
import { CallsResource } from "./calls.js";
import { MessagingCampaignsResource } from "./campaigns.js";
import { ChannelsResource } from "./channels.js";
import { ClientTokensResource } from "./client-tokens.js";
import { ContactsResource } from "./contacts.js";
import { GroupsResource } from "./groups.js";
import { LabelsResource } from "./labels.js";
import { IdentitiesResource } from "./identities.js";
import { MessagingMediaResource } from "./media.js";
import { MessagesResource } from "./messages.js";
import { ObservationPoliciesResource } from "./observation-policies.js";
import { ProfileResource } from "./profile.js";
import { PrivacyResource } from "./privacy.js";
import { PresenceResource } from "./presence.js";
import { QuickRepliesResource } from "./quick-replies.js";
import { QuickLinksResource } from "./quicklinks.js";
import { SessionsResource } from "./sessions.js";
import { TemplatesResource } from "./templates.js";
import { UsersResource } from "./users.js";
import { VoipResource } from "./voip.js";
import { WebhooksResource } from "./webhooks.js";

export class MessagingClient {
  readonly banSafe: MessagingBanSafeResource;
  readonly business: BusinessResource;
  readonly calls: CallsResource;
  readonly campaigns: MessagingCampaignsResource;
  readonly chats: ChatsResource;
  readonly channels: ChannelsResource;
  readonly clientTokens: ClientTokensResource;
  readonly contacts: ContactsResource;
  readonly groups: GroupsResource;
  readonly labels: LabelsResource;
  readonly identities: IdentitiesResource;
  readonly media: MessagingMediaResource;
  readonly observationPolicies: ObservationPoliciesResource;
  readonly sessions: SessionsResource;
  readonly messages: MessagesResource;
  readonly profile: ProfileResource;
  readonly privacy: PrivacyResource;
  readonly presence: PresenceResource;
  readonly quickReplies: QuickRepliesResource;
  readonly cloudOnboarding: CloudOnboardingResource;
  readonly testing: TestingResource;
  readonly quickLinks: QuickLinksResource;
  readonly templates: TemplatesResource;
  readonly users: UsersResource;
  readonly voip: VoipResource;
  readonly webhooks: WebhooksResource;
  readonly raw: RawClient;

  constructor(options: MessagingClientOptions) {
    const credential = validateMessagingCredential(options.credential);
    if (credential.type !== "clientToken") assertServerRuntime();
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
    this.banSafe = new MessagingBanSafeResource(transport, credential.type);
    this.business = new BusinessResource(transport);
    this.calls = new CallsResource(transport);
    this.campaigns = new MessagingCampaignsResource(transport);
    this.chats = new ChatsResource(transport);
    this.channels = new ChannelsResource(transport);
    this.clientTokens = new ClientTokensResource(transport, credential.type);
    this.contacts = new ContactsResource(transport);
    this.groups = new GroupsResource(transport);
    this.labels = new LabelsResource(transport);
    this.identities = new IdentitiesResource(transport);
    this.media = new MessagingMediaResource(transport);
    this.observationPolicies = new ObservationPoliciesResource(transport);
    this.sessions = new SessionsResource(transport, credential.type);
    this.messages = new MessagesResource(transport);
    this.profile = new ProfileResource(transport);
    this.privacy = new PrivacyResource(transport);
    this.presence = new PresenceResource(transport);
    this.quickReplies = new QuickRepliesResource(transport);
    this.cloudOnboarding = new CloudOnboardingResource(
      transport,
      credential.type,
    );
    this.testing = new TestingResource(transport, credential.type);
    this.quickLinks = new QuickLinksResource(transport, credential.type);
    this.templates = new TemplatesResource(transport);
    this.users = new UsersResource(transport);
    this.voip = new VoipResource(transport, credential.type);
    this.webhooks = new WebhooksResource(transport);
    this.raw = new RawClient(transport);
  }
}
