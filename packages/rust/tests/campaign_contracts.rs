use polymorfa_sdk::{ClientOptions, Credential, OrganizationClient, RequestOptions};
use serde_json::json;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpListener,
};
#[tokio::test]
async fn safe_contract_error_metadata_is_preserved() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let (mut s, _) = listener.accept().await.unwrap();
        let mut b = [0; 4096];
        assert!(s.read(&mut b).await.unwrap() > 0);
        let body=json!({"error":{"code":"state_conflict","param":"body.revision","message":"Stale revision"}}).to_string();
        s.write_all(format!("HTTP/1.1 409 Conflict\r\ncontent-type: application/json\r\nx-trace-id: trace-contract\r\nx-ratelimit-limit: 100\r\ncontent-length: {}\r\nconnection: close\r\n\r\n{}",body.len(),body).as_bytes()).await.unwrap();
    });
    let client = OrganizationClient::new(
        Credential::organization_api_key("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k".to_string())
            .unwrap(),
        ClientOptions {
            base_url: base,
            max_network_retries: 0,
            ..Default::default()
        },
    )
    .unwrap();
    let error = client
        .raw::<serde_json::Value>(
            reqwest::Method::GET,
            "/platform/campaign-settings",
            &Default::default(),
            None,
            RequestOptions::default(),
        )
        .await
        .unwrap_err();
    server.await.unwrap();
    assert_eq!(error.param.as_deref(), Some("body.revision"));
    assert_eq!(
        error
            .metadata
            .as_ref()
            .unwrap()
            .headers
            .get("x-trace-id")
            .map(String::as_str),
        Some("trace-contract")
    );
}

