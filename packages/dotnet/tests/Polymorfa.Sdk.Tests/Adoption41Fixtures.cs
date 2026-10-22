// Independent response fixtures follow API f97 schema/row-to-wire and final
// TypeScript c944 public contracts. They are not serialized SDK model instances.
internal static class Adoption41Fixtures
{
    internal const string Project = "11111111-1111-4111-8111-111111111111";
    internal const string CampaignJson = """{"id":"c","name":"Campaign","status":"draft","templateId":null,"recipientListId":null,"recipientCount":0,"sentCount":0,"deliveredCount":0,"readCount":0,"failedCount":0,"skippedCount":0,"scheduledAt":null,"launchedAt":null,"completedAt":null,"createdAt":0,"updatedAt":0,"sendWindow":null,"trackedLinks":[],"experimentOutcome":null,"followUp":null}""";
    internal const string FollowUps = """{"total":0,"waiting":0,"scheduled":0,"sending":0,"sent":0,"delivered":0,"read":0,"replied":0,"cancelled":0,"expired":0,"failed":0,"unknown":0,"nextDueAt":null}""";
    internal const string Analytics = """{"campaignId":"c","recipientCount":0,"sentCount":0,"deliveredCount":0,"readCount":0,"failedCount":0,"skippedCount":0,"respondedCount":0,"responseRate":0,"averageResponseTimeMs":null,"minResponseTimeMs":null,"maxResponseTimeMs":null,"experiment":null,"followUps":FEED}""";
    internal static string Report => Analytics.Replace("FEED", FollowUps);
    internal const string Recipient = """{"id":"r","phone":"+15550001111","variables":{},"variantKey":null,"status":"queued","attempts":0,"lastError":null,"failureReason":null,"externalMessageId":null,"queuedAt":0,"sentAt":null,"deliveredAt":null,"readAt":null,"failedAt":null,"respondedAt":null,"messagesSent":0,"nextMessageAt":null,"sequenceError":null,"followUp":null}""";
    internal const string Config = """{"requestedHistory":{"mode":"deliver","requestFull":false,"delivery":"descriptor"},"effective":{"historySync":{"mode":"metadata_only","requestFull":false,"delivery":"descriptor"},"observation":{"presenceMode":"off","typingMode":"events","labelMode":"cache","quickReplyMode":"off"},"hms":{"enabled":false}},"overrides":{"historySync":{"delivery":"descriptor"}},"sources":{"historySync.mode":"consent","historySync.requestFull":"consent","historySync.delivery":"platform","hms":"platform","observation.presenceMode":"platform","observation.typingMode":"platform","observation.labelMode":"platform","observation.quickReplyMode":"platform"},"revisions":{"team":0,"project":0,"session":0},"historyConsent":"pending"}""";
    internal const string SessionJson = """{"sessionId":"s","name":"Support","externalId":null,"tenantId":"team","type":"linked_device","testMode":false,"status":"connected","statusReason":null,"createdAt":"2026-10-14","updatedAt":"2026-10-14","signalMode":"zero_knowledge"}""";
    internal const string QuickLinkJson = """{"id":"q","url":"https://example.test/q","purpose":"initial","session":"s","connectionGoal":"hybrid","expiresAt":null}""";
    internal const string Added = """{"campaignId":"c","added":0,"recipientCount":0,"duplicateCount":0,"invalidCount":0,"invalidRows":[]}""";
    internal static string Envelope(string data, bool messaging = true) => (messaging ? "{\"success\":true,\"data\":" : "{\"data\":") + data + "}";
}
