"""Handwritten composed message variants from the pinned Messaging contract."""

from typing import Literal

from typing_extensions import NotRequired, TypedDict

from .transport import Json


class ConversationFields(TypedDict, total=False):
    username: str


class ById(ConversationFields):
    id: str
    phoneNumber: NotRequired[str]
    bsuid: NotRequired[str]


class ByPhone(ConversationFields):
    phoneNumber: str
    id: NotRequired[str]
    bsuid: NotRequired[str]


class ByBusinessId(ConversationFields):
    bsuid: str
    id: NotRequired[str]
    phoneNumber: NotRequired[str]


ConversationReference = ById | ByPhone | ByBusinessId


class QuotedMessage(TypedDict):
    id: str
    type: NotRequired[str]
    text: NotRequired[str]


class UrlMedia(TypedDict):
    url: str
    mimeType: NotRequired[str]
    caption: NotRequired[str]


class Base64Media(TypedDict):
    base64: str
    mimeType: NotRequired[str]
    caption: NotRequired[str]


class UrlFile(UrlMedia):
    filename: NotRequired[str]


class Base64File(Base64Media):
    filename: NotRequired[str]


class UrlVoice(UrlMedia):
    ptt: NotRequired[bool]


class Base64Voice(Base64Media):
    ptt: NotRequired[bool]


class ProductUrlMedia(TypedDict):
    url: str
    mimeType: NotRequired[str]


class ProductBase64Media(TypedDict):
    base64: str
    mimeType: NotRequired[str]


class Product(TypedDict):
    businessOwnerId: str
    id: str
    title: str
    description: NotRequired[str]
    currencyCode: str
    priceAmount1000: float
    salePriceAmount1000: NotRequired[float]
    retailerId: NotRequired[str]
    url: NotRequired[str]
    imageCount: NotRequired[int]
    image: NotRequired[ProductUrlMedia | ProductBase64Media]
    body: NotRequired[str]
    footer: NotRequired[str]


class ProductSection(TypedDict):
    title: NotRequired[str]
    productIds: list[str]


class ProductList(TypedDict):
    businessOwnerId: str
    title: str
    description: NotRequired[str]
    buttonText: str
    footer: NotRequired[str]
    sections: list[ProductSection]


class Order(TypedDict):
    id: str
    thumbnailBase64: NotRequired[str]
    itemCount: int
    status: Literal["inquiry", "accepted", "declined"]
    message: NotRequired[str]
    title: NotRequired[str]
    sellerId: str
    token: NotRequired[str]
    totalAmount1000: float
    totalCurrencyCode: str
    catalogType: NotRequired[str]


class ListRow(TypedDict):
    id: str
    title: str
    description: NotRequired[str]


class ListSection(TypedDict):
    title: NotRequired[str]
    rows: list[ListRow]


class InteractiveList(TypedDict):
    title: str
    description: NotRequired[str]
    buttonText: str
    footer: NotRequired[str]
    sections: list[ListSection]


class UrlButton(TypedDict):
    type: Literal["url"]
    text: str
    url: str


class CallButton(TypedDict):
    type: Literal["call"]
    text: str
    phoneNumber: str


class ReplyButton(TypedDict):
    type: Literal["reply"]
    text: str
    id: str


class CopyButton(TypedDict):
    type: Literal["copy"]
    text: str
    copyCode: str


class CatalogButton(TypedDict):
    type: Literal["catalog"]
    text: str
    businessPhoneNumber: str
    catalogProductId: NotRequired[str]


Button = UrlButton | CallButton | ReplyButton | CopyButton | CatalogButton


class Buttons(TypedDict):
    title: NotRequired[str]
    body: str
    footer: NotRequired[str]
    buttons: list[Button]


class Address(TypedDict):
    body: str
    buttonText: NotRequired[str]
    footer: NotRequired[str]
    country: NotRequired[str]


class FlowBase(TypedDict):
    body: str
    buttonText: str
    footer: NotRequired[str]
    id: str
    token: str


class NavigateFlow(FlowBase):
    action: Literal["navigate"]
    screen: str
    dataJson: NotRequired[str]


class ExchangeFlow(FlowBase):
    action: Literal["data_exchange"]


class Poll(TypedDict):
    title: str
    options: list[str]
    multiSelect: NotRequired[bool]


class Location(TypedDict):
    lat: float
    long: float
    address: NotRequired[str]


class Contact(TypedDict):
    vcard: str


class Empty(TypedDict):
    pass


class CallPermissionRequest(TypedDict):
    body: str


class Template(TypedDict):
    name: str
    language: str
    components: NotRequired[list[Json]]


class PaymentAmount(TypedDict):
    value: int
    offset: Literal[100]