use polymorfa_sdk::{campaign_contracts::*, ErrorKind, MessagingClient, ProjectClient};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    sync::{Arc, Mutex},
    time::Duration,
};
const PROJECT: &str = "11111111-1111-4111-8111-111111111111";
const ID: &str = "22222222-2222-4222-8222-222222222222";
const CUSTOMER: &str = "33333333-3333-4333-8333-333333333333";
const PHONE: &str = "+15551234567";
#[derive(Clone, Debug)]
struct Captured {
    method: String,
    path: String,
    headers: BTreeMap<String, String>,
    body: Option<Value>,
}
struct Wire {
    base: String,
    requests: Arc<Mutex<Vec<Captured>>>,
    task: Option<tokio::task::JoinHandle<()>>,
}
impl Drop for Wire {
    fn drop(&mut self) {
        if let Some(t) = self.task.take() {
            t.abort();
        }
    }
}
type WireResponse = (u16, Value, Option<String>, Vec<(String, String)>);
impl Wire {
    async fn new(responses: Vec<WireResponse>) -> Self {
        let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", l.local_addr().unwrap());
        let requests = Arc::new(Mutex::new(Vec::new()));
        let save = requests.clone();
        let task = tokio::spawn(async move {
            for (status, value, raw, headers) in responses {
                let (mut s, _) = tokio::time::timeout(Duration::from_secs(10), l.accept())
                    .await
                    .unwrap()
                    .unwrap();
                let mut all = Vec::new();
                let mut buf = [0; 4096];
                let end = loop {
                    let n = s.read(&mut buf).await.unwrap();
                    assert_ne!(n, 0);
                    all.extend_from_slice(&buf[..n]);
                    if let Some(i) = all.windows(4).position(|w| w == b"\r\n\r\n") {
                        break i + 4;
                    }
                };
                let head = String::from_utf8(all[..end].to_vec()).unwrap();
                let mut lines = head.lines();
                let first = lines.next().unwrap().split_whitespace().collect::<Vec<_>>();
                let fields = lines
                    .filter_map(|s| s.split_once(':'))
                    .map(|(k, v)| (k.to_ascii_lowercase(), v.trim().to_owned()))
                    .collect::<BTreeMap<_, _>>();
                let len = fields
                    .get("content-length")
                    .and_then(|s| s.parse::<usize>().ok())
                    .unwrap_or(0);
                while all.len() < end + len {
                    let n = s.read(&mut buf).await.unwrap();
                    assert_ne!(n, 0);
                    all.extend_from_slice(&buf[..n]);
                }
                let body = if len > 0 {
                    Some(serde_json::from_slice(&all[end..end + len]).unwrap())
                } else {
                    None
                };
                save.lock().unwrap().push(Captured {
                    method: first[0].into(),
                    path: first[1].into(),
                    headers: fields,
                    body,
                });
                let data = raw.unwrap_or_else(|| value.to_string());
                let mut out = format!(
                    "HTTP/1.1 {status} Response\r\ncontent-length: {}\r\nconnection: close\r\n",
                    data.len()
                );
                if !headers
                    .iter()
                    .any(|(n, _)| n.eq_ignore_ascii_case("content-type"))
                {
                    out.push_str("content-type: application/json\r\n");
                }
                for (k, v) in headers {
                    out.push_str(&format!("{k}: {v}\r\n"));
                }
                out.push_str("\r\n");
                out.push_str(&data);
                s.write_all(out.as_bytes()).await.unwrap();
            }
        });
        Self {
            base,
            requests,
            task: Some(task),
        }
    }
    async fn finish(mut self) -> Vec<Captured> {
        self.task.take().unwrap().await.unwrap();
        let result = self.requests.lock().unwrap().clone();
        result
    }
    fn clients(&self) -> (MessagingClient, OrganizationClient, ProjectClient) {
        let c =
            Credential::organization_api_key("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k".to_string())
                .unwrap();
        let o = ClientOptions {
            base_url: self.base.clone(),
            max_network_retries: 0,
            ..Default::default()
        };
        let org = OrganizationClient::new(c.clone(), o.clone()).unwrap();
        let p = org.project(PROJECT).unwrap();
        (MessagingClient::new(c, o).unwrap(), org, p)
    }
}
fn graph() -> CreateCampaignReplyFlowRequest {
    CreateCampaignReplyFlowRequest {
        name: "Reply".into(),
        flow_key: None,
        revision: None,
        definition: CampaignReplyFlowDefinition {
            entry_node_id: "entry".into(),
            nodes: vec![
                CampaignReplyFlowNode {
                    id: "entry".into(),
                    send: None,
                    edges: vec![CampaignReplyFlowEdge {
                        r#match: CampaignReplyFlowMatch::Keyword {
                            value: "yes".into(),
                        },
                        to: "done".into(),
                    }],
                },
                CampaignReplyFlowNode {
                    id: "done".into(),
                    send: Some(CampaignReplyFlowSend::Text {
                        text: "Hello".into(),
                    }),
                    edges: vec![],
                },
            ],
        },
    }
}
fn test_body() -> CampaignTestSendRequest {
    CampaignTestSendRequest {
        session_id: ID.into(),
        to: PHONE.into(),
        sample_recipient_id: None,
        variables: Some(BTreeMap::new()),
    }
}
fn profile_body() -> PutAudienceProfileRequest {
    PutAudienceProfileRequest {
        tags: vec![],
        attributes: BTreeMap::new(),
        expected_revision: None,
        provenance: None,
        consent: Some(AudienceProfileConsentInput {
            purpose: AudienceConsentPurpose::Campaigns,
            source: AudienceProfileSource::Api,
            reference: "form".into(),
            allowed: false,
            asserted_at: 0,
        }),
    }
}
fn import_body() -> CreateAudienceProfileImportRequest {
    use base64::Engine;
    CreateAudienceProfileImportRequest {
        replay_key: "original:1".into(),
        csv_base64: base64::engine::general_purpose::STANDARD
            .encode("phone,tags,attributes\n+15551234567,[],{}\n"),
        mapping: None,
    }
}
fn fixture(kind: &str) -> Value {
    match kind {
        "flow" => {
            json!({"id":ID,"flowKey":ID,"revision":1,"name":"Reply","definition":{"entryNodeId":"entry","nodes":[{"id":"entry","edges":[{"match":{"kind":"keyword","value":"yes"},"to":"done"}]},{"id":"done","send":{"kind":"text","text":"Hello"},"edges":[]}]},"createdAt":0})
        }
        "links" => json!([{"key":"a","url":"https://example.com/","uniqueOpens":0,"totalOpens":1}]),
        "send" => {
            json!({"id":ID,"campaignId":ID,"status":"sent","from":{"sessionId":ID,"phone":PHONE},"to":PHONE,"messageId":null,"variables":{},"createdAt":0})
        }
        "assignment" => json!({"campaignId":ID,"replyFlowId":null}),
        "profile" => {
            json!({"id":ID,"phone":PHONE,"revision":1,"tags":[],"attributes":{"none":null,"flag":false,"number":0},"provenance":null,"createdAt":0,"updatedAt":0})
        }
        "consent" => {
            json!({"source":"api","reference":"form","purpose":"campaigns","allowed":false,"assertedAt":0,"id":ID,"profileRevision":1,"createdAt":0})
        }
        "import" => {
            json!({"id":ID,"state":"queued","totalValid":1,"invalidCount":0,"invalidSamples":[],"conflictSamples":[],"processedValid":0,"createdCount":0,"updatedCount":0,"conflictCount":0,"createdAt":0,"updatedAt":0,"completedAt":null})
        }
        "custody" => {
            json!({"signalModeDefault":null,"effectiveSignalMode":"standard","revision":0})
        }
        "confirmation" => {
            json!({"teamId":PROJECT,"enabled":false,"locale":null,"revision":0,"textRevision":1,"acknowledgement":null,"updatedAt":null})
        }
        "summary" => {
            json!({"enabled":false,"counts":{"queued":0,"admitted":0,"completed":0,"failed":0,"unknown":0}})
        }
        "retarget" => {
            json!({"id":ID,"name":"Retarget","source":"campaign","recipientCount":0,"fileId":null,"columns":null,"sampleRow":null,"mapping":null,"createdAt":0,"updatedAt":0,"sourceCampaignId":ID,"outcome":"read","matchedCount":0,"optedOutCount":0})
        }
        "approvals" => {
            json!([{"id":ID,"campaignId":ID,"action":"launch","status":"pending","reasons":["agent_request"],"recipientCount":0,"scheduledAt":null,"requestedBy":{"type":"api_key","id":"issuer"},"requestedAt":0,"expiresAt":1,"decidedBy":null,"decidedAt":null,"operationId":null}])
        }
        "settings" => json!({"launchApproval":{"recipientThreshold":null}}),
        "deleted" => json!({"deleted":true,"phone":PHONE,"revision":2}),
        _ => panic!("unknown fixture"),
    }
}
#[allow(clippy::too_many_arguments)]
async fn call(
    id: &str,
    m: &MessagingClient,
    c: &OrganizationClient,
    p: &ProjectClient,
    bound: bool,
    o: RequestOptions,
) -> polymorfa_sdk::Result<Value> {
    macro_rules! data{($e:expr)=>{serde_json::to_value($e.await?.data).map_err(|_|polymorfa_sdk::Error::new(ErrorKind::Server,"serialize","invalid_response"))};}
    macro_rules! csv{($e:expr)=>{{let r=$e.await?;Ok(json!({"csv":r.data.csv,"nextCursor":r.data.next_cursor,"filename":r.data.filename}))}};}
    let selection = CampaignProjectParameters {
        project_id: PROJECT.into(),
    };
    match id {
        "getCampaignReplyFlow" => data!(m.campaigns().get_reply_flow("slug", ID, o)),
        "getProjectCampaignLinks" => data!(m.campaigns().links("slug", ID, o)),
        "exportProjectCampaignRecipients" => {
            csv!(m
                .campaigns()
                .export_recipients("slug", ID, &Default::default(), o))
        }
        "createCampaignReplyFlow" => data!(m.campaigns().create_reply_flow("slug", &graph(), o)),
        "testSendCampaign" => data!(m.campaigns().test_send("slug", ID, &test_body(), o)),
        "setCampaignReplyFlow" => data!(m.campaigns().set_reply_flow(
            "slug",
            ID,
            &SetCampaignReplyFlowRequest {
                reply_flow_id: None
            },
            o
        )),
        "getCampaignSettings" => data!(c.campaigns().get_settings(o)),
        "createAudienceFromCampaign" => data!(c.audiences().create_from_campaign(
            &CreateAudienceFromCampaignRequest {
                name: "Retarget".into(),
                campaign_id: ID.into(),
                outcome: CampaignRetargetOutcome::Read,
                project_id: None
            },
            o
        )),
        "listAudienceProfiles" => data!(c.audience_profiles().list(&Default::default(), o)),
        "getAudienceProfile" => data!(c.audience_profiles().retrieve(PHONE, o)),
        "putAudienceProfile" => data!(c.audience_profiles().put(PHONE, &profile_body(), o)),
        "deleteAudienceProfile" => data!(c.audience_profiles().delete(PHONE, 1, o)),
        "listAudienceProfileConsent" => {
            data!(c
                .audience_profiles()
                .list_consent(PHONE, &Default::default(), o))
        }
        "createAudienceProfileImport" => {
            data!(c.audience_profiles().imports().create(&import_body(), o))
        }
        "getAudienceProfileImport" => data!(c.audience_profiles().imports().retrieve(ID, o)),
        "cancelAudienceProfileImport" => data!(c.audience_profiles().imports().cancel(ID, o)),
        "getStopConfirmationSettings" => data!(c.opt_outs().get_confirmation_settings(o)),
        "updateStopConfirmationSettings" => data!(c.opt_outs().update_confirmation_settings(
            &UpdateStopConfirmationSettingsRequest {
                team_id: PROJECT.into(),
                enabled: false,
                locale: None,
                revision: 0
            },
            o
        )),
        "getStopConfirmationSummary" => data!(c.opt_outs().get_confirmation_summary(o)),
        "getProjectSignalCustody" => {
            if bound {
                data!(p.signal_custody().retrieve(o))
            } else {
                data!(c.projects().get_signal_custody(PROJECT, o))
            }
        }
        "updateProjectSignalCustody" => {
            let b = ProjectSignalCustodyUpdate {
                expected_revision: 0,
                signal_mode_default: SignalCustodyMode::Standard,
            };
            if bound {
                data!(p.signal_custody().update(&b, o))
            } else {
                data!(c.projects().update_signal_custody(PROJECT, &b, o))
            }
        }
        "getCustomerSignalCustody" => {
            if bound {
                data!(p.signal_custody().retrieve_customer(CUSTOMER, o))
            } else {
                data!(c.customers().get_signal_custody(PROJECT, CUSTOMER, o))
            }
        }
        "updateCustomerSignalCustody" => {
            let b = CustomerSignalCustodyUpdate {
                expected_revision: 0,
                signal_mode_default: None,
            };
            if bound {
                data!(p.signal_custody().update_customer(CUSTOMER, &b, o))
            } else {
                data!(c
                    .customers()
                    .update_signal_custody(PROJECT, CUSTOMER, &b, o))
            }
        }
        "getPlatformCampaignReplyFlow" => {
            if bound {
                data!(p.campaigns().get_reply_flow(ID, o))
            } else {
                data!(c.campaigns().get_reply_flow(ID, &selection, o))
            }
        }
        "createPlatformCampaignReplyFlow" => {
            if bound {
                data!(p.campaigns().create_reply_flow(&graph(), o))
            } else {
                data!(c.campaigns().create_reply_flow(
                    &CreatePlatformCampaignReplyFlowRequest {
                        project_id: PROJECT.into(),
                        body: graph()
                    },
                    o
                ))
            }
        }
        "testSendPlatformCampaign" => {
            if bound {
                data!(p.campaigns().test_send(ID, &test_body(), o))
            } else {
                data!(c.campaigns().test_send(
                    ID,
                    &PlatformCampaignTestSendRequest {
                        project_id: PROJECT.into(),
                        body: test_body()
                    },
                    o
                ))
            }
        }
        "setPlatformCampaignReplyFlow" => {
            if bound {
                data!(p.campaigns().set_reply_flow(
                    ID,
                    &SetCampaignReplyFlowRequest {
                        reply_flow_id: None
                    },
                    o
                ))
            } else {
                data!(c.campaigns().set_reply_flow(
                    ID,
                    &SetPlatformCampaignReplyFlowRequest {
                        project_id: PROJECT.into(),
                        body: SetCampaignReplyFlowRequest {
                            reply_flow_id: None
                        }
                    },
                    o
                ))
            }
        }
        "getCampaignLinks" => {
            if bound {
                data!(p.campaigns().links(ID, o))
            } else {
                data!(c.campaigns().links(ID, &selection, o))
            }
        }
        "listCampaignLaunchApprovals" => {
            if bound {
                data!(p.campaigns().list_launch_approvals(ID, o))
            } else {
                data!(c.campaigns().list_launch_approvals(ID, &selection, o))
            }
        }
        "exportCampaignRecipients" => {
            if bound {
                csv!(p.campaigns().export_recipients(ID, &Default::default(), o))
            } else {
                csv!(c.campaigns().export_recipients(
                    ID,
                    &PlatformCampaignRecipientExportParameters {
                        project_id: PROJECT.into(),
                        filters: Default::default()
                    },
                    o
                ))
            }
        }
        _ => panic!("unknown operation"),
    }
}

