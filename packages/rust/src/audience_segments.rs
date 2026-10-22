//! Organization-owned saved audience segments and count previews, pinned to
//! `contracts/campaign-segments-drip.json`. Team keys only:
//! campaigns:read for reads, campaigns:manage for writes and unsaved previews.
//! Revision conflicts and bounded evaluation timeouts return 409 `state_conflict`;
//! re-read, reconcile or simplify the rules before trying again. Writes and
//! previews are sent once.
use crate::campaign_contracts::CampaignRetargetOutcome;
use crate::models::DataEnvelope;
use crate::{
    transport::{encode, HttpTransport},
    ApiResponse, Error, ErrorKind, RequestOptions, Result,
};
use reqwest::Method;
use serde::{de, Deserialize, Deserializer, Serialize, Serializer};
use serde_json::{json, Number, Value};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AudienceSegmentMatch {
    All,
    Any,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AudienceSegmentTextOperator {
    Contains,
    Before,
    After,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AudienceSegmentCompareOperator {
    GreaterThan,
    LessThan,
}
/// An `equals` value: a string, number or boolean of the same type.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AudienceSegmentScalar {
    String(String),
    Number(Number),
    Boolean(bool),
}
/// An `in` value: a string or a number.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum AudienceSegmentListValue {
    String(String),
    Number(Number),
}
/// One rule condition. Missing, null or wrong-type attributes do not match.
/// Conditions this SDK does not model decode as `Unknown`; requests containing
/// `Unknown` are rejected before sending.
#[derive(Clone, Debug, PartialEq)]
pub enum AudienceSegmentCondition {
    TagContains {
        value: String,
    },
    TagIn {
        values: Vec<String>,
    },
    TagExists,
    AttributeEquals {
        name: String,
        value: AudienceSegmentScalar,
    },
    AttributeText {
        name: String,
        operator: AudienceSegmentTextOperator,
        value: String,
    },
    AttributeIn {
        name: String,
        values: Vec<AudienceSegmentListValue>,
    },
    AttributeCompare {
        name: String,
        operator: AudienceSegmentCompareOperator,
        value: Number,
    },
    AttributeExists {
        name: String,
    },
    ConsentEquals {
        value: bool,
    },
    Campaign {
        campaign_id: String,
        outcome: CampaignRetargetOutcome,
    },
    Unknown(Value),
}
impl Serialize for AudienceSegmentCondition {
    fn serialize<S: Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        use AudienceSegmentCondition::*;
        let v = match self {
            TagContains { value } => json!({"field":"tag","operator":"contains","value":value}),
            TagIn { values } => json!({"field":"tag","operator":"in","values":values}),
            TagExists => json!({"field":"tag","operator":"exists"}),
            AttributeEquals { name, value } => {
                json!({"field":"attribute","name":name,"operator":"equals","value":value})
            }
            AttributeText {
                name,
                operator,
                value,
            } => {
                json!({"field":"attribute","name":name,"operator":operator,"value":value})
            }
            AttributeIn { name, values } => {
                json!({"field":"attribute","name":name,"operator":"in","values":values})
            }
            AttributeCompare {
                name,
                operator,
                value,
            } => {
                json!({"field":"attribute","name":name,"operator":operator,"value":value})
            }
            AttributeExists { name } => {
                json!({"field":"attribute","name":name,"operator":"exists"})
            }
            ConsentEquals { value } => json!({"field":"consent","operator":"equals","value":value}),
            Campaign {
                campaign_id,
                outcome,
            } => {
                json!({"field":"campaign","campaignId":campaign_id,"outcome":outcome})
            }
            Unknown(raw) => raw.clone(),
        };
        v.serialize(s)
    }
}
fn typed<T: serde::de::DeserializeOwned>(
    map: &serde_json::Map<String, Value>,
    key: &str,
) -> Option<T> {
    serde_json::from_value(map.get(key)?.clone()).ok()
}
impl<'de> Deserialize<'de> for AudienceSegmentCondition {
    fn deserialize<D: Deserializer<'de>>(d: D) -> std::result::Result<Self, D::Error> {
        let raw = Value::deserialize(d)?;
        let Some(map) = raw.as_object() else {
            return Err(de::Error::custom(
                "audience segment condition must be an object",
            ));
        };
        let keys = |expected: &[&str]| {
            map.len() == expected.len() && expected.iter().all(|k| map.contains_key(*k))
        };
        let name = || map.get("name").and_then(Value::as_str).map(str::to_owned);
        use AudienceSegmentCondition::*;
        let field = map.get("field").and_then(Value::as_str);
        let operator = map.get("operator").and_then(Value::as_str);
        let decoded = match (field, operator) {
            (Some("tag"), Some("contains")) if keys(&["field", "operator", "value"]) => {
                typed(map, "value").map(|value| TagContains { value })
            }
            (Some("tag"), Some("in")) if keys(&["field", "operator", "values"]) => {
                typed(map, "values").map(|values| TagIn { values })
            }
            (Some("tag"), Some("exists")) if keys(&["field", "operator"]) => Some(TagExists),
            (Some("attribute"), Some(op)) => {
                let name = name();
                match op {
                    "equals" if keys(&["field", "name", "operator", "value"]) => {
                        typed(map, "value")
                            .and_then(|value| Some(AttributeEquals { name: name?, value }))
                    }
                    "contains" | "before" | "after"
                        if keys(&["field", "name", "operator", "value"]) =>
                    {
                        match (typed(map, "operator"), typed(map, "value")) {
                            (Some(operator), Some(value)) => name.map(|name| AttributeText {
                                name,
                                operator,
                                value,
                            }),
                            _ => None,
                        }
                    }
                    "in" if keys(&["field", "name", "operator", "values"]) => typed(map, "values")
                        .and_then(|values| {
                            Some(AttributeIn {
                                name: name?,
                                values,
                            })
                        }),
                    "greater_than" | "less_than"
                        if keys(&["field", "name", "operator", "value"]) =>
                    {
                        match (
                            typed(map, "operator"),
                            map.get("value").and_then(Value::as_number),
                        ) {
                            (Some(operator), Some(value)) => name.map(|name| AttributeCompare {
                                name,
                                operator,
                                value: value.clone(),
                            }),
                            _ => None,
                        }
                    }
                    "exists" if keys(&["field", "name", "operator"]) => {
                        name.map(|name| AttributeExists { name })
                    }
                    _ => None,
                }
            }
            (Some("consent"), Some("equals")) if keys(&["field", "operator", "value"]) => {
                typed(map, "value").map(|value| ConsentEquals { value })
            }
            (Some("campaign"), None) if keys(&["field", "campaignId", "outcome"]) => {
                match (typed(map, "campaignId"), typed(map, "outcome")) {
                    (Some(campaign_id), Some(outcome)) => Some(Campaign {
                        campaign_id,
                        outcome,
                    }),
                    _ => None,
                }
            }
            _ => None,
        };
        Ok(decoded.unwrap_or(Unknown(raw)))
    }
}
/// Up to 20 conditions. `negate` inverts the group's result.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AudienceSegmentGroup {
    pub r#match: AudienceSegmentMatch,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub negate: Option<bool>,
    pub conditions: Vec<AudienceSegmentCondition>,
}
/// At most 10 groups, 20 conditions per group, 40 conditions, 5 campaign
/// conditions, 50 values per `in` and 16 KiB. The API enforces these limits.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct AudienceSegmentRules {
    pub r#match: AudienceSegmentMatch,
    pub groups: Vec<AudienceSegmentGroup>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudienceSegment {
    pub id: String,
    pub name: String,
    pub revision: u64,
    pub rules: AudienceSegmentRules,
    pub created_at: u64,
    pub updated_at: u64,
}
/// `phone` is masked, for example `+49*******12`.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AudienceSegmentSample {
    pub phone: String,
    pub tags: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudienceSegmentPreview {
    pub matched_count: u64,
    pub opted_out_count: u64,
    pub consent_withheld_count: u64,
    pub eligible_count: u64,
    pub sample: Vec<AudienceSegmentSample>,
    pub evaluated_at: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SavedAudienceSegmentPreview {
    #[serde(flatten)]
    pub preview: AudienceSegmentPreview,
    pub revision: u64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CreateAudienceSegmentRequest {
    pub name: String,
    pub rules: AudienceSegmentRules,
}
/// Requires the last observed revision.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAudienceSegmentRequest {
    pub expected_revision: u64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub rules: Option<AudienceSegmentRules>,
}
#[derive(Clone, Debug, Default)]
pub struct ListAudienceSegmentsParameters {
    pub limit: Option<u32>,
    pub cursor: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AudienceSegmentPageInfo {
    pub has_more: bool,
    pub next_cursor: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AudienceSegmentPage {
    pub data: Vec<AudienceSegment>,
    pub page: AudienceSegmentPageInfo,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AudienceSegmentDeletion {
    pub deleted: bool,
    pub id: String,
}
#[derive(Serialize)]
struct PreviewRules<'a> {
    rules: &'a AudienceSegmentRules,
}

fn invalid(message: &'static str) -> Error {
    Error::local(ErrorKind::Validation, message, "invalid_parameter")
}
fn path(id: &str) -> Result<String> {
    if id.trim().is_empty() {
        return Err(invalid("A segment ID is required"));
    }
    Ok(format!("/platform/audience-segments/{}", encode(id)))
}
fn once(mut options: RequestOptions) -> RequestOptions {
    options.max_network_retries = Some(0);
    options
}
/// Typed conditions cannot carry wrong value types; only unmodeled conditions
/// are rejected here. Counts, sizes and patterns remain API authority.
fn validate(rules: &AudienceSegmentRules) -> Result<()> {
    let unknown = rules
        .groups
        .iter()
        .flat_map(|g| &g.conditions)
        .any(|c| matches!(c, AudienceSegmentCondition::Unknown(_)));
    if unknown {
        return Err(invalid(
            "Audience segment requests cannot contain unknown conditions",
        ));
    }
    Ok(())
}

pub struct AudienceSegments<'a>(&'a HttpTransport);
impl crate::platform::OrganizationClient {
    /// Organization segment authority; project clients have no segment methods.
    pub fn audience_segments(&self) -> AudienceSegments<'_> {
        AudienceSegments(&self.http)
    }
}
impl AudienceSegments<'_> {
    pub async fn list(
        &self,
        params: &ListAudienceSegmentsParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<AudienceSegmentPage>> {
        let mut query = Vec::new();
        if let Some(limit) = params.limit {
            query.push(("limit", limit.to_string()));
        }
        if let Some(cursor) = &params.cursor {
            query.push(("cursor", cursor.clone()));
        }
        self.0
            .request::<_, ()>(
                Method::GET,
                "/platform/audience-segments",
                &query,
                None,
                options,
            )
            .await
    }
    pub async fn retrieve(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<AudienceSegment>>> {
        self.0.get(&path(id)?, options).await
    }
    pub async fn create(
        &self,
        body: &CreateAudienceSegmentRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<AudienceSegment>>> {
        validate(&body.rules)?;
        self.0
            .request(
                Method::POST,
                "/platform/audience-segments",
                &[],
                Some(body),
                once(options),
            )
            .await
    }
    pub async fn update(
        &self,
        id: &str,
        body: &UpdateAudienceSegmentRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<AudienceSegment>>> {
        let path = path(id)?;
        if let Some(rules) = &body.rules {
            validate(rules)?;
        }
        self.0
            .request(Method::PATCH, &path, &[], Some(body), once(options))
            .await
    }
    /// Refused while an unlaunched draft uses the segment. Launched campaigns keep
    /// their snapshot and recipients; their segment ID becomes null.
    pub async fn delete(
        &self,
        id: &str,
        expected_revision: u64,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<AudienceSegmentDeletion>>> {
        self.0
            .request::<_, ()>(
                Method::DELETE,
                &path(id)?,
                &[("expectedRevision", expected_revision.to_string())],
                None,
                once(options),
            )
            .await
    }
    /// Evaluates the saved segment once; an evaluation timeout is a 409.
    pub async fn preview(
        &self,
        id: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<SavedAudienceSegmentPreview>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/preview", path(id)?),
                &[],
                None,
                once(options),
            )
            .await
    }
    pub async fn preview_rules(
        &self,
        rules: &AudienceSegmentRules,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<AudienceSegmentPreview>>> {
        validate(rules)?;
        self.0
            .request(
                Method::POST,
                "/platform/audience-segments/preview",
                &[],
                Some(&PreviewRules { rules }),
                once(options),
            )
            .await
    }
}
