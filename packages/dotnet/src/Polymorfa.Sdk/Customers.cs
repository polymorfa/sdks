using System.Text.Json.Serialization;

namespace Polymorfa.Sdk;

public record Customer(string Id, string OrgId, string ProjectId, string? Name, string? ExternalCustomerId, string Status, bool IsDefault, long? ArchivedAt, long CreatedAt, long UpdatedAt);
public sealed record CustomerSummary(string Id, string OrgId, string ProjectId, string? Name, string? ExternalCustomerId, string Status, bool IsDefault, long? ArchivedAt, long CreatedAt, long UpdatedAt, int NumberCount, int ConnectedNumberCount, string? ActivePairingLinkState, long? LastActivityAt, bool NeedsAttention) : Customer(Id, OrgId, ProjectId, Name, ExternalCustomerId, Status, IsDefault, ArchivedAt, CreatedAt, UpdatedAt);
public sealed record CustomersStatus(bool Enabled, long? EnabledAt, string? EnabledBy, Customer? DefaultCustomer);
public sealed record CustomersEnablement(bool Enabled, long? EnabledAt, string? EnabledBy, Customer? DefaultCustomer, int MigratedNumberCount);
public sealed record CustomerProjectRequest(string? ProjectId = null);
public sealed record CreateCustomerRequest(string? ProjectId = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<string> Name = default, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<string> ExternalCustomerId = default);
public sealed record UpdateCustomerRequest(string? ProjectId = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<string> Name = default, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<string> ExternalCustomerId = default);
public sealed record ListCustomersParameters(string ProjectId, string? Cursor = null, int? Limit = null, string? Search = null, string? Status = null, bool? IsDefault = null, bool? HasNumbers = null, bool? NeedsAttention = null);
public sealed record CustomerListPage(string? NextCursor, bool HasMore);
public sealed record CustomerListEnvelope(IReadOnlyList<CustomerSummary> Data, CustomerListPage Page);
public sealed record CustomerNumber(string Id, string CustomerId, string SessionId, string? Name, string? PhoneMasked, string Status, string? Backend, long CreatedAt);
public sealed record CustomerEventMetadata(IReadOnlyList<string>? Fields = null);
public sealed record CustomerEvent(string Id, string Action, string? FromStatus, string? ToStatus, string? SessionId, string? PairingLinkId, CustomerEventMetadata Metadata, long OccurredAt);
public record CustomerPairingLink(string Id, string OrgId, string ProjectId, string CustomerId, string? ExpectedPhoneMasked, IReadOnlyList<string> Methods, string? Locale, string? Theme, long ExpiresAt, string Status, int AttemptCount, int MaxAttempts, string? PendingSessionId, string? CreatedBy, long? ReservedAt, long? OpenedAt, long? ConnectingAt, long? ConnectedAt, long? FailedAt, long? ExpiredAt, long? RevokedAt, string? LastErrorCode, int FailedExchangeCount, int PhoneMismatchCount, long CreatedAt, long UpdatedAt);
public sealed record CreatedCustomerPairingLink(string Id, string OrgId, string ProjectId, string CustomerId, string? ExpectedPhoneMasked, IReadOnlyList<string> Methods, string? Locale, string? Theme, long ExpiresAt, string Status, int AttemptCount, int MaxAttempts, string? PendingSessionId, string? CreatedBy, long? ReservedAt, long? OpenedAt, long? ConnectingAt, long? ConnectedAt, long? FailedAt, long? ExpiredAt, long? RevokedAt, string? LastErrorCode, int FailedExchangeCount, int PhoneMismatchCount, long CreatedAt, long UpdatedAt, string? Url) : CustomerPairingLink(Id, OrgId, ProjectId, CustomerId, ExpectedPhoneMasked, Methods, Locale, Theme, ExpiresAt, Status, AttemptCount, MaxAttempts, PendingSessionId, CreatedBy, ReservedAt, OpenedAt, ConnectingAt, ConnectedAt, FailedAt, ExpiredAt, RevokedAt, LastErrorCode, FailedExchangeCount, PhoneMismatchCount, CreatedAt, UpdatedAt)
{
    public override string ToString() => $"CreatedCustomerPairingLink {{ Id = {Id}, Status = {Status}, Url = [REDACTED] }}";
}
public sealed record CreateCustomerPairingLinkRequest(string? ProjectId = null, [property: JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingDefault)] PatchValue<string> ExpectedPhone = default, IReadOnlyList<string>? Methods = null, int? ExpiresInSeconds = null);
public sealed record ListCustomerEventsParameters(string ProjectId, int? Limit = null);
public sealed record TransferCustomerNumberRequest(string ProjectId, string SourceCustomerId, bool Confirm);

