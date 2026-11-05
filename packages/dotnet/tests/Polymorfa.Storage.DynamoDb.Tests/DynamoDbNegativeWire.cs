using Amazon.DynamoDBv2;
using Amazon.Runtime;
using Polymorfa.Sdk.Storage;
using Polymorfa.Storage.DynamoDb;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Text.Json.Nodes;
internal static class DynamoDbNegativeWire
{
    internal static async Task Run()
    {
        foreach (var mode in new[] { "namespace", "identity", "number", "missing", "duplicate", "unprocessed", "cursor" })
        {
            using var listener = new TcpListener(IPAddress.Loopback, 0); listener.Start(); var endpoint = $"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}";
            var item = JsonNode.Parse("""{"pk":{"S":"app:messages"},"sk":{"S":"ks:m"},"row":{"M":{"_id":{"S":"ks:m"},"_rev":{"N":"1"},"_v":{"M":{}},"sessionId":{"S":"s"},"messageId":{"S":"m"}}}}""")!;
            switch (mode) { case "namespace": item["pk"]!["S"] = "foreign:messages"; break; case "identity": item["row"]!["M"]!["_id"]!["S"] = "ks:other"; break; case "number": item["row"]!["M"]!["_rev"]!["N"] = "true"; break; case "missing": item["row"]!["M"]!.AsObject().Remove("_id"); break; }
            var response = mode switch { "duplicate" => new JsonObject { ["Responses"] = new JsonObject { ["table"] = new JsonArray(item.DeepClone(), item.DeepClone()) } }, "unprocessed" => JsonNode.Parse("""{"UnprocessedKeys":{"foreign-table":{"Keys":[{"pk":{"S":"app:messages"},"sk":{"S":"ks:m"}}]}}}""")!, "cursor" => JsonNode.Parse("""{"Items":[],"LastEvaluatedKey":{"pk":{"S":"app:messages"},"sk":{"S":"ks:m"}}}""")!, _ => new JsonObject { ["Responses"] = new JsonObject { ["table"] = new JsonArray(item.DeepClone()) } } }; var body = response.ToJsonString();
            var server = Task.Run(async () =>
            {
                using var socket = await listener.AcceptTcpClientAsync(); await using var stream = socket.GetStream(); using var raw = new MemoryStream(); var buffer = new byte[1]; while (await stream.ReadAsync(buffer) > 0) { raw.Write(buffer); if (raw.Length >= 4 && Encoding.ASCII.GetString(raw.GetBuffer(), (int)raw.Length - 4, 4) == "\r\n\r\n") break; }
                var head = Encoding.ASCII.GetString(raw.ToArray()).ToLowerInvariant(); if (!head.Contains("authorization: aws4-hmac-sha256", StringComparison.Ordinal) || new[] { "pmfa_", "cookie:", "origin:", "polymorfa-version:" }.Any(x => head.Contains(x, StringComparison.Ordinal))) throw new Exception("DynamoDB request inherited an unrelated credential/header."); var length = int.Parse(head.Split("\r\n").Single(l => l.StartsWith("content-length:", StringComparison.Ordinal)).Split(':', 2)[1].Trim(), System.Globalization.CultureInfo.InvariantCulture); var bytes = new byte[length]; await stream.ReadExactlyAsync(bytes); await stream.WriteAsync(Encoding.UTF8.GetBytes($"HTTP/1.1 200 OK\r\nContent-Type: application/x-amz-json-1.0\r\nContent-Length: {Encoding.UTF8.GetByteCount(body)}\r\nConnection: close\r\n\r\n{body}")); socket.Close(); using var stop = new CancellationTokenSource(TimeSpan.FromMilliseconds(150)); try { using var extra = await listener.AcceptTcpClientAsync(stop.Token); throw new Exception("Invalid DynamoDB response triggered another provider request."); } catch (OperationCanceledException) when (stop.IsCancellationRequested) { }
            });
            using var client = new AmazonDynamoDBClient(new BasicAWSCredentials("synthetic-test-access", "synthetic-test-secret"), new AmazonDynamoDBConfig { ServiceURL = endpoint, AuthenticationRegion = "us-east-1", MaxErrorRetry = 0, HttpClientFactory = new StrictHttp() }); var adapter = new DynamoDbStorageAdapter(client, new("app", "table"));
            try { if (mode == "cursor") await adapter.QueryAsync(StorageEntity.Messages, new("by_chat", new Dictionary<string, string> { { "sessionId", "s" }, { "chatId", "chat" } }, 1)); else await adapter.GetAsync(StorageEntity.Messages, new[] { "ks:m" }); throw new Exception("Corrupt DynamoDB response accepted: " + mode); } catch (StorageProviderException) { }
            await server;
        }
        Console.WriteLine("PASS native AWS HTTP rejects foreign/duplicate/corrupt rows, unprocessed keys and nonprogressing cursor before another request");
    }
}
