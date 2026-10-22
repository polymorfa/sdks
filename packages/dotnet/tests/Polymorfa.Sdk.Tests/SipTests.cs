using Polymorfa.Sdk;
using static BillingTests;

internal static class SipTests
{
    private const string Trunk = "{\"id\":\"trunk\",\"projectId\":\"p\",\"name\":\"PBX\",\"enabled\":true,\"direction\":\"both\",\"outbound\":{\"targetUri\":\"sip:pbx.example.invalid\",\"transport\":\"tls\",\"authUsername\":\"user\",\"hasPassword\":true,\"fromUser\":null},\"inbound\":{\"username\":\"user\",\"realm\":\"realm\",\"session\":null,\"allowedAddresses\":[\"192.0.2.0/24\"],\"allowedDestinations\":[\"+1\"]},\"codecs\":[\"PCMU\"],\"maxConcurrentCalls\":2,\"revision\":3,\"createdAt\":\"2026-09-22\",\"updatedAt\":\"2026-09-22\"}";
    public static async Task RunAsync()
    {
        await Organization("GET", "/platform/sip-trunks?projectId=p", null, "{\"data\":[" + Trunk + "]}", async c => ResourceTests.Equal((await c.SipTrunks.ListAsync("p")).Data[0].Inbound!.AllowedAddresses[0], "192.0.2.0/24"));
        await Organization("GET", "/platform/sip/endpoint", null, "{\"data\":{\"status\":\"hosted\",\"host\":\"sip.example.invalid\",\"transports\":[{\"transport\":\"tls\",\"port\":5061,\"srtp\":\"required\"}],\"rtp\":{\"protocol\":\"udp\",\"portMin\":10000,\"portMax\":20000}}}", async c => ResourceTests.Equal((await c.SipTrunks.EndpointAsync()).Data.Transports[0].Srtp, "required"));
        await Organization("POST", "/platform/sip-trunks", "{\"name\":\"PBX\",\"direction\":\"inbound\",\"inbound\":{\"allowedAddresses\":[\"192.0.2.0/24\"],\"session\":null},\"projectId\":\"p\"}", "{\"data\":{\"trunk\":" + Trunk + ",\"inboundCredentials\":{\"username\":\"user\",\"password\":\"fixture-only-password\",\"realm\":\"realm\"}}}", async c => { var credentials = (await c.SipTrunks.CreateAsync(new("PBX", "inbound", Inbound: new(["192.0.2.0/24"], Session: PatchValue<string>.Set(null))), "p")).Data.InboundCredentials!; ResourceTests.Equal(credentials.Password, "fixture-only-password"); ResourceTests.Equal(credentials.ToString().Contains(credentials.Password), false); });
        await Organization("GET", "/platform/sip-trunks/trunk", null, "{\"data\":" + Trunk + "}", async c => ResourceTests.Equal((await c.SipTrunks.RetrieveAsync("trunk")).Data.Outbound!.HasPassword, true));
        await Organization("PATCH", "/platform/sip-trunks/trunk", "{\"expectedRevision\":2,\"outbound\":{\"authUsername\":null,\"fromUser\":null}}", "{\"data\":" + Trunk + "}", async c => ResourceTests.Equal((await c.SipTrunks.UpdateAsync("trunk", new(ExpectedRevision: 2, Outbound: new(AuthUsername: PatchValue<string>.Set(null), FromUser: PatchValue<string>.Set(null))))).Data.Revision, 3L));
        await Organization("DELETE", "/platform/sip-trunks/trunk", null, "{\"data\":{\"id\":\"trunk\",\"deleted\":true}}", async c => ResourceTests.True((await c.SipTrunks.DeleteAsync("trunk")).Data.Deleted));
        await Organization("POST", "/platform/sip-trunks/trunk/credentials", null, "{\"data\":{\"username\":\"user\",\"password\":\"fixture-only-password\",\"realm\":\"realm\"}}", async c => ResourceTests.Equal((await c.SipTrunks.RotateCredentialsAsync("trunk")).Data.Realm, "realm"));
        await Organization("GET", "/platform/sip-trunks/trunk", null, "{\"data\":" + Trunk + "}", async c => { try { await c.Project("other").SipTrunks.DeleteAsync("trunk", new() { IdempotencyKey = "write-only" }); } catch (PolymorfaNotFoundException) { return; } throw new Exception("Project-bound SIP write escaped confinement."); });
        await Organization("GET", "/platform/sip/endpoint", null, "{\"data\":{\"status\":\"sip_not_hosted\",\"host\":null,\"transports\":[],\"rtp\":null}}", async c => ResourceTests.Equal((await c.Project("p").SipTrunks.EndpointAsync()).Data.Status, "sip_not_hosted"));
        Console.WriteLine("PASS 7 typed SIP routes, null clearing, withheld passwords and project confinement");
    }
}
