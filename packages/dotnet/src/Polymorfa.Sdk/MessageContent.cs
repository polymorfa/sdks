using System.Text.Json;

namespace Polymorfa.Sdk;

public sealed record ProductMedia(string? Url = null, string? Base64 = null, string? MimeType = null);
public sealed record ProductMessage(string BusinessOwnerId, string Id, string Title, string CurrencyCode, long PriceAmount1000, string? Description = null, long? SalePriceAmount1000 = null, string? RetailerId = null, string? Url = null, int? ImageCount = null, ProductMedia? Image = null, string? Body = null, string? Footer = null);
public sealed record ProductListSection(IReadOnlyList<string> ProductIds, string? Title = null);
public sealed record ProductListMessage(string BusinessOwnerId, string Title, string ButtonText, IReadOnlyList<ProductListSection> Sections, string? Description = null, string? Footer = null);
public sealed record OrderMessage(string Id, int ItemCount, string Status, string SellerId, long TotalAmount1000, string TotalCurrencyCode, string? ThumbnailBase64 = null, string? Message = null, string? Title = null, string? Token = null, string? CatalogType = null);
public sealed record ListMessageRow(string Id, string Title, string? Description = null);
public sealed record ListMessageSection(IReadOnlyList<ListMessageRow> Rows, string? Title = null);
public sealed record ListMessage(string Title, string ButtonText, IReadOnlyList<ListMessageSection> Sections, string? Description = null, string? Footer = null);
public sealed record MessageButton(string Type, string Text, string? Url = null, string? PhoneNumber = null, string? Id = null, string? CopyCode = null, string? BusinessPhoneNumber = null, string? CatalogProductId = null)
{
    public static MessageButton OpenUrl(string text, string url) => new("url", text, Url: url);
    public static MessageButton Call(string text, string phoneNumber) => new("call", text, PhoneNumber: phoneNumber);
    public static MessageButton Reply(string text, string id) => new("reply", text, Id: id);
    public static MessageButton Copy(string text, string code) => new("copy", text, CopyCode: code);
    public static MessageButton Catalog(string text, string businessPhoneNumber, string? catalogProductId = null) => new("catalog", text, BusinessPhoneNumber: businessPhoneNumber, CatalogProductId: catalogProductId);
}
public sealed record ButtonsMessage(string Body, IReadOnlyList<MessageButton> Buttons, string? Title = null, string? Footer = null);
public sealed record AddressMessage(string Body, string? ButtonText = null, string? Footer = null, string? Country = null);
public sealed record FlowMessage(string Body, string ButtonText, string Id, string Token, string Action, string? Footer = null, string? Screen = null, string? DataJson = null)
{
    public static FlowMessage Navigate(string body, string buttonText, string id, string token, string screen, string? dataJson = null, string? footer = null) => new(body, buttonText, id, token, "navigate", footer, screen, dataJson);
    public static FlowMessage ExchangeData(string body, string buttonText, string id, string token, string? footer = null) => new(body, buttonText, id, token, "data_exchange", footer);
    public override string ToString() => $"FlowMessage(id={Id}, action={Action}, token=redacted)";
}
public sealed record CallPermissionRequestMessage(string Body);
public sealed record PaymentOrderAmount(long Value, int Offset = 100);
public sealed record PixDynamicCodePayment(string Code, string MerchantName, string Key, string KeyType);
public sealed record PaymentLink(string Uri);
public sealed record BoletoPayment(string DigitableLine);
public sealed record OrderPaymentSettings(PixDynamicCodePayment? PixDynamicCode = null, PaymentLink? PaymentLink = null, BoletoPayment? Boleto = null);
public sealed record OrderExpiration(long Timestamp, string Description);
public sealed record OrderDetailsItem(string RetailerId, string Name, PaymentOrderAmount Amount, int Quantity, PaymentOrderAmount? SaleAmount = null);
public sealed record DescribedOrderAmount(long Value, int Offset = 100, string? Description = null, string? ProgramName = null);
public sealed record OrderDetailsItemization(IReadOnlyList<OrderDetailsItem> Items, PaymentOrderAmount Subtotal, DescribedOrderAmount Tax, string? CatalogId = null, OrderExpiration? Expiration = null, DescribedOrderAmount? Shipping = null, DescribedOrderAmount? Discount = null);
public sealed record OrderDetailsMessage(string ReferenceId, string Type, string Body, PaymentOrderAmount TotalAmount, OrderPaymentSettings PaymentSettings, string Currency = "BRL", string? Footer = null, OrderDetailsItemization? Order = null, string? HeaderImageUrl = null);
public sealed record OrderStatusUpdate(string Status, string? Description = null);
public sealed record OrderPaymentStatusUpdate(string Status, long? Timestamp = null);
public sealed record OrderStatusMessage(string ReferenceId, string Body, string? Footer = null, OrderStatusUpdate? Order = null, OrderPaymentStatusUpdate? Payment = null);
public sealed record MessageTemplateSend(string Name, string Language, IReadOnlyList<JsonElement>? Components = null);
public sealed record EmptyMessageObject;
public sealed record PhoneNumberRequestContent(EmptyMessageObject RequestPhoneNumber) : MessageContent;
public sealed record ProductContent(ProductMessage Product) : MessageContent;
public sealed record ProductListContent(ProductListMessage ProductList) : MessageContent;
public sealed record OrderContent(OrderMessage Order) : MessageContent;
public sealed record ListContent(ListMessage List) : MessageContent;
public sealed record ButtonsContent(ButtonsMessage Buttons) : MessageContent;
public sealed record AddressContent(AddressMessage AddressMessage) : MessageContent;
public sealed record FlowContent(FlowMessage Flow) : MessageContent;
public sealed record CallPermissionRequestContent(CallPermissionRequestMessage CallPermissionRequest) : MessageContent;
public sealed record OrderDetailsContent(OrderDetailsMessage OrderDetails) : MessageContent;
public sealed record OrderStatusContent(OrderStatusMessage OrderStatus) : MessageContent;
public sealed record TemplateContent(MessageTemplateSend Template) : MessageContent;
/// <summary>A future response content object retained without losing fields.</summary>
public sealed record UnknownMessageContent(JsonElement Value) : MessageContent;