fn rows() -> Vec<(&'static str, &'static str, String, &'static str)> {
    vec![
        (
            "getCampaignReplyFlow",
            "GET",
            format!("/messaging/projects/slug/campaign-reply-flows/{ID}"),
            "flow",
        ),
        (
            "getProjectCampaignLinks",
            "GET",
            format!("/messaging/projects/slug/campaigns/{ID}/links"),
            "links",
        ),
        (
            "exportProjectCampaignRecipients",
            "GET",
            format!("/messaging/projects/slug/campaigns/{ID}/recipients/export"),
            "csv",
        ),
        (
            "createCampaignReplyFlow",
            "POST",
            "/messaging/projects/slug/campaign-reply-flows".into(),
            "flow",
        ),
        (
            "testSendCampaign",
            "POST",
            format!("/messaging/projects/slug/campaigns/{ID}/test-send"),
            "send",
        ),
        (
            "setCampaignReplyFlow",
            "PUT",
            format!("/messaging/projects/slug/campaigns/{ID}/reply-flow"),
            "assignment",
        ),
        (
            "cancelAudienceProfileImport",
            "DELETE",
            format!("/platform/audience-profile-imports/{ID}"),
            "import",
        ),
        (
            "deleteAudienceProfile",
            "DELETE",
            "/platform/audience-profiles/%2B15551234567?expectedRevision=1".into(),
            "deleted",
        ),
        (
            "getAudienceProfileImport",
            "GET",
            format!("/platform/audience-profile-imports/{ID}"),
            "import",
        ),
        (
            "listAudienceProfiles",
            "GET",
            "/platform/audience-profiles".into(),
            "page-profile",
        ),
        (
            "getAudienceProfile",
            "GET",
            "/platform/audience-profiles/%2B15551234567".into(),
            "profile",
        ),
        (
            "listAudienceProfileConsent",
            "GET",
            "/platform/audience-profiles/%2B15551234567/consent".into(),
            "page-consent",
        ),
        (
            "getPlatformCampaignReplyFlow",
            "GET",
            format!("/platform/campaign-reply-flows/{ID}?projectId={PROJECT}"),
            "flow",
        ),
        (
            "getCampaignSettings",
            "GET",
            "/platform/campaign-settings".into(),
            "settings",
        ),
        (
            "listCampaignLaunchApprovals",
            "GET",
            format!("/platform/campaigns/{ID}/approvals?projectId={PROJECT}"),
            "approvals",
        ),
        (
            "getCampaignLinks",
            "GET",
            format!("/platform/campaigns/{ID}/links?projectId={PROJECT}"),
            "links",
        ),
        (
            "exportCampaignRecipients",
            "GET",
            format!("/platform/campaigns/{ID}/recipients/export?projectId={PROJECT}"),
            "csv",
        ),
        (
            "getStopConfirmationSettings",
            "GET",
            "/platform/optouts/confirmation-settings".into(),
            "confirmation",
        ),
        (
            "getStopConfirmationSummary",
            "GET",
            "/platform/optouts/confirmation-summary".into(),
            "summary",
        ),
        (
            "getCustomerSignalCustody",
            "GET",
            format!("/platform/projects/{PROJECT}/customers/{CUSTOMER}/signal-custody"),
            "custody",
        ),
        (
            "getProjectSignalCustody",
            "GET",
            format!("/platform/projects/{PROJECT}/signal-custody"),
            "custody",
        ),
        (
            "createAudienceProfileImport",
            "POST",
            "/platform/audience-profile-imports".into(),
            "import",
        ),
        (
            "createAudienceFromCampaign",
            "POST",
            "/platform/audiences/from-campaign".into(),
            "retarget",
        ),
        (
            "createPlatformCampaignReplyFlow",
            "POST",
            "/platform/campaign-reply-flows".into(),
            "flow",
        ),
        (
            "testSendPlatformCampaign",
            "POST",
            format!("/platform/campaigns/{ID}/test-send"),
            "send",
        ),
        (
            "putAudienceProfile",
            "PUT",
            "/platform/audience-profiles/%2B15551234567".into(),
            "profile",
        ),
        (
            "setPlatformCampaignReplyFlow",
            "PUT",
            format!("/platform/campaigns/{ID}/reply-flow"),
            "assignment",
        ),
        (
            "updateStopConfirmationSettings",
            "PUT",
            "/platform/optouts/confirmation-settings".into(),
            "confirmation",
        ),
        (
            "updateCustomerSignalCustody",
            "PUT",
            format!("/platform/projects/{PROJECT}/customers/{CUSTOMER}/signal-custody"),
            "custody",
        ),
        (
            "updateProjectSignalCustody",
            "PUT",
            format!("/platform/projects/{PROJECT}/signal-custody"),
            "custody",
        ),
    ]
}
#[tokio::test]
async fn all_thirty_public_routes_versions_envelopes_and_aliases() {
    assert_eq!(rows().len(), 30);
    for (id, method, path, kind) in rows() {
        for bound in [false, true] {
            for version in [None, Some("2099-01-01")] {
                let is_msg = id == "getCampaignReplyFlow" || path.starts_with("/messaging/");
                let payload = if let Some(inner) = kind.strip_prefix("page-") {
                    json!({"data":[fixture(inner)],"page":{"nextCursor":null,"hasMore":false}})
                } else if kind == "csv" {
                    Value::Null
                } else if is_msg {
                    json!({"success":true,"data":fixture(kind)})
                } else {
                    json!({"data":fixture(kind)})
                };
                let raw = (kind == "csv").then(|| "phone,status\r\n'+15551234567,sent\r\n".into());
                let headers = if kind == "csv" {
                    vec![
                        ("Content-Type".into(), "text/csv; charset=utf-8".into()),
                        ("Polymorfa-Next-Cursor".into(), "next-page".into()),
                        (
                            "Content-Disposition".into(),
                            "attachment; filename*=UTF-8''r%C3%A9cipients.csv".into(),
                        ),
                    ]
                } else {
                    vec![]
                };
                let w = Wire::new(vec![(200, payload.clone(), raw, headers)]).await;
                let (m, c, p) = w.clients();
                let o = RequestOptions {
                    api_version: version.map(str::to_owned),
                    ..Default::default()
                };
                let value = call(id, &m, &c, &p, bound, o)
                    .await
                    .unwrap_or_else(|e| panic!("{id}: {e:?}"));
                if kind == "csv" {
                    assert_eq!(value["filename"], "récipients.csv");
                    assert_eq!(value["nextCursor"], "next-page");
                    assert_eq!(value["csv"], "phone,status\r\n'+15551234567,sent\r\n");
                } else {
                    assert_eq!(numeric_json(value), numeric_json(payload), "{id}");
                }
                let requests = w.finish().await;
                assert_eq!(requests.len(), 1);
                let r = &requests[0];
                assert_eq!(r.method, method, "{id}");
                assert_eq!(&r.path, &path, "{id}");
                assert_eq!(
                    r.headers["polymorfa-version"],
                    version.unwrap_or("2026-10-14")
                );
                if ["testSendCampaign", "testSendPlatformCampaign"].contains(&id) {
                    assert!(!r.headers["idempotency-key"].is_empty());
                } else {
                    assert!(!r.headers.contains_key("idempotency-key"));
                }
                if id == "updateCustomerSignalCustody" {
                    assert_eq!(
                        r.body.as_ref().unwrap(),
                        &json!({"expectedRevision":0,"signalModeDefault":null})
                    );
                }
                if id == "putAudienceProfile" {
                    let b = r.body.as_ref().unwrap();
                    assert_eq!(b["tags"], json!([]));
                    assert_eq!(b["attributes"], json!({}));
                    assert_eq!(b["consent"]["allowed"], false);
                }
            }
        }
    }
}

