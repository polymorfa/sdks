#[allow(dead_code)]
mod support;
use polymorfa_sdk::{organization::*, RequestOptions};
use serde_json::json;
#[tokio::test]
async fn organization_identity_and_credential_metadata_native_wire() {
    wire_organization!(
        client,
        "GET",
        "/platform/team",
        None,
        json!({"data":{"id":"team","externalId":"external","name":"Team","slug":null,"email":"team@example.com","timezone":"UTC","creditBalanceCents":100,"lowBalanceThresholdCents":20,"billingEmail":null,"status":"active","plan":"payg","planStatus":null,"isActive":true,"createdAt":1000,"updatedAt":2000}}),
        client.organizations().retrieve(RequestOptions::default())
    );
    wire_organization!(
        client,
        "GET",
        "/platform/members",
        None,
        json!({"data":[{"_id":"member","_creationTime":1000.0,"orgId":"team","userId":"user","email":"user@example.com","name":null,"role":"owner","status":"active","invitedAt":null,"joinedAt":1000}]}),
        client.members().list(RequestOptions::default())
    );
    wire_organization!(
        client,
        "GET",
        "/platform/keys",
        None,
        json!({"data":[{"_id":"key","_creationTime":1000.0,"id":"key","keyId":"key","start":"pmfa","last4":"abcd","orgId":"team","label":"server","scopes":1,"source":"api","expiresAt":3000,"lastUsed":2000,"isActive":true}]}),
        client.api_keys().list(RequestOptions::default())
    );
    wire_organization!(
        client,
        "DELETE",
        "/platform/keys/key%2Fid",
        None,
        json!({"data":{"ok":true,"keyId":"key/id"}}),
        client
            .api_keys()
            .deactivate("key/id", RequestOptions::default())
    );
    wire_organization!(
        client,
        "GET",
        "/platform/tokens?projectId=project",
        None,
        json!({"data":[{"id":"token","start":"pmfa_pt","last4":"abcd","label":null,"scopes":1,"expiresAt":null,"createdAt":1000,"lastUsedAt":2000,"revokedAt":null}]}),
        client
            .project_tokens()
            .list("project", RequestOptions::default())
    );
}
#[tokio::test]
async fn organization_audit_and_security_incident_native_wire() {
    wire_organization!(
        client,
        "GET",
        "/platform/audit?action=send&resource=message&limit=20",
        None,
        json!({"data":[{"id":"audit","actorEmail":"user@example.com","actorUserId":"user","actorRole":"owner","action":"send","resource":"message","projectId":"project","projectName":"Project","ip":null,"userAgent":null,"duration":1.2,"source":"api","description":null,"result":"ok","metadata":{"count":1},"createdAt":1000}]}),
        client.audit_logs().list(
            &ListAuditLogsParameters {
                action: Some("send".into()),
                resource: Some("message".into()),
                limit: Some(20)
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "GET",
        "/platform/incidents",
        None,
        json!({"data":[{"id":"incident","keyId":"key","tokenType":"org","source":"detection","url":null,"ref":null,"resolution":"pending","detectedAt":1000,"acknowledgedAt":null,"acknowledgedBy":null,"createdAt":1000}]}),
        client.security_incidents().list(RequestOptions::default())
    );
    wire_organization!(
        client,
        "POST",
        "/platform/incidents/incident/acknowledge",
        None,
        json!({"data":{"acknowledged":true}}),
        client
            .security_incidents()
            .acknowledge("incident", RequestOptions::default())
    );
}
