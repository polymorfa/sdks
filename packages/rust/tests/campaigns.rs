#[allow(dead_code)]
mod support;
use polymorfa_sdk::{campaigns::*, ErrorKind, RequestOptions};
use serde_json::json;
fn campaign() -> serde_json::Value {
    json!({"id":"campaign","name":"Campaign","status":"draft","templateId":null,"recipientListId":"audience","recipientCount":2,"sentCount":1,"deliveredCount":1,"readCount":1,"failedCount":0,"skippedCount":0,"scheduledAt":null,"launchedAt":null,"completedAt":null,"createdAt":1000,"updatedAt":2000,"sendWindow":{"timeZone":"UTC","days":["monday"],"hours":[{"start":"09:00","end":"18:00"}],"recipientTimeZone":true,"timeZoneVariable":"timeZone"},"composerBlueprint":{"version":2,"source":"Hello"},"messages":[],"audienceRef":{"id":"audience"},"senderConfig":{"strategy":"round-robin"},"complianceConfig":{"consent":true},"variants":[{"key":"a","label":"A","weight":50,"blueprint":{"version":2,"source":"Hello","asset":"asset"}},{"key":"b","label":"B","weight":50,"blueprint":{"version":2,"source":"Hi"}}],"variantStrategy":{"winnerCriterion":"read","holdoutPercent":10,"testSlicePercent":20,"autoPromote":true,"testWindowMinutes":60},"experimentOutcome":{"state":"inconclusive","reason":"insufficient_evidence"},"messageVariations":null})
}
fn operation() -> serde_json::Value {
    let mut c = campaign();
    c["operationId"] = json!("operation");
    c
}
fn recipients() -> serde_json::Value {
    json!([{"id":"recipient","phone":"+15551234567","variables":{"name":"Alex"},"variantKey":"a","status":"read","attempts":1,"lastError":null,"externalMessageId":"message","queuedAt":1000,"sentAt":1100,"deliveredAt":1200,"readAt":1300,"failedAt":null,"respondedAt":1400}])
}
#[tokio::test]
async fn messaging_campaign_drafts_analytics_and_recipient_native_wire() {
    wire_messaging!(
        client,
        "GET",
        "/messaging/projects/project/campaigns",
        None,
        json!({"success":true,"data":[campaign()]}),
        client
            .campaigns()
            .list("project", RequestOptions::default())
    );
    let body = json!({"name":"Campaign","templateId":"template","recipientListId":"audience","senderConfig":{"strategy":"round-robin"},"scheduledAt":1000,"sendWindow":null,"recipients":[{"phone":"+15551234567","variables":{"name":"Alex","number":5.0,"consent":true}}],"messageVariations":null,"variants":null,"variantStrategy":null});
    wire_messaging!(
        client,
        "POST",
        "/messaging/projects/project/campaigns",
        Some(body.clone()),
        json!({"success":true,"data":campaign()}),
        client.campaigns().create(
            "project",
            &serde_json::from_value::<CreateCampaignRequest>(body.clone()).unwrap(),
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/projects/project/campaigns/campaign",
        None,
        json!({"success":true,"data":campaign()}),
        client
            .campaigns()
            .retrieve("project", "campaign", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "PATCH",
        "/messaging/projects/project/campaigns/campaign",
        Some(
            json!({"name":"Changed","recipientListId":null,"scheduledAt":null,"sendWindow":null,"variants":null,"variantStrategy":null,"messageVariations":null})
        ),
        json!({"success":true,"data":campaign()}),
        client.campaigns().update(
            "project",
            "campaign",
            &UpdateCampaignRequest {
                name: Some("Changed".into()),
                recipient_list_id: Some(None),
                scheduled_at: Some(None),
                send_window: Some(None),
                variants: Some(None),
                variant_strategy: Some(None),
                message_variations: Some(None),
                ..Default::default()
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "GET",
        "/messaging/projects/project/campaigns/campaign/analytics",
        None,
        json!({"success":true,"data":{"campaignId":"campaign","recipientCount":2,"sentCount":1,"deliveredCount":1,"readCount":1,"failedCount":0,"skippedCount":0,"respondedCount":1,"responseRate":1.0,"experiment":{"criterion":"read","outcome":{"state":"promoted","winnerKey":"a"},"holdoutCount":1,"reserveCount":5,"variants":[{"key":"a","label":"A","weight":50,"assigned":1,"sent":1,"delivered":1,"read":1,"replied":1,"outcomeRate":1.0}]}}}),
        client
            .campaigns()
            .analytics("project", "campaign", RequestOptions::default())
    );
    wire_messaging!(client,"GET","/messaging/projects/project/campaigns/campaign/recipients?status=read&cursor=cursor&limit=25",None,json!({"success":true,"data":recipients(),"page":{"nextCursor":null,"hasMore":false}}),client.campaigns().list_recipients("project","campaign",&ListCampaignRecipientsParameters{status:Some(CampaignRecipientStatus::Read),cursor:Some("cursor".into()),limit:Some(25)},RequestOptions::default()));
    wire_messaging!(
        client,
        "POST",
        "/messaging/projects/project/campaigns/campaign/recipients",
        Some(json!({"recipients":[{"phone":"+15551234567","variables":{"name":"Alex"}}]})),
        json!({"success":true,"data":{"campaignId":"campaign","added":1,"recipientCount":2,"duplicateCount":1,"invalidCount":1,"invalidRows":[{"row":3,"reason":"invalid_phone"}]}}),
        client.campaigns().add_recipients(
            "project",
            "campaign",
            &AddCampaignRecipientsRequest {
                recipients: vec![CampaignRecipientInput {
                    phone: "+15551234567".into(),
                    variables: Some(
                        [("name".into(), CampaignVariableValue::String("Alex".into()))].into()
                    )
                }]
            },
            RequestOptions::default()
        )
    );
}
#[tokio::test]
async fn messaging_campaign_lifecycle_nullable_stop_and_reschedule_native_wire() {
    wire_messaging!(
        client,
        "POST",
        "/messaging/projects/project/campaigns/campaign/launch",
        Some(json!({"scheduledAt":1000})),
        json!({"success":true,"data":operation()}),
        client.campaigns().launch(
            "project",
            "campaign",
            &LaunchCampaignRequest {
                scheduled_at: Some(1000)
            },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/projects/project/campaigns/campaign/reschedule",
        Some(json!({"scheduledAt":null})),
        json!({"success":true,"data":operation()}),
        client.campaigns().reschedule(
            "project",
            "campaign",
            &RescheduleCampaignRequest { scheduled_at: None },
            RequestOptions::default()
        )
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/projects/project/campaigns/campaign/pause",
        None,
        json!({"success":true,"data":operation()}),
        client
            .campaigns()
            .pause("project", "campaign", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/projects/project/campaigns/campaign/resume",
        None,
        json!({"success":true,"data":operation()}),
        client
            .campaigns()
            .resume("project", "campaign", RequestOptions::default())
    );
    let mut stopped = campaign();
    stopped["status"] = json!("cancelled");
    stopped["operationId"] = json!(null);
    wire_messaging!(
        client,
        "POST",
        "/messaging/projects/project/campaigns/campaign/stop",
        None,
        json!({"success":true,"data":stopped}),
        client
            .campaigns()
            .stop("project", "campaign", RequestOptions::default())
    );
    wire_messaging!(
        client,
        "POST",
        "/messaging/projects/project/campaigns/campaign/requeue",
        Some(json!({"includeSkippedError":true})),
        json!({"success":true,"data":{"requeued":1}}),
        client.campaigns().requeue(
            "project",
            "campaign",
            &RequeueCampaignRequest {
                include_skipped_error: Some(true)
            },
            RequestOptions::default()
        )
    );
    let client = support::messaging("http://127.0.0.1:1".into());
    assert_eq!(
        client
            .campaigns()
            .update(
                "project",
                "campaign",
                &UpdateCampaignRequest::default(),
                RequestOptions::default()
            )
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Validation
    );
}
#[tokio::test]
async fn generated_campaign_idempotency_key_is_stable_across_real_retry() {
    use tokio::{
        io::{AsyncReadExt, AsyncWriteExt},
        net::TcpListener,
    };
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let response = json!({"success":true,"data":campaign()}).to_string();
    let server = tokio::spawn(async move {
        let mut saved = None;
        for attempt in 0..2 {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut bytes = Vec::new();
            let mut buf = [0u8; 4096];
            loop {
                let n = socket.read(&mut buf).await.unwrap();
                assert!(n > 0);
                bytes.extend_from_slice(&buf[..n]);
                if bytes.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
            let head = String::from_utf8_lossy(&bytes);
            assert!(head.starts_with("POST /messaging/projects/project/campaigns HTTP/1.1"));
            let key = head
                .lines()
                .find_map(|line| line.strip_prefix("idempotency-key: "))
                .unwrap()
                .to_owned();
            assert!(uuid::Uuid::parse_str(&key).is_ok());
            if let Some(first) = &saved {
                assert_eq!(&key, first);
            }
            saved = Some(key);
            let (status, body) = if attempt == 0 {
                (
                    "503 Service Unavailable",
                    "{\"error\":{\"message\":\"retry\"}}".to_owned(),
                )
            } else {
                ("200 OK", response.clone())
            };
            socket.write_all(format!("HTTP/1.1 {status}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{body}",body.len()).as_bytes()).await.unwrap();
        }
    });
    let client = support::messaging(base);
    let body = serde_json::from_value::<CreateCampaignRequest>(json!({"name":"Campaign"})).unwrap();
    let result = client
        .campaigns()
        .create(
            "project",
            &body,
            RequestOptions {
                max_network_retries: Some(1),
                ..Default::default()
            },
        )
        .await
        .unwrap();
    assert_eq!(result.data.data.id, "campaign");
    assert_eq!(result.metadata.attempts, 2);
    server.await.unwrap();
}
#[tokio::test]
async fn platform_campaign_drafts_open_fields_and_recipient_contracts_native_wire() {
    let params = PlatformCampaignParameters {
        project_id: "project".into(),
    };
    wire_organization!(
        client,
        "GET",
        "/platform/campaigns?projectId=project&projectSlug=slug",
        None,
        json!({"data":[campaign()]}),
        client.campaigns().list(
            &ListCampaignsParameters {
                project_id: "project".into(),
                project_slug: Some("slug".into())
            },
            RequestOptions::default()
        )
    );
    let body = json!({"projectId":"project","name":"Campaign","recipientCount":2,"sendWindow":null,"recipients":[{"phone":"+15551234567"}],"composerBlueprint":{"version":2,"source":"Hello"},"messagesArray":[],"audienceRef":{"id":"audience"},"complianceConfig":{"consent":true}});
    wire_organization!(
        client,
        "POST",
        "/platform/campaigns",
        Some(body.clone()),
        json!({"data":campaign()}),
        client.campaigns().create(
            &serde_json::from_value::<CreatePlatformCampaignRequest>(body.clone()).unwrap(),
            RequestOptions::default()
        )
    );
    let mut open = campaign();
    open["futureField"] = json!({"preserve":true});
    wire_organization!(
        client,
        "GET",
        "/platform/campaigns/campaign?projectId=project",
        None,
        json!({"data":open}),
        client
            .campaigns()
            .retrieve("campaign", &params, RequestOptions::default())
    );
    wire_organization!(
        client,
        "GET",
        "/platform/campaigns/missing?projectId=project",
        None,
        json!({"data":null}),
        client
            .campaigns()
            .retrieve("missing", &params, RequestOptions::default())
    );
    let patch = UpdatePlatformCampaignRequest {
        changes: UpdateCampaignRequest {
            name: Some("Changed".into()),
            send_window: Some(None),
            ..Default::default()
        },
        extensions: [("futureField".into(), json!({"change":true}))].into(),
    };
    wire_organization!(
        client,
        "PATCH",
        "/platform/campaigns/campaign?projectId=project",
        Some(json!({"name":"Changed","sendWindow":null,"futureField":{"change":true}})),
        json!({"data":campaign()}),
        client
            .campaigns()
            .update("campaign", Some(&patch), &params, RequestOptions::default())
    );
    wire_organization!(
        client,
        "DELETE",
        "/platform/campaigns/campaign?projectId=project",
        None,
        json!({"data":{"deleted":true}}),
        client
            .campaigns()
            .delete("campaign", &params, RequestOptions::default())
    );
    wire_organization!(
        client,
        "GET",
        "/platform/campaigns/campaign/analytics?projectId=project",
        None,
        json!({"data":{"campaignId":"campaign","recipientCount":2,"sentCount":1,"deliveredCount":1,"readCount":1,"failedCount":0,"skippedCount":0,"respondedCount":1,"responseRate":1.0,"averageResponseTimeMs":100.0,"minResponseTimeMs":50.0,"maxResponseTimeMs":150.0,"experiment":null}}),
        client
            .campaigns()
            .analytics("campaign", &params, RequestOptions::default())
    );
    wire_organization!(
        client,
        "GET",
        "/platform/campaigns/campaign/events?projectId=project",
        None,
        json!({"data":{"events":[{"type":"sent"}]}}),
        client
            .campaigns()
            .events("campaign", &params, RequestOptions::default())
    );
    wire_organization!(client,"GET","/platform/campaigns/campaign/recipients?projectId=project&status=read&cursor=cursor&limit=25",None,json!({"data":recipients(),"page":{"nextCursor":null,"hasMore":false}}),client.campaigns().recipients("campaign",&ListPlatformCampaignRecipientsParameters{project_id:"project".into(),status:Some(CampaignRecipientStatus::Read),cursor:Some("cursor".into()),limit:Some(25)},RequestOptions::default()));
    wire_organization!(
        client,
        "POST",
        "/platform/campaigns/campaign/recipients",
        Some(json!({"projectId":"project","recipients":[{"phone":"+15551234567"}]})),
        json!({"data":{"campaignId":"campaign","added":1,"recipientCount":2,"duplicateCount":0,"invalidCount":0,"invalidRows":[]}}),
        client.campaigns().add_recipients(
            "campaign",
            &AddPlatformCampaignRecipientsRequest {
                project_id: "project".into(),
                recipients: vec![CampaignRecipientInput {
                    phone: "+15551234567".into(),
                    variables: None
                }]
            },
            RequestOptions::default()
        )
    );
}
#[tokio::test]
async fn platform_campaign_lifecycle_payloads_and_reported_conversions_native_wire() {
    let body: PlatformCampaignPayload = [("projectId".into(), json!("project"))].into();
    wire_organization!(
        client,
        "POST",
        "/platform/campaigns/campaign/launch",
        Some(json!({"projectId":"project"})),
        json!({"data":{"operationId":"operation"}}),
        client
            .campaigns()
            .launch("campaign", Some(&body), RequestOptions::default())
    );
    wire_organization!(
        client,
        "POST",
        "/platform/campaigns/campaign/pause",
        Some(json!({"projectId":"project"})),
        json!({"data":{"operationId":"operation"}}),
        client
            .campaigns()
            .pause("campaign", Some(&body), RequestOptions::default())
    );
    wire_organization!(
        client,
        "POST",
        "/platform/campaigns/campaign/resume",
        Some(json!({"projectId":"project"})),
        json!({"data":{"operationId":"operation"}}),
        client
            .campaigns()
            .resume("campaign", Some(&body), RequestOptions::default())
    );
    wire_organization!(
        client,
        "POST",
        "/platform/campaigns/campaign/stop",
        Some(json!({"projectId":"project"})),
        json!({"data":{"operationId":null}}),
        client
            .campaigns()
            .stop("campaign", Some(&body), RequestOptions::default())
    );
    wire_organization!(
        client,
        "POST",
        "/platform/campaigns/campaign/archive",
        Some(json!({"projectId":"project"})),
        json!({"data":{"archived":true}}),
        client
            .campaigns()
            .archive("campaign", Some(&body), RequestOptions::default())
    );
    wire_organization!(
        client,
        "POST",
        "/platform/campaigns/campaign/duplicate",
        Some(json!({"projectId":"project"})),
        json!({"data":{"id":"copy"}}),
        client
            .campaigns()
            .duplicate("campaign", Some(&body), RequestOptions::default())
    );
    wire_organization!(
        client,
        "POST",
        "/platform/campaigns/campaign/requeue",
        Some(json!({"projectId":"project"})),
        json!({"data":{"requeued":1}}),
        client
            .campaigns()
            .requeue("campaign", Some(&body), RequestOptions::default())
    );
    wire_organization!(
        client,
        "POST",
        "/platform/campaigns/campaign/reschedule",
        Some(json!({"projectId":"project","scheduledAt":null})),
        json!({"data":{"operationId":"operation"}}),
        client.campaigns().reschedule(
            "campaign",
            &ReschedulePlatformCampaignRequest {
                project_id: "project".into(),
                scheduled_at: None
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "POST",
        "/platform/campaigns/campaign/conversions",
        Some(
            json!({"projectId":"project","recipientId":"recipient","eventId":"order","eventType":"purchase","occurredAt":"2026-10-11T10:00:00Z","value":{"amountMinor":12500,"currency":"USD"}})
        ),
        json!({"data":{"id":"conversion","campaignId":"campaign","recipientId":"recipient","eventType":"purchase","occurredAt":"2026-10-11T10:00:00Z","value":{"amountMinor":12500,"currency":"USD"},"evidence":"customer_reported","attribution":{"outcome":"attributed","touchAt":"2026-10-11T09:00:00Z","windowDays":7},"recordedAt":"2026-10-11T11:00:00Z","replayed":true}}),
        client.campaigns().record_conversion(
            "campaign",
            &RecordCampaignConversionRequest {
                project_id: "project".into(),
                recipient_id: "recipient".into(),
                event_id: "order".into(),
                event_type: "purchase".into(),
                occurred_at: "2026-10-11T10:00:00Z".into(),
                value: Some(Some(CampaignConversionValue {
                    amount_minor: 12500,
                    currency: "USD".into()
                }))
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "GET",
        "/platform/campaigns/campaign/conversions?projectId=project",
        None,
        json!({"data":{"campaignId":"campaign","model":{"touch":"recipient_sent","windowDays":7,"correlation":"explicit_recipient"},"sentCount":1,"conversions":{"total":2,"attributed":1,"outsideWindow":1,"notSent":0,"optedOut":0},"convertedRecipients":1,"conversionRate":1.0,"values":[{"currency":"USD","evidence":"customer_reported","attributedConversions":1,"attributedAmountMinor":"12500","unattributedConversions":1,"unattributedAmountMinor":"9007199254740993"}]}}),
        client.campaigns().conversions(
            "campaign",
            &PlatformCampaignParameters {
                project_id: "project".into()
            },
            RequestOptions::default()
        )
    );
}
