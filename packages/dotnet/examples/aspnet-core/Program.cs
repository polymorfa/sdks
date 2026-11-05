using System.Collections.Concurrent;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Polymorfa.Sdk;

var applicationSessions = new ConcurrentDictionary<string, DateTimeOffset>();
var builder = WebApplication.CreateBuilder(args);
var session = builder.Configuration["POLYMORFA_SESSION"] ?? throw new InvalidOperationException("POLYMORFA_SESSION is required.");
var peer = builder.Configuration["POLYMORFA_RECIPIENT"] ?? throw new InvalidOperationException("POLYMORFA_RECIPIENT is required.");
if (string.IsNullOrWhiteSpace(peer)) throw new InvalidOperationException("An assigned recipient is required.");
var conversation = new NativeConversation(session, peer, builder.Configuration["POLYMORFA_EXAMPLE_TRANSPORT"] == "local-test-number");
builder.Services.AddSingleton(new MessagingClient(builder.Configuration["POLYMORFA_PROJECT_TOKEN"] is { Length: > 0 } projectToken ? Credential.ProjectToken(projectToken) : Credential.OrganizationApiKey(builder.Configuration["POLYMORFA_API_KEY"] ?? throw new InvalidOperationException("Configure a server project token or organization API key.")), new() { BaseUrl = new(builder.Configuration["POLYMORFA_API_BASE_URL"] ?? "https://api.polymorfa.com") }));
// Replace this application's cookie sign-in with your own identity provider.
builder.Services.AddDataProtection().UseEphemeralDataProtectionProvider();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options =>
{
    options.Cookie.Name = "polymorfa-example"; options.Cookie.HttpOnly = true; options.Cookie.SameSite = SameSiteMode.Strict;
    options.Events.OnValidatePrincipal = context =>
    {
        var id = context.Principal?.FindFirstValue("example_session");
        if (id is null || !applicationSessions.TryGetValue(id, out var expires) || expires <= DateTimeOffset.UtcNow) context.RejectPrincipal();
        return Task.CompletedTask;
    };
    options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; };
    options.Events.OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; };
});
builder.Services.AddAuthorization(options => options.AddPolicy("PolymorfaSession", policy => policy.RequireAuthenticatedUser().RequireClaim("polymorfa_session", session)));
var app = builder.Build();
var staticTypes = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
staticTypes.Mappings[".dat"] = "application/octet-stream"; // Blazor globalization data.
app.UseDefaultFiles(); app.UseStaticFiles(new StaticFileOptions { ContentTypeProvider = staticTypes }); app.UseAuthentication(); app.UseAuthorization();
// A local example sign-in only. No route exists outside Development or without a configured password.
if (app.Environment.IsDevelopment() && app.Configuration["POLYMORFA_EXAMPLE_PASSWORD"] is { Length: > 0 } password)
{
    app.MapPost("/example/login", async (HttpContext context) =>
    {
        if (context.Request.Headers.Origin.ToString() != $"{context.Request.Scheme}://{context.Request.Host}" || context.Request.ContentLength > 4096) return Results.StatusCode(403);
        var maximum = context.Features.Get<Microsoft.AspNetCore.Http.Features.IHttpMaxRequestBodySizeFeature>(); if (maximum is { IsReadOnly: false }) maximum.MaxRequestBodySize = 4096;
        if (!context.Request.HasFormContentType) return Results.StatusCode(415);
        var form = await context.Request.ReadFormAsync(context.RequestAborted);
        if (!CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(form["password"].ToString())), SHA256.HashData(Encoding.UTF8.GetBytes(password)))) return Results.Unauthorized();
        // Both identity and session belong to this server configuration, never to the submitted form.
        foreach (var prior in applicationSessions.Where(entry => entry.Value <= DateTimeOffset.UtcNow)) applicationSessions.TryRemove(prior.Key, out _);
        if (applicationSessions.Count >= 128) return Results.StatusCode(429);
        var applicationId = Guid.NewGuid().ToString("N"); applicationSessions[applicationId] = DateTimeOffset.UtcNow.AddMinutes(20);
        var identity = new ClaimsIdentity(new[] { new Claim("example_session", applicationId), new Claim(ClaimTypes.NameIdentifier, "example-operator"), new Claim("polymorfa_session", session) }, CookieAuthenticationDefaults.AuthenticationScheme);
        await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity));
        context.Response.Headers.CacheControl = "no-store"; return Results.NoContent();
    });
    app.MapPost("/example/logout", async (HttpContext context) => { if (context.Request.Headers.Origin.ToString() != $"{context.Request.Scheme}://{context.Request.Host}") return Results.StatusCode(403); if (context.User.FindFirstValue("example_session") is { } id) applicationSessions.TryRemove(id, out _); await context.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme); return Results.NoContent(); });
}
app.MapGet("/example/config", () => Results.Json(new { apiBaseUrl = app.Configuration["POLYMORFA_API_BASE_URL"] ?? "https://api.polymorfa.com" }));
app.MapPost("/api/polymorfa/token", async (HttpContext context, MessagingClient client) =>
{
    if (context.Request.Headers.Origin.ToString() != $"{context.Request.Scheme}://{context.Request.Host}") return Results.StatusCode(403);
    var subject = context.User.FindFirstValue(ClaimTypes.NameIdentifier);
    if (string.IsNullOrEmpty(subject)) return Results.StatusCode(403);
    context.Response.Headers.CacheControl = "no-store";
    try
    {
        var response = await client.ClientTokens.MintAsync(new("example:" + subject, Session: session, TtlSeconds: 300), new() { CancellationToken = context.RequestAborted });
        if (!response.Data.Data.Token.StartsWith("pmfa_ct_", StringComparison.Ordinal) || response.Data.Data.Token.Length <= 8 || !DateTimeOffset.TryParse(response.Data.Data.ExpiresAt, out var expiry)) return Results.StatusCode(502);
        return Results.Json(new { value = response.Data.Data.Token, audience = "browser", expiresAt = expiry.ToUnixTimeMilliseconds(), scopes = new[] { "read_messages", "connect_whatsapp" }, grant = new { session, conversations = Array.Empty<string>(), allow = new[] { "read_messages", "connect_whatsapp" } } });
    }
    catch (PolymorfaException error) { return Results.StatusCode(error.Status is >= 400 and < 500 ? 403 : 502); }
}).RequireAuthorization("PolymorfaSession");
app.MapGet("/api/polymorfa/conversation", (HttpContext context) => { context.Response.Headers.CacheControl = "no-store"; return Results.Json(conversation.Snapshot()); }).RequireAuthorization("PolymorfaSession");
app.MapPost("/api/polymorfa/send", async (HttpContext context, MessagingClient client) =>
{
    if (context.Request.Headers.Origin.ToString() != $"{context.Request.Scheme}://{context.Request.Host}") return Results.StatusCode(403);
    if (context.Request.ContentLength > 16384) return Results.StatusCode(413);
    using var body = new MemoryStream(); var buffer = new byte[4096];
    while (true) { var count = await context.Request.Body.ReadAsync(buffer, context.RequestAborted); if (count == 0) break; if (body.Length + count > 16384) return Results.StatusCode(413); await body.WriteAsync(buffer.AsMemory(0, count), context.RequestAborted); }
    context.Response.Headers.CacheControl = "no-store";
    return await conversation.SendAsync(client, body.ToArray(), context.Request.Headers["Idempotency-Key"].ToString(), context.RequestAborted);
}).RequireAuthorization("PolymorfaSession");
// Separate browser-grant examples retain their original empty source. The native inbox uses /conversation.
app.MapGet("/api/polymorfa/history/conversations", (HttpContext context) => { context.Response.Headers.CacheControl = "no-store"; return Results.Json(new { data = Array.Empty<object>(), nextCursor = (string?)null }); }).RequireAuthorization("PolymorfaSession");
app.MapPost("/api/polymorfa/connect", async (HttpContext context, MessagingClient client) =>
{
    if (context.Request.Headers.Origin.ToString() != $"{context.Request.Scheme}://{context.Request.Host}") return Results.StatusCode(403);
    context.Response.Headers.CacheControl = "no-store";
    try { var response = await client.QuickLinks.CreateAsync(new(Purpose: "add_connection", Session: session, AddConnection: "linked_devices", ConnectionGoal: "hybrid"), new() { CancellationToken = context.RequestAborted }); return Results.Json(new { data = new { response.Data.Data.Id, response.Data.Data.Url, response.Data.Data.ExpiresAt } }); }
    catch (PolymorfaException error) { return Results.StatusCode(error.Status is >= 400 and < 500 ? 403 : 502); }
}).RequireAuthorization("PolymorfaSession");
app.MapPost("/webhooks/polymorfa", async (HttpContext context) =>
{
    if (context.Request.ContentLength > 65536) return Results.StatusCode(413);
    using var body = new MemoryStream(); var buffer = new byte[16384];
    while (true) { var count = await context.Request.Body.ReadAsync(buffer, context.RequestAborted); if (count == 0) break; if (body.Length + count > 65536) return Results.StatusCode(413); await body.WriteAsync(buffer.AsMemory(0, count), context.RequestAborted); }
    var secret = app.Configuration["POLYMORFA_WEBHOOK_SECRET"];
    if (string.IsNullOrEmpty(secret)) return Results.StatusCode(503);
    try { var verified = Webhooks.ConstructEvent(body.ToArray(), context.Request.Headers["x-webhook-signature"].ToString(), secret); conversation.Receive(verified); return Results.NoContent(); }
    catch (WebhookSignatureException) { return Results.StatusCode(401); }
    catch (PolymorfaValidationException) { return Results.BadRequest(); }
    catch (OverflowException) { return Results.BadRequest(); }
});
app.Run();