public sealed class Customers : Resource
{
    internal Customers(HttpTransport http) : base(http) { }
    private static string Path(string customer) => "/platform/customers/" + E(customer);
    public Task<ApiResponse<DataEnvelope<CustomersStatus>>> StatusAsync(string projectId, RequestOptions? options = null) => Get<DataEnvelope<CustomersStatus>>($"/platform/projects/{E(projectId)}/customers/status", options);
    public Task<ApiResponse<DataEnvelope<CustomersEnablement>>> EnableAsync(string projectId, RequestOptions? options = null) => Post<DataEnvelope<CustomersEnablement>>($"/platform/projects/{E(projectId)}/customers/enable", null, options);
    public Task<ApiResponse<CustomerListEnvelope>> ListAsync(ListCustomersParameters parameters, RequestOptions? options = null) => Get<CustomerListEnvelope>("/platform/customers", options, parameters);
    public Task<ApiResponse<DataEnvelope<Customer>>> CreateAsync(CreateCustomerRequest? body = null, RequestOptions? options = null) => Post<DataEnvelope<Customer>>("/platform/customers", body ?? new(), options);
    public Task<ApiResponse<DataEnvelope<Customer>>> RetrieveAsync(string customerId, string projectId, RequestOptions? options = null) => Get<DataEnvelope<Customer>>(Path(customerId), options, new { projectId });
    public Task<ApiResponse<DataEnvelope<Customer>>> UpdateAsync(string customerId, UpdateCustomerRequest body, RequestOptions? options = null) => Patch<DataEnvelope<Customer>>(Path(customerId), body, options);
    public Task<ApiResponse<DataEnvelope<Customer>>> ArchiveAsync(string customerId, CustomerProjectRequest? body = null, RequestOptions? options = null) => Post<DataEnvelope<Customer>>(Path(customerId) + "/archive", body ?? new(), options);
    public Task<ApiResponse<DataEnvelope<Customer>>> RestoreAsync(string customerId, CustomerProjectRequest? body = null, RequestOptions? options = null) => Post<DataEnvelope<Customer>>(Path(customerId) + "/restore", body ?? new(), options);
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<CustomerNumber>>>> ListNumbersAsync(string customerId, string projectId, RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyList<CustomerNumber>>>(Path(customerId) + "/numbers", options, new { projectId });
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<CustomerEvent>>>> ListEventsAsync(string customerId, ListCustomerEventsParameters parameters, RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyList<CustomerEvent>>>(Path(customerId) + "/events", options, parameters);
    public Task<ApiResponse<DataEnvelope<CreatedCustomerPairingLink>>> CreatePairingLinkAsync(string customerId, CreateCustomerPairingLinkRequest? body = null, RequestOptions? options = null) => Post<DataEnvelope<CreatedCustomerPairingLink>>(Path(customerId) + "/pairing-links", body ?? new(), options);
    public Task<ApiResponse<DataEnvelope<IReadOnlyList<CustomerPairingLink>>>> ListPairingLinksAsync(string customerId, string projectId, RequestOptions? options = null) => Get<DataEnvelope<IReadOnlyList<CustomerPairingLink>>>(Path(customerId) + "/pairing-links", options, new { projectId });
    public Task<ApiResponse<DataEnvelope<CustomerPairingLink>>> RevokePairingLinkAsync(string customerId, string linkId, string projectId, RequestOptions? options = null) => Http.RequestAsync<DataEnvelope<CustomerPairingLink>>(HttpMethod.Delete, Path(customerId) + "/pairing-links/" + E(linkId), null, options, Query(new { projectId }));
    public Task<ApiResponse<DataEnvelope<CustomerNumber>>> TransferNumberAsync(string customerId, string sessionId, TransferCustomerNumberRequest body, RequestOptions? options = null)
    {
        if (!body.Confirm) throw new PolymorfaValidationException("Number transfer requires confirm:true.", "invalid_parameter");
        return Post<DataEnvelope<CustomerNumber>>(Path(customerId) + "/numbers/" + E(sessionId) + "/transfer", body, options);
    }
}
