//! Typed interactive, commerce, and payment message content from the merged API contract.
use crate::models::MediaSource;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct PhoneNumberRequest {}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct MessageTemplateSend {
    pub name: String,
    pub language: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub components: Option<Vec<serde_json::Value>>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductMessageMedia {
    #[serde(flatten)]
    pub source: MediaSource,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductMessageContent {
    pub business_owner_id: String,
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub currency_code: String,
    pub price_amount1000: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sale_price_amount1000: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub retailer_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_count: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<ProductMessageMedia>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub body: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub footer: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductListMessageSection {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub product_ids: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProductListMessageContent {
    pub business_owner_id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub button_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub footer: Option<String>,
    pub sections: Vec<ProductListMessageSection>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrderMessageStatus {
    Inquiry,
    Accepted,
    Declined,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderMessageContent {
    pub id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_base64: Option<String>,
    pub item_count: u32,
    pub status: OrderMessageStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub seller_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
    pub total_amount1000: f64,
    pub total_currency_code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub catalog_type: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ListMessageRow {
    pub id: String,
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ListMessageSection {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub rows: Vec<ListMessageRow>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListMessageContent {
    pub title: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub button_text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub footer: Option<String>,
    pub sections: Vec<ListMessageSection>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(
    tag = "type",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum MessageButton {
    Url {
        text: String,
        url: String,
    },
    Call {
        text: String,
        phone_number: String,
    },
    Reply {
        text: String,
        id: String,
    },
    Copy {
        text: String,
        copy_code: String,
    },
    Catalog {
        text: String,
        business_phone_number: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        catalog_product_id: Option<String>,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ButtonsMessageContent {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub footer: Option<String>,
    pub buttons: Vec<MessageButton>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressMessageContent {
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub button_text: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub footer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub country: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(
    tag = "action",
    rename_all = "snake_case",
    rename_all_fields = "camelCase"
)]
pub enum FlowMessageContent {
    Navigate {
        body: String,
        button_text: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        footer: Option<String>,
        id: String,
        token: String,
        screen: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        data_json: Option<String>,
    },
    DataExchange {
        body: String,
        button_text: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        footer: Option<String>,
        id: String,
        token: String,
    },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CallPermissionRequestMessageContent {
    pub body: String,
}
/// BRL centavos, with the contract's fixed offset of 100.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(try_from = "AmountWire", into = "AmountWire")]
pub struct PaymentOrderAmount {
    pub value: f64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
struct AmountWire {
    value: f64,
    offset: u32,
}
impl TryFrom<AmountWire> for PaymentOrderAmount {
    type Error = &'static str;
    fn try_from(value: AmountWire) -> Result<Self, Self::Error> {
        if value.offset != 100 {
            return Err("BRL payment amount offset must be 100");
        }
        Ok(Self { value: value.value })
    }
}
impl From<PaymentOrderAmount> for AmountWire {
    fn from(value: PaymentOrderAmount) -> Self {
        Self {
            value: value.value,
            offset: 100,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum PixKeyType {
    CPF,
    CNPJ,
    EMAIL,
    PHONE,
    EVP,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PixDynamicCodePayment {
    pub code: String,
    pub merchant_name: String,
    pub key: String,
    pub key_type: PixKeyType,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PaymentLink {
    pub uri: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoletoPayment {
    pub digitable_line: String,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderPaymentSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pix_dynamic_code: Option<PixDynamicCodePayment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment_link: Option<PaymentLink>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub boleto: Option<BoletoPayment>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrderExpiration {
    pub timestamp: i64,
    pub description: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderDetailsItem {
    pub retailer_id: String,
    pub name: String,
    pub amount: PaymentOrderAmount,
    pub quantity: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sale_amount: Option<PaymentOrderAmount>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DescribedPaymentAmount {
    #[serde(flatten)]
    pub amount: PaymentOrderAmount,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscountPaymentAmount {
    #[serde(flatten)]
    pub amount: PaymentOrderAmount,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub program_name: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderDetailsItemization {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub catalog_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expiration: Option<OrderExpiration>,
    pub items: Vec<OrderDetailsItem>,
    pub subtotal: PaymentOrderAmount,
    pub tax: DescribedPaymentAmount,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub shipping: Option<DescribedPaymentAmount>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub discount: Option<DiscountPaymentAmount>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PaymentOrderType {
    DigitalGoods,
    PhysicalGoods,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum PaymentCurrency {
    BRL,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderDetailsMessageContent {
    pub reference_id: String,
    #[serde(rename = "type")]
    pub order_type: PaymentOrderType,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub footer: Option<String>,
    pub currency: PaymentCurrency,
    pub total_amount: PaymentOrderAmount,
    pub payment_settings: OrderPaymentSettings,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<OrderDetailsItemization>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub header_image_url: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrderStatus {
    Pending,
    Processing,
    PartiallyShipped,
    Shipped,
    Completed,
    Canceled,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OrderPaymentStatus {
    Pending,
    Captured,
    Failed,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrderStatusUpdate {
    pub status: OrderStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct OrderPaymentUpdate {
    pub status: OrderPaymentStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<i64>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrderStatusMessageContent {
    pub reference_id: String,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub footer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub order: Option<OrderStatusUpdate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub payment: Option<OrderPaymentUpdate>,
}
