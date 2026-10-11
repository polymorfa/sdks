using System.Security.Claims;
using Polymorfa.Sdk;

var builder = WebApplication.CreateBuilder(args);
var session = builder.Configuration["POLYMORFA_SESSION"] ?? throw new InvalidOperationException("POLYMORFA_SESSION is required.");
builder.Services.AddSingleton(new MessagingClient(Credential.OrganizationApiKey(builder.Configuration["POLYMORFA_API_KEY"] ?? throw new InvalidOperationException("POLYMORFA_API_KEY is required."))));
// Add your application's authentication scheme here. This example has no anonymous token path.
builder.Services.AddAuthentication();
builder.Services.AddAuthorization(options => options.AddPolicy("PolymorfaSession", policy => policy.RequireAuthenticatedUser().RequireClaim("polymorfa_session", session)));
var app = builder.Build();
app.UseStaticFiles(); app.UseAuthentication(); app.UseAuthorization();
app.MapPost("/api/polymorfa/token", async (HttpContext context, MessagingClient client) =>
{
    if (context.Request.Headers.Origin.ToString() != $"{context.Request.Scheme}://{context.Request.Host}") return Results.StatusCode(403);
    var subject = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (string.IsNullOrEmpty(subject)) return Results.StatusCode(403);
    context.Response.Headers.CacheControl = "no-store";
    var response = await client.ClientTokens.MintAsync(new(subject, Session: session, TtlSeconds: 300), new() { CancellationToken = context.RequestAborted });
    return Results.Json(new { value = response.Data.Data.Token, audience = "browser", expiresAt = DateTimeOffset.Parse(response.Data.Data.ExpiresAt, System.Globalization.CultureInfo.InvariantCulture).ToUnixTimeMilliseconds() });
}).RequireAuthorization("PolymorfaSession");
app.MapPost("/webhooks/polymorfa", async (HttpContext context) =>
{
    if (context.Request.ContentLength > 1024 * 1024) return Results.StatusCode(413);
    using var body = new MemoryStream(); var buffer = new byte[16384];
    while (true) { var count = await context.Request.Body.ReadAsync(buffer, context.RequestAborted); if (count == 0) break; if (body.Length + count > 1024 * 1024) return Results.StatusCode(413); await body.WriteAsync(buffer.AsMemory(0, count), context.RequestAborted); }
    var secret = app.Configuration["POLYMORFA_WEBHOOK_SECRET"];
    if (string.IsNullOrEmpty(secret)) return Results.StatusCode(503);
    try { var verified = Webhooks.ConstructEvent(body.ToArray(), context.Request.Headers["x-webhook-signature"].ToString(), secret); /* Persist and deduplicate verified.Envelope.Id before enqueueing application work. */ return Results.NoContent(); }
    catch (WebhookSignatureException) { return Results.StatusCode(401); }
    catch (PolymorfaValidationException) { return Results.BadRequest(); }
});
app.Run();
