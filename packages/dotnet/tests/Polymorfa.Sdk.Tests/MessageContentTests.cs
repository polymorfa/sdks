using Polymorfa.Sdk;
using System.Text.Json;

internal static class MessageContentTests
{
    public static async Task RunAsync()
    {
        var cases = new (MessageContent Content, string Json)[] {
            (new TextContent("Hello"), """{"text":"Hello"}"""),
            (new ImageContent(new(Url:"https://customer.example/image", Caption:"Photo")), """{"image":{"url":"https://customer.example/image","caption":"Photo"}}"""),
            (new VideoContent(new(Base64:"AA==", MimeType:"video/mp4")), """{"video":{"base64":"AA==","mimeType":"video/mp4"}}"""),
            (new FileContent(new(Url:"https://customer.example/file", Filename:"file.pdf")), """{"file":{"url":"https://customer.example/file","filename":"file.pdf"}}"""),
            (new VoiceContent(new(Url:"https://customer.example/audio", Ptt:false)), """{"voice":{"url":"https://customer.example/audio","ptt":false}}"""),
            (new PollContent(new("Choose", ["Yes","No"],false)), """{"poll":{"title":"Choose","options":["Yes","No"],"multiSelect":false}}"""),
            (new LocationContent(new(1.25,2.5,"Here")), """{"location":{"lat":1.25,"long":2.5,"address":"Here"}}"""),
            (new ContactContent(new("BEGIN:VCARD")), """{"contact":{"vcard":"BEGIN:VCARD"}}"""),
            (new PhoneNumberRequestContent(new()), """{"requestPhoneNumber":{}}"""),
            (new ProductContent(new("owner","prod1","Product","USD",12345, SalePriceAmount1000:123, Image:new(Base64:"AA=="))), """{"product":{"businessOwnerId":"owner","id":"prod1","title":"Product","currencyCode":"USD","priceAmount1000":12345,"salePriceAmount1000":123,"image":{"base64":"AA=="}}}"""),
            (new ProductListContent(new("owner","Products","Open", [new(["p1"],"Section")])), """{"productList":{"businessOwnerId":"owner","title":"Products","buttonText":"Open","sections":[{"productIds":["p1"],"title":"Section"}]}}"""),
            (new OrderContent(new("o1",1,"pending","seller",12345,"USD")), """{"order":{"id":"o1","itemCount":1,"status":"pending","sellerId":"seller","totalAmount1000":12345,"totalCurrencyCode":"USD"}}"""),
            (new ListContent(new("Title","Open",[new([new("r1","Row","Detail")],"Section")])), """{"list":{"title":"Title","buttonText":"Open","sections":[{"rows":[{"id":"r1","title":"Row","description":"Detail"}],"title":"Section"}]}}"""),
            (new ButtonsContent(new("Choose",[MessageButton.OpenUrl("Open","https://customer.example"),MessageButton.Reply("Reply","r1"),MessageButton.Copy("Copy","code")])), """{"buttons":{"body":"Choose","buttons":[{"type":"url","text":"Open","url":"https://customer.example"},{"type":"reply","text":"Reply","id":"r1"},{"type":"copy","text":"Copy","copyCode":"code"}]}}"""),
            (new AddressContent(new("Address",Country:"BR")), """{"addressMessage":{"body":"Address","country":"BR"}}"""),
            (new FlowContent(FlowMessage.Navigate("Form","Open","f1","token","FORM","{}")), """{"flow":{"body":"Form","buttonText":"Open","id":"f1","token":"token","action":"navigate","screen":"FORM","dataJson":"{}"}}"""),
            (new FlowContent(FlowMessage.ExchangeData("Form","Open","f1","token")), """{"flow":{"body":"Form","buttonText":"Open","id":"f1","token":"token","action":"data_exchange"}}"""),
            (new CallPermissionRequestContent(new("May we call?")), """{"callPermissionRequest":{"body":"May we call?"}}"""),
            (new OrderDetailsContent(new("r1","digital-goods","Pay",new(123),new(PaymentLink:new("https://customer.example/pay")))), """{"orderDetails":{"referenceId":"r1","type":"digital-goods","body":"Pay","totalAmount":{"value":123,"offset":100},"paymentSettings":{"paymentLink":{"uri":"https://customer.example/pay"}},"currency":"BRL"}}"""),
            (new OrderStatusContent(new("r1","Paid",Order:new("completed"),Payment:new("paid",123))), """{"orderStatus":{"referenceId":"r1","body":"Paid","order":{"status":"completed"},"payment":{"status":"paid","timestamp":123}}}"""),
            (new TemplateContent(new("welcome","en_US",[JsonSerializer.SerializeToElement(new { type="body", parameters=new[]{new{type="text",text="Zoë"}} })])), """{"template":{"name":"welcome","language":"en_US","components":[{"type":"body","parameters":[{"type":"text","text":"Zoë"}]}]}}"""),
            (new UnknownMessageContent(JsonSerializer.SerializeToElement(new{ future = new{enabled=false} })), """{"future":{"enabled":false}}""")
        };
        foreach (var (content, json) in cases)
        {
            using var fixture = new WireFixture { RequiredHeaders = ["idempotency-key"] };
            var request = "{\"conversation\":{\"bsuid\":\"US.123\"},\"content\":" + json + ",\"transport\":\"official_api\",\"isForwarded\":false,\"mentions\":[],\"quotedMessage\":{\"id\":\"quoted1\"}}";
            var response = "{\"success\":true,\"data\":{\"id\":\"m1\",\"whatsapp_ids\":{\"official_api\":\"wa1\"},\"conversation\":{\"bsuid\":\"US.123\"},\"timestamp\":\"2026-09-22\",\"status\":\"pending\",\"type\":\"interactive\",\"content\":" + json + ",\"operationId\":\"op1\"}}";
            var serving = fixture.ServeAsync("POST", "/messaging/support/messages/send", request, response);
            using var client = new MessagingClient(Credential.OrganizationApiKey("pmfa_" + new string('a', 72)), new() { BaseUrl = fixture.Url });
            var actual = (await client.Messages.SendAsync("support", new(new(Bsuid: "US.123"), content, "official_api", false, [], new("quoted1")))).Data.Data;
            ResourceTests.Equal(actual.Content!.GetType(), content.GetType()); ResourceTests.Equal(actual.OperationId, "op1"); await serving;
        }
        Console.WriteLine("PASS all 20 message content kinds, both Flow actions, typed response dispatch and unknown future content over native HTTP");
    }
}