fn numeric_json(v: Value) -> Value {
    match v {
        Value::Number(n) => json!(n.as_f64().unwrap()),
        Value::Array(a) => Value::Array(a.into_iter().map(numeric_json).collect()),
        Value::Object(o) => {
            Value::Object(o.into_iter().map(|(k, v)| (k, numeric_json(v))).collect())
        }
        other => other,
    }
}
#[tokio::test]
async fn normalized_response_keywords_and_extensions_are_not_revalidated_as_requests() {
    let mut flow = fixture("flow");
    let normalized = "i\u{307}".repeat(32);
    assert_eq!(normalized.len(), 96);
    assert_eq!(normalized.encode_utf16().count(), 64);
    flow["definition"]["nodes"][0]["edges"][0]["match"]["value"] = json!(normalized);
    flow["futureExtension"] = json!({"unrelated":true});
    let w = Wire::new(vec![(200, json!({"data":flow}), None, vec![])]).await;
    let (_, c, _) = w.clients();
    let r = c
        .campaigns()
        .get_reply_flow(
            ID,
            &CampaignProjectParameters {
                project_id: PROJECT.into(),
            },
            Default::default(),
        )
        .await
        .unwrap();
    match &r.data.data.definition.nodes[0].edges[0].r#match {
        CampaignReplyFlowMatch::Keyword { value } => assert_eq!(value, &normalized),
        _ => panic!("wrong match"),
    };
    w.finish().await;
}

