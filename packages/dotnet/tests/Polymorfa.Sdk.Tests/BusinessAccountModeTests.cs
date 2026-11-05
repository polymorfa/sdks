using Polymorfa.Sdk;
internal static class BusinessAccountModeTests
{
    public static async Task RunAsync()
    {
        foreach (var (mode, wire) in new[] { (WhatsAppAccountType.WhatsappApp,"whatsapp_app"), (WhatsAppAccountType.BusinessApp,"business_app"), (WhatsAppAccountType.MetaCloud,"meta_cloud"), (WhatsAppAccountType.MetaCoexistence,"meta_coexistence") })
            await ResourceTests.Messaging("PUT", "/messaging/demo%20%2Fa/phone/account-mode", "{\"accountType\":\"" + wire + "\"}", "{\"session\":\"demo /a\",\"accountType\":\"" + wire + "\",\"primaryPlatform\":null,\"changed\":true,\"unlinkedDevices\":[2,7]}", async c => { var value = (await c.Testing.SetAccountModeAsync("demo /a", new(mode))).Data; ResourceTests.Equal(value.AccountType,mode); ResourceTests.True(value.Changed); ResourceTests.Equal(value.UnlinkedDevices.Count,2); });
        await ResourceTests.Messaging("PUT", "/messaging/demo/phone/account-mode", """{"accountType":"business_app","primaryPlatform":"ios"}""", """{"session":"demo","accountType":"business_app","primaryPlatform":"ios","changed":false,"unlinkedDevices":[]}""", async c => { var value = (await c.Testing.SetAccountModeAsync("demo",new(WhatsAppAccountType.BusinessApp,TestingPrimaryPlatform.Ios))).Data; ResourceTests.True(!value.Changed); ResourceTests.Equal(value.PrimaryPlatform,TestingPrimaryPlatform.Ios); });
        using var server = new MessagingClient(Credential.OrganizationApiKey("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"));
        foreach (var invalid in new[] { new TestingAccountModeRequest(WhatsAppAccountType.MetaCloud,TestingPrimaryPlatform.Android), new TestingAccountModeRequest((WhatsAppAccountType)99), new TestingAccountModeRequest(WhatsAppAccountType.BusinessApp,(TestingPrimaryPlatform)99) })
            try { await server.Testing.SetAccountModeAsync("demo",invalid); throw new Exception("Invalid mode accepted"); } catch (PolymorfaValidationException) { }
        using var client = new MessagingClient(Credential.ClientToken("pmfa_ct_Zml4dHVyZQ"));
        try { await client.Testing.SetAccountModeAsync("demo",new(WhatsAppAccountType.BusinessApp)); throw new Exception("Client token accepted"); } catch (PolymorfaConfigurationException) { }
        foreach (var malformed in new[] { "{}", """{"session":"demo","accountType":"business","primaryPlatform":null,"changed":false,"unlinkedDevices":[]}""", """{"session":"demo","accountType":"business_app","changed":false,"unlinkedDevices":[]}""" })
            await ResourceTests.Messaging("PUT", "/messaging/demo/phone/account-mode", """{"accountType":"business_app"}""",malformed,async c => { try { await c.Testing.SetAccountModeAsync("demo",new(WhatsAppAccountType.BusinessApp)); throw new Exception("Malformed mode accepted"); } catch (PolymorfaServerException) { } });
        foreach (var (encryption,wire) in new (ContactEncryption?,string?)[] { (ContactEncryption.EndToEnd,"end_to_end"), (ContactEncryption.Hybrid,"hybrid"), (ContactEncryption.NotEndToEnd,"not_end_to_end"),(null,null) })
            await ResourceTests.Messaging("GET","/messaging/demo/contacts/123/business-profile",null,"{\"success\":true,\"data\":{\"id\":\"123\",\"address\":\"\",\"email\":\"\",\"description\":\"\",\"websites\":[],\"coverPhotoId\":\"\",\"categories\":[],\"options\":{},\"hoursTimeZone\":\"\",\"hours\":[]" + (wire is null ? "" : ",\"encryption\":\"" + wire + "\"") + "}}",async c => ResourceTests.Equal((await c.Contacts.BusinessProfileAsync("demo","123")).Data.Data.Encryption,encryption));
        var quickLink = new CreateQuickLinkRequest(Configuration: new QuickLinkConfiguration(
            Testing: new QuickLinkTesting(Configuration: new TestingConfiguration(
                AccountType: WhatsAppAccountType.BusinessApp,
                PrimaryPlatform: TestingPrimaryPlatform.Ios,
                ReplyBehavior: "echo"))));
        await ResourceTests.Messaging("POST", "/messaging/quicklinks", """{"configuration":{"testing":{"configuration":{"accountType":"business_app","primaryPlatform":"ios","replyBehavior":"echo"}}}}""", """{"success":true,"data":{"id":"ql","url":"https://example.test/ql","session":"demo","expiresAt":null}}""", async c => { await c.QuickLinks.CreateAsync(quickLink); });
        var invalidQuickLink = new CreateQuickLinkRequest(Configuration: new QuickLinkConfiguration(
            Testing: new QuickLinkTesting(Configuration: new TestingConfiguration(
                AccountType: WhatsAppAccountType.MetaCloud,
                PrimaryPlatform: TestingPrimaryPlatform.Ios))));
        try { await server.QuickLinks.CreateAsync(invalidQuickLink); throw new Exception("Cloud QuickLink accepted a phone platform"); } catch (PolymorfaValidationException) { }
        Console.WriteLine("PASS Business account modes: four modes, iOS, pre-I/O refusal, server credentials, malformed replies and encryption omission");
    }
}
