#[allow(dead_code)]
mod support;
use polymorfa_sdk::{configuration::*, settings::*, ClientOptions, Credential, RequestOptions};
use serde_json::json;
macro_rules! settings_wire {
    ($project:expr,$method:expr,$path:expr,$body:expr,$expected:expr,$name:ident,$resource:ident,$call:expr) => {{
        let expected=$expected;
        let (base,server)=support::wire($method,$path,$body,json!({"data":expected})).await;
        let org=support::organization(base);let view=org.project("project").unwrap();
        let $resource=if $project {view.$name()} else {org.$name()};
        let result=$call.await.unwrap();support::assert_subset(&expected,&serde_json::to_value(result.data).unwrap());
        assert_eq!(result.metadata.request_id.as_deref(),Some("wire_fixture"));server.await.unwrap();
    }};
}
#[tokio::test]
async fn organization_and_immutable_project_configuration_defaults_native_wire() {
    let configuration = json!({"effective":{"observation":{"presenceMode":"cache","typingMode":"events","labelMode":"project","quickReplyMode":"off"},"historySync":{"mode":"deliver","requestFull":true},"hms":{"enabled":false}},"overrides":{},"sources":{"historySync.mode":"consent","historySync.requestFull":"session","hms":"project","observation.presenceMode":"session","observation.typingMode":"team","observation.labelMode":"project","observation.quickReplyMode":"platform"},"requestedHistory":{"mode":"deliver","requestFull":true},"historyConsent":"accepted","revisions":{"team":1,"project":2,"session":3},"application":{"desiredGeneration":4,"appliedGeneration":4,"status":"applied"}});
    let update = UpdateSessionDefaults {
        configuration: SessionConfigurationPatch {
            set: Some(SessionConfigurationOverrides {
                hms: Some(HmsConfiguration::Disabled),
                ..Default::default()
            }),
            reset: Some(vec![SessionConfigurationReset::HistorySyncRequestFull]),
        },
        revision: 3,
    };
    for project in [false, true] {
        let path = if project {
            "/platform/session-configuration?projectId=project"
        } else {
            "/platform/session-configuration"
        };
        settings_wire!(
            project,
            "GET",
            path,
            None,
            configuration.clone(),
            session_configuration,
            resource,
            resource.retrieve(RequestOptions::default())
        );
        let mut body = json!({"configuration":{"set":{"hms":{"enabled":false}},"reset":["historySync.requestFull"]},"revision":3});
        if project {
            body["projectId"] = json!("project");
        }
        settings_wire!(
            project,
            "PUT",
            "/platform/session-configuration",
            Some(body),
            configuration.clone(),
            session_configuration,
            resource,
            resource.update(&update, RequestOptions::default())
        );
    }
}
#[tokio::test]
async fn owner_bound_quicklink_settings_sparse_nulls_and_call_retention_native_wire() {
    let settings = json!({"id":"setting","projectId":null,"enabled":true,"successCallbackUrl":null,"failureCallbackUrl":null,"businessName":"Shop","headline":"Connect","description":null,"successMessage":null,"supportUrl":null,"privacyUrl":null,"termsUrl":null,"accent":"#123456","theme":"system","hideWatermark":false,"allowPhoneChange":false,"shape":"rounded","radiusPx":8.0,"logoMode":"organization","logoStorageId":null,"logoSourceStorageId":null,"logoUrl":null,"historySync":"ask","methods":["qr","pairing"],"defaultMethod":"qr","createdAt":1800000000000u64,"updatedAt":1800000000000u64});
    let update:UpdateQuickLinkSettings=serde_json::from_value(json!({"headline":null,"defaultMethod":null,"methods":["pairing"],"theme":"dark","successCallbackUrl":"https://example.com/success","allowPhoneChange":true})).unwrap();
    assert_eq!(
        serde_json::to_value(&update).unwrap(),
        json!({"headline":null,"defaultMethod":null,"methods":["pairing"],"theme":"dark","successCallbackUrl":"https://example.com/success","allowPhoneChange":true})
    );
    let retention = json!({"policy":"custom","retentionDays":42,"appliesTo":["call_records","call_events","client_reports"],"revision":2,"updatedAt":"2026-10-11T12:00:00Z"});
    let retention_update = UpdateCallRetentionRequest::Custom {
        retention_days: 42,
        expected_revision: Some(1),
    };
    for project in [false, true] {
        let path = if project {
            "/platform/quicklink?projectId=project"
        } else {
            "/platform/quicklink"
        };
        let mut expected = settings.clone();
        if project {
            expected["projectId"] = json!("project");
        }
        settings_wire!(
            project,
            "GET",
            path,
            None,
            expected.clone(),
            quick_link_settings,
            resource,
            resource.retrieve(RequestOptions::default())
        );
        let mut body = serde_json::to_value(&update).unwrap();
        if project {
            body["projectId"] = json!("project");
        }
        settings_wire!(
            project,
            "PUT",
            "/platform/quicklink",
            Some(body),
            expected,
            quick_link_settings,
            resource,
            resource.update(&update, RequestOptions::default())
        );
        settings_wire!(
            project,
            "GET",
            "/platform/call-retention",
            None,
            retention.clone(),
            call_retention,
            resource,
            resource.retrieve(RequestOptions::default())
        );
        settings_wire!(
            project,
            "PUT",
            "/platform/call-retention",
            Some(json!({"policy":"custom","retentionDays":42,"expectedRevision":1})),
            retention.clone(),
            call_retention,
            resource,
            resource.update(&retention_update, RequestOptions::default())
        );
    }
    settings_wire!(
        false,
        "GET",
        "/platform/quicklink",
        None,
        serde_json::Value::Null,
        quick_link_settings,
        resource,
        resource.retrieve(RequestOptions::default())
    );
}
#[tokio::test]
async fn standalone_team_retention_requires_server_principal_without_project_id() {
    let token = Credential::project_token(format!("pmfa_pt_{}A", "a".repeat(93))).unwrap();
    assert!(TeamCallRetentionClient::new(token, ClientOptions::default()).is_ok());
    let token = Credential::client_token("pmfa_ct_client").unwrap();
    assert!(TeamCallRetentionClient::new(token, ClientOptions::default()).is_err());
}
