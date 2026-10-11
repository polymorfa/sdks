using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Polymorfa.Sdk;

internal static class WebhookTests
{
    public static void Run()
    {
        var linked = Parse<LinkedDeviceMessagePayload>("message.received", """{"id":"m1","whatsapp_ids":{"linked_devices":"wa1"},"conversation":{"id":"peer","sender":{"id":"lid","bsuid":"US.123"}},"fromMe":false,"timestamp":1726170122,"pushName":"Zoë 🐈","isGroup":true,"type":"text","text":"héllo","edited":false,"pollOptions":[{"name":"A","hash":"abc"}],"future":{"enabled":true}}""");
        Check(linked.WhatsAppIds.LinkedDevices == "wa1" && linked.Text == "héllo" && linked.Timestamp == 1726170122 && linked.Conversation.Sender?.Bsuid == "US.123" && linked.AdditionalFields?["future"].GetProperty("enabled").GetBoolean() == true, "linked-device payload");
        var cloud = Parse<CloudMessagePayload>("message.reaction", """{"id":"m2","whatsapp_ids":{"official_api":"wa2"},"conversation":{"id":"peer"},"timestamp":"1726170122","type":"interactive","senderName":"Zoë","nativeFlowResponse":{"name":"flow","paramsJson":"{\"choice\":false}","version":3},"referral":{"source_type":"ad","ctwa_clid":"click","future":"kept"},"interactive":{"button_reply":{"id":"yes"}}}""");
        Check(cloud.WhatsAppIds.OfficialApi == "wa2" && cloud.Timestamp == "1726170122" && cloud.NativeFlowResponse?.Version == 3 && cloud.Referral?.ClickId == "click" && cloud.Referral.AdditionalFields?["future"].GetString() == "kept", "cloud payload");
        var ack = Parse<MessageAckPayload>("message.ack", """{"messages":[{"id":"m1","whatsapp_ids":{"linked_devices":"wa1"}}],"conversation":{"id":"peer"},"type":"delivered","timestamp":1726170122,"pricing":{"billable":false,"pricing_model":"PMP","category":"utility"}}""");
        Check(ack.Messages[0].Id == "m1" && ack.Pricing?.Billable == false && ack.Pricing.PricingModel == "PMP", "ack payload");
        var group = Parse<GroupParticipantPayload>("group.participant", """{"id":"group","joined":[{"id":"peer","phoneNumber":"+15550001111"}],"failedParticipants":[{"participant":{"id":"other"},"errors":[{"code":131,"title":"Denied"}]}],"joinRequest":{"joinRequestId":"jr1","user":{"id":"peer"},"state":"pending"}}""");
        Check(group.JoinRequest?.State == "pending" && group.FailedParticipants?[0].Errors?[0].Code == 131, "group payload");
        var ended = Parse<CallEndedPayload>("call.ended", """{"from":null,"callId":"c1","durationSeconds":1.25,"reason":"normal","direction":"outbound","hadVideo":false}""");
        Check(ended.From is null && ended.DurationSeconds == 1.25 && !ended.HadVideo, "call payload");
        var history = Parse<LinkedHistorySyncPayload>("history.sync", """{"whatsapp_ids":{"linked_devices":"wa1"},"messages":[{"id":"m1","whatsapp_ids":{"linked_devices":"wa1"},"conversation":{"id":"peer"},"fromMe":false}],"mode":"recent","syncType":"RECENT","fileLength":125,"conversationCount":1,"messageCount":1,"pushNameCount":0,"statusMessageCount":0,"whatsapp":{"encoding":"gzip+protobuf","data":"H4sI"},"chunkOrder":0,"progress":100}""");
        Check(history.Messages[0].FromMe == false && history.Whatsapp.Data == "H4sI" && history.Progress == 100, "history payload");
        Check(Parse<CloudHistorySyncPayload>("history.sync", """{"kind":"history","value":{"history":[{"id":"h1"}]}}""").Value["history"].GetArrayLength() == 1, "cloud history");
        Check(Parse<RuntimeSessionStatusPayload>("session.status", """{"status":"failed","statusReason":"banned","banCode":401,"banExpiresAt":null}""").BanCode == 401, "runtime status");
        Check(Parse<CloudAccountStatusPayload>("session.status", """{"source":"meta","kind":"account_update","value":{"event":"DISABLED"},"wabaId":"w1"}""").WabaId == "w1", "cloud status");
        Check(Parse<RuntimeTemplateStatusPayload>("template.status", """{"templateName":"welcome","templateId":"t1","status":"APPROVED","category":"UTILITY","reason":"NONE","qualityRating":"GREEN"}""").QualityRating == "GREEN", "runtime template");
        Check(Parse<CloudTemplateStatusPayload>("template.status", """{"kind":"message_template_status_update","event":"APPROVED","templateId":"t1","language":"en_US"}""").Language == "en_US", "cloud template");
        var customerBase = "\"eventId\":\"e1\",\"occurredAt\":\"2026-09-16T00:00:00Z\",\"organizationId\":\"o1\",\"projectId\":\"p1\",\"customerId\":\"cu1\",\"actorKind\":\"project_token\"";
        Check(Parse<CustomerUpdatedPayload>("customer.updated", "{" + customerBase + ",\"fields\":[\"name\",\"externalCustomerId\"]}").Fields.Count == 2, "customer update");
        Check(Parse<CustomerArchivingPayload>("customer.archiving", "{" + customerBase + ",\"blockingNumberCount\":1,\"revokedPairingLinkCount\":3}").RevokedPairingLinkCount == 3, "customer archiving");
        Check(Parse<CustomerPairingLinkConnectedPayload>("customer.pairing_link.connected", "{" + customerBase + ",\"pairingLinkId\":\"link1\",\"sessionId\":\"s1\"}").SessionId == "s1", "customer connection");
        Check(Parse<CustomerNumberTransferredPayload>("customer.number.transferred", "{" + customerBase + ",\"sessionId\":\"s1\",\"sourceCustomerId\":\"cu0\"}").SourceCustomerId == "cu0", "customer transfer");
        var payment = Parse<PaymentStatusUpdatedPayload>("order.payment_updated", """{"reportedBy":"whatsapp","providerEventId":"n1","referenceId":"order1","conversation":{"phoneNumber":"+15550001111"},"kind":"payment_status","status":"captured","amount":{"value":5500.25,"offset":100},"currency":"BRL","transaction":{"providerTransactionId":"txn1","method":"pix"}}""");
        Check(payment.Amount?.Value == 5500.25m && payment.Transaction?.Method == "pix", "reported payment precision");
        Check(Parse<PaymentMethodSelectedPayload>("order.payment_updated", """{"reportedBy":"whatsapp","providerEventId":"n2","referenceId":"order1","conversation":{"id":"peer"},"kind":"payment_method_selected","messageId":"m1","paymentMethod":"offsite_card_pay","lastFourDigits":"5235","paymentTimestamp":1726170122}""").LastFourDigits == "5235", "reported method");
        var health = Parse<BanSafeHealthThresholdPayload>("bansafe.health_threshold", """{"sessionId":"s1","projectId":"p1","health":41.5,"threshold":45,"healthSource":"ml_model","estimatorVersion":"estimator-3","modelVersion":null,"evaluatedAt":"2026-09-16T00:00:00Z","policyVersion":4,"episodeId":"ep1","actionId":"a1"}""");
        Check(health.ModelVersion is null && health.Health == 41.5 && health.PolicyVersion == 4, "safety payload");
        Check(Parse<CampaignCompletedPayload>("campaign.completed", """{"campaignId":"cmp1","sentCount":10,"deliveredCount":9,"readCount":7,"failedCount":1,"skippedCount":2,"responseCount":3,"completedAt":1726170122000,"durationMs":2500}""").ResponseCount == 3, "campaign payload");
        Check(Parse<VoiceAssetReadyPayload>("voice.asset_ready", """{"eventId":"e1","occurredAt":"2026-09-16T00:00:00Z","organizationId":"o1","projectId":"p1","assetId":"va1","name":"welcome","source":"upload","durationMs":1200,"contentSha256":"abc","originalFormat":"wav"}""").DurationMs == 1200, "voice payload");
        var usage = Parse<UsageRecordedPayload>("usage.recorded", """{"id":"u1","meter":"calling.audio","quantity":1.234567,"unit":"minute","dimensions":{"direction":"outbound","billable":false},"keySource":"organization","sourceKind":"call","sourceId":"c1","projectId":null,"session":null,"occurredAt":"2026-09-16T00:00:00Z","recordedAt":"2026-09-16T00:00:01Z","revision":2,"pricingState":"priced","rateCard":{"id":"rc1","version":3},"pricedCredits":0.000001}""");
        Check(usage.Quantity == 1.234567m && usage.PricedCredits == 0.000001m && usage.Dimensions["billable"].GetBoolean() == false, "usage precision");
        var capabilities = Parse<SessionCapabilitiesUpdatedPayload>("session.capabilities_updated", """{"session":"support","projectId":"p1","status":"synced","syncedAt":null,"checkedAt":null,"accountType":null,"capabilities":[{"key":"polls.endTime","kind":"feature","unit":null,"value":false,"source":"server"},{"key":"future","kind":"future","unit":"other","value":{"enabled":true},"source":"server"}],"changedKeys":["polls.endTime"]}""");
        Check(capabilities.Capabilities[0] is FeatureCapability { Value: false } && capabilities.Capabilities[1] is UnknownSessionCapability, "capability union");
        var unknown = Signed("future.event", """{"nullValue":null,"large":"9007199254740993","nested":[false,{"future":true}]}""");
        Check(unknown is UnknownWebhookEvent && unknown.Envelope.Payload.GetProperty("large").GetString() == "9007199254740993", "unknown preservation");
        Check(Signed("order.payment_updated", """{"kind":"future","providerEventId":"n3"}""") is UnknownWebhookEvent, "future payment preservation");
        var invalid = Encoding.UTF8.GetBytes("not json");
        try { Webhooks.ConstructEvent(invalid, new string('0', 64), "secret"); throw new Exception("signature accepted"); } catch (WebhookSignatureException) { }
        var signature = Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes("secret"), invalid));
        try { Webhooks.ConstructEvent(invalid, signature, "secret"); throw new Exception("invalid JSON accepted"); } catch (PolymorfaValidationException e) { Check(e.Code == "invalid_webhook_json", "JSON failure"); }
        Check(Webhooks.KnownEventTypes.Count == 84, "known registry count");
        Console.WriteLine("PASS typed webhook families, variants, precision, forward compatibility and signature-first validation");
    }
    private static T Parse<T>(string type, string payload) => Signed(type, payload) is TypedWebhookEvent<T> typed ? typed.Payload : throw new Exception($"Wrong webhook payload for {type}");
    private static WebhookEvent Signed(string type, string payload)
    {
        var body = Encoding.UTF8.GetBytes("{\"id\":\"e1\",\"session\":\"support\",\"timestamp\":\"2026-09-16T00:00:00Z\",\"event\":\"" + type + "\",\"payload\":" + payload + "}");
        return Webhooks.ConstructEvent(body, "sha256=" + Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes("secret"), body)), "secret");
    }
    private static void Check(bool value, string name) { if (!value) throw new Exception("Webhook: " + name); }
}
