using System.Text.Json.Serialization;
namespace Polymorfa.Sdk;

[JsonConverter(typeof(WhatsAppAccountTypeConverter))]
public enum WhatsAppAccountType { WhatsappApp, BusinessApp, MetaCloud, MetaCoexistence }
internal sealed class WhatsAppAccountTypeConverter() : KnownStringEnumConverter<WhatsAppAccountType>(new Dictionary<WhatsAppAccountType, string> { [WhatsAppAccountType.WhatsappApp] = "whatsapp_app", [WhatsAppAccountType.BusinessApp] = "business_app", [WhatsAppAccountType.MetaCloud] = "meta_cloud", [WhatsAppAccountType.MetaCoexistence] = "meta_coexistence" });
[JsonConverter(typeof(TestingPrimaryPlatformConverter))]
public enum TestingPrimaryPlatform { Android, Ios }
internal sealed class TestingPrimaryPlatformConverter() : KnownStringEnumConverter<TestingPrimaryPlatform>(new Dictionary<TestingPrimaryPlatform, string> { [TestingPrimaryPlatform.Android] = "android", [TestingPrimaryPlatform.Ios] = "ios" });
[JsonConverter(typeof(ContactEncryptionConverter))]
public enum ContactEncryption { EndToEnd, Hybrid, NotEndToEnd }
internal sealed class ContactEncryptionConverter() : KnownStringEnumConverter<ContactEncryption>(new Dictionary<ContactEncryption, string> { [ContactEncryption.EndToEnd] = "end_to_end", [ContactEncryption.Hybrid] = "hybrid", [ContactEncryption.NotEndToEnd] = "not_end_to_end" });
public sealed record TestingAccountModeRequest(WhatsAppAccountType AccountType, TestingPrimaryPlatform? PrimaryPlatform = null);
public sealed record TestingAccountMode(string Session, WhatsAppAccountType AccountType, TestingPrimaryPlatform? PrimaryPlatform, bool Changed, IReadOnlyList<long> UnlinkedDevices);
internal static class BusinessAccountModeValidation
{
    internal static void Fields(WhatsAppAccountType? account, TestingPrimaryPlatform? platform)
    {
        if (account is { } a && !Enum.IsDefined(a) || platform is { } p && !Enum.IsDefined(p) || account == WhatsAppAccountType.MetaCloud && platform is not null)
            throw new PolymorfaValidationException("Invalid Test account mode or primaryPlatform.", "invalid_parameter");
    }
}
