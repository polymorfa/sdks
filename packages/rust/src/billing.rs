//! Organization billing balances and revision-guarded resource controls.
use crate::{
    models::DataEnvelope, transport::HttpTransport, ApiResponse, Error, ErrorKind, RequestOptions,
    Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum BillingScope {
    Project,
    Customer,
    Number,
}
impl BillingScope {
    fn wire(self) -> &'static str {
        match self {
            Self::Project => "project",
            Self::Customer => "customer",
            Self::Number => "number",
        }
    }
}
#[derive(Clone, Copy, Debug, Deserialize, Serialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum BillingResourceScope {
    Customer,
    Number,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub enum BillingCurrency {
    USD,
    BRL,
    INR,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BillingBalance {
    pub balance_cents: i64,
    pub preferred_currency: BillingCurrency,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BillingUsage {
    pub active_numbers: u64,
    pub total_charged_cents: i64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum PaymentStatus {
    Paid,
    Refunded,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BillingTransaction {
    pub id: String,
    pub amount_cents: i64,
    pub balance_after_cents: i64,
    pub r#type: String,
    pub description: String,
    pub session_id: Option<String>,
    pub project_id: Option<String>,
    pub tier: Option<String>,
    pub currency: Option<String>,
    pub payment_status: PaymentStatus,
    pub created_at: u64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TierPricing {
    pub id: String,
    pub tier: String,
    pub daily_rate_cents: u64,
    pub label: String,
    pub description: String,
    pub features: Vec<String>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct BillingPriority {
    pub id: String,
    pub name: String,
    pub priority: u32,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectResourceBillingPriority {
    pub id: String,
    pub name: String,
    pub priority: u32,
    pub project_id: String,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct BillingPriorities {
    pub revision: u32,
    pub projects: Vec<BillingPriority>,
    pub customers: Vec<ProjectResourceBillingPriority>,
    pub numbers: Vec<ProjectResourceBillingPriority>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BillingLimit {
    pub scope: BillingScope,
    pub resource_id: String,
    pub project_id: String,
    pub name: String,
    pub limit_credits: Option<f64>,
    pub spent_credits: f64,
    pub reserved_credits: f64,
    pub revision: u32,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct DailyBillingCredits {
    pub date: String,
    pub credits: f64,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BillingLimits {
    pub checked_at: String,
    pub period_start: String,
    pub period_end: String,
    pub today_credits: f64,
    pub month_credits: f64,
    pub daily: Vec<DailyBillingCredits>,
    pub budgets: Vec<BillingLimit>,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceBillingControls {
    pub budget: BillingLimit,
    pub priority: u32,
    pub priority_revision: u32,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetResourceBillingControlsRequest {
    pub limit_credits: Option<f64>,
    pub priority: u32,
    pub expected_budget_revision: u32,
    pub expected_priority_revision: u32,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetBillingLimitRequest {
    pub limit_credits: Option<f64>,
    pub expected_revision: u32,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetBillingPriorityRequest {
    pub priority: u32,
    pub expected_revision: u32,
}
#[derive(Clone, Debug, Deserialize, Serialize)]
pub struct BillingLimitSaved {
    pub saved: bool,
}
#[derive(Clone, Debug, Default)]
pub struct BillingReadParameters {
    pub project_id: Option<String>,
    /// Set true to explicitly request project scope.
    pub project_scope: bool,
}
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BillingResourceReference {
    pub scope: BillingResourceScope,
    pub resource_id: String,
}
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "scope", rename_all = "lowercase")]
pub enum ReorderBillingPrioritiesRequest {
    Project {
        #[serde(rename = "resourceIds")]
        resource_ids: Vec<String>,
        #[serde(rename = "expectedRevision")]
        expected_revision: u32,
    },
    Customer {
        #[serde(rename = "projectId")]
        project_id: String,
        #[serde(rename = "resourceIds")]
        resource_ids: Vec<String>,
        #[serde(rename = "expectedRevision")]
        expected_revision: u32,
    },
    Number {
        #[serde(rename = "projectId")]
        project_id: String,
        #[serde(rename = "resourceIds")]
        resource_ids: Vec<String>,
        #[serde(rename = "expectedRevision")]
        expected_revision: u32,
    },
    Resource {
        #[serde(rename = "projectId")]
        project_id: String,
        resources: Vec<BillingResourceReference>,
        #[serde(rename = "expectedRevision")]
        expected_revision: u32,
    },
}
fn invalid(message: &str) -> Error {
    Error::local(ErrorKind::Validation, message, "invalid_billing_control")
}
fn id(value: &str) -> Result<String> {
    if value.len() != 36
        || value.bytes().enumerate().any(|(i, c)| {
            if [8, 13, 18, 23].contains(&i) {
                c != b'-'
            } else {
                !c.is_ascii_hexdigit()
            }
        })
    {
        return Err(invalid("resource must be a UUID"));
    }
    Ok(value.to_ascii_lowercase())
}
fn revision(value: u32) -> Result<()> {
    if value > 2_147_483_646 {
        Err(invalid("expectedRevision must be a nonnegative integer"))
    } else {
        Ok(())
    }
}
fn priority(value: u32) -> Result<()> {
    if value > 1_000_000 {
        Err(invalid("priority must be an integer from 0 to 1000000"))
    } else {
        Ok(())
    }
}
fn limit(value: Option<f64>) -> Result<()> {
    if let Some(v) = value {
        if !v.is_finite()
            || !(0.0..=1_000_000.0).contains(&v)
            || v.to_string().split('.').nth(1).is_some_and(|p| p.len() > 6)
        {
            return Err(invalid(
                "limitCredits must be null or 0–1000000 credits with at most six decimal places",
            ));
        }
    }
    Ok(())
}
impl BillingReadParameters {
    fn query(&self) -> Result<Vec<(&'static str, String)>> {
        let mut query = Vec::new();
        if let Some(v) = &self.project_id {
            query.push(("projectId", id(v)?));
        }
        if self.project_scope {
            query.push(("scope", "project".into()));
        }
        Ok(query)
    }
}
impl ReorderBillingPrioritiesRequest {
    fn normalized(&self) -> Result<serde_json::Value> {
        let mut body = serde_json::to_value(self).expect("closed billing request is serializable");
        let rev = body["expectedRevision"].as_u64().expect("typed revision") as u32;
        revision(rev)?;
        if let Some(project) = body.get_mut("projectId") {
            *project = serde_json::Value::String(id(project.as_str().expect("typed project id"))?);
        }
        let mut seen = std::collections::HashSet::new();
        if let Some(resources) = body.get_mut("resources").and_then(|v| v.as_array_mut()) {
            if resources.len() > 1_000_000 {
                return Err(invalid("resources must be a unique complete list"));
            }
            for row in resources {
                let canonical = id(row["resourceId"].as_str().expect("typed resource id"))?;
                if !seen.insert(format!("{}:{canonical}", row["scope"])) {
                    return Err(invalid("resources must be a unique complete list"));
                }
                row["resourceId"] = canonical.into();
            }
        } else {
            for resource in body["resourceIds"]
                .as_array_mut()
                .expect("typed resource ids")
            {
                let canonical = id(resource.as_str().expect("typed resource id"))?;
                if !seen.insert(canonical.clone()) {
                    return Err(invalid("resourceIds must not contain duplicates"));
                }
                *resource = canonical.into();
            }
        }
        Ok(body)
    }
}
pub struct Billing<'a>(pub(crate) &'a HttpTransport);
impl Billing<'_> {
    pub async fn retrieve(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<BillingBalance>>> {
        self.0.get("/platform/billing", options).await
    }
    pub async fn usage(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<BillingUsage>>> {
        self.0.get("/platform/billing/usage", options).await
    }
    pub async fn list_transactions(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<BillingTransaction>>>> {
        self.0.get("/platform/billing/transactions", options).await
    }
    pub async fn list_pricing(
        &self,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<TierPricing>>>> {
        self.0.get("/platform/billing/pricing", options).await
    }
    pub async fn get_resource_controls(
        &self,
        scope: BillingScope,
        resource_id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ResourceBillingControls>>> {
        self.0
            .get(
                &format!(
                    "/platform/billing/controls/{}/{}",
                    scope.wire(),
                    id(resource_id)?
                ),
                options,
            )
            .await
    }
    pub async fn set_resource_controls(
        &self,
        scope: BillingScope,
        resource_id: &str,
        body: &SetResourceBillingControlsRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<ResourceBillingControls>>> {
        limit(body.limit_credits)?;
        priority(body.priority)?;
        revision(body.expected_budget_revision)?;
        revision(body.expected_priority_revision)?;
        self.0
            .request(
                Method::PUT,
                &format!(
                    "/platform/billing/controls/{}/{}",
                    scope.wire(),
                    id(resource_id)?
                ),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn get_limits(
        &self,
        params: &BillingReadParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<BillingLimits>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                "/platform/billing/limits",
                &params.query()?,
                None,
                options,
            )
            .await
    }
    pub async fn set_limit(
        &self,
        scope: BillingScope,
        resource_id: &str,
        body: &SetBillingLimitRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<BillingLimitSaved>>> {
        limit(body.limit_credits)?;
        revision(body.expected_revision)?;
        self.0
            .request(
                Method::PUT,
                &format!(
                    "/platform/billing/limits/{}/{}",
                    scope.wire(),
                    id(resource_id)?
                ),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn get_priorities(
        &self,
        params: &BillingReadParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<BillingPriorities>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                "/platform/billing/priorities",
                &params.query()?,
                None,
                options,
            )
            .await
    }
    pub async fn set_priority(
        &self,
        scope: BillingScope,
        resource_id: &str,
        body: &SetBillingPriorityRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<BillingPriorities>>> {
        priority(body.priority)?;
        revision(body.expected_revision)?;
        self.0
            .request(
                Method::PUT,
                &format!(
                    "/platform/billing/priorities/{}/{}",
                    scope.wire(),
                    id(resource_id)?
                ),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn reorder_priorities(
        &self,
        body: &ReorderBillingPrioritiesRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<BillingPriorities>>> {
        self.0
            .request(
                Method::PUT,
                "/platform/billing/priorities",
                &[],
                Some(&body.normalized()?),
                options,
            )
            .await
    }
}
