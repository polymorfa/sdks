//! Organization-managed Customers and one-time customer pairing links.
use crate::{
    models::DataEnvelope,
    transport::{encode, HttpTransport},
    ApiResponse, Error, ErrorKind, RequestOptions, Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
macro_rules! model{($name:ident{$($field:ident:$ty:ty),*;$($opt:ident:$opt_ty:ty),*$(,)?})=>{#[derive(Clone,Debug,Serialize,Deserialize)]#[serde(rename_all="camelCase")]pub struct $name{$(pub $field:$ty,)*$(#[serde(skip_serializing_if="Option::is_none")]pub $opt:Option<$opt_ty>,)*}}}
macro_rules! wire_enum{($name:ident{$($variant:ident=$wire:literal),*$(,)?})=>{#[derive(Clone,Copy,Debug,Serialize,Deserialize)]pub enum $name{$(#[serde(rename=$wire)]$variant),*}}}
wire_enum!(CustomerStatus{Active="active",Archiving="archiving",Archived="archived"});
wire_enum!(CustomerListStatus{Active="active",Archiving="archiving",Archived="archived",All="all"});
wire_enum!(CustomerPairingMethod{Qr="qr",Phone="phone"});
wire_enum!(CustomerPairingLocale{En="en",PtBr="pt-BR"});
wire_enum!(CustomerPairingTheme{Light="light",Dark="dark",System="system"});
wire_enum!(CustomerPairingLinkStatus{Active="active",Opened="opened",Connecting="connecting",Connected="connected",Failed="failed",Expired="expired",Revoked="revoked"});
wire_enum!(CustomerEventField{Name="name",Phone="phone",ExternalCustomerId="externalCustomerId"});
model!(Customer{id:String,org_id:String,project_id:String,name:Option<String>,external_customer_id:Option<String>,status:CustomerStatus,is_default:bool,archived_at:Option<u64>,created_at:u64,updated_at:u64;});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerSummary {
    #[serde(flatten)]
    pub customer: Customer,
    pub number_count: u64,
    pub connected_number_count: u64,
    pub active_pairing_link_state: Option<String>,
    pub last_activity_at: Option<u64>,
    pub needs_attention: bool,
}
model!(CustomersStatus{enabled:bool,enabled_at:Option<u64>,enabled_by:Option<String>,default_customer:Option<Customer>;});
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomersEnablement {
    #[serde(flatten)]
    pub status: CustomersStatus,
    pub migrated_number_count: u64,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomerProjectRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCustomerRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub name: Option<Option<String>>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub external_customer_id: Option<Option<String>>,
}
pub type UpdateCustomerRequest = CreateCustomerRequest;
model!(ListCustomersParameters{project_id:String;cursor:String,limit:u32,search:String,status:CustomerListStatus,is_default:bool,has_numbers:bool,needs_attention:bool});
model!(CustomerListPage{next_cursor:Option<String>,has_more:bool;});
model!(CustomerListEnvelope{data:Vec<CustomerSummary>,page:CustomerListPage;});
model!(CustomerNumber{id:String,customer_id:String,session_id:String,name:Option<String>,phone_masked:Option<String>,status:String,backend:Option<String>,created_at:u64;});
model!(CustomerEventMetadata{;fields:Vec<CustomerEventField>});
model!(CustomerEvent{id:String,action:String,from_status:Option<String>,to_status:Option<String>,session_id:Option<String>,pairing_link_id:Option<String>,metadata:CustomerEventMetadata,occurred_at:u64;});
model!(CustomerPairingLink{id:String,org_id:String,project_id:String,customer_id:String,expected_phone_masked:Option<String>,methods:Vec<CustomerPairingMethod>,locale:Option<CustomerPairingLocale>,theme:Option<CustomerPairingTheme>,expires_at:u64,status:CustomerPairingLinkStatus,attempt_count:u32,max_attempts:u32,pending_session_id:Option<String>,created_by:Option<String>,reserved_at:Option<u64>,opened_at:Option<u64>,connecting_at:Option<u64>,connected_at:Option<u64>,failed_at:Option<u64>,expired_at:Option<u64>,revoked_at:Option<u64>,last_error_code:Option<String>,failed_exchange_count:u32,phone_mismatch_count:u32,created_at:u64,updated_at:u64;});
#[derive(Clone, Serialize, Deserialize)]
pub struct CreatedCustomerPairingLink {
    #[serde(flatten)]
    pub link: CustomerPairingLink,
    /// Returned once; a replay returns null.
    pub url: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCustomerPairingLinkRequest {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(
        default,
        skip_serializing_if = "Option::is_none",
        deserialize_with = "crate::configuration::deserialize_present_option"
    )]
    pub expected_phone: Option<Option<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub methods: Option<Vec<CustomerPairingMethod>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expires_in_seconds: Option<u32>,
}
model!(ListCustomerEventsParameters{project_id:String;limit:u32});
model!(TransferCustomerNumberRequest{project_id:String,source_customer_id:String,confirm:bool;});
pub struct Customers<'a>(pub(crate) &'a HttpTransport);
fn customer(id: &str) -> String {
    format!("/platform/customers/{}", encode(id))
}
impl Customers<'_> {
    pub async fn status(
        &self,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<CustomersStatus>>> {
        self.0
            .get(
                &format!("/platform/projects/{}/customers/status", encode(project)),
                options,
            )
            .await
    }
    pub async fn enable(
        &self,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<CustomersEnablement>>> {
        self.0
            .request::<_, ()>(
                Method::POST,
                &format!("/platform/projects/{}/customers/enable", encode(project)),
                &[],
                None,
                options,
            )
            .await
    }
    pub async fn list(
        &self,
        params: &ListCustomersParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<CustomerListEnvelope>> {
        let mut query = vec![("projectId", params.project_id.clone())];
        for (k, v) in [("cursor", &params.cursor), ("search", &params.search)] {
            if let Some(v) = v {
                query.push((k, v.clone()));
            }
        }
        if let Some(v) = params.limit {
            query.push(("limit", v.to_string()));
        }
        if let Some(v) = params.status {
            query.push((
                "status",
                serde_json::to_value(v).unwrap().as_str().unwrap().into(),
            ));
        }
        for (k, v) in [
            ("isDefault", params.is_default),
            ("hasNumbers", params.has_numbers),
            ("needsAttention", params.needs_attention),
        ] {
            if let Some(v) = v {
                query.push((k, v.to_string()));
            }
        }
        self.0
            .request::<_, ()>(Method::GET, "/platform/customers", &query, None, options)
            .await
    }
    pub async fn create(
        &self,
        body: &CreateCustomerRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Customer>>> {
        self.0
            .request(
                Method::POST,
                "/platform/customers",
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn retrieve(
        &self,
        id: &str,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Customer>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                &customer(id),
                &[("projectId", project.into())],
                None,
                options,
            )
            .await
    }
    pub async fn update(
        &self,
        id: &str,
        body: &UpdateCustomerRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Customer>>> {
        self.0
            .request(Method::PATCH, &customer(id), &[], Some(body), options)
            .await
    }
    pub async fn archive(
        &self,
        id: &str,
        body: &CustomerProjectRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Customer>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/archive", customer(id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn restore(
        &self,
        id: &str,
        body: &CustomerProjectRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Customer>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/restore", customer(id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn list_numbers(
        &self,
        id: &str,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<CustomerNumber>>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/numbers", customer(id)),
                &[("projectId", project.into())],
                None,
                options,
            )
            .await
    }
    pub async fn list_events(
        &self,
        id: &str,
        params: &ListCustomerEventsParameters,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<CustomerEvent>>>> {
        let mut query = vec![("projectId", params.project_id.clone())];
        if let Some(v) = params.limit {
            query.push(("limit", v.to_string()));
        }
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/events", customer(id)),
                &query,
                None,
                options,
            )
            .await
    }
    pub async fn create_pairing_link(
        &self,
        id: &str,
        body: &CreateCustomerPairingLinkRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<CreatedCustomerPairingLink>>> {
        self.0
            .request(
                Method::POST,
                &format!("{}/pairing-links", customer(id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
    pub async fn list_pairing_links(
        &self,
        id: &str,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<Vec<CustomerPairingLink>>>> {
        self.0
            .request::<_, ()>(
                Method::GET,
                &format!("{}/pairing-links", customer(id)),
                &[("projectId", project.into())],
                None,
                options,
            )
            .await
    }
    pub async fn revoke_pairing_link(
        &self,
        id: &str,
        link_id: &str,
        project: &str,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<CustomerPairingLink>>> {
        self.0
            .request::<_, ()>(
                Method::DELETE,
                &format!("{}/pairing-links/{}", customer(id), encode(link_id)),
                &[("projectId", project.into())],
                None,
                options,
            )
            .await
    }
    pub async fn transfer_number(
        &self,
        id: &str,
        session_id: &str,
        body: &TransferCustomerNumberRequest,
        options: RequestOptions,
    ) -> Result<ApiResponse<DataEnvelope<CustomerNumber>>> {
        if !body.confirm {
            return Err(Error::local(
                ErrorKind::Validation,
                "confirm must be true",
                "invalid_customer_transfer",
            ));
        }
        self.0
            .request(
                Method::POST,
                &format!("{}/numbers/{}/transfer", customer(id), encode(session_id)),
                &[],
                Some(body),
                options,
            )
            .await
    }
}
