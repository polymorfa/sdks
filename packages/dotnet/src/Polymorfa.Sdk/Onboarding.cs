namespace Polymorfa.Sdk;

public sealed record EmbeddedSignupResult(string Code, string WabaId, string PhoneNumberId, bool? Coexistence = null, bool? HistorySync = null) { public override string ToString() => "EmbeddedSignupResult(code=redacted)"; }
public sealed record EmbeddedSignupRequest(string QuicklinkId, string? ProjectId = null, EmbeddedSignupResult? Result = null);
public sealed record EmbeddedSignupStage(string Stage);
public sealed class CloudOnboarding : Resource
{
    internal CloudOnboarding(HttpTransport http) : base(http) { }
    public Task<ApiResponse<SuccessEnvelope<EmbeddedSignupStage>>> AdvanceAsync(EmbeddedSignupRequest input, RequestOptions? options = null) { Http.Credential.RequireServer(); return Post<SuccessEnvelope<EmbeddedSignupStage>>("/messaging/cloud-api/embedded-signup", input, options); }
}
public sealed record TestingHistoryMessage(string Id, string SenderPhone, string Text, long Timestamp, bool FromMe);
public sealed record CreateTestingHistoryFixtureRequest(IReadOnlyList<TestingHistoryMessage> Messages);
public sealed record TestingHistoryFixtureCreated(string FixtureId);
public sealed record TestEventOverrides(string? Text = null, string? From = null, string? PushName = null, string? MediaType = null, string? Caption = null, string? AckStatus = null, string? MessageId = null, string? FailureReason = null, bool? Video = null, decimal? DurationSeconds = null, string? CallEndReason = null, bool? RestrictionActive = null, string? Status = null, string? StatusReason = null, string? TemplateName = null, string? TemplateStatus = null, string? Reason = null);
public sealed record TriggerTestEventRequest(string Event, TestEventOverrides? Overrides = null, string? FromConnection = null);
public sealed record TriggerTestEventResponse(string Event, string Connection, string Delivery, string? EventId, string Source);
public sealed record TestEventFixtureInfo(string Name, string Description, IReadOnlyList<string> Overrides);
public sealed record TestEventFixtures(IReadOnlyList<TestEventFixtureInfo> Fixtures);
public sealed record TestingPhoneDevice(int DeviceId);
public sealed record TestingPhone(string Connection, string Phone, bool Online, IReadOnlyList<TestingPhoneDevice> Devices);
public sealed record SendTestingPhoneMessageRequest(string To, string Text);
public sealed record SendTestingPhoneMessageResponse(string Connection, string To, string? MessageId);
public sealed record UnlinkTestingPhoneDeviceResponse(string Connection, int DeviceId, bool Unlinked);
public sealed class Testing : Resource
{
    internal Testing(HttpTransport http) : base(http) { }
    private static string Path(string projectId) => "/messaging/projects/" + E(projectId);
    private static string PhonePath(string connection) => "/messaging/" + E(connection) + "/phone";
    private Task<ApiResponse<T>> Request<T>(HttpMethod method, string path, object? body, RequestOptions? options) { Http.Credential.RequireServer(); return Http.RequestAsync<T>(method, path, body, options); }
    public Task<ApiResponse<TestingHistoryFixtureCreated>> CreateHistoryFixtureAsync(string projectId, CreateTestingHistoryFixtureRequest input, RequestOptions? options = null) => Request<TestingHistoryFixtureCreated>(HttpMethod.Post, Path(projectId) + "/test-history-fixtures", input, options);
    public Task<ApiResponse<TriggerTestEventResponse>> TriggerEventAsync(string connection, TriggerTestEventRequest input, RequestOptions? options = null) => Request<TriggerTestEventResponse>(HttpMethod.Post, "/messaging/" + E(connection) + "/test-events", input, options);
    public Task<ApiResponse<TestEventFixtures>> ListEventFixturesAsync(RequestOptions? options = null) => Request<TestEventFixtures>(HttpMethod.Get, "/messaging/test-events/fixtures", null, options);
    public Task<ApiResponse<TestingPhone>> GetPhoneAsync(string connection, RequestOptions? options = null) { Http.Credential.RequireServer(); return ExistingContractCodec.Request<TestingPhone>(Http, HttpMethod.Get, PhonePath(connection), options: options); }
    public Task<ApiResponse<SendTestingPhoneMessageResponse>> SendPhoneMessageAsync(string connection, SendTestingPhoneMessageRequest input, RequestOptions? options = null) { Http.Credential.RequireServer(); return ExistingContractCodec.Request<SendTestingPhoneMessageResponse>(Http, HttpMethod.Post, PhonePath(connection) + "/messages", ExistingContractCodec.Capture(input), options, status: 202); }
    public Task<ApiResponse<UnlinkTestingPhoneDeviceResponse>> UnlinkPhoneDeviceAsync(string connection, int deviceId, RequestOptions? options = null) { if (deviceId is < 1 or > 99) throw new PolymorfaValidationException("deviceId must be a companion ID from 1 to 99.", "invalid_parameter"); Http.Credential.RequireServer(); return ExistingContractCodec.Request<UnlinkTestingPhoneDeviceResponse>(Http, HttpMethod.Post, PhonePath(connection) + "/devices/" + deviceId + "/unlink", options: options); }
}
public sealed record ProjectObservationPolicy(string ProjectId, string PresenceMode, string TypingMode, string LabelMode, string? QuickReplyMode = null);
public sealed record ConnectionObservationPolicyValues(string PresenceMode, string TypingMode, string LabelMode, string? QuickReplyMode = null);
public sealed record ConnectionObservationPolicy(string ConnectionName, string ProjectId, ConnectionObservationPolicyValues Project, ConnectionObservationPolicyValues Override, ConnectionObservationPolicyValues Effective);
public sealed class ObservationPolicies : Resource
{
    internal ObservationPolicies(HttpTransport http) : base(http) { }
    public Task<ApiResponse<SuccessEnvelope<ProjectObservationPolicy>>> RetrieveForProjectAsync(string projectId, RequestOptions? options = null) => Get<SuccessEnvelope<ProjectObservationPolicy>>("/messaging/projects/" + E(projectId) + "/observation-policy", options);
    public Task<ApiResponse<SuccessEnvelope<ConnectionObservationPolicy>>> RetrieveForConnectionAsync(string connection, RequestOptions? options = null) => Get<SuccessEnvelope<ConnectionObservationPolicy>>("/messaging/" + E(connection) + "/observation-policy", options);
}
public sealed record HybridRoutingPolicyScope(string Scope, string? ProjectId = null, string? Connection = null)
{
    public static HybridRoutingPolicyScope Team() => new("team");
    public static HybridRoutingPolicyScope Project(string projectId) => new("project", projectId);
    public static HybridRoutingPolicyScope ForConnection(string projectId, string connection) => new("connection", projectId, connection);
}
public sealed record HybridRoutingPolicy(string Scope, string Revision, string? Prefer, IReadOnlyList<string> AllowedTransports);
public sealed record SetHybridRoutingPolicyRequest(string ExpectedRevision, [property: System.Text.Json.Serialization.JsonIgnore(Condition = System.Text.Json.Serialization.JsonIgnoreCondition.Never)] string? Prefer, IReadOnlyList<string> AllowedTransports);
public sealed record HybridLinkState(string Revision, bool Paused, IReadOnlyList<ConnectionStatus> Connections);
public sealed record SetHybridLinkPausedRequest(string ExpectedRevision, bool Paused);
public sealed record HybridLinkPaused(string Revision, bool Paused);
public sealed class HybridLink : Resource
{
    internal HybridLink(HttpTransport http) : base(http) { }
    private Task<ApiResponse<SuccessEnvelope<T>>> Request<T>(HttpMethod method, string path, object? body, object? query, RequestOptions? options) { Http.Credential.RequireServer(); return Http.RequestAsync<SuccessEnvelope<T>>(method, path, body, options, Query(query)); }
    public Task<ApiResponse<SuccessEnvelope<HybridRoutingPolicy>>> GetPolicyAsync(HybridRoutingPolicyScope scope, RequestOptions? options = null) => Request<HybridRoutingPolicy>(HttpMethod.Get, "/messaging/routing/hybrid", null, scope, options);
    public Task<ApiResponse<SuccessEnvelope<HybridRoutingPolicy>>> SetPolicyAsync(HybridRoutingPolicyScope scope, SetHybridRoutingPolicyRequest body, RequestOptions? options = null) => Request<HybridRoutingPolicy>(HttpMethod.Put, "/messaging/routing/hybrid", body, scope, options);
    public Task<ApiResponse<SuccessEnvelope<HybridLinkState>>> StateAsync(string connection, RequestOptions? options = null) => Request<HybridLinkState>(HttpMethod.Get, "/messaging/" + E(connection) + "/hybrid-link", null, null, options);
    public Task<ApiResponse<SuccessEnvelope<HybridLinkPaused>>> SetPausedAsync(string connection, SetHybridLinkPausedRequest body, RequestOptions? options = null) => Request<HybridLinkPaused>(HttpMethod.Put, "/messaging/" + E(connection) + "/hybrid-link", body, null, options);
    public static IReadOnlyDictionary<string, string> GraphTransportHeaders(string transport) => transport is "auto" or "linked_devices" or "official_api" ? new Dictionary<string, string> { ["X-Polymorfa-Transport"] = transport } : throw new PolymorfaValidationException("Invalid Graph transport.", "invalid_parameter");
}
