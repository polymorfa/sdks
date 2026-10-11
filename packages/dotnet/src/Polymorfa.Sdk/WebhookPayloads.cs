using System.Text.Json;
using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public sealed record TypedWebhookEvent<T>(WebhookEnvelope Envelope, T Payload) : WebhookEvent(Envelope);
public sealed record IdentityReference(string Id, string? PhoneNumber = null, string? Bsuid = null, string? Username = null);
public sealed record EventConversation(string Id, string? PhoneNumber = null, string? Bsuid = null, string? Username = null, IdentityReference? Sender = null);
public sealed record NativeFlowResponse(string Name, string ParamsJson, int? Version = null);
public sealed record ReplyChoice(string Kind, string Id);
public sealed record PollOption(string Name, string Hash);
public sealed record LinkedDeviceMessagePayload(string Id, [property: JsonPropertyName("whatsapp_ids")] WhatsAppMessageIds WhatsAppIds, EventConversation Conversation, bool FromMe, long Timestamp, string PushName, bool IsGroup, string Type, string? Text = null, string? Caption = null, string? MimeType = null, bool? Ptt = null, string? Filename = null, double? Latitude = null, double? Longitude = null, string? DisplayName = null, string? Title = null, string? Reaction = null, string? ReactionTo = null, string? RevokedId = null, string? Media = null, string? MediaUrl = null, bool? Edited = null, IReadOnlyList<PollOption>? PollOptions = null, bool? Unavailable = null, string? UnavailableReason = null, NativeFlowResponse? NativeFlowResponse = null, ReplyChoice? ReplyChoice = null, string? ParentMessageId = null, [property: JsonPropertyName("whatsapp_id")] string? WhatsAppId = null)
{
    [JsonExtensionData] public Dictionary<string, JsonElement>? AdditionalFields { get; init; }
}
public sealed record CloudMessageReferral([property: JsonPropertyName("source_type")] string? SourceType = null, [property: JsonPropertyName("source_id")] string? SourceId = null, [property: JsonPropertyName("source_url")] string? SourceUrl = null, [property: JsonPropertyName("ctwa_clid")] string? ClickId = null)
{
    [JsonExtensionData] public Dictionary<string, JsonElement>? AdditionalFields { get; init; }
}
public sealed record CloudMessagePayload(string Id, [property: JsonPropertyName("whatsapp_ids")] WhatsAppMessageIds WhatsAppIds, EventConversation Conversation, string Timestamp, string Type, string? SenderName = null, NativeFlowResponse? NativeFlowResponse = null, ReplyChoice? ReplyChoice = null, string? ParentMessageId = null, IReadOnlyDictionary<string, JsonElement>? Interactive = null, CloudMessageReferral? Referral = null, [property: JsonPropertyName("whatsapp_id")] string? WhatsAppId = null)
{
    [JsonExtensionData] public Dictionary<string, JsonElement>? AdditionalFields { get; init; }
}
public sealed record MessageSentPayload(string Id, [property: JsonPropertyName("whatsapp_ids")] WhatsAppMessageIds WhatsAppIds, EventConversation Conversation, string Type, long Timestamp, [property: JsonPropertyName("whatsapp_id")] string? WhatsAppId = null);
public sealed record MetaPricingReport(bool? Billable = null, [property: JsonPropertyName("pricing_model")] string? PricingModel = null, string? Category = null, string? Type = null);
public sealed record AcknowledgedMessage(string Id, [property: JsonPropertyName("whatsapp_ids")] WhatsAppMessageIds WhatsAppIds, [property: JsonPropertyName("whatsapp_id")] string? WhatsAppId = null);
public sealed record MessageAckPayload(IReadOnlyList<AcknowledgedMessage> Messages, EventConversation Conversation, string Type, long Timestamp, IdentityReference? From = null, IdentityReference? Sender = null, MetaPricingReport? Pricing = null);
public sealed record MessageDeletePayload(IdentityReference From, IdentityReference Sender, string Id, [property: JsonPropertyName("whatsapp_ids")] WhatsAppMessageIds WhatsAppIds, EventConversation Conversation, bool FromMe, [property: JsonPropertyName("whatsapp_id")] string? WhatsAppId = null);
public sealed record PollVotePayload(EventConversation Conversation, string PollMessageId, IdentityReference Voter, IReadOnlyList<string> SelectedHashes, long Timestamp);
public sealed record RuntimeSessionStatusPayload(string Status, string? StatusReason = null, int? BanCode = null, string? BanReason = null, long? BanExpiresAt = null, string? Detail = null);
public sealed record CloudAccountStatusPayload(string Source, string Kind, IReadOnlyDictionary<string, JsonElement> Value, string? WabaId = null);
public sealed record SessionRestrictionUpdatedPayload(string Type, bool Active, string? EnforcementType, string? ExpiresAt, string ObservedAt);
public sealed record SessionConnectedPayload(string PhoneNumber, string PushName, string PhonePlatform, string AccountType, string? Id = null, string? BusinessName = null);
public sealed record SessionLoggedOutPayload(string Reason, int Code);
public sealed record SessionPhoneOfflinePayload(int DaysSinceLastSeen, int DaysRemaining, string LastSeen, string Action);
public sealed record OfficialGroupError(int Code, string? Title = null);
public sealed record GroupUpdatePayload(string Id, string? NewSubject = null, string? NewDescription = null, string? Action = null, string? RequestId = null, string? InviteLink = null, bool? JoinApprovalRequired = null, bool? PictureChanged = null, IReadOnlyList<string>? FailedChanges = null, IReadOnlyList<OfficialGroupError>? Errors = null);
public sealed record FailedGroupParticipant(IdentityReference Participant, IReadOnlyList<OfficialGroupError>? Errors = null);
public sealed record GroupJoinRequest(string JoinRequestId, IdentityReference User, string State);
public sealed record GroupParticipantPayload(string Id, IReadOnlyList<IdentityReference>? Joined = null, IReadOnlyList<IdentityReference>? Left = null, IReadOnlyList<IdentityReference>? Promoted = null, IReadOnlyList<IdentityReference>? Demoted = null, string? Reason = null, string? InitiatedBy = null, string? RequestId = null, IReadOnlyList<FailedGroupParticipant>? FailedParticipants = null, IReadOnlyList<OfficialGroupError>? Errors = null, GroupJoinRequest? JoinRequest = null);
public sealed record PresenceUpdatePayload(long ObservedAt, IdentityReference? From = null, IdentityReference? Sender = null, string? State = null, string? Media = null, bool? Unavailable = null, long? LastSeen = null);
public sealed record ContactOptPayload(string Phone, string Source, string Keyword, string Session, string? ProjectId = null);
public sealed record ContactUpdatePayload(string Id, string? PhoneNumber = null, string? Bsuid = null, string? FullName = null, string? FirstName = null, string? PushName = null, string? OldPushName = null, string? BusinessName = null, string? OldBusinessName = null, string? PictureId = null, bool? PictureRemoved = null, string? Username = null);
public sealed record ChatArchivePayload(IdentityReference From, bool? Archive = null, bool? Pinned = null);
public sealed record ChatMutePayload(IdentityReference From, bool Muted, long? MuteEndTimestamp = null);
public sealed record ChatReadPayload(IdentityReference From, bool Read);
public sealed record ChatClearPayload(IdentityReference From);
public sealed record ChatDeletePayload(IdentityReference From);
public sealed record WebhookCallCapabilities(bool Video, bool Invite);
public sealed record CallReceivedPayload(IdentityReference From, string CallId, bool HasVideo, string? SessionConnection = null, WebhookCallCapabilities? Capabilities = null);
public sealed record CallMissedPayload(IdentityReference From, string CallId, string Reason);
public sealed record CallAcceptedPayload(IdentityReference From, string CallId, string? AnsweredBy = null, bool? Exclusive = null, string? SessionConnection = null, WebhookCallCapabilities? Capabilities = null);
public sealed record CallRejectedPayload(IdentityReference From, string CallId);
public sealed record CallEndedPayload(IdentityReference? From, string CallId, double DurationSeconds, string Reason, string Direction, bool HadVideo, string? SessionConnection = null);
public sealed record CallTelemetryPayload(string CallId, double SetupMs, double RingMs, double DurationSeconds, string TerminateReason, string Codec, double JitterMs, long PacketsLost, double RttMs, double RecvKbps, double SendKbps);
public sealed record CallParticipantPayload(string CallId, CallParticipant Participant);
public sealed record CallParticipantLeftPayload(string CallId, string ParticipantId, string? Reason = null);
public sealed record CallConnection(string Id, string Participant, string Transport);
public sealed record CallConnectionJoinedPayload(string CallId, CallConnection Connection);
public sealed record CallConnectionLeftPayload(string CallId, string ConnectionId, string Participant, string Reason);
public sealed record NewsletterUpdatePayload(string Id, string Action, bool? Muted = null);
public sealed record BlocklistChange(string Action, string Id, string? PhoneNumber = null, string? Bsuid = null, string? Username = null);
public sealed record BlocklistUpdatePayload(string Action, IReadOnlyList<BlocklistChange> Changes);
public sealed record LabelsUpdatePayload(string Action, string? LabelId = null, IdentityReference? From = null, string? Label = null, string? Name = null, int? Color = null, int? OrderIndex = null, bool? Deleted = null, bool? Labeled = null, long? ObservedAt = null, string? MessageId = null, bool? Starred = null);
public sealed record CloudHistorySyncPayload(string Kind, IReadOnlyDictionary<string, JsonElement> Value);
public sealed record HistorySyncMessage(string Id, [property: JsonPropertyName("whatsapp_ids")] WhatsAppMessageIds WhatsAppIds, IdentityReference Conversation, bool? FromMe = null, [property: JsonPropertyName("whatsapp_id")] string? WhatsAppId = null);
public sealed record WhatsAppHistoryPayload(string Encoding, string Data);
public sealed record LinkedHistorySyncPayload([property: JsonPropertyName("whatsapp_ids")] WhatsAppMessageIds WhatsAppIds, IReadOnlyList<HistorySyncMessage> Messages, string Mode, string SyncType, long FileLength, long ConversationCount, long MessageCount, long PushNameCount, long StatusMessageCount, WhatsAppHistoryPayload Whatsapp, int? ChunkOrder = null, int? Progress = null, [property: JsonPropertyName("original_whatsapp_ids")] WhatsAppMessageIds? OriginalWhatsAppIds = null, [property: JsonPropertyName("whatsapp_id")] string? WhatsAppId = null, [property: JsonPropertyName("original_whatsapp_id")] string? OriginalWhatsAppId = null);
public sealed record ContactsSyncPayload(string Kind, IReadOnlyDictionary<string, JsonElement> Value);
public sealed record MessageEchoPayload(string Source, IReadOnlyDictionary<string, JsonElement> Value);
public sealed record CommandResultPayload(string RequestId, string Command, bool Success, IReadOnlyDictionary<string, JsonElement>? Data = null, string? Error = null);
public sealed record BusinessQuickReplyUpdatePayload(string Id, string Shortcut, string Message, IReadOnlyList<string> Keywords, int Count, bool Deleted, IReadOnlyList<string> AssociatedLabelIds, long ObservedAt, bool FromFullSync);
public record CustomerEventPayload(string EventId, string OccurredAt, string OrganizationId, string ProjectId, string CustomerId, string ActorKind);
public sealed record CustomerUpdatedPayload(string EventId, string OccurredAt, string OrganizationId, string ProjectId, string CustomerId, string ActorKind, IReadOnlyList<string> Fields) : CustomerEventPayload(EventId, OccurredAt, OrganizationId, ProjectId, CustomerId, ActorKind);
public sealed record CustomerEnabledPayload(string EventId, string OccurredAt, string OrganizationId, string ProjectId, string CustomerId, string ActorKind, int MigratedNumberCount) : CustomerEventPayload(EventId, OccurredAt, OrganizationId, ProjectId, CustomerId, ActorKind);
public sealed record CustomerArchivingPayload(string EventId, string OccurredAt, string OrganizationId, string ProjectId, string CustomerId, string ActorKind, int BlockingNumberCount, int RevokedPairingLinkCount) : CustomerEventPayload(EventId, OccurredAt, OrganizationId, ProjectId, CustomerId, ActorKind);
public sealed record CustomerPairingLinkPayload(string EventId, string OccurredAt, string OrganizationId, string ProjectId, string CustomerId, string ActorKind, string PairingLinkId) : CustomerEventPayload(EventId, OccurredAt, OrganizationId, ProjectId, CustomerId, ActorKind);
public sealed record CustomerPairingLinkConnectedPayload(string EventId, string OccurredAt, string OrganizationId, string ProjectId, string CustomerId, string ActorKind, string PairingLinkId, string SessionId) : CustomerEventPayload(EventId, OccurredAt, OrganizationId, ProjectId, CustomerId, ActorKind);
public sealed record CustomerPairingLinkFailedPayload(string EventId, string OccurredAt, string OrganizationId, string ProjectId, string CustomerId, string ActorKind, string PairingLinkId, string ErrorCode) : CustomerEventPayload(EventId, OccurredAt, OrganizationId, ProjectId, CustomerId, ActorKind);
public sealed record CustomerPairingLinkRevokedPayload(string EventId, string OccurredAt, string OrganizationId, string ProjectId, string CustomerId, string ActorKind, string PairingLinkId, string? Reason = null) : CustomerEventPayload(EventId, OccurredAt, OrganizationId, ProjectId, CustomerId, ActorKind);
public sealed record CustomerNumberAttachedPayload(string EventId, string OccurredAt, string OrganizationId, string ProjectId, string CustomerId, string ActorKind, string SessionId, string? PairingLinkId = null) : CustomerEventPayload(EventId, OccurredAt, OrganizationId, ProjectId, CustomerId, ActorKind);
public sealed record CustomerNumberTransferredPayload(string EventId, string OccurredAt, string OrganizationId, string ProjectId, string CustomerId, string ActorKind, string SessionId, string SourceCustomerId) : CustomerEventPayload(EventId, OccurredAt, OrganizationId, ProjectId, CustomerId, ActorKind);
public sealed record CustomerNumberDisconnectedPayload(string EventId, string OccurredAt, string OrganizationId, string ProjectId, string CustomerId, string ActorKind, string SessionId, string Reason) : CustomerEventPayload(EventId, OccurredAt, OrganizationId, ProjectId, CustomerId, ActorKind);
public sealed record BanSafeHealthThresholdPayload(string SessionId, string ProjectId, double Health, double Threshold, string HealthSource, string EstimatorVersion, string? ModelVersion, string EvaluatedAt, long PolicyVersion, string EpisodeId, string ActionId);
public sealed record BanSafeRequiredFinding(string FindingKey, string Title, string Severity);
public sealed record BanSafeActionPayload(string PhoneNumber, string Action, string Scope, string Rung, string? PreviousRung, string Reason, double? Health, string HealthBand, IReadOnlyList<BanSafeRequiredFinding> Requires, double? ThroughputPerMinute, string? EligibleLiftAt, string LiftRequires, string AppealUrl, string StartedAt, string Docs);
public sealed record BanSafeIncidentPayload(string Id, string PhoneNumber, string Kind, string Source, string StartedAt, string? EndsAt, double Belief, string Resolution, string? ClaimId, string? ClosedAt);
public sealed record BanSafeClaimPayload(string Id, string IncidentId, string PhoneNumber, string Status, string Verdict, string WindowStart, string WindowEnd, decimal MeasuredCents, decimal CapCents, decimal AmountCents, string Summary, string Reason, string? DecidedAt, string? PaidAt);
public sealed record CallPermissionChangedPayload(IdentityReference Conversation, string Status, string PreviousStatus, string? ExpiresAt, string Source, string ChangedAt);
public sealed record ReportedPaymentAmount(decimal Value, long Offset);
public sealed record ReportedPaymentTransaction(string? Id = null, string? ProviderTransactionId = null, string? Provider = null, string? Status = null, string? Method = null, string? ErrorCode = null);
public abstract record OrderPaymentUpdatedPayload(string ReportedBy, string ProviderEventId, string ReferenceId, ConversationReference Conversation, string Kind);
public sealed record PaymentStatusUpdatedPayload(string ReportedBy, string ProviderEventId, string ReferenceId, ConversationReference Conversation, string Status, ReportedPaymentAmount? Amount = null, string? Currency = null, ReportedPaymentTransaction? Transaction = null) : OrderPaymentUpdatedPayload(ReportedBy, ProviderEventId, ReferenceId, Conversation, "payment_status");
public sealed record PaymentMethodSelectedPayload(string ReportedBy, string ProviderEventId, string ReferenceId, ConversationReference Conversation, string MessageId, string PaymentMethod, string? LastFourDigits = null, string? CredentialId = null, long? PaymentTimestamp = null) : OrderPaymentUpdatedPayload(ReportedBy, ProviderEventId, ReferenceId, Conversation, "payment_method_selected");
public sealed record MessageFailedPayload(IdentityReference To, string Type, string Error, long Timestamp, string? Code = null, double? RetryAfter = null);
public sealed record RuntimeTemplateStatusPayload(string TemplateName, string TemplateId, string Status, string Category, string Reason, string QualityRating);
public sealed record CloudTemplateStatusPayload(string Kind, string? Event = null, string? TemplateId = null, string? TemplateName = null, string? Language = null, string? Reason = null, string? PreviousQualityScore = null, string? NewQualityScore = null, string? WabaId = null);
public sealed record CampaignLaunchedPayload(string CampaignId, string Name, int RecipientCount, bool Scheduled, long LaunchedAt);
public sealed record CampaignPausedPayload(string CampaignId, long SentCount, long RemainingCount, long PausedAt);
public sealed record CampaignRescheduledPayload(string CampaignId, long? PreviousScheduledAt, long ScheduledAt, long RescheduledAt);
public sealed record CampaignResumedPayload(string CampaignId, long SentCount, long RemainingCount, long ResumedAt);
public sealed record CampaignCompletedPayload(string CampaignId, long SentCount, long DeliveredCount, long ReadCount, long FailedCount, long SkippedCount, long ResponseCount, long CompletedAt, long DurationMs);
public sealed record CampaignFailedPayload(string CampaignId, string Reason, long FailedAt);
public sealed record CampaignStoppedPayload(string CampaignId, long SentCount, long AbandonedCount, long StoppedAt);
public sealed record CampaignRecipientSentPayload(string CampaignId, string RecipientId, string Phone, string SessionKey, string ExternalMessageId, string VariantKey, int Attempt);
public sealed record CampaignRecipientFailedPayload(string CampaignId, string RecipientId, string Phone, int Attempts, string Error, long FailedAt);
public sealed record CampaignRecipientSkippedPayload(string CampaignId, string RecipientId, string Phone, string Reason, long SkippedAt);
public sealed record CampaignThrottledPayload(string CampaignId, string SessionKey, string Reason, long DeferredCount, long At);
public sealed record CampaignCapReachedPayload(string CampaignId, string SessionKey, string Phone, string CapType, long CapLimit, long WindowResetsAt, long At);
public sealed record CampaignColdBlockedPayload(string CampaignId, string RecipientId, string Phone, string Surface, string Reason, long At);
public sealed record VoiceAssetReadyPayload(string EventId, string OccurredAt, string OrganizationId, string ProjectId, string AssetId, string Name, string Source, long DurationMs, string ContentSha256, string OriginalFormat);
public sealed record VoiceAssetFailedPayload(string EventId, string OccurredAt, string OrganizationId, string ProjectId, string AssetId, string Name, string Source, string FailureReason);
public sealed record UsageRateCard(string Id, long Version);
public sealed record UsageRecordedPayload(string Id, string Meter, decimal Quantity, string Unit, IReadOnlyDictionary<string, JsonElement> Dimensions, string KeySource, string SourceKind, string SourceId, string? ProjectId, string? Session, string OccurredAt, string RecordedAt, long Revision, string PricingState, UsageRateCard? RateCard, decimal? PricedCredits);
public sealed record SessionCapabilitiesUpdatedPayload(string Session, string ProjectId, string Status, string? SyncedAt, string? CheckedAt, string? AccountType, IReadOnlyList<SessionCapability> Capabilities, IReadOnlyList<string> ChangedKeys);
