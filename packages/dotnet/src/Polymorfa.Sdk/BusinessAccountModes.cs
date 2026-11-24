using System.Text.Json.Serialization;
namespace Polymorfa.Sdk;

[JsonConverter(typeof(ContactEncryptionConverter))]
public enum ContactEncryption { EndToEnd, Hybrid, NotEndToEnd }
internal sealed class ContactEncryptionConverter() : KnownStringEnumConverter<ContactEncryption>(new Dictionary<ContactEncryption, string> { [ContactEncryption.EndToEnd] = "end_to_end", [ContactEncryption.Hybrid] = "hybrid", [ContactEncryption.NotEndToEnd] = "not_end_to_end" });
public sealed record TestingAccountModeRequest(TestingAccountType AccountType, TestingPrimaryPlatform? PrimaryPlatform = null);
public sealed record TestingAccountMode(string Connection, TestingAccountType AccountType, TestingPrimaryPlatform? PrimaryPlatform, bool Changed, IReadOnlyList<long> UnlinkedDevices);
internal static class BusinessAccountModeValidation
{
    internal static void Fields(TestingAccountType? account, TestingPrimaryPlatform? platform)
    {
        if (account is { } a && !Enum.IsDefined(a) || platform is { } p && !Enum.IsDefined(p) || account == TestingAccountType.MetaCloud && platform is not null)
            throw new PolymorfaValidationException("Invalid Test account mode or primaryPlatform.", "invalid_parameter");
    }
}