#[test]
fn required_nullable_and_optional_nonnull_models_have_distinct_presence() {
    for kind in [
        "profile",
        "import",
        "custody",
        "send",
        "assignment",
        "confirmation",
        "retarget",
    ] {
        let value = fixture(kind);
        macro_rules! check {
            ($ty:ty,$field:expr) => {{
                let mut object = value.clone();
                object.as_object_mut().unwrap().remove($field);
                assert!(
                    serde_json::from_value::<$ty>(object).is_err(),
                    "{kind} missing {}",
                    $field
                );
                assert!(serde_json::from_value::<$ty>(value.clone()).is_ok());
            }};
        }
        match kind {
            "profile" => check!(AudienceProfile, "provenance"),
            "import" => check!(AudienceProfileImportJob, "completedAt"),
            "custody" => check!(SignalCustodyDefault, "signalModeDefault"),
            "send" => check!(CampaignTestSend, "messageId"),
            "assignment" => check!(CampaignReplyFlowAssignment, "replyFlowId"),
            "confirmation" => check!(StopConfirmationSettings, "locale"),
            "retarget" => check!(AudienceFromCampaignResult, "columns"),
            _ => {}
        }
    }
    let settings = fixture("settings");
    assert!(serde_json::from_value::<CampaignSettings>(settings.clone()).is_ok());
    let mut missing = settings;
    missing["launchApproval"]
        .as_object_mut()
        .unwrap()
        .remove("recipientThreshold");
    assert!(serde_json::from_value::<CampaignSettings>(missing).is_err());
    let approval = fixture("approvals")[0].clone();
    assert!(serde_json::from_value::<CampaignLaunchApproval>(approval.clone()).is_ok());
    for field in ["scheduledAt", "decidedBy", "decidedAt", "operationId"] {
        let mut missing = approval.clone();
        missing.as_object_mut().unwrap().remove(field);
        assert!(
            serde_json::from_value::<CampaignLaunchApproval>(missing).is_err(),
            "missing {field}"
        );
    }
    assert!(serde_json::from_value::<SetCampaignReplyFlowRequest>(json!({})).is_err());
    assert!(
        serde_json::from_value::<CustomerSignalCustodyUpdate>(json!({"expectedRevision":0}))
            .is_err()
    );
    assert!(serde_json::from_value::<ProjectSignalCustodyUpdate>(
        json!({"expectedRevision":0,"signalModeDefault":null})
    )
    .is_err());
    for bad in [
        json!({"kind":"buttons","body":"Hello","footer":null,"buttons":[{"id":"ok","text":"Yes"}]}),
        json!({"kind":"list","body":"Hello","buttonText":"Open","rows":[{"id":"ok","title":"Yes","description":null}]}),
        json!({"kind":"native_flow","flowDraftId":ID}),
    ] {
        assert!(serde_json::from_value::<CampaignReplyFlowSend>(bad).is_err());
    }
    assert!(serde_json::from_value::<CampaignReplyFlowNode>(
        json!({"id":"node","edges":[],"send":null})
    )
    .is_err());
    assert_eq!(
        serde_json::to_value(CustomerSignalCustodyUpdate {
            expected_revision: 0,
            signal_mode_default: None
        })
        .unwrap(),
        json!({"expectedRevision":0,"signalModeDefault":null})
    );
}

