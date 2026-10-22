package polymorfa

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestKnownWebhookPayloadFamilies(t *testing.T) {
	families := []struct{ events, kind, body, field string }{
		{"bansafe.action", "BanSafeActionPayload", `{"rung":"throttle","health":null,"requires":[{"findingKey":"risk","severity":"warning"}]}`, "requires.0.findingKey"},
		{"bansafe.claim", "BanSafeClaimPayload", `{"amountCents":0.123456,"decidedAt":null}`, "amountCents"},
		{"bansafe.health_threshold", "BanSafeHealthThresholdPayload", `{"policyVersion":2,"healthSource":"ml_model","modelVersion":null}`, "policyVersion"},
		{"bansafe.incident", "BanSafeIncidentPayload", `{"belief":0.2,"endsAt":null}`, "belief"},
		{"blocklist.update", "BlocklistUpdatePayload", `{"changes":[{"id":"x","bsuid":"b"}]}`, "changes.0.bsuid"},
		{"business.quick_reply.update", "BusinessQuickReplyUpdatePayload", `{"shortcut":"reply","deleted":false,"keywords":["hello"]}`, "shortcut"},
		{"call.accepted", "CallAcceptedPayload", `{"callId":"c","exclusive":false,"capabilities":{"video":true,"invite":false}}`, "exclusive"},
		{"call.connection_joined", "CallConnectionJoinedPayload", `{"connection":{"id":"c","transport":"sip"}}`, "connection.transport"},
		{"call.connection_left", "CallConnectionLeftPayload", `{"connectionId":"c","reason":"sip_declined"}`, "reason"},
		{"call.ended", "CallEndedPayload", `{"from":null,"durationSeconds":2.5,"hadVideo":false}`, "durationSeconds"},
		{"call.missed", "CallMissedPayload", `{"reason":"ring_timeout","from":{"id":"x"}}`, "reason"},
		{"call.participant_joined call.participant_state", "CallParticipantPayload", `{"participant":{"id":"p","handRaised":false,"audioMuted":false,"video":false,"state":"connected"}}`, "participant.handRaised"},
		{"call.participant_left", "CallParticipantLeftPayload", `{"participantId":"p","reason":"left"}`, "participantId"},
		{"call.permission_changed", "CallPermissionChangedPayload", `{"conversation":{"id":"p"},"status":"temporary","expiresAt":null}`, "status"},
		{"call.received", "CallReceivedPayload", `{"hasVideo":true,"sessionConnection":"official_api"}`, "hasVideo"},
		{"call.rejected", "CallRejectedPayload", `{"callId":"c","from":{"phoneNumber":"+15551234567","id":"x"}}`, "from.phoneNumber"},
		{"call.telemetry", "CallTelemetryPayload", `{"recvKbps":2.5,"rttMs":3}`, "recvKbps"},
		{"campaign.cap_reached", "CampaignCapReachedPayload", `{"capLimit":200,"windowResetsAt":42}`, "capLimit"},
		{"campaign.cold_blocked", "CampaignColdBlockedPayload", `{"surface":"campaign","reason":"restricted"}`, "surface"},
		{"campaign.completed", "CampaignCompletedPayload", `{"deliveredCount":2,"durationMs":42}`, "deliveredCount"},
		{"campaign.failed", "CampaignFailedPayload", `{"failedAt":42,"reason":"transport"}`, "failedAt"},
		{"campaign.launched", "CampaignLaunchedPayload", `{"recipientCount":2,"scheduled":false}`, "scheduled"},
		{"campaign.paused", "CampaignPausedPayload", `{"remainingCount":2,"pausedAt":42}`, "remainingCount"},
		{"campaign.recipient_failed", "CampaignRecipientFailedPayload", `{"attempts":2,"error":"unavailable"}`, "attempts"},
		{"campaign.recipient_sent", "CampaignRecipientSentPayload", `{"variantKey":"b","externalMessageId":"provider"}`, "variantKey"},
		{"campaign.recipient_skipped", "CampaignRecipientSkippedPayload", `{"reason":"opted_out","skippedAt":42}`, "reason"},
		{"campaign.rescheduled", "CampaignRescheduledPayload", `{"previousScheduledAt":null,"scheduledAt":42}`, "scheduledAt"},
		{"campaign.resumed", "CampaignResumedPayload", `{"resumedAt":42,"sentCount":2}`, "resumedAt"},
		{"campaign.stopped", "CampaignStoppedPayload", `{"abandonedCount":2,"stoppedAt":42}`, "abandonedCount"},
		{"campaign.throttled", "CampaignThrottledPayload", `{"deferredCount":2,"reason":"safety"}`, "deferredCount"},
		{"chat.archive", "ChatArchivePayload", `{"from":{"id":"x"},"archive":false,"pinned":false}`, "archive"},
		{"chat.clear", "ChatClearPayload", `{"from":{"id":"x","username":"friend"}}`, "from.username"},
		{"chat.delete", "ChatDeletePayload", `{"from":{"id":"x"}}`, "from.id"},
		{"chat.mute", "ChatMutePayload", `{"from":{"id":"x"},"muted":false,"muteEndTimestamp":0}`, "muteEndTimestamp"},
		{"chat.read", "ChatReadPayload", `{"from":{"id":"x"},"read":false}`, "read"},
		{"command.result", "CommandResultPayload", `{"success":false,"data":{"future":3},"error":"refused"}`, "data.future"},
		{"contact.opted_in contact.opted_out", "ContactOptPayload", `{"keyword":"STOP","source":"stop-keyword","projectId":"p"}`, "keyword"},
		{"contact.sync", "ContactsSyncPayload", `{"kind":"contacts","value":{"future":[1,2]}}`, "value.future"},
		{"contact.update", "ContactUpdatePayload", `{"bsuid":"b","pictureRemoved":false}`, "pictureRemoved"},
		{"customer.created customer.archived customer.restored", "CustomerEventPayload", `{"customerId":"c","actorKind":"project_token"}`, "actorKind"},
		{"customer.archiving", "CustomerArchivingPayload", `{"customerId":"c","blockingNumberCount":2}`, "blockingNumberCount"},
		{"customer.enabled", "CustomerEnabledPayload", `{"customerId":"c","migratedNumberCount":2}`, "migratedNumberCount"},
		{"customer.updated", "CustomerUpdatedPayload", `{"customerId":"c","fields":["phone"]}`, "fields"},
		{"customer.number.attached", "CustomerNumberAttachedPayload", `{"sessionId":"s","pairingLinkId":"l"}`, "pairingLinkId"},
		{"customer.number.disconnected", "CustomerNumberDisconnectedPayload", `{"sessionId":"s","reason":"removed"}`, "reason"},
		{"customer.number.transferred", "CustomerNumberTransferredPayload", `{"sessionId":"s","sourceCustomerId":"c"}`, "sourceCustomerId"},
		{"customer.pairing_link.connected", "CustomerPairingLinkConnectedPayload", `{"sessionId":"s","pairingLinkId":"l"}`, "sessionId"},
		{"customer.pairing_link.created customer.pairing_link.opened customer.pairing_link.expired", "CustomerPairingLinkPayload", `{"pairingLinkId":"l","customerId":"c"}`, "pairingLinkId"},
		{"customer.pairing_link.failed", "CustomerPairingLinkFailedPayload", `{"errorCode":"failed","pairingLinkId":"l"}`, "errorCode"},
		{"customer.pairing_link.revoked", "CustomerPairingLinkRevokedPayload", `{"reason":"terminal_failure","pairingLinkId":"l"}`, "reason"},
		{"group.participant", "GroupParticipantPayload", `{"joinRequest":{"joinRequestId":"j","user":{"id":"x"},"state":"created"},"failedParticipants":[{"participant":{"id":"x"},"errors":[{"code":403}]}]}`, "failedParticipants.0.errors.0.code"},
		{"group.update", "GroupUpdatePayload", `{"joinApprovalRequired":false,"pictureChanged":false,"errors":[{"code":403,"title":"refused"}]}`, "joinApprovalRequired"},
		{"history.sync", "LinkedHistorySyncPayload", `{"mode":"deliver","messages":[{"id":"x","whatsapp_ids":{"linked_devices":"p"},"conversation":{"id":"c"},"fromMe":false}],"whatsapp":{"encoding":"gzip-base64-protobuf","data":"AQ=="}}`, "messages.0.fromMe"},
		{"labels.update", "LabelsUpdatePayload", `{"deleted":false,"color":0,"starred":false}`, "color"},
		{"message.ack", "MessageAckPayload", `{"messages":[{"id":"x","whatsapp_ids":{"official_api":"p"}}],"pricing":{"billable":false,"pricing_model":"PMP"}}`, "pricing.billable"},
		{"message.delete", "MessageDeletePayload", `{"id":"x","fromMe":false,"sender":{"id":"s"}}`, "sender.id"},
		{"message.echo", "MessageEchoPayload", `{"source":"whatsapp_business_app","value":{"future":3}}`, "value.future"},
		{"message.edited message.revoked message.update message.received message.reaction", "LinkedDeviceMessagePayload", `{"id":"x","timestamp":42,"fromMe":false,"ptt":false,"replyChoice":{"kind":"button","id":"reply"},"future":{"v":3}}`, "future.v"},
		{"message.failed", "MessageFailedPayload", `{"error":"blocked_by_safety","retryAfter":1.5,"to":{"id":"x"}}`, "retryAfter"},
		{"message.sent", "MessageSentPayload", `{"id":"x","whatsapp_ids":{"linked_devices":"p"},"timestamp":42}`, "whatsapp_ids.linked_devices"},
		{"message.vote", "PollVotePayload", `{"pollMessageId":"x","selectedHashes":["hash"]}`, "selectedHashes"},
		{"newsletter.update", "NewsletterUpdatePayload", `{"id":"x","muted":false}`, "muted"},
		{"order.payment_updated", "OrderPaymentStatusPayload", `{"kind":"payment_status","reportedBy":"whatsapp","amount":{"value":100,"offset":100},"transaction":{"errorCode":"future"}}`, "transaction.errorCode"},
		{"presence.update", "PresenceUpdatePayload", `{"observedAt":42,"lastSeen":0,"unavailable":false}`, "lastSeen"},
		{"session.capabilities_updated", "SessionCapabilitiesUpdatedPayload", `{"changedKeys":["calling"],"values":{"calling":true}}`, "changedKeys"},
		{"session.connected", "SessionConnectedPayload", `{"phonePlatform":"iphone","accountType":"business_app"}`, "accountType"},
		{"session.logged_out", "SessionLoggedOutPayload", `{"reason":"device_removed","code":401}`, "code"},
		{"session.phone_offline", "SessionPhoneOfflinePayload", `{"daysRemaining":2,"lastSeen":"2026-10-01"}`, "daysRemaining"},
		{"session.restriction_updated", "SessionRestrictionUpdatedPayload", `{"active":false,"expiresAt":null,"enforcementType":null}`, "active"},
		{"session.status", "RuntimeSessionStatusPayload", `{"status":"banned","banCode":403}`, "banCode"},
		{"template.status", "RuntimeTemplateStatusPayload", `{"templateName":"hello","qualityRating":"GREEN"}`, "qualityRating"},
		{"usage.recorded", "UsageRecordedPayload", `{"quantity":0.123456,"dimensions":{"enabled":false},"rateCard":null,"pricedCredits":null}`, "dimensions.enabled"},
		{"voice.asset_failed", "VoiceAssetFailedPayload", `{"assetId":"a","failureReason":"invalid_audio"}`, "failureReason"},
		{"voice.asset_ready", "VoiceAssetReadyPayload", `{"assetId":"a","durationMs":42,"originalFormat":"mp3"}`, "durationMs"},
		// Additional native variants of the known families.
		{"message.received message.reaction", "CloudMessagePayload", `{"id":"x","timestamp":"2026-10-11","referral":{"source_type":"ad","ctwa_clid":"c","future":false},"interactive":{"future":3},"future":{"v":3}}`, "referral.future"},
		{"history.sync", "CloudHistorySyncPayload", `{"kind":"history","value":{"future":3}}`, "value.future"},
		{"session.status", "CloudAccountStatusPayload", `{"source":"meta","kind":"account_alerts","value":{"future":3}}`, "value.future"},
		{"template.status", "CloudTemplateStatusPayload", `{"kind":"message_template_quality_update","newQualityScore":"RED"}`, "newQualityScore"},
		{"order.payment_updated", "OrderPaymentMethodSelectedPayload", `{"kind":"payment_method_selected","reportedBy":"whatsapp","paymentMethod":"pix","paymentTimestamp":42}`, "paymentTimestamp"},
	}
	covered := map[string]bool{}
	for _, f := range families {
		for _, name := range strings.Fields(f.events) {
			t.Run(name+"/"+f.kind, func(t *testing.T) {
				raw := []byte(`{"id":"event","session":"s","timestamp":"2026-10-11","event":"` + name + `","payload":` + f.body + `}`)
				mac := hmac.New(sha256.New, []byte("fixture-secret"))
				mac.Write(raw)
				event, err := ConstructWebhookEvent(raw, hex.EncodeToString(mac.Sum(nil)), "fixture-secret")
				if err != nil {
					t.Fatal(err)
				}
				v, known, err := event.TypedPayload()
				if err != nil || !known || v == nil {
					t.Fatal(v, known, err)
				}
				if reflect.TypeOf(v).Elem().Name() != f.kind {
					t.Fatal("wrong typed payload", reflect.TypeOf(v), f.kind)
				}
				b, err := json.Marshal(v)
				if err != nil {
					t.Fatal(err)
				}
				var actual, expected any
				json.Unmarshal(b, &actual)
				json.Unmarshal([]byte(f.body), &expected)
				if !reflect.DeepEqual(jsonField(actual, f.field), jsonField(expected, f.field)) {
					t.Fatalf("typed field %s: %s", f.field, b)
				}
				covered[name] = true
			})
		}
	}
	if len(covered) != len(knownWebhookEvents) {
		t.Fatalf("known event evidence %d expected %d", len(covered), len(knownWebhookEvents))
	}
	for name := range knownWebhookEvents {
		if !covered[name] {
			t.Error("missing payload test", name)
		}
	}
	unknown := WebhookEvent{Event: "future.event", Payload: json.RawMessage(`{"future":false}`)}
	v, known, err := unknown.TypedPayload()
	if err != nil || known || v != nil || string(unknown.Payload) != `{"future":false}` {
		t.Fatal("unknown lost")
	}
}
func TestLocalAndFlowForwardSignatures(t *testing.T) {
	raw := []byte(`{"id":"e","session":"s","timestamp":"t","event":"future","payload":null}`)
	secret := "flow-secret"
	sign := func(key []byte, prefix string) string {
		m := hmac.New(sha256.New, key)
		m.Write([]byte(prefix + "."))
		m.Write(raw)
		return hex.EncodeToString(m.Sum(nil))
	}
	signature := "t=1000,v1=" + sign([]byte(secret), "1000")
	now := time.Unix(1000, 0)
	if !VerifyFlowForwardSignature(raw, signature, secret, VerifyFlowForwardOptions{Now: now}) {
		t.Fatal("flow signature")
	}
	if VerifyFlowForwardSignature(raw, signature, secret, VerifyFlowForwardOptions{Now: now.Add(301 * time.Second)}) || VerifyFlowForwardSignature(append(raw, ' '), signature, secret, VerifyFlowForwardOptions{Now: now}) {
		t.Fatal("expired/changed flow signature accepted")
	}
	key := make([]byte, 32)
	localSecret := base64.RawURLEncoding.EncodeToString(key)
	localSignature := "t=1000,v1=" + sign(key, "1000")
	secs := int64(1000)
	e, err := ConstructLocalWebhookEvent(raw, localSignature, localSecret, VerifyLocalWebhookOptions{NowUnixSeconds: &secs})
	if err != nil || e.Event != "future" {
		t.Fatal(e, err)
	}
	secs = 1301
	if _, err = ConstructLocalWebhookEvent(raw, localSignature, localSecret, VerifyLocalWebhookOptions{NowUnixSeconds: &secs}); err == nil {
		t.Fatal("expired local signature accepted")
	}
	if _, err = ConstructLocalWebhookEvent(raw, localSignature, "bad", VerifyLocalWebhookOptions{}); err == nil {
		t.Fatal("bad local secret accepted")
	}
	fixture, err := CreateWebhookFixture(e, "native")
	if err != nil || !VerifyWebhookSignature(fixture.Body, fixture.Signature, "native") || fixture.Headers.Get("Content-Type") != "application/json" {
		t.Fatal("native fixture", err)
	}
}
