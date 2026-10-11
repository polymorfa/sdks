namespace Polymorfa.Sdk;

public record CallOutcomeMetrics
{
    public long Total { get; init; }
    public long Answered { get; init; }
    public long Missed { get; init; }
    public long Declined { get; init; }
    public long Failed { get; init; }
    public long Ringing { get; init; }
    public decimal? AnswerRate { get; init; }
    public decimal TalkSeconds { get; init; }
    public long TimedAnswered { get; init; }
    public long TimedPickup { get; init; }
    public decimal? AverageTalkSeconds { get; init; }
    public decimal? MedianTalkSeconds { get; init; }
    public decimal? P95TalkSeconds { get; init; }
    public decimal? AveragePickupMs { get; init; }
    public decimal? P95PickupMs { get; init; }
    public long ShortAnswered { get; init; }
    public long Video { get; init; }
}
public sealed record CallDirections(CallOutcomeMetrics Inbound, CallOutcomeMetrics Outbound);
public sealed record CallMediaQuality(long MeasuredCalls, decimal? AverageJitterMs, decimal? AverageRttMs, long? PacketsLost);
public sealed record CallAppQuality(long MeasuredCalls, decimal? AverageJitterMs, decimal? AverageRttMs, decimal? PacketLossRate, long? Reconnects);
public sealed record CallCountByCode(string Code, long Count);
public sealed record CallFollowUp(long EligibleMissed, long ReturnedWithin24h, decimal? Rate, decimal? AverageDelayMs, long PendingWindow, long UnknownContact);
public sealed record CallBusinessMetrics : CallOutcomeMetrics
{
    public CallDirections Directions { get; init; } = null!;
    public CallMediaQuality MediaQuality { get; init; } = null!;
    public CallAppQuality AppQuality { get; init; } = null!;
    public IReadOnlyList<CallCountByCode> EndReasons { get; init; } = [];
    public IReadOnlyList<CallCountByCode> AppErrors { get; init; } = [];
    public IReadOnlyList<CallCountByCode> Transports { get; init; } = [];
    public long MultiParticipantCalls { get; init; }
    public CallFollowUp FollowUp { get; init; } = null!;
}
public sealed record WhatsAppBusinessSegment(string Dimension, string Key, long SendAttempts, long Sent, long SendFailures, decimal? SendFailureRate, long CompletedConversations, long DeliveredConversations, long ReadConversations, long RepliedConversations, decimal? DeliveryRate, decimal? ReadRate, decimal? ReplyRate, decimal? AverageCustomerReplyMs, IReadOnlyList<decimal>? ReadRateInterval95, IReadOnlyList<decimal>? ReplyRateInterval95, decimal? ReadRateDifference, decimal? ReplyRateDifference, decimal? ShareOfConversations, decimal? ShareOfSends);
public sealed record WhatsAppEngagement(int WindowHours, long CompletedConversations, long DeliveredConversations, long ReadConversations, long RepliedConversations, decimal? DeliveryRate, decimal? ReadRate, decimal? ReplyRate, decimal? AverageCustomerReplyMs, bool Complete, long DroppedConversations, long DroppedRecords, long DroppedReceiptJoins);
public sealed record WhatsAppPlatformCount(string Platform, long Messages, decimal? Share);
public sealed record WhatsAppDeviceInventoryEntry(int DeviceIndex, string EstimatedPlatform, string ReportedClass, long? LastActiveAt, bool? Listed);
public sealed record WhatsAppDeviceInventory(bool ListObserved, bool ListCurrent, long? ObservedAt, int? DeviceCount, bool Truncated, IReadOnlyList<WhatsAppDeviceInventoryEntry> Devices);
public sealed record WhatsAppDeviceAnalytics(string Detector, bool Measured, bool Complete, long ObservedBuckets, long? CustomerMessages, long? AccountMessages, IReadOnlyList<WhatsAppPlatformCount> CustomerPlatforms, IReadOnlyList<WhatsAppPlatformCount> AccountPlatforms, WhatsAppDeviceInventory? Inventory);
public sealed record WhatsAppRecipientActivityRow(long Ts, string RecipientCountry, string RecipientDeviceCount, string DeviceSource, long IncomingMessages, long DeliveryReceipts, long ReadReceipts, long OnlineSignals, long OfflineSignals, long TypingSignals, long LastSignalAt, long QuietGaps, long QuietGapMs, decimal? AverageQuietGapMs);
public sealed record WhatsAppRecipientActivity(bool Measured, bool Complete, long ObservedBuckets, long DroppedSignals, bool Truncated, IReadOnlyList<WhatsAppRecipientActivityRow> Rows);
public sealed record WhatsAppConversationGroup(long Ts, string MessageType, string TextBand, string Origin, string CallingCode, string CustomerDevices, long CompletedConversations, long DeliveredConversations, long ReadConversations, long RepliedConversations, decimal ReplyLatencySumMs, decimal? ReadRate, decimal? ReplyRate, decimal? AverageCustomerReplyMs, string? RecipientCountry = null, string? RecipientDeviceCount = null);
public sealed record WhatsAppConversationBucket(long Ts, bool Complete);
public sealed record WhatsAppConversationBreakdown(bool Measured, bool Complete, long ObservedBuckets, long DroppedConversations, bool Truncated, IReadOnlyList<WhatsAppConversationBucket> Buckets, IReadOnlyList<WhatsAppConversationGroup> Rows);
public sealed record WhatsAppMessageAnalysis(bool Complete, IReadOnlyList<WhatsAppBusinessSegment> Segments);
public sealed record WhatsAppCustomerActivity(bool Observed, long OnlineSignals, long OfflineSignals, long TypingSignals);
public sealed record WhatsAppAccountActivity(bool Observed, long PrimaryPhoneActivitySignals, long PrimaryPhoneActivePeriods, long CompletedPhoneActivityPeriods, long PhoneActivityMs, decimal? AveragePhoneActivityMs, long PhoneQuietGaps, long PhoneQuietMs, decimal? AveragePhoneQuietMs, long PrimaryPhoneMessages, long OtherDeviceMessages, long PrimaryPhoneReplies, long OtherDeviceReplies, decimal? AveragePrimaryPhoneResponseMs, decimal? AverageOtherDeviceResponseMs, long? LastPrimaryPhoneAt);
public sealed record WhatsAppResponseQueue(long AwaitingReply, long OldestWaitingMs, long ObservedAt, bool Complete);
public record WhatsAppMetrics
{
    public WhatsAppRecipientActivity? RecipientActivity { get; init; }
    public WhatsAppDeviceAnalytics DeviceAnalytics { get; init; } = null!;
    public WhatsAppConversationBreakdown ConversationBreakdown { get; init; } = null!;
    public CallBusinessMetrics Calls { get; init; } = null!;
    public bool Measured { get; init; }
    public long ObservedHours { get; init; }
    public long? LastObservedAt { get; init; }
    public long OutgoingMessages { get; init; }
    public long IncomingMessages { get; init; }
    public long SendAttempts { get; init; }
    public long SendFailures { get; init; }
    public decimal? SendFailureRate { get; init; }
    public long BusinessReplies { get; init; }
    public decimal? AverageBusinessResponseMs { get; init; }
    public long OnlineMs { get; init; }
    public long Disconnects { get; init; }
    public long ConnectFailures { get; init; }
    public long StreamErrors { get; init; }
    public long KeepaliveTimeouts { get; init; }
    public WhatsAppEngagement Engagement { get; init; } = null!;
    public WhatsAppMessageAnalysis MessageAnalysis { get; init; } = null!;
    public WhatsAppCustomerActivity CustomerActivity { get; init; } = null!;
    public WhatsAppAccountActivity AccountActivity { get; init; } = null!;
    public WhatsAppResponseQueue? ResponseQueue { get; init; }
}
public sealed record WhatsAppAnalyticsSummary : WhatsAppMetrics { public long TotalNumbers { get; init; } public long MeasuredNumbers { get; init; } public long ConnectedNumbers { get; init; } }
public sealed record WhatsAppAnalyticsNumber : WhatsAppMetrics { public string SessionId { get; init; } = ""; public string ProjectId { get; init; } = ""; public string ProjectName { get; init; } = ""; public string Name { get; init; } = ""; public string Backend { get; init; } = ""; public string Status { get; init; } = ""; }
public sealed record WhatsAppAnalyticsCallSeries : CallOutcomeMetrics { public string SessionId { get; init; } = ""; public long Ts { get; init; } }
public sealed record WhatsAppAnalyticsSeries(long CustomerOnlineSignals, long CustomerTypingSignals, long PrimaryPhoneMessages, long OtherDeviceMessages, long PrimaryPhoneReplies, long PhoneActivePeriods, long CompletedPhoneActivityPeriods, long PhoneActivityMs, long PhoneQuietGaps, long PhoneQuietMs, string SessionId, long Ts, long OutgoingMessages, long IncomingMessages, long SendFailures, long BusinessReplies, decimal? AverageBusinessResponseMs, long OnlineMs, long Disconnects);
public sealed record AnalyticsPeriod(long Start, long End);
public sealed record AnalyticsRequestVitals(long Requests, long Failures, decimal? ErrorRate);
public sealed record WhatsAppAnalytics(IReadOnlyList<WhatsAppAnalyticsCallSeries> CallSeries, bool Enabled, AnalyticsPeriod Period, AnalyticsRequestVitals RequestVitals, WhatsAppAnalyticsSummary? Summary, IReadOnlyList<WhatsAppAnalyticsNumber> Numbers, IReadOnlyList<WhatsAppAnalyticsSeries> Series);
public sealed record AnalyticsParameters(string? ProjectId = null, string? SessionId = null, long? Start = null, long? End = null);
public sealed record AnalyticsMetricsParameters(string? ProjectId = null, string? SessionId = null, int? WindowHours = null, bool? Segments = null, string? Format = null);
public sealed class Analytics : Resource
{
    private readonly string? projectId;
    private string Path => projectId is null ? "/platform/analytics" : "/platform/projects/" + E(projectId) + "/analytics";
    internal Analytics(HttpTransport http, string? projectId) : base(http) => this.projectId = projectId;
    private void Validate(string? project, string? session)
    {
        foreach (var id in new[] { project, session }) if (id is not null && !Guid.TryParseExact(id, "D", out _)) throw new PolymorfaValidationException("Analytics filters require UUIDs.", "invalid_analytics_filter");
        if (projectId is not null && project is not null && !projectId.Equals(project, StringComparison.OrdinalIgnoreCase)) throw new PolymorfaValidationException("Analytics cannot read outside the client's project.", "invalid_analytics_filter");
    }
    public async Task<ApiResponse<WhatsAppAnalytics>> GetAsync(AnalyticsParameters? parameters = null, RequestOptions? options = null)
    {
        parameters ??= new(); Validate(parameters.ProjectId, parameters.SessionId);
        if (parameters.Start is < 0 or > 9007199254740991 || parameters.End is < 0 or > 9007199254740991 || parameters.Start is { } start && parameters.End is { } end && (end < start || end - start > 366L * 86400000)) throw new PolymorfaValidationException("Choose an ordered analytics range of up to 366 days.", "invalid_analytics_range");
        var r = await Get<DataEnvelope<WhatsAppAnalytics>>(Path, options, parameters with { ProjectId = projectId is null ? parameters.ProjectId : null }).ConfigureAwait(false); return new(r.Data.Data, r.Metadata);
    }
    public async Task<ApiResponse<string>> MetricsAsync(AnalyticsMetricsParameters? parameters = null, RequestOptions? options = null)
    {
        parameters ??= new(); Validate(parameters.ProjectId, parameters.SessionId); if (parameters.WindowHours is < 1 or > 168) throw new PolymorfaValidationException("windowHours must be from 1 to 168.", "invalid_analytics_range"); var format = parameters.Format ?? "prometheus"; if (format is not ("prometheus" or "openmetrics")) throw new PolymorfaValidationException("Invalid metrics format.", "invalid_analytics_filter");
        var accept = format == "openmetrics" ? "application/openmetrics-text" : "text/plain";
        var r = await Http.RequestTextAsync(Path + "/metrics", accept, options, Query(parameters with { ProjectId = projectId is null ? parameters.ProjectId : null, Format = format })).ConfigureAwait(false);
        if (r.Metadata.Headers.GetValueOrDefault("content-type")?.Split(';')[0].Trim().ToLowerInvariant() != accept || !System.Text.RegularExpressions.Regex.IsMatch(r.Data, "^# TYPE polymorfa_analytics_enabled gauge$", System.Text.RegularExpressions.RegexOptions.Multiline) || format == "openmetrics" && !r.Data.EndsWith("# EOF\n", StringComparison.Ordinal)) throw new PolymorfaServerException("Invalid analytics metrics response.", "invalid_response", r.Metadata); return r;
    }
}
