using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Polymorfa.Sdk;

internal static class SignalTests
{
    private const string Secret = "application-fixture-secret";
    private const string Event = """{"id":"event-fixture","type":"message","session_id":"s","chat":"111@s.whatsapp.net","sender":"111:1@s.whatsapp.net","message_id":"m","timestamp":100,"is_from_me":false,"redelivered":false,"identity_changed":false,"message_proto":"","text":"private text ✓","future":{"retained":true}}""";
    internal static async Task RunAsync()
    {
        using var fixture = new WireFixture { Authorization = "Bearer " + Secret, AbsentHeaders = ["origin", "cookie"], FragmentBytes = 7 };
        using var client = new SignalClient(new(fixture.Url, Secret));
        var served = fixture.ServeAsync("GET", "/v1/sessions", null, """{"node_id":"node","sessions":[{"id":"s","lease_generation":2,"claimed":true,"has_device_keys":true,"state":"connected","pn":null,"lid":null}]}""");
        ResourceTests.Equal((await client.SessionsAsync()).Sessions[0].LeaseGeneration, 2UL); await served;
        served = fixture.ServeAsync("POST", "/v1/sessions/s%2F1/messages", """{"to":"111@s.whatsapp.net","text":"private"}""", """{"message_id":"m","server_timestamp":100,"resent":false}""");
        ResourceTests.Equal((await client.SendAsync("s/1", SignalSendRequest.TextMessage("111@s.whatsapp.net", "private"))).MessageId, "m"); await served;
        served = fixture.ServeAsync("GET", "/v1/events?session_id=s%20one", null, $": keepalive\r\n\r\nid: event-fixture\r\nevent: message\r\ndata: {Event}\r\n\r\n", responseHeaders: new Dictionary<string, string> { ["content-type"] = "text/event-stream" });
        await using var events = client.EventsAsync("s one").GetAsyncEnumerator();
        ResourceTests.True(await events.MoveNextAsync()); ResourceTests.Equal(events.Current.Text, "private text ✓"); ResourceTests.True(events.Current.Additional!["future"].GetProperty("retained").GetBoolean()); await served;
        await Task.Delay(25); ResourceTests.True(!fixture.Pending);
        served = fixture.ServeAsync("POST", "/v1/events/event-fixture/ack", null, "", 204);
        await client.AcknowledgeAsync(events.Current.Id); await served;
        ResourceTests.True(!events.Current.ToString().Contains("private", StringComparison.Ordinal));
        foreach (var status in new[] { 401, 403, 307 })
        {
            using var capture = new WireFixture();
            served = fixture.ServeAsync("GET", "/v1/sessions", null, "<html>signed?secret=value</html>", status, new Dictionary<string, string> { ["content-type"] = "text/html", ["location"] = new Uri(capture.Url, "/capture").AbsoluteUri });
            try { await client.SessionsAsync(); throw new Exception("Non-success accepted"); }
            catch (PolymorfaException error) { ResourceTests.Equal(error.Status, status); ResourceTests.True(!error.Message.Contains("secret", StringComparison.Ordinal)); if (status == 401) ResourceTests.True(error is PolymorfaAuthenticationException); if (status == 403) ResourceTests.True(error is PolymorfaAuthorizationException); }
            await served; await Task.Delay(25); ResourceTests.True(!capture.Pending);
        }
        var body = Encoding.UTF8.GetBytes(Event); var signed = Encoding.UTF8.GetBytes("100." + Event); var signature = "v1=" + Convert.ToHexString(HMACSHA256.HashData(Encoding.ASCII.GetBytes(Secret), signed)).ToLowerInvariant();
        ResourceTests.Equal(SignalClient.VerifyWebhook(Encoding.ASCII.GetBytes(Secret), 100, body, signature, 105, TimeSpan.FromSeconds(5)).Id, "event-fixture");
        foreach (var invalid in new[] { (Body: body, Now: 106L), (Body: Encoding.UTF8.GetBytes(Event + " "), Now: 100L) })
        {
            try { SignalClient.VerifyWebhook(Encoding.ASCII.GetBytes(Secret), 100, invalid.Body, signature, invalid.Now, TimeSpan.FromSeconds(5)); throw new Exception("Invalid signature accepted"); }
            catch (PolymorfaException error) { ResourceTests.Equal(error.Code, "invalid_signature"); }
        }
        foreach (var options in new[] { new SignalClientOptions(new("http://remote.invalid"), Secret), new(new("https://user:password@remote.invalid"), Secret), new(new("https://remote.invalid?secret=x"), Secret), new(new("https://remote.invalid"), "spaces are forbidden") })
        { try { using var invalid = new SignalClient(options); throw new Exception("Unsafe Signal configuration accepted"); } catch (PolymorfaConfigurationException) { } }
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        try { await client.SessionsAsync(cancelled.Token); throw new Exception("Cancellation ignored"); } catch (PolymorfaCancelledException) { }
        if(Environment.GetEnvironmentVariable("POLYMORFA_SIGNAL_FIXTURE_DIRECTORY") is {}directory)await ActualService(directory);
        Console.WriteLine("PASS native Signal app auth, SSE manual ACK, exact webhook MAC, errors, redirects and cancellation");
    }
    private static async Task ActualService(string directory)
    {
        using var metadata=JsonDocument.Parse(await File.ReadAllBytesAsync(Path.Combine(directory,"metadata.json")));var meta=metadata.RootElement;ResourceTests.Equal(meta.GetProperty("sourceCommit").GetString(),SignalClient.ServiceContract);ResourceTests.True(meta.GetProperty("syntheticOnly").GetBoolean());var url=new Uri(meta.GetProperty("url").GetString()!);var secret=meta.GetProperty("applicationSecret").GetString()!;using var client=new SignalClient(new(url,secret));var sessions=await client.SessionsAsync();ResourceTests.Equal(sessions.Sessions[0].Id,meta.GetProperty("sessionId").GetString());ResourceTests.True(sessions.Sessions[0].Claimed);
        using var wrong=new SignalClient(new(url,"incorrect-synthetic-application-secret"));try{await wrong.SessionsAsync();throw new Exception("Incorrect app secret accepted");}catch(PolymorfaAuthenticationException){}
        using var http=new HttpClient();using var origin=new HttpRequestMessage(HttpMethod.Get,new Uri(url,"/v1/sessions"));origin.Headers.Authorization=new("Bearer",secret);origin.Headers.Add("Origin","null");using var rejected=await http.SendAsync(origin);ResourceTests.Equal((int)rejected.StatusCode,403);using var health=JsonDocument.Parse(await http.GetStringAsync(new Uri(url,"/healthz")));ResourceTests.Equal(health.RootElement.GetProperty("status").GetString(),"ok");if(Environment.GetEnvironmentVariable("POLYMORFA_SIGNAL_FIXTURE_INJECT")=="1")await ActualEvent(client,directory,meta.GetProperty("sessionId").GetString()!);Console.WriteLine("PASS actual Signal service8aa HTTP: native sessions, application401, Origin403 and public liveness");
    }

