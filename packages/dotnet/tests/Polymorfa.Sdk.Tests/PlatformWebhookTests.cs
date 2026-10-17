using Polymorfa.Sdk;

internal static class PlatformWebhookTests
{
    private const string Receipt = """{"id":"idem1","key":"key1","replayed":false,"createdAt":"2026-09-22T00:00:00Z","expiresAt":"2026-09-23T00:00:00Z"}""";
    private const string Webhook = """{"id":"w1","organizationId":"org1","owner":"organization","projectId":null,"url":"https://customer.example/hooks","eventTypes":["message.received"],"enabled":false,"format":"native","retryPolicy":{"maximumAttempts":3,"backoff":"exponential","initialDelaySeconds":10},"headers":[{"name":"X-Customer"}],"secret":{"version":2,"createdAt":"2026-09-22T00:00:00Z","previousValidUntil":null},"createdAt":"2026-09-22T00:00:00Z","updatedAt":"2026-09-22T00:00:00Z"}""";
    private const string Delivery = """{"id":"d1","organizationId":"org1","projectId":null,"eventId":"e1","webhookId":"w1","status":"failed","attemptCount":2,"capabilities":{"retryable":true},"payloadAvailability":"available","replayableUntil":"2026-09-23T00:00:00Z","metadataExpiresAt":"2026-10-22T00:00:00Z","nextAttemptAt":null,"lastAttemptAt":"2026-09-22T00:00:00Z","completedAt":"2026-09-22T00:00:01Z","createdAt":"2026-09-22T00:00:00Z","updatedAt":"2026-09-22T00:00:01Z","lastOutcome":{"statusCode":500,"errorCode":null}}""";
    private const string Attempt = """{"id":"a1","organizationId":"org1","projectId":null,"deliveryId":"d1","number":2,"status":"failed","startedAt":"2026-09-22T00:00:00Z","completedAt":"2026-09-22T00:00:01Z","nextRetryAt":null,"durationMs":12.5,"statusCode":500,"errorCode":null,"response":{"contentType":"text/plain","excerpt":"[redacted] upstream failure","truncated":true},"metadataExpiresAt":"2026-10-22T00:00:00Z"}""";
    private const string Creation = "{\"data\":{\"webhook\":" + Webhook + ",\"operationId\":null,\"idempotency\":" + Receipt + ",\"secret\":\"secret-once\",\"secretAvailable\":true}}";
    private const string Mutation = "{\"data\":{\"webhook\":" + Webhook + ",\"operationId\":null,\"idempotency\":" + Receipt + "}}";
    private const string Deletion = "{\"data\":{\"webhookId\":\"w1\",\"deleted\":true,\"operationId\":null,\"idempotency\":" + Receipt + "}}";
    private const string Rotation = "{\"data\":{\"webhookId\":\"w1\",\"operationId\":null,\"secret\":null,\"secretAvailable\":false,\"secretMetadata\":{\"version\":3,\"createdAt\":\"2026-09-22\",\"previousValidUntil\":\"2026-09-23\"},\"idempotency\":" + Receipt + "}}";
    private const string Replay = "{\"data\":{\"eventId\":\"e1\",\"deliveryId\":\"d1\",\"operationId\":\"op1\",\"idempotency\":" + Receipt + "}}";
    private const string Retry = "{\"data\":{\"deliveryId\":\"d1\",\"attemptId\":\"a1\",\"operationId\":\"op1\",\"idempotency\":" + Receipt + "}}";
    public static async Task RunAsync()
    {
        await Organization("GET", "/platform/webhooks?eventType=message.received&enabled=false&limit=2", null, Page(Webhook), async c => ResourceTests.True(!(await c.Webhooks.ListAsync(new("message.received", false, 2))).Items[0].Enabled));
        await Organization("POST", "/platform/webhooks", "{\"url\":\"https://customer.example/hooks\",\"eventTypes\":[],\"enabled\":false,\"headers\":[]}", Creation, async c => { var receipt = (await c.Webhooks.CreateAsync(new("https://customer.example/hooks", [], false, Headers: []))).Data; ResourceTests.Equal(receipt.Secret, "secret-once"); ResourceTests.True(!receipt.ToString().Contains("secret-once")); });
        await Organization("GET", "/platform/webhooks/w1", null, Envelope(Webhook), async c => ResourceTests.Equal((await c.Webhooks.RetrieveAsync("w1")).Data.Secret.Version, 2));
        await Organization("PATCH", "/platform/webhooks/w1", "{\"eventTypes\":[],\"enabled\":false}", Mutation, async c => ResourceTests.Equal((await c.Webhooks.UpdateAsync("w1", new(EventTypes: [], Enabled: false))).Data.Idempotency.Key, "key1"));
        await Organization("DELETE", "/platform/webhooks/w1", null, Deletion, async c => ResourceTests.True((await c.Webhooks.DeleteAsync("w1")).Data.Deleted));
        await Organization("POST", "/platform/webhooks/w1/tests", "{}", Replay, async c => ResourceTests.Equal((await c.Webhooks.TestAsync("w1")).Data.OperationId, "op1"));
        await Organization("POST", "/platform/webhooks/w1/secret-rotations", "{\"overlapSeconds\":0}", Rotation, async c => ResourceTests.True((await c.Webhooks.RotateSecretAsync("w1", new(0))).Data.Secret is null));
        await Organization("GET", "/platform/webhook-deliveries?webhookId=w1&eventId=e1&status=failed&limit=2", null, Page(Delivery), async c => ResourceTests.Equal((await c.WebhookDeliveries.ListAsync(new("w1", "e1", "failed", Limit: 2))).Items[0].LastOutcome!.StatusCode, 500));
        await Organization("GET", "/platform/webhook-deliveries/d1", null, Envelope(Delivery), async c => ResourceTests.True((await c.WebhookDeliveries.RetrieveAsync("d1")).Data.Capabilities.Retryable));
        await Organization("GET", "/platform/webhook-deliveries/d1/attempts?limit=2", null, Page(Attempt), async c => ResourceTests.Equal((await c.WebhookDeliveries.ListAttemptsAsync("d1", new(2))).Items[0].DurationMs, 12.5));
        await Organization("GET", "/platform/webhook-deliveries/d1/attempts/a1", null, Envelope(Attempt), async c => ResourceTests.True((await c.WebhookDeliveries.RetrieveAttemptAsync("d1", "a1")).Data.Response!.Truncated));
        await Organization("POST", "/platform/webhook-deliveries/d1/retry", "{}", Retry, async c => ResourceTests.Equal((await c.WebhookDeliveries.RetryAsync("d1")).Data.AttemptId, "a1"));
        await Organization("GET", "/platform/projects/p1/webhooks", null, Project(Page(Webhook)), async c => ResourceTests.Equal((await c.Project("p1").Webhooks.ListAsync()).Items[0].ProjectId, "p1"));
        await Organization("POST", "/platform/projects/p1/webhooks", "{\"url\":\"https://customer.example/hooks\",\"eventTypes\":[\"message.received\"]}", Project(Creation), async c => ResourceTests.Equal((await c.Project("p1").Webhooks.CreateAsync(new("https://customer.example/hooks", ["message.received"]))).Data.Webhook.Owner, "project"));
        await Organization("GET", "/platform/projects/p1/webhooks/w1", null, Project(Envelope(Webhook)), async c => ResourceTests.Equal((await c.Project("p1").Webhooks.RetrieveAsync("w1")).Data.ProjectId, "p1"));
        await Organization("PATCH", "/platform/projects/p1/webhooks/w1", "{\"headers\":[{\"name\":\"X-Customer\",\"value\":\"configured\"}]}", Project(Mutation), async c => ResourceTests.Equal((await c.Project("p1").Webhooks.UpdateAsync("w1", new(Headers: [new("X-Customer", "configured")]))).Data.Webhook.Headers[0].Name, "X-Customer"));
        await Organization("DELETE", "/platform/projects/p1/webhooks/w1", null, Deletion, async c => ResourceTests.True((await c.Project("p1").Webhooks.DeleteAsync("w1")).Data.Deleted));
        await Organization("POST", "/platform/projects/p1/webhooks/w1/tests", "{\"body\":{\"encoding\":\"base64\",\"data\":\"e30=\",\"contentType\":\"application/json\"},\"sessionId\":\"s1\",\"eventType\":\"message.received\"}", Replay, async c => ResourceTests.Equal((await c.Project("p1").Webhooks.TestAsync("w1", new TestProjectWebhookPayloadInput(new("base64", "e30="), "s1", "message.received"))).Data.DeliveryId, "d1"));
        await Organization("POST", "/platform/projects/p1/webhooks/w1/secret-rotations", "{}", Rotation, async c => ResourceTests.Equal((await c.Project("p1").Webhooks.RotateSecretAsync("w1")).Data.SecretMetadata.Version, 3));
        await Organization("GET", "/platform/projects/p1/webhook-deliveries", null, Project(Page(Delivery)), async c => ResourceTests.Equal((await c.Project("p1").WebhookDeliveries.ListAsync()).Items[0].ProjectId, "p1"));
        await Organization("GET", "/platform/projects/p1/webhook-deliveries/d1", null, Project(Envelope(Delivery)), async c => ResourceTests.Equal((await c.Project("p1").WebhookDeliveries.RetrieveAsync("d1")).Data.AttemptCount, 2));
        await Organization("GET", "/platform/projects/p1/webhook-deliveries/d1/attempts", null, Project(Page(Attempt)), async c => ResourceTests.Equal((await c.Project("p1").WebhookDeliveries.ListAttemptsAsync("d1")).Items[0].ProjectId, "p1"));
        await Organization("GET", "/platform/projects/p1/webhook-deliveries/d1/attempts/a1", null, Project(Envelope(Attempt)), async c => ResourceTests.Equal((await c.Project("p1").WebhookDeliveries.RetrieveAttemptAsync("d1", "a1")).Data.Response!.Excerpt, "[redacted] upstream failure"));
        await Organization("POST", "/platform/projects/p1/webhook-deliveries/d1/retry", "{}", Retry, async c => ResourceTests.Equal((await c.Project("p1").WebhookDeliveries.RetryAsync("d1")).Data.OperationId, "op1"));
        using var client = new OrganizationClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72)));
        try { await client.Webhooks.TestAsync("w1", new TestProjectWebhookPayloadInput(new("base64", "e30="), "s1")); throw new Exception("Organization payload accepted"); } catch (PolymorfaValidationException) { }
        Console.WriteLine("PASS 24 typed organization/project webhook and delivery routes, headers, redacted receipts and test scope");
    }
    private static string Page(string item) => "{\"data\":[" + item + "],\"page\":{\"nextCursor\":null,\"hasMore\":false}}";
    private static string Envelope(string item) => "{\"data\":" + item + "}";
    private static string Project(string input) => input.Replace("\"projectId\":null", "\"projectId\":\"p1\"").Replace("\"owner\":\"organization\"", "\"owner\":\"project\"");
    private static Task Organization(string method, string path, string? body, string response, Func<OrganizationClient, Task> invoke) => BillingTests.Organization(method, path, body, response, invoke);
}
