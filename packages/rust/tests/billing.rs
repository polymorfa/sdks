#[allow(dead_code)]
mod support;
use polymorfa_sdk::{billing::*, ErrorKind, RequestOptions};
use serde_json::json;
const ID: &str = "abcdefab-1234-5678-9012-123456789abc";
fn budget() -> serde_json::Value {
    json!({"scope":"project","resourceId":ID,"projectId":ID,"name":"Project","limitCredits":null,"spentCredits":1.25,"reservedCredits":0.5,"revision":2})
}
fn priorities() -> serde_json::Value {
    json!({"revision":2,"projects":[{"id":ID,"name":"Project","priority":5}],"customers":[{"id":ID,"name":"Customer","priority":6,"projectId":ID}],"numbers":[{"id":ID,"name":"Number","priority":7,"projectId":ID}]})
}
#[tokio::test]
async fn balances_transactions_and_tier_pricing_native_wire() {
    wire_organization!(
        client,
        "GET",
        "/platform/billing",
        None,
        json!({"data":{"balanceCents":250,"preferredCurrency":"USD"}}),
        client.billing().retrieve(RequestOptions::default())
    );
    wire_organization!(
        client,
        "GET",
        "/platform/billing/usage",
        None,
        json!({"data":{"activeNumbers":2,"totalChargedCents":50}}),
        client.billing().usage(RequestOptions::default())
    );
    wire_organization!(
        client,
        "GET",
        "/platform/billing/transactions",
        None,
        json!({"data":[{"id":"transaction","amountCents":-50,"balanceAfterCents":250,"type":"charge","description":"Number","sessionId":"number","projectId":ID,"tier":"standard","currency":"USD","paymentStatus":"paid","createdAt":1000}]}),
        client
            .billing()
            .list_transactions(RequestOptions::default())
    );
    wire_organization!(
        client,
        "GET",
        "/platform/billing/pricing",
        None,
        json!({"data":[{"id":"price","tier":"standard","dailyRateCents":50,"label":"Standard","description":"Number","features":["calls"]}]}),
        client.billing().list_pricing(RequestOptions::default())
    );
}
#[tokio::test]
async fn revision_guarded_billing_controls_limits_and_priorities_native_wire() {
    wire_organization!(
        client,
        "GET",
        "/platform/billing/controls/project/abcdefab-1234-5678-9012-123456789abc",
        None,
        json!({"data":{"budget":budget(),"priority":5,"priorityRevision":2}}),
        client.billing().get_resource_controls(
            BillingScope::Project,
            &ID.to_uppercase(),
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "PUT",
        "/platform/billing/controls/customer/abcdefab-1234-5678-9012-123456789abc",
        Some(
            json!({"limitCredits":10.123456,"priority":5,"expectedBudgetRevision":2,"expectedPriorityRevision":2})
        ),
        json!({"data":{"budget":budget(),"priority":5,"priorityRevision":3}}),
        client.billing().set_resource_controls(
            BillingScope::Customer,
            ID,
            &SetResourceBillingControlsRequest {
                limit_credits: Some(10.123456),
                priority: 5,
                expected_budget_revision: 2,
                expected_priority_revision: 2
            },
            RequestOptions::default()
        )
    );
    let params = BillingReadParameters {
        project_id: Some(ID.to_uppercase()),
        project_scope: true,
    };
    wire_organization!(
        client,
        "GET",
        "/platform/billing/limits?projectId=abcdefab-1234-5678-9012-123456789abc&scope=project",
        None,
        json!({"data":{"checkedAt":"2026-10-11","periodStart":"2026-10-01","periodEnd":"2026-11-01","todayCredits":1.25,"monthCredits":5.5,"daily":[{"date":"2026-10-11","credits":1.25}],"budgets":[budget()]}}),
        client
            .billing()
            .get_limits(&params, RequestOptions::default())
    );
    wire_organization!(
        client,
        "PUT",
        "/platform/billing/limits/number/abcdefab-1234-5678-9012-123456789abc",
        Some(json!({"limitCredits":null,"expectedRevision":2})),
        json!({"data":{"saved":true}}),
        client.billing().set_limit(
            BillingScope::Number,
            ID,
            &SetBillingLimitRequest {
                limit_credits: None,
                expected_revision: 2
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "GET",
        "/platform/billing/priorities?projectId=abcdefab-1234-5678-9012-123456789abc&scope=project",
        None,
        json!({"data":priorities()}),
        client
            .billing()
            .get_priorities(&params, RequestOptions::default())
    );
    wire_organization!(
        client,
        "PUT",
        "/platform/billing/priorities/project/abcdefab-1234-5678-9012-123456789abc",
        Some(json!({"priority":5,"expectedRevision":2})),
        json!({"data":priorities()}),
        client.billing().set_priority(
            BillingScope::Project,
            ID,
            &SetBillingPriorityRequest {
                priority: 5,
                expected_revision: 2
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "PUT",
        "/platform/billing/priorities",
        Some(
            json!({"scope":"resource","projectId":ID,"resources":[{"scope":"number","resourceId":ID}],"expectedRevision":2})
        ),
        json!({"data":priorities()}),
        client.billing().reorder_priorities(
            &ReorderBillingPrioritiesRequest::Resource {
                project_id: ID.to_uppercase(),
                resources: vec![BillingResourceReference {
                    scope: BillingResourceScope::Number,
                    resource_id: ID.to_uppercase()
                }],
                expected_revision: 2
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "PUT",
        "/platform/billing/priorities",
        Some(json!({"scope":"project","resourceIds":[ID],"expectedRevision":2})),
        json!({"data":priorities()}),
        client.billing().reorder_priorities(
            &ReorderBillingPrioritiesRequest::Project {
                resource_ids: vec![ID.to_uppercase()],
                expected_revision: 2
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "PUT",
        "/platform/billing/priorities",
        Some(json!({"scope":"customer","projectId":ID,"resourceIds":[ID],"expectedRevision":2})),
        json!({"data":priorities()}),
        client.billing().reorder_priorities(
            &ReorderBillingPrioritiesRequest::Customer {
                project_id: ID.to_uppercase(),
                resource_ids: vec![ID.into()],
                expected_revision: 2
            },
            RequestOptions::default()
        )
    );
    wire_organization!(
        client,
        "PUT",
        "/platform/billing/priorities",
        Some(json!({"scope":"number","projectId":ID,"resourceIds":[ID],"expectedRevision":2})),
        json!({"data":priorities()}),
        client.billing().reorder_priorities(
            &ReorderBillingPrioritiesRequest::Number {
                project_id: ID.to_uppercase(),
                resource_ids: vec![ID.into()],
                expected_revision: 2
            },
            RequestOptions::default()
        )
    );
}
#[tokio::test]
async fn invalid_billing_controls_fail_before_network() {
    let client = support::organization("http://127.0.0.1:1".into());
    let bad = [
        SetResourceBillingControlsRequest {
            limit_credits: Some(0.0000001),
            priority: 5,
            expected_budget_revision: 2,
            expected_priority_revision: 2,
        },
        SetResourceBillingControlsRequest {
            limit_credits: Some(f64::NAN),
            priority: 5,
            expected_budget_revision: 2,
            expected_priority_revision: 2,
        },
        SetResourceBillingControlsRequest {
            limit_credits: None,
            priority: 1_000_001,
            expected_budget_revision: 2,
            expected_priority_revision: 2,
        },
        SetResourceBillingControlsRequest {
            limit_credits: None,
            priority: 5,
            expected_budget_revision: u32::MAX,
            expected_priority_revision: 2,
        },
    ];
    for request in bad {
        assert_eq!(
            client
                .billing()
                .set_resource_controls(
                    BillingScope::Project,
                    ID,
                    &request,
                    RequestOptions::default()
                )
                .await
                .unwrap_err()
                .kind,
            ErrorKind::Validation
        );
    }
    assert_eq!(
        client
            .billing()
            .get_resource_controls(BillingScope::Project, "not-uuid", RequestOptions::default())
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Validation
    );
    assert_eq!(
        client
            .billing()
            .reorder_priorities(
                &ReorderBillingPrioritiesRequest::Project {
                    resource_ids: vec![ID.into(), ID.to_uppercase()],
                    expected_revision: 2
                },
                RequestOptions::default()
            )
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Validation
    );
    assert_eq!(
        client
            .billing()
            .reorder_priorities(
                &ReorderBillingPrioritiesRequest::Resource {
                    project_id: ID.into(),
                    resources: vec![
                        BillingResourceReference {
                            scope: BillingResourceScope::Number,
                            resource_id: ID.into()
                        },
                        BillingResourceReference {
                            scope: BillingResourceScope::Number,
                            resource_id: ID.to_uppercase()
                        }
                    ],
                    expected_revision: 2
                },
                RequestOptions::default()
            )
            .await
            .unwrap_err()
            .kind,
        ErrorKind::Validation
    );
}