#[tokio::test]
async fn malformed_success_envelopes_pages_and_csv_are_rejected() {
    let valid = json!({"data":fixture("profile")});
    let mut missing = valid.clone();
    missing["data"]
        .as_object_mut()
        .unwrap()
        .remove("provenance");
    let mut nulltags = valid.clone();
    nulltags["data"]["tags"] = Value::Null;
    for payload in [
        json!({}),
        json!([]),
        json!({"data":null}),
        fixture("profile"),
        missing,
        nulltags,
    ] {
        let w = Wire::new(vec![(200, payload, None, vec![])]).await;
        let (_, c, _) = w.clients();
        assert_eq!(
            c.audience_profiles()
                .retrieve(PHONE, Default::default())
                .await
                .unwrap_err()
                .code
                .as_deref(),
            Some("invalid_response")
        );
        w.finish().await;
    }
    for payload in [
        json!({"data":[]}),
        json!({"data":[],"page":{"hasMore":false}}),
        json!({"data":[],"page":{"hasMore":true,"nextCursor":null}}),
        json!({"data":[],"page":{"hasMore":false,"nextCursor":ID}}),
    ] {
        let w = Wire::new(vec![(200, payload, None, vec![])]).await;
        let (_, c, _) = w.clients();
        assert!(c
            .audience_profiles()
            .list(&Default::default(), Default::default())
            .await
            .is_err());
        w.finish().await;
    }
    for (status, mime, raw) in [
        (204, "text/csv", ""),
        (200, "text/html", "<html>private content</html>"),
    ] {
        let w = Wire::new(vec![(
            status,
            Value::Null,
            Some(raw.into()),
            vec![("Content-Type".into(), mime.into())],
        )])
        .await;
        let (_, _, p) = w.clients();
        let e = p
            .campaigns()
            .export_recipients(ID, &Default::default(), Default::default())
            .await
            .unwrap_err();
        assert_eq!(e.code.as_deref(), Some("invalid_response"));
        assert!(!e.to_string().contains("private"));
        w.finish().await;
    }
    for success in [false, true] {
        let payload = if success {
            json!({"success":true})
        } else {
            json!({"success":false,"data":fixture("links")})
        };
        let w = Wire::new(vec![(200, payload, None, vec![])]).await;
        let (m, _, _) = w.clients();
        assert!(m
            .campaigns()
            .links("slug", ID, Default::default())
            .await
            .is_err());
        w.finish().await;
    }
}

#[tokio::test]
async fn server_credentials_and_validation_refuse_before_http() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    let opts = ClientOptions {
        base_url: base,
        max_network_retries: 0,
        ..Default::default()
    };
    let m = MessagingClient::new(
        Credential::client_token("pmfa_ct_c3ludGhldGljLW9ubHk").unwrap(),
        opts.clone(),
    )
    .unwrap();
    let c = OrganizationClient::new(
        Credential::organization_api_key("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k".to_string())
            .unwrap(),
        opts,
    )
    .unwrap();
    let p = c.project(PROJECT).unwrap();
    for (id, _, path, _) in rows()
        .into_iter()
        .filter(|(_, _, p, _)| p.starts_with("/messaging/"))
    {
        let e = tokio::time::timeout(
            Duration::from_secs(1),
            call(id, &m, &c, &p, true, Default::default()),
        )
        .await
        .unwrap()
        .unwrap_err();
        assert_eq!(e.kind, ErrorKind::Configuration, "{path}");
    }
    let mut profiles = Vec::new();
    let mut b = profile_body();
    b.tags = vec!["é".repeat(25)];
    profiles.push(b);
    let mut b = profile_body();
    b.attributes.insert("bad-name".into(), None);
    profiles.push(b);
    let mut b = profile_body();
    b.attributes
        .insert("x".into(), Some(CampaignTestVariable::Number(f64::NAN)));
    profiles.push(b);
    let mut b = profile_body();
    b.expected_revision = Some(0);
    profiles.push(b);
    let mut b = profile_body();
    b.tags = vec!["same".into(), "same".into()];
    profiles.push(b);
    for b in profiles {
        assert_eq!(
            c.audience_profiles()
                .put(PHONE, &b, Default::default())
                .await
                .unwrap_err()
                .kind,
            ErrorKind::Configuration
        );
    }
    let mut b = graph();
    b.name = "é".repeat(65);
    assert!(p
        .campaigns()
        .create_reply_flow(&b, Default::default())
        .await
        .is_err());
    let mut b = graph();
    b.definition.nodes[0].edges[0].r#match = CampaignReplyFlowMatch::Keyword {
        value: "İ".repeat(33),
    };
    assert!(p
        .campaigns()
        .create_reply_flow(&b, Default::default())
        .await
        .is_err());
    for b in [
        CreateAudienceProfileImportRequest {
            csv_base64: "Zh==".into(),
            ..import_body()
        },
        CreateAudienceProfileImportRequest {
            csv_base64: "YWJj\n".into(),
            ..import_body()
        },
        CreateAudienceProfileImportRequest {
            csv_base64: "AA==".into(),
            ..import_body()
        },
    ] {
        assert!(c
            .audience_profiles()
            .imports()
            .create(&b, Default::default())
            .await
            .is_err());
    }
    assert!(p
        .campaigns()
        .export_recipients(
            ID,
            &CampaignRecipientExportParameters {
                status: Some(polymorfa_sdk::campaigns::CampaignRecipientStatus::Failed),
                limit: Some(1),
                ..Default::default()
            },
            Default::default()
        )
        .await
        .is_err());
    assert!(p
        .signal_custody()
        .update(
            &ProjectSignalCustodyUpdate {
                expected_revision: u64::MAX,
                signal_mode_default: SignalCustodyMode::Standard
            },
            Default::default()
        )
        .await
        .is_err());
    assert!(c
        .opt_outs()
        .update_confirmation_settings(
            &UpdateStopConfirmationSettingsRequest {
                team_id: PROJECT.into(),
                enabled: true,
                revision: 0,
                locale: None
            },
            Default::default()
        )
        .await
        .is_err());
    assert!(
        tokio::time::timeout(Duration::from_millis(30), listener.accept())
            .await
            .is_err()
    );
}

