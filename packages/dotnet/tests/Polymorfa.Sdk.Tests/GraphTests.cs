using Polymorfa.Sdk;

internal static class GraphTests
{
    public static async Task RunAsync()
    {
        await ResourceTests.Messaging("GET", "/graph/whatsapp/v23.0/waba1/product_catalogs?limit=10&after=cursor1", null, """{"data":[{"id":"1","name":"Catalog"}],"paging":{"cursors":{"before":"a","after":"b"}}}""", async c => ResourceTests.Equal((await c.CloudGraph.ListCatalogsAsync("waba1", new("v23.0", 10, "cursor1"))).Data.Paging!.Cursors.After, "b"));
        await ResourceTests.Messaging("GET", "/graph/whatsapp/v23.0/waba1/product_catalogs/1/products", null, """{"data":[{"id":"2","retailer_id":"sku1","name":"Product","availability":"in stock"}]}""", async c => ResourceTests.Equal((await c.CloudGraph.ListProductsAsync("waba1", "1", new("v23.0"))).Data.Data[0].RetailerId, "sku1"));
        await ResourceTests.Messaging("GET", "/graph/whatsapp/v23.0/waba1/marketing_messages/status", null, """{"id":"waba1","marketing_messages_lite_api_status":"future"}""", async c => ResourceTests.Equal((await c.CloudGraph.MarketingStatusAsync("waba1", "v23.0")).Data.MarketingMessagesLiteApiStatus, "future"));
        await ResourceTests.Messaging("GET", "/graph/whatsapp/v23.0/phone1/whatsapp_business_encryption", null, """{"data":[{"business_public_key":"public-fixture","business_public_key_signature_status":"VALID"}]}""", async c => ResourceTests.Equal((await c.CloudGraph.RetrieveEncryptionKeyAsync("phone1", "v23.0")).Data.Data[0].BusinessPublicKeySignatureStatus, "VALID"));
        await ResourceTests.Messaging("POST", "/graph/whatsapp/v23.0/phone1/whatsapp_business_encryption", """{"business_public_key":"public-fixture"}""", """{"success":true}""", async c => ResourceTests.True((await c.CloudGraph.RegisterEncryptionKeyAsync("phone1", new("public-fixture"), "v23.0")).Data.Success));
        using var token = new MessagingClient(Credential.ClientToken("pmfa_ct_fixture")); try { await token.CloudGraph.MarketingStatusAsync("waba1", "v23.0"); throw new Exception("Client token used Graph server methods"); } catch (PolymorfaConfigurationException) { }
        Console.WriteLine("PASS native Graph catalog, products, marketing and encryption-key subset");
    }
}
