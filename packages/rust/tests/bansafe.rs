#[allow(dead_code)]
mod support;
use polymorfa_sdk::{bansafe::*, RequestOptions};
use serde_json::{json, Value};
fn health() -> Value {
    json!({"health":91.5,"band":"good","healthSource":"ml_model","healthEstimatorVersion":"rules1","healthModelVersion":"model1","healthEvaluatedAt":"now","healthFeatureCoverage":0.9,"healthReliability":"validated","healthUnavailableReason":null,"healthProbabilities":{"healthy":0.9,"limited":0.08,"restricted":0.01,"banned":0.01},"mostLikelyHealthState":"healthy","healthExplanation":{"penalties":{"conduct":1.0,"delivery":2.0,"connection":0.0,"restriction":0.0,"total":3.0},"factors":[{"group":"delivery","key":"failed","penalty":2.0,"observedValue":0.1,"sampleSize":20}],"measuredGroups":["delivery","connection"],"missingGroups":["conduct"]},"observedAccountState":{"state":"healthy","observedAt":"now","source":"account_check"}})
}
fn enforcement() -> Value {
    json!({"rung":"notify","previousRung":"none","organizationFloor":"none","reason":"health","source":"automatic","throughputPerMinute":10.0,"blocksUnsolicited":false,"suspended":false,"startedAt":"now","eligibleLiftAt":null,"exitProgress":0.5,"blockingFindings":["delivery"],"operatorHold":false,"appealState":"none","state":"applied"})
}
fn number() -> Value {
    let mut v = health();
    v.as_object_mut().unwrap().extend(json!({"sessionId":"sid","session":"support","phoneNumber":"+1555","projectId":"project","enforcement":enforcement()}).as_object().unwrap().clone());
    v
}
fn finding() -> Value {
    json!({"id":"finding","key":"delivery","title":"Delivery","summary":"Check delivery","fix":"Slow down","status":"open","severity":"warning","occurrences":2,"reopenedCount":1,"evidence":{"failed":0.1},"sessionId":"sid","session":"support","phoneNumber":"+1555","firstSeenAt":"then","lastSeenAt":"now","acknowledgedAt":null,"acknowledgedBy":null,"acknowledgementNote":null,"snoozedUntil":null,"resolvedAt":null,"resolveReason":null})
}
fn incident() -> Value {
    json!({"id":"incident","sessionId":"sid","session":"support","phoneNumber":"+1555","projectId":"project","kind":"customer_report","source":"customer","resolution":"open","ambiguous":true,"startedAt":"now","endsAt":null,"closedAt":null,"closedBy":null,"claimId":"claim","note":"reported","reportedBy":"member","createdAt":"now"})
}
fn claim() -> Value {
    json!({"id":"claim","incidentId":"incident","sessionId":"sid","session":"support","phoneNumber":"+1555","projectId":"project","status":"under_review","verdict":"inconclusive","windowStart":"then","windowEnd":"now","measuredCents":2.123456,"capCents":3.0,"amountCents":0.0,"evidence":{"attributionRuleVersion":1,"windowDays":7,"deviceEvidence":true,"otherDevices":2,"restrictedInWindow":true,"criticalFindingDays":1,"sharedConnection":false,"measuredHours":100},"summary":"Review","reason":"evidence","decidedAt":null,"paidAt":null,"createdAt":"now"})
}
fn signal() -> Value {
    json!({"key":"delivery","label":"Delivery","group":"delivery","kind":"code_counts","unit":"count","description":"Codes","measured":true,"value":[1.0,2.0],"sampleSize":2,"codes":[{"code":429,"count":2}]})
}
fn snapshot() -> Value {
    json!({"bucketStart":"then","flushedAt":"now","receivedAt":"now","partial":false,"recordVersion":2,"signals":[signal()]})
}
fn collection() -> Value {
    json!({"sessionId":"sid","session":"support","projectId":"project","collection":{"state":"fresh","latestFlushedAt":"now","latestReceivedAt":"now","freshUntil":"later","recordVersion":2,"collectorVersion":1,"partial":false,"droppedRecords":0}})
}
fn page(item: Value) -> Value {
    json!({"data":[item],"page":{"nextCursor":"next","hasMore":true}})
}
#[tokio::test]
async fn health_explanations_findings_enforcement_and_telemetry_native_wire() {
    wire_organization!(
        client,
        "GET",
        "/platform/bansafe/health?cursor=before&limit=5&projectId=project",
        None,
        page(number()),
        client.ban_safe().list_health(
            &ListHealthParameters {
                project_id: Some("project".into()),
                cursor: Some("before".into()),
                limit: Some(5)
            },
            RequestOptions::default()
        )
    );
    let mut detail = number();
    detail.as_object_mut().unwrap().extend(json!({"warmup":{"enabled":true,"tenureSource":"history","tenureDay":5,"allowance":10,"sentToday":2,"resetsAt":"later","curve":[{"day":1,"allowance":5}]},"findings":[finding()],"liftRequires":"clean","appealState":"requested"}).as_object().unwrap().clone());
    wire_organization!(
        client,
        "GET",
        "/platform/bansafe/health/support",
        None,
        json!({"data":detail}),
        client
            .ban_safe()
            .get_health("support", RequestOptions::default())
    );
    let mut point = health();
    point["band"] = Value::Null;
    wire_organization!(
        client,
        "GET",
        "/platform/bansafe/health/support/history?limit=5&since=then",
        None,
        json!({"data":{"sessionId":"sid","session":"support","points":[point]}}),
        client.ban_safe().list_health_history(
            "support",
            &ListHealthHistoryParameters {
                since: Some("then".into()),
                limit: Some(5)
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "GET",
        "/platform/bansafe/signals",
        None,
        json!({"data":[{"key":"delivery","label":"Delivery","group":"delivery","kind":"code_counts","unit":"count","description":"Codes"}]}),
        client.ban_safe().list_signals(RequestOptions::default())
    );
    let mut telemetry = collection();
    telemetry["snapshot"] = snapshot();
    wire_organization!(
        client,
        "GET",
        "/platform/bansafe/telemetry/support",
        None,
        json!({"data":telemetry}),
        client
            .ban_safe()
            .get_telemetry("support", RequestOptions::default())
    );
    wire_organization!(
        client,
        "GET",
        "/platform/bansafe/telemetry/support/history?cursor=before&limit=5&since=then&until=now",
        None,
        page(snapshot()),
        client.ban_safe().list_telemetry_history(
            "support",
            &ListTelemetryHistoryParameters {
                since: Some("then".into()),
                until: Some("now".into()),
                cursor: Some("before".into()),
                limit: Some(5)
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "GET",
        "/platform/bansafe/collection?limit=5",
        None,
        page(collection()),
        client.ban_safe().list_collection(
            &ListCollectionParameters {
                limit: Some(5),
                ..Default::default()
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "GET",
        "/platform/bansafe/health-actions?session=support&status=succeeded",
        None,
        page(
            json!({"id":"action","sessionId":"sid","session":"support","projectId":"project","mode":"apply","action":"slow_down","status":"succeeded","health":51.0,"threshold":55.0,"healthSource":"rules_v1","estimatorVersion":"rules1","modelVersion":null,"slowDownMps":1.0,"evaluatedAt":"then","createdAt":"then","completedAt":"now","outcome":"applied"})
        ),
        client.ban_safe().list_health_actions(
            &ListHealthActionsParameters {
                session: Some("support".into()),
                status: Some(HealthActionStatus::Succeeded),
                ..Default::default()
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "GET",
        "/platform/bansafe/findings?severity=warning&status=open",
        None,
        page(finding()),
        client.ban_safe().list_findings(
            &ListFindingsParameters {
                status: Some(FindingQueryStatus::Open),
                severity: Some(FindingSeverity::Warning),
                ..Default::default()
            },
            RequestOptions::default()
        )
    );
    let mut summary = health();
    summary
        .as_object_mut()
        .unwrap()
        .extend(enforcement().as_object().unwrap().clone());
    summary.as_object_mut().unwrap().extend(json!({"sessionId":"sid","session":"support","phoneNumber":"+1555","projectId":"project","liftRequires":"clean","enforcement":enforcement()}).as_object().unwrap().clone());
    summary.as_object_mut().unwrap().remove("exitProgress");
    wire_organization!(
        client,
        "GET",
        "/platform/bansafe/enforcement?rung=notify",
        None,
        page(summary),
        client.ban_safe().list_enforcement(
            &ListEnforcementParameters {
                rung: Some(EnforcementRung::Notify),
                ..Default::default()
            },
            RequestOptions::default()
        )
    );
}
#[tokio::test]
async fn incident_receipt_retraction_and_claim_evidence_native_wire() {
    wire_organization!(
        client,
        "GET",
        "/platform/bansafe/incidents?session=support",
        None,
        page(incident()),
        client.ban_safe().list_incidents(
            &ListIncidentsParameters {
                session: Some("support".into()),
                ..Default::default()
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "POST",
        "/platform/bansafe/incidents",
        Some(json!({"session":"support","occurredAt":"now","note":"reported"})),
        json!({"data":{"incidentId":"incident","created":true,"sessionId":"sid","session":"support","occurredAt":"now"}}),
        client.ban_safe().create_incident(
            &ReportIncidentRequest {
                session: "support".into(),
                occurred_at: Some("now".into()),
                note: Some("reported".into())
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "POST",
        "/platform/bansafe/incidents/incident/retract",
        None,
        json!({"data":incident()}),
        client
            .ban_safe()
            .retract_incident("incident", RequestOptions::default())
    );
    wire_organization!(
        client,
        "GET",
        "/platform/bansafe/claims?status=under_review",
        None,
        page(claim()),
        client.ban_safe().list_claims(
            &ListClaimsParameters {
                status: Some(ClaimStatus::UnderReview),
                ..Default::default()
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "GET",
        "/platform/bansafe/claims/claim",
        None,
        json!({"data":claim()}),
        client
            .ban_safe()
            .get_claim("claim", RequestOptions::default())
    );
}
