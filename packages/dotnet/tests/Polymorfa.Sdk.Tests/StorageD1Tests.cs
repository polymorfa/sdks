using Polymorfa.Sdk;
using Polymorfa.Sdk.Storage;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Security.Cryptography;
internal static class StorageD1Tests
{
    private static D1BridgeOptions Options(string url)=>new(new(url),"fixture-customer-a","bridge_a_","synthetic_D1_bridge_fixture_secret_only_20261015");
    private static IReadOnlyDictionary<string,string> Key(string session,string message)=>new Dictionary<string,string>{{"sessionId",session},{"messageId",message}};
    private static StorageUpsert Upsert(string session,string message,int timestamp)=>new(StorageEntity.Messages,Key(session,message),new Dictionary<string,StorageFieldWrite>{{"text",new(JsonSerializer.SerializeToElement(message),timestamp)},{"timestamp",new(JsonSerializer.SerializeToElement(timestamp),timestamp)},{"chatId",new(JsonSerializer.SerializeToElement("chat"),timestamp)}});
    internal static async Task RunAsync()
    {
        foreach(var url in new[]{"http://example.com/","https://example.com/base","https://user@example.com/","https://example.com/?a=1"})try{using var _=await D1BridgeStorageAdapter.ConnectAsync(Options(url));throw new Exception("Unsafe D1 configuration accepted");}catch(StorageValidationException){}
        foreach(var mode in new[]{"unsigned","redirect","stalled"})
        {
            using var listener=new TcpListener(IPAddress.Loopback,0);listener.Start();var url=$"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}/";var server=Task.Run(async()=>{using var client=await listener.AcceptTcpClientAsync();await using var stream=client.GetStream();using var raw=new MemoryStream();var b=new byte[1];while(await stream.ReadAsync(b)>0){raw.Write(b);if(raw.Length>=4&&Encoding.ASCII.GetString(raw.GetBuffer(),(int)raw.Length-4,4)=="\r\n\r\n")break;}var request=Encoding.UTF8.GetString(raw.ToArray());ResourceTests.True(!request.Contains("Origin:",StringComparison.OrdinalIgnoreCase));ResourceTests.True(!request.Contains("Cookie:",StringComparison.OrdinalIgnoreCase));ResourceTests.True(!request.Contains("pmfa_",StringComparison.Ordinal));string response;if(mode=="redirect")response="HTTP/1.1 307 Temporary Redirect\r\nLocation: https://invalid.example/private?secret=never-reflect\r\nContent-Length: 0\r\n\r\n";else if(mode=="stalled"){var nonce=request.Split("\r\n").Single(l=>l.StartsWith("Polymorfa-Storage-Nonce:",StringComparison.OrdinalIgnoreCase)).Split(':',2)[1].Trim();response=$"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nPolymorfa-Storage-Nonce: {nonce}\r\nContent-Length: 3\r\n\r\n{{";}else response="HTTP/1.1 403 Forbidden\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}";await stream.WriteAsync(Encoding.UTF8.GetBytes(response));if(mode=="stalled")await Task.Delay(300);});
            try{using var _=await D1BridgeStorageAdapter.ConnectAsync(Options(url)with{Timeout=TimeSpan.FromMilliseconds(80)});throw new Exception("Untrusted bridge accepted");}catch(StorageProviderException error){ResourceTests.True(!error.ToString().Contains("never-reflect",StringComparison.Ordinal));ResourceTests.True(!error.ToString().Contains("synthetic_",StringComparison.Ordinal));}await server;
        }
        await SignedNegatives();
        await SecretBoundaryAsync();
        if(Environment.GetEnvironmentVariable("POLYMORFA_D1_BRIDGE_URL") is {}live)await Actual(live);
        Console.WriteLine("PASS D1 bridge safe configuration, unsigned/redirect rejection and whole-body deadline");
    }
    // The application secret is independent of Polymorfa credentials: reserved pmfa_ prefixes
    // and out-of-range lengths fail before any request; independent secrets complete a signed handshake.
    internal static async Task SecretBoundaryAsync()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start();
        var url = $"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}/"; var calls = 0;
        using var stop = new CancellationTokenSource();
        var server = Task.Run(async () =>
        {
            while (!stop.IsCancellationRequested)
            {
                TcpClient client; try { client = await listener.AcceptTcpClientAsync(stop.Token); } catch (OperationCanceledException) { return; }
                using (client)
                {
                    Interlocked.Increment(ref calls);
                    await using var stream = client.GetStream(); using var raw = new MemoryStream(); var b = new byte[1];
                    while (await stream.ReadAsync(b) > 0) { raw.Write(b); if (raw.Length >= 4 && Encoding.ASCII.GetString(raw.GetBuffer(), (int)raw.Length - 4, 4) == "\r\n\r\n") break; }
                    var lines = Encoding.UTF8.GetString(raw.ToArray()).Split("\r\n");
                    string Header(string name) => lines.Single(l => l.StartsWith(name + ":", StringComparison.OrdinalIgnoreCase)).Split(':', 2)[1].Trim();
                    var nonce = Header("Polymorfa-Storage-Nonce"); var secret = Header("Authorization")["Bearer ".Length..];
                    var body = new JsonObject { ["contract"] = "polymorfa-d1-storage-v1", ["schemaVersion"] = 2, ["authority"] = "fixture-customer-a", ["tablePrefix"] = "bridge_a_", ["data"] = new JsonObject { ["atomicCommit"] = true, ["maxCommitSize"] = 50, ["maxGetSize"] = 1000, ["maxQuerySize"] = 1000, ["maxBodyBytes"] = 8388608, ["conditionalDeletes"] = true, ["setupAllowed"] = false } }.ToJsonString();
                    var signature = "v1=" + Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes($"{nonce}.200.{body}"))).ToLowerInvariant();
                    await stream.WriteAsync(Encoding.UTF8.GetBytes($"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nPolymorfa-Storage-Nonce: {nonce}\r\nPolymorfa-Storage-Signature: {signature}\r\nContent-Length: {Encoding.UTF8.GetByteCount(body)}\r\nConnection: close\r\n\r\n{body}"));
                }
            }
        });
        D1BridgeOptions With(string secret) => new(new(url), "fixture-customer-a", "bridge_a_", secret);
        var rejected = new[] { "pmfa_", "pmfa_pt_", "pmfa_ct_", "pmfa_ls_", "pmfa_at_", "pmfa_wst_", "pmfa_sd_" }.Select(p => p + "synthetic-fixture-value-0123456789").Concat(new[] { "pmfa_" + new string('x', 251), new string('x', 31), new string('x', 257) });
        foreach (var secret in rejected) try { using var _ = await D1BridgeStorageAdapter.ConnectAsync(With(secret)); throw new Exception("Reserved or out-of-range D1 secret accepted"); } catch (StorageValidationException error) { ResourceTests.True(!error.ToString().Contains(secret, StringComparison.Ordinal)); }
        ResourceTests.Equal(Volatile.Read(ref calls), 0);
        foreach (var secret in new[] { new string('x', 32), new string('x', 256), "PMFA_uppercase-is-not-reserved-0123456789", "xpmfa_not-a-prefix-fixture-0123456789" })
        { using var adapter = await D1BridgeStorageAdapter.ConnectAsync(With(secret)); ResourceTests.True(adapter.Capabilities.AtomicCommit); }
        ResourceTests.Equal(Volatile.Read(ref calls), 4);
        stop.Cancel(); await server;
        Console.WriteLine("PASS D1 application secret boundary: reserved and out-of-range secrets send no request");
    }
    private static async Task SignedNegatives()
    {
        foreach(var mode in new[]{"authority","prefix","schema","atomic","limit","deletes","nonce","tamper"})
        {
            using var listener=new TcpListener(IPAddress.Loopback,0);listener.Start();var url=$"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}/";var server=Task.Run(async()=>
            {
                using var client=await listener.AcceptTcpClientAsync();await using var stream=client.GetStream();using var raw=new MemoryStream();var b=new byte[1];while(await stream.ReadAsync(b)>0){raw.Write(b);if(raw.Length>=4&&Encoding.ASCII.GetString(raw.GetBuffer(),(int)raw.Length-4,4)=="\r\n\r\n")break;}var request=Encoding.UTF8.GetString(raw.ToArray());var nonce=request.Split("\r\n").Single(l=>l.StartsWith("Polymorfa-Storage-Nonce:",StringComparison.OrdinalIgnoreCase)).Split(':',2)[1].Trim();
                var envelope=new JsonObject{["contract"]="polymorfa-d1-storage-v1",["schemaVersion"]=2,["authority"]="fixture-customer-a",["tablePrefix"]="bridge_a_",["data"]=new JsonObject{["atomicCommit"]=true,["maxCommitSize"]=50,["maxGetSize"]=1000,["maxQuerySize"]=1000,["maxBodyBytes"]=8388608,["conditionalDeletes"]=true,["setupAllowed"]=false}};
                switch(mode){case "authority":envelope["authority"]="other";break;case "prefix":envelope["tablePrefix"]="other_";break;case "schema":envelope["schemaVersion"]=1;break;case "atomic":envelope["data"]!["atomicCommit"]=false;break;case "limit":envelope["data"]!["maxCommitSize"]=100;break;case "deletes":envelope["data"]!["conditionalDeletes"]=false;break;}
                var body=envelope.ToJsonString();var signature="v1="+Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(Options(url).ApplicationSecret),Encoding.UTF8.GetBytes($"{nonce}.200.{body}"))).ToLowerInvariant();if(mode=="tamper")body+=" ";var returnedNonce=mode=="nonce"?"wrong":nonce;var response=$"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nPolymorfa-Storage-Nonce: {returnedNonce}\r\nPolymorfa-Storage-Signature: {signature}\r\nContent-Length: {Encoding.UTF8.GetByteCount(body)}\r\n\r\n{body}";await stream.WriteAsync(Encoding.UTF8.GetBytes(response));
            });
            try{using var _=await D1BridgeStorageAdapter.ConnectAsync(Options(url));throw new Exception("Authenticated but invalid bridge accepted "+mode);}catch(StorageProviderException){}await server;
        }
    }
    private static async Task Actual(string url)
    {
        using var adapter=await D1BridgeStorageAdapter.ConnectAsync(Options(url));ResourceTests.True(adapter.Capabilities.AtomicCommit);ResourceTests.Equal(adapter.Capabilities.MaxCommitSize,50);await adapter.SetupAsync();var session="csharp-native-"+Guid.NewGuid().ToString("N");var store=new CustomerStorage(adapter);var first=new StorageBatch(session,new[]{Upsert(session,"first",1)},"first");ResourceTests.True((await store.ApplyAsync(first)).Applied);ResourceTests.True(!(await store.ApplyAsync(first)).Applied);
        var id=StorageSchema.EncodeKey(StorageEntity.Messages,Key(session,"first"));var current=(await adapter.GetAsync(StorageEntity.Messages,new[]{id}))[id];var created=StorageMerge.EmptyRow(StorageEntity.Messages,Key(session,"rollback"))with{Revision=1};ResourceTests.True(!(await adapter.CommitAsync(new StorageWrite[]{new StoragePut(StorageEntity.Messages,created,null),new StorageRowDelete(StorageEntity.Messages,id,current.Revision+1)})).Ok);ResourceTests.True(await store.GetAsync(StorageEntity.Messages,Key(session,"rollback")) is null);
        await Task.WhenAll(Enumerable.Range(2,4).Select(n=>store.ApplyAsync(new(session,new[]{Upsert(session,"first",n)}))));var huge=new StorageBatch(session,Enumerable.Range(0,2000).Select(n=>(StorageOperation)Upsert(session,n.ToString(System.Globalization.CultureInfo.InvariantCulture),n)).ToArray(),"history");ResourceTests.True((await store.ApplyAsync(huge)).Applied);ResourceTests.True(!(await store.ApplyAsync(huge)).Applied);
        var query=new StorageIndexQuery("by_chat",new Dictionary<string,string>{{"sessionId",session},{"chatId","chat"}},1000,Order:"asc");var page=await adapter.QueryAsync(StorageEntity.Messages,query);ResourceTests.Equal(page.Count,1000);var last=page[^1];var second=await adapter.QueryAsync(StorageEntity.Messages,query with{After=new(last.Fields["timestamp"].GetDouble(),last.Id)});ResourceTests.Equal(second.Count,1000);
        var checkpoint=new StorageBatch(session,new[]{new StorageCheckpoint(session,"events","saved",PatchValue<string>.Set(null),UpdatedAt:1)});await store.ApplyAsync(checkpoint);try{await store.ApplyAsync(checkpoint);throw new Exception("Stale checkpoint accepted");}catch(StorageCheckpointConflictException){}
        var clear=new StorageBatch(session,new StorageOperation[]{new StorageUpsert(StorageEntity.Chats,new Dictionary<string,string>{{"sessionId",session},{"chatId","chat"}},new Dictionary<string,StorageFieldWrite>{{"clearedAt",new(JsonSerializer.SerializeToElement(1000),1000)}}),new StorageClearChat(session,"chat",1000)},"clear");await store.ApplyAsync(clear);ResourceTests.Equal((await adapter.QueryAsync(StorageEntity.Messages,query)).Count,999);
        var late=Upsert(session,"late",1)with{Guard=new(session,"chat",1)};await store.ApplyAsync(new(session,new[]{late},"late"));ResourceTests.True(await store.GetAsync(StorageEntity.Messages,Key(session,"late")) is null);try{await adapter.CommitAsync(new[]{new StorageRowDelete(StorageEntity.Messages,StorageSchema.EncodeKey(StorageEntity.Messages,Key(session,"1001")))});throw new Exception("Unfenced unconditional delete accepted");}catch(StorageProviderException){}
        Console.WriteLine("PASS actual Worker D1 binding: signed native HTTP, all-row rollback, concurrent leases, replay, 2000 rows, paging, checkpoint CAS and fenced clear");
    }
}
