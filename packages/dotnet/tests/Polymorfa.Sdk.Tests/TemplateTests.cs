using Polymorfa.Sdk;
using System.Text.Json;

internal static class TemplateTests
{
    private const string Definition = """{"version":1,"kind":"standard","category":"UTILITY","language":"en_US","body":"Hello {{name}}","variables":[{"name":"name","type":"text","example":"Zoë"}],"header":{"format":"text","text":"Hello"},"buttons":[{"type":"quick_reply","text":"Reply"}]}""";
    private const string Draft = """{"id":"t1","name":"welcome","category":"UTILITY","language":"en_US","status":"draft","kind":"standard","definition":DEFINITION,"sampleValues":{"name":"Zoë"},"cloudLinks":[],"createdAt":9007199254740993,"updatedAt":10}""";
    private const string Cloud = """{"id":"ct1","tenantId":"o1","session":"support","wabaId":"waba1","name":"welcome","language":"en_US","category":"UTILITY","status":"APPROVED","components":[{"type":"BODY","text":"Hello"}],"metaTemplateId":"meta1","rejectionReason":null,"qualityScore":"GREEN","createdAt":"2026-09-22","updatedAt":"2026-09-22"}""";
    public static async Task RunAsync()
    {
        var d = new TemplateDefinition(1, "standard", "UTILITY", "en_US", "Hello {{name}}", [new("name", "text", "Zoë")], new TemplateTextHeader("Hello"), Buttons: [new TemplateQuickReplyButton("Reply")]);
        var draft = Draft.Replace("DEFINITION", Definition.Replace("{\"format\":\"text\",\"text\":\"Hello\"}", "{\"text\":\"Hello\",\"format\":\"text\"}"));
        await Messaging("GET", "/messaging/projects/support/templates", null, "{\"success\":true,\"data\":[" + draft + "]}", async c => ResourceTests.Equal((await c.Templates.ListAsync("support")).Data.Data[0].CreatedAt, 9007199254740993L));
        await Messaging("POST", "/messaging/projects/support/templates", "{\"name\":\"welcome\",\"definition\":" + Definition + ",\"sampleValues\":{\"name\":\"Zoë\"}}", Envelope(draft), async c => ResourceTests.Equal(((TemplateTextHeader)(await c.Templates.CreateAsync("support", new("welcome", d, new Dictionary<string, string> { ["name"] = "Zoë" }))).Data.Data.Definition!.Header!).Text, "Hello"));
        await Messaging("GET", "/messaging/projects/support/templates/t1", null, Envelope(draft), async c => ResourceTests.Equal((await c.Templates.RetrieveAsync("support", "t1")).Data.Data.SampleValues!["name"], "Zoë"));
        await Messaging("PATCH", "/messaging/projects/support/templates/t1", """{"status":"draft","sampleValues":{}}""", Envelope(draft), async c => ResourceTests.Equal((await c.Templates.UpdateAsync("support", "t1", new(Status: "draft", SampleValues: new Dictionary<string, string>()))).Data.Data.Status, "draft"));
        await Messaging("DELETE", "/messaging/projects/support/templates/t1", null, """{"success":true}""", async c => ResourceTests.True((await c.Templates.DeleteAsync("support", "t1")).Data.Success));
        await Messaging("POST", "/messaging/projects/support/templates/t1/preview", """{"values":{"name":"Zoë"},"surface":"sandbox"}""", """{"success":true,"data":{"body":"Hello Zoë","surface":"sandbox"}}""", async c => ResourceTests.Equal((await c.Templates.PreviewAsync("support", "t1", new(new Dictionary<string, string> { ["name"] = "Zoë" }, "sandbox"))).Data.Data.GetProperty("body").GetString(), "Hello Zoë"));
        await Messaging("POST", "/messaging/projects/support/templates/t1/submit", """{"session":"support"}""", """{"success":true,"data":{"accepted":true,"requestId":"op1"}}""", async c => ResourceTests.Equal((await c.Templates.SubmitAsync("support", "t1", new("support"))).Data.Data.GetProperty("requestId").GetString(), "op1"));
        await Messaging("GET", "/messaging/support/templates", null, "{\"success\":true,\"data\":[" + Cloud + "]}", async c => ResourceTests.Equal((await c.CloudTemplates.ListAsync("support")).Data.Data[0].QualityScore, "GREEN"));
        await Messaging("GET", "/messaging/support/templates/welcome?language=en_US", null, Envelope(Cloud), async c => ResourceTests.Equal((await c.CloudTemplates.RetrieveAsync("support", "welcome", "en_US")).Data.Data.MetaTemplateId, "meta1"));
        await Messaging("POST", "/messaging/support/templates", """{"name":"welcome","language":"en_US","category":"UTILITY","components":[{"type":"BODY","text":"Hello"}]}""", Envelope(Cloud), async c => ResourceTests.Equal((await c.CloudTemplates.CreateAsync("support", new("welcome", "en_US", "UTILITY", [JsonSerializer.SerializeToElement(new { type = "BODY", text = "Hello" })]))).Data.Data.Status, "APPROVED"));
        await Messaging("PATCH", "/messaging/support/templates/welcome?language=en_US", """{"components":[]}""", """{"success":true,"data":{"accepted":true,"name":"welcome","language":"en_US"}}""", async c => ResourceTests.True((await c.CloudTemplates.UpdateAsync("support", "welcome", new([]), "en_US")).Data.Data.Accepted));
        await Messaging("DELETE", "/messaging/support/templates/welcome", null, """{"success":true}""", async c => ResourceTests.True((await c.CloudTemplates.DeleteAsync("support", "welcome")).Data.Success));
        await Variants(); await OneAttempt();
        using var token = new MessagingClient(Credential.ClientToken("pmfa_ct_fixture")); try { await token.CloudTemplates.ListAsync("support"); throw new Exception("Client used provider templates"); } catch (PolymorfaConfigurationException) { }
        Console.WriteLine("PASS 12 project/provider template methods, full draft variants, query language, precise timestamps and one-attempt submit");
    }
    private static string Envelope(string json) => "{\"success\":true,\"data\":" + json + "}";
    private static Task Messaging(string method, string path, string? body, string response, Func<MessagingClient, Task> invoke) => ResourceTests.Messaging(method, path, body, response, invoke);
    private static async Task Variants()
    {
        foreach (var (header,json) in new (TemplateHeader,string)[] {
            (new TemplateNoneHeader(), """{"format":"none"}"""), (new TemplateImageHeader("https://customer.example/image"), """{"format":"image","example":"https://customer.example/image"}"""),
            (new TemplateVideoHeader("https://customer.example/video"), """{"format":"video","example":"https://customer.example/video"}"""), (new TemplateDocumentHeader("https://customer.example/file","file.pdf"), """{"format":"document","example":"https://customer.example/file","filename":"file.pdf"}"""),
            (new TemplateLocationHeader(new(1.25,2.5,"Place")), """{"format":"location","example":{"latitude":1.25,"longitude":2.5,"name":"Place"}}""") })
        {
            var d = new TemplateDefinition(1,"limited_time_offer","MARKETING","en_US","Offer",[],header,Buttons:[new TemplateUrlButton("Open","https://customer.example"),new TemplatePhoneButton("Call","+15550001111"),new TemplateCopyCodeButton(Example:"CODE")],Authentication:new("one_tap","123456",false,10),LimitedTimeOffer:new("Offer",false),Carousel:new([new(new TemplateImageHeader("https://customer.example/image"),"Card")]));
            var definition = "{\"version\":1,\"kind\":\"limited_time_offer\",\"category\":\"MARKETING\",\"language\":\"en_US\",\"body\":\"Offer\",\"variables\":[],\"header\":"+json+",\"buttons\":[{\"type\":\"url\",\"text\":\"Open\",\"url\":\"https://customer.example\"},{\"type\":\"phone\",\"text\":\"Call\",\"phone\":\"+15550001111\"},{\"type\":\"copy_code\",\"example\":\"CODE\"}],\"authentication\":{\"otpType\":\"one_tap\",\"codeExample\":\"123456\",\"addSecurityRecommendation\":false,\"codeExpirationMinutes\":10},\"limitedTimeOffer\":{\"text\":\"Offer\",\"hasExpiration\":false},\"carousel\":{\"cards\":[{\"header\":{\"format\":\"image\",\"example\":\"https://customer.example/image\"},\"body\":\"Card\"}]}}";
            await ResourceTests.Messaging("POST","/messaging/projects/support/templates","{\"name\":\"offer\",\"definition\":"+definition+"}",Envelope(Draft.Replace("DEFINITION",definition)),async c=>ResourceTests.Equal((await c.Templates.CreateAsync("support",new("offer",d))).Data.Data.Definition!.Header!.GetType(),header.GetType()));
        }
    }
    private static async Task OneAttempt()
    {
        using var fixture = new WireFixture(); var serving = fixture.ServeAsync("POST", "/messaging/projects/support/templates/t1/submit", """{"session":"support"}""", """{"error":{"code":"provider_unavailable","message":"Unavailable"}}""", 503); using var client = new MessagingClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72)), new() { BaseUrl = fixture.Url }); try { await client.Templates.SubmitAsync("support", "t1", new("support"), new() { IdempotencyKey="fixture", MaxNetworkRetries=3 }); throw new Exception("Expected rejection"); } catch (PolymorfaServerException e) { ResourceTests.Equal(e.Metadata!.Attempts,1); } await serving;
    }
}