    private static async Task ActualEvent(SignalClient client,string directory,string session)
    {
        var receipt=Path.Combine(directory,"receipt.json");File.Delete(receipt);var id="csharp-native-"+Guid.NewGuid().ToString("N");using var deadline=new CancellationTokenSource(TimeSpan.FromSeconds(4));await using var events=client.EventsAsync(session,deadline.Token).GetAsyncEnumerator();var next=events.MoveNextAsync().AsTask();await Task.Delay(100);await File.WriteAllBytesAsync(Path.Combine(directory,"inject.json"),JsonSerializer.SerializeToUtf8Bytes(new{messageId=id,text="csharp-native-synthetic"}));ResourceTests.True(await next);var item=events.Current;ResourceTests.Equal(item.MessageId,id);ResourceTests.Equal(item.Text,"csharp-native-synthetic");ResourceTests.Equal(item.Timestamp,1720000000L);ResourceTests.Equal(item.SenderAlt,"123456@lid");ResourceTests.True(item.MessageProto.Length>0);ResourceTests.True(!File.Exists(receipt));
        var body=JsonSerializer.SerializeToUtf8Bytes(new{item.Id,item.MessageProto,item.Text});using(var file=new FileStream(Path.Combine(directory,"csharp-received.json"),FileMode.Create,FileAccess.Write,FileShare.None)){file.Write(body);file.Flush(flushToDisk:true);}await client.AcknowledgeAsync(item.Id);while(!File.Exists(receipt)){await Task.Delay(10,deadline.Token);}using var saved=JsonDocument.Parse(await File.ReadAllBytesAsync(receipt));ResourceTests.True(saved.RootElement.GetProperty("acknowledged").GetBoolean());Console.WriteLine("PASS actual service real encrypted Receive -> C# native SSE plaintext/protobuf -> durable caller file -> manual ACK -> service mark_delivered");
    }

}