#[tokio::test]
async fn caller_keys_remain_stable_and_nonreplay_writes_default_to_one_attempt() {
    for header in ["Idempotency-Key", "idempotency-key", "IDEMPOTENCY-KEY"] {
        let good = json!({"data":fixture("send")});
        let error = json!({"error":{"code":"upstream_failure","message":"Try later"}});
        let w = Wire::new(vec![
            (503, error.clone(), None, vec![]),
            (200, good.clone(), None, vec![]),
            (503, error, None, vec![]),
            (200, good, None, vec![]),
        ])
        .await;
        let (_, _, p) = w.clients();
        let o = RequestOptions {
            headers: BTreeMap::from([(header.into(), "caller-fixed".into())]),
            max_network_retries: Some(1),
            ..Default::default()
        };
        for _ in 0..2 {
            p.campaigns()
                .test_send(ID, &test_body(), o.clone())
                .await
                .unwrap();
        }
        for r in w.finish().await {
            assert_eq!(r.headers["idempotency-key"], "caller-fixed");
            assert_eq!(r.body.unwrap()["projectId"], PROJECT);
        }
    }
    let w = Wire::new(vec![(
        503,
        json!({"error":{"code":"future_contract_error","param":"body.tags","message":"Refused"}}),
        None,
        vec![("X-Trace-Id".into(), "trace".into())],
    )])
    .await;
    let (_, c, _) = w.clients();
    let e = c
        .audience_profiles()
        .put(
            PHONE,
            &profile_body(),
            RequestOptions {
                idempotency_key: Some("caller-owned".into()),
                ..Default::default()
            },
        )
        .await
        .unwrap_err();
    assert_eq!(e.code.as_deref(), Some("future_contract_error"));
    assert_eq!(e.param.as_deref(), Some("body.tags"));
    assert_eq!(e.metadata.as_ref().unwrap().headers["x-trace-id"], "trace");
    assert_eq!(w.finish().await.len(), 1);
    for code in polymorfa_sdk::errors::CAMPAIGN_CONTRACT_ERROR_CODES {
        assert!(polymorfa_sdk::is_known_error_code(code));
    }
}

#[tokio::test]
async fn retained_project_views_and_finite_pages_do_not_retarget_or_autopage() {
    let other = CUSTOMER;
    let payload = json!({"data":fixture("links")});
    let w = Wire::new(vec![
        (200, payload.clone(), None, vec![]),
        (200, payload.clone(), None, vec![]),
        (200, payload, None, vec![]),
    ])
    .await;
    let (_, c, p) = w.clients();
    let b = c.project(other).unwrap();
    let a_view = p.campaigns();
    let b_view = b.campaigns();
    a_view.links(ID, Default::default()).await.unwrap();
    b_view.links(ID, Default::default()).await.unwrap();
    a_view.links(ID, Default::default()).await.unwrap();
    let r = w.finish().await;
    assert!(r[0].path.ends_with(PROJECT));
    assert!(r[1].path.ends_with(other));
    assert!(r[2].path.ends_with(PROJECT));
    let w = Wire::new(vec![(
        200,
        json!({"data":[],"page":{"nextCursor":ID,"hasMore":true}}),
        None,
        vec![],
    )])
    .await;
    let (_, c, _) = w.clients();
    let page = c
        .audience_profiles()
        .list(
            &ListAudienceProfilesParameters {
                cursor: Some(ID.into()),
                limit: Some(1),
            },
            Default::default(),
        )
        .await
        .unwrap();
    assert!(page.data.page.has_more);
    assert_eq!(page.data.page.next_cursor.as_deref(), Some(ID));
    assert_eq!(w.finish().await.len(), 1);
    let token =
        Credential::project_token("pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k".to_string()).unwrap();
    let p = ProjectClient::new(token, PROJECT, ClientOptions::default()).unwrap();
    assert!(p.project(other).is_err());
}

#[tokio::test]
async fn every_retained_campaign_method_preserves_its_project() {
    for (id, _, _, kind) in rows().into_iter().filter(|(id, _, _, _)| {
        [
            "getPlatformCampaignReplyFlow",
            "createPlatformCampaignReplyFlow",
            "setPlatformCampaignReplyFlow",
            "testSendPlatformCampaign",
            "getCampaignLinks",
            "listCampaignLaunchApprovals",
            "exportCampaignRecipients",
        ]
        .contains(id)
    }) {
        let payload = if kind == "csv" {
            Value::Null
        } else {
            json!({"data":fixture(kind)})
        };
        let raw = (kind == "csv").then(|| "phone\r\n".into());
        let headers = if kind == "csv" {
            vec![("content-type".into(), "text/csv".into())]
        } else {
            vec![]
        };
        let w = Wire::new(
            (0..3)
                .map(|_| (200, payload.clone(), raw.clone(), headers.clone()))
                .collect(),
        )
        .await;
        let (m, c, a) = w.clients();
        let b = c.project(CUSTOMER).unwrap();
        for p in [&a, &b, &a] {
            call(id, &m, &c, p, true, Default::default()).await.unwrap();
        }
        let captured = w.finish().await;
        for (request, expected) in captured.iter().zip([PROJECT, CUSTOMER, PROJECT]) {
            if let Some(body) = &request.body {
                assert_eq!(body["projectId"], expected, "{id}");
            } else {
                assert!(request.path.ends_with(expected), "{id}: {}", request.path);
            }
        }
    }
}