class DescribedAmount(PaymentAmount):
    description: NotRequired[str]


class Discount(DescribedAmount):
    programName: NotRequired[str]


class Pix(TypedDict):
    code: str
    merchantName: str
    key: str
    keyType: Literal["CPF", "CNPJ", "EMAIL", "PHONE", "EVP"]


class PaymentLink(TypedDict):
    uri: str


class Boleto(TypedDict):
    digitableLine: str


class PayByPix(TypedDict):
    pixDynamicCode: Pix
    paymentLink: NotRequired[PaymentLink]
    boleto: NotRequired[Boleto]


class PayByLink(TypedDict):
    pixDynamicCode: NotRequired[Pix]
    paymentLink: PaymentLink
    boleto: NotRequired[Boleto]


class PayByBoleto(TypedDict):
    pixDynamicCode: NotRequired[Pix]
    paymentLink: NotRequired[PaymentLink]
    boleto: Boleto


PaymentSettings = PayByPix | PayByLink | PayByBoleto


class Expiration(TypedDict):
    timestamp: int
    description: str


class PaymentItem(TypedDict):
    retailerId: str
    name: str
    amount: PaymentAmount
    quantity: int
    saleAmount: NotRequired[PaymentAmount]


class Itemization(TypedDict):
    catalogId: NotRequired[str]
    expiration: NotRequired[Expiration]
    items: list[PaymentItem]
    subtotal: PaymentAmount
    tax: DescribedAmount
    shipping: NotRequired[DescribedAmount]
    discount: NotRequired[Discount]


class OrderDetailsBase(TypedDict):
    referenceId: str
    type: Literal["digital-goods", "physical-goods"]
    body: str
    footer: NotRequired[str]
    currency: Literal["BRL"]
    totalAmount: PaymentAmount
    paymentSettings: PaymentSettings


class ItemizedOrderDetails(OrderDetailsBase):
    order: Itemization
    headerImageUrl: NotRequired[str]


class OrderState(TypedDict):
    status: Literal[
        "pending", "processing", "partially_shipped", "shipped", "completed", "canceled"
    ]
    description: NotRequired[str]


class PaymentState(TypedDict):
    status: Literal["pending", "captured", "failed"]
    timestamp: NotRequired[int]


class OrderStatusBase(TypedDict):
    referenceId: str
    body: str
    footer: NotRequired[str]


class StatusByOrder(OrderStatusBase):
    order: OrderState
    payment: NotRequired[PaymentState]


class StatusByPayment(OrderStatusBase):
    order: NotRequired[OrderState]
    payment: PaymentState


class TextContent(TypedDict):
    text: str


class ImageContent(TypedDict):
    image: UrlMedia | Base64Media


class VideoContent(TypedDict):
    video: UrlMedia | Base64Media


class FileContent(TypedDict):
    file: UrlFile | Base64File


class VoiceContent(TypedDict):
    voice: UrlVoice | Base64Voice


class PollContent(TypedDict):
    poll: Poll


class LocationContent(TypedDict):
    location: Location


class ContactContent(TypedDict):
    contact: Contact


class PhoneRequestContent(TypedDict):
    requestPhoneNumber: Empty


class ProductContent(TypedDict):
    product: Product


class ProductListContent(TypedDict):
    productList: ProductList


class OrderContent(TypedDict):
    order: Order


class ListContent(TypedDict):
    list: InteractiveList


class ButtonsContent(TypedDict):
    buttons: Buttons


class AddressContent(TypedDict):
    addressMessage: Address


class FlowContent(TypedDict):
    flow: NavigateFlow | ExchangeFlow


class PermissionContent(TypedDict):
    callPermissionRequest: CallPermissionRequest


class OrderDetailsContent(TypedDict):
    orderDetails: OrderDetailsBase | ItemizedOrderDetails


class OrderStatusContent(TypedDict):
    orderStatus: StatusByOrder | StatusByPayment


class TemplateContent(TypedDict):
    template: Template


Content = (
    TextContent
    | ImageContent
    | VideoContent
    | FileContent
    | VoiceContent
    | PollContent
    | LocationContent
    | ContactContent
    | PhoneRequestContent
    | ProductContent
    | ProductListContent
    | OrderContent
    | ListContent
    | ButtonsContent
    | AddressContent
    | FlowContent
    | PermissionContent
    | OrderDetailsContent
    | OrderStatusContent
    | TemplateContent
)


class SendMessage(TypedDict):
    conversation: ConversationReference
    content: Content
    transport: NotRequired[Literal["auto", "linked_devices", "official_api"]]
    isForwarded: NotRequired[bool]
    mentions: NotRequired[list[str]]
    quotedMessage: NotRequired[QuotedMessage]