#[tokio::test]
async fn typed_reply_variants_and_unicode_variable_limits_reach_the_wire() {
    let variants = vec![
        CampaignReplyFlowSend::Text {
            text: "Hello".into(),
        },
        CampaignReplyFlowSend::Buttons {
            body: "Hello".into(),
            footer: Some("Footer".into()),
            buttons: vec![CampaignReplyButton {
                id: "yes".into(),
                text: "Yes".into(),
            }],
        },
        CampaignReplyFlowSend::List {
            body: "Hello".into(),
            button_text: "Open".into(),
            footer: None,
            rows: vec![CampaignReplyRow {
                id: "yes".into(),
                title: "Yes".into(),
                description: Some("Detail".into()),
            }],
        },
        CampaignReplyFlowSend::FlowForm {
            flow_id: ID.into(),
            body: "Hello".into(),
            button_text: "Open".into(),
            footer: None,
            screen: "FIRST_SCREEN".into(),
        },
    ];
    for send in variants {
        let expected = serde_json::to_value(&send).unwrap();
        let w = Wire::new(vec![(200, json!({"data":fixture("flow")}), None, vec![])]).await;
        let (_, _, p) = w.clients();
        let mut body = graph();
        body.definition.nodes[1].send = Some(send);
        p.campaigns()
            .create_reply_flow(&body, Default::default())
            .await
            .unwrap();
        assert_eq!(
            w.finish().await[0].body.as_ref().unwrap()["definition"]["nodes"][1]["send"],
            expected
        );
    }
    let w = Wire::new(vec![(200, json!({"data":fixture("send")}), None, vec![])]).await;
    let (_, _, p) = w.clients();
    let mut body = test_body();
    body.variables = Some(BTreeMap::from([
        (
            "emoji".into(),
            CampaignTestVariable::String("😀".repeat(512)),
        ),
        ("zero".into(), CampaignTestVariable::Number(0.0)),
        ("false".into(), CampaignTestVariable::Boolean(false)),
    ]));
    p.campaigns()
        .test_send(ID, &body, Default::default())
        .await
        .unwrap();
    let wire = w.finish().await;
    assert_eq!(wire[0].body.as_ref().unwrap()["variables"]["false"], false);
    assert_eq!(
        wire[0].body.as_ref().unwrap()["variables"]["emoji"]
            .as_str()
            .unwrap()
            .encode_utf16()
            .count(),
        1024
    );
    body.variables.as_mut().unwrap().insert(
        "emoji".into(),
        CampaignTestVariable::String("😀".repeat(513)),
    );
    assert_eq!(
        p.campaigns()
            .test_send(ID, &body, Default::default())
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Configuration
    );
}

#[tokio::test]
async fn settings_threshold_response_enforces_its_declared_bounds() {
    for threshold in [0, 1_000_001] {
        let w = Wire::new(vec![(
            200,
            json!({"data":{"launchApproval":{"recipientThreshold":threshold}}}),
            None,
            vec![],
        )])
        .await;
        let (_, c, _) = w.clients();
        assert_eq!(
            c.campaigns()
                .get_settings(Default::default())
                .await
                .unwrap_err()
                .code
                .as_deref(),
            Some("invalid_response")
        );
        w.finish().await;
    }
}

#[tokio::test]
async fn semantic_profile_quota_and_import_wire_size_use_their_actual_units() {
    use base64::Engine;
    let mut body = profile_body();
    for i in 0..5 {
        body.attributes.insert(
            format!("a{i}"),
            Some(CampaignTestVariable::String("\u{1}".repeat(256))),
        );
    }
    let current = serde_json::to_vec(&body.attributes).unwrap().len();
    // A new key adds eight JSON bytes, then six bytes per escaped control.
    let remaining = 8192 - current - 8;
    let value = format!(
        "{}{}",
        "\u{1}".repeat(remaining / 6),
        "a".repeat(remaining % 6)
    );
    assert!(value.len() <= 256);
    body.attributes.insert(
        "a5".into(),
        Some(CampaignTestVariable::String(value.clone())),
    );
    assert_eq!(serde_json::to_vec(&body.attributes).unwrap().len(), 8192);
    let w = Wire::new(vec![(
        200,
        json!({"data":fixture("profile")}),
        None,
        vec![],
    )])
    .await;
    let (_, c, _) = w.clients();
    c.audience_profiles()
        .put(PHONE, &body, Default::default())
        .await
        .unwrap();
    assert_eq!(w.finish().await.len(), 1);
    body.attributes.insert(
        "a5".into(),
        Some(CampaignTestVariable::String(format!("{value}a"))),
    );
    assert_eq!(
        c.audience_profiles()
            .put(PHONE, &body, Default::default())
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Configuration
    );
    let mut import = import_body();
    import.csv_base64 =
        base64::engine::general_purpose::STANDARD.encode(vec![b'a'; 10 * 1024 * 1024]);
    let w = Wire::new(vec![(200, json!({"data":fixture("import")}), None, vec![])]).await;
    let (_, c, _) = w.clients();
    c.audience_profiles()
        .imports()
        .create(&import, Default::default())
        .await
        .unwrap();
    let requests = w.finish().await;
    assert!(
        serde_json::to_vec(requests[0].body.as_ref().unwrap())
            .unwrap()
            .len()
            <= 14 * 1024 * 1024
    );
    import.csv_base64 =
        base64::engine::general_purpose::STANDARD.encode(vec![b'a'; 10 * 1024 * 1024 + 1]);
    assert_eq!(
        c.audience_profiles()
            .imports()
            .create(&import, Default::default())
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Configuration
    );
}

#[tokio::test]
async fn cancellation_settles_csv_body_without_a_second_request() {
    let l = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", l.local_addr().unwrap());
    let (start_tx, start_rx) = tokio::sync::oneshot::channel();
    let (release_tx, release_rx) = tokio::sync::oneshot::channel();
    let server = tokio::spawn(async move {
        let (mut socket, _) = l.accept().await.unwrap();
        let mut buf = [0; 4096];
        assert!(socket.read(&mut buf).await.unwrap() > 0);
        socket.write_all(b"HTTP/1.1 200 OK\r\ncontent-type: text/csv\r\ncontent-length: 100\r\nconnection: close\r\n\r\n").await.unwrap();
        start_tx.send(()).unwrap();
        let _ = release_rx.await;
    });
    let c = OrganizationClient::new(
        Credential::organization_api_key("pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k".to_string())
            .unwrap(),
        ClientOptions {
            base_url: base,
            max_network_retries: 0,
            ..Default::default()
        },
    )
    .unwrap();
    let token = tokio_util::sync::CancellationToken::new();
    let cancel = token.clone();
    let controller = async move {
        start_rx.await.unwrap();
        cancel.cancel();
    };
    let selection = PlatformCampaignRecipientExportParameters {
        project_id: PROJECT.into(),
        filters: Default::default(),
    };
    let campaigns = c.campaigns();
    let request = campaigns.export_recipients(
        ID,
        &selection,
        RequestOptions {
            cancellation: Some(token),
            ..Default::default()
        },
    );
    let (result, ()) = tokio::join!(request, controller);
    assert_eq!(result.unwrap_err().kind, ErrorKind::Cancelled);
    release_tx.send(()).unwrap();
    server.await.unwrap();
}
