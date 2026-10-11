<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type MessageIds array{linked_devices:string,official_api?:string}|array{linked_devices?:string,official_api:string}
 * @phpstan-type RoutingReason 'explicit_transport'|'template'|'target_reference'|'only_eligible_transport'|'session_rule'|'project_rule'|'team_rule'|'default_linked_devices'
 * @phpstan-type Transport 'auto'|'linked_devices'|'official_api'
 * @phpstan-type Conversation array{id:string,phoneNumber?:string,bsuid?:string,username?:string}|array{id?:string,phoneNumber:string,bsuid?:string,username?:string}|array{id?:string,phoneNumber?:string,bsuid:string,username?:string}
 * @phpstan-type Media array{url:string,base64?:never,mimeType?:string,caption?:string}|array{url?:never,base64:string,mimeType?:string,caption?:string}
 * @phpstan-type FileMedia array{url:string,base64?:never,mimeType?:string,caption?:string,filename?:string}|array{url?:never,base64:string,mimeType?:string,caption?:string,filename?:string}
 * @phpstan-type VoiceMedia array{url:string,base64?:never,mimeType?:string,caption?:string,ptt?:bool}|array{url?:never,base64:string,mimeType?:string,caption?:string,ptt?:bool}
 * @phpstan-type Product array{businessOwnerId:string,id:string,title:string,description?:string,currencyCode:string,priceAmount1000:int|float,salePriceAmount1000?:int|float,retailerId?:string,url?:string,imageCount?:int,image?:array{url:string,base64?:never,mimeType?:string}|array{url?:never,base64:string,mimeType?:string},body?:string,footer?:string}
 * @phpstan-type ProductList array{businessOwnerId:string,title:string,description?:string,buttonText:string,footer?:string,sections:list<array{title?:string,productIds:list<string>}>}
 * @phpstan-type Order array{id:string,thumbnailBase64?:string,itemCount:int,status:'inquiry'|'accepted'|'declined',message?:string,title?:string,sellerId:string,token?:string,totalAmount1000:int|float,totalCurrencyCode:string,catalogType?:string}
 * @phpstan-type ListContent array{title:string,description?:string,buttonText:string,footer?:string,sections:list<array{title?:string,rows:list<array{id:string,title:string,description?:string}>}>}
 * @phpstan-type Button array{type:'url',text:string,url:string}|array{type:'call',text:string,phoneNumber:string}|array{type:'reply',text:string,id:string}|array{type:'copy',text:string,copyCode:string}|array{type:'catalog',text:string,businessPhoneNumber:string,catalogProductId?:string}
 * @phpstan-type Flow array{body:string,buttonText:string,footer?:string,id:string,token:string,action:'navigate',screen:string,dataJson?:string}|array{body:string,buttonText:string,footer?:string,id:string,token:string,action:'data_exchange',screen?:never,dataJson?:never}
 * @phpstan-type Amount array{value:int,offset:100}
 * @phpstan-type Pix array{code:string,merchantName:string,key:string,keyType:'CPF'|'CNPJ'|'EMAIL'|'PHONE'|'EVP'}
 * @phpstan-type PaymentSettings array{pixDynamicCode:Pix,paymentLink?:array{uri:string},boleto?:array{digitableLine:string}}|array{pixDynamicCode?:Pix,paymentLink:array{uri:string},boleto?:array{digitableLine:string}}|array{pixDynamicCode?:Pix,paymentLink?:array{uri:string},boleto:array{digitableLine:string}}
 * @phpstan-type Itemization array{catalogId?:string,expiration?:array{timestamp:int,description:string},items:list<array{retailerId:string,name:string,amount:Amount,quantity:int,saleAmount?:Amount}>,subtotal:Amount,tax:array{value:int,offset:100,description?:string},shipping?:array{value:int,offset:100,description?:string},discount?:array{value:int,offset:100,description?:string,programName?:string}}
 * @phpstan-type OrderDetails array{referenceId:string,type:'digital-goods'|'physical-goods',body:string,footer?:string,currency:'BRL',totalAmount:Amount,paymentSettings:PaymentSettings,order:Itemization,headerImageUrl?:string}|array{referenceId:string,type:'digital-goods'|'physical-goods',body:string,footer?:string,currency:'BRL',totalAmount:Amount,paymentSettings:PaymentSettings,order?:never,headerImageUrl?:never}
 * @phpstan-type OrderState array{status:'pending'|'processing'|'partially_shipped'|'shipped'|'completed'|'canceled',description?:string}
 * @phpstan-type PaymentState array{status:'pending'|'captured'|'failed',timestamp?:int}
 * @phpstan-type OrderStatus array{referenceId:string,body:string,footer?:string,order:OrderState,payment?:PaymentState}|array{referenceId:string,body:string,footer?:string,order?:OrderState,payment:PaymentState}
 * @phpstan-type Content array{text:string}|array{image:Media}|array{video:Media}|array{file:FileMedia}|array{voice:VoiceMedia}|array{poll:array{title:string,options:list<string>,multiSelect?:bool}}|array{location:array{lat:int|float,long:int|float,address?:string}}|array{contact:array{vcard:string}}|array{requestPhoneNumber:array{}}|array{product:Product}|array{productList:ProductList}|array{order:Order}|array{list:ListContent}|array{buttons:array{title?:string,body:string,footer?:string,buttons:list<Button>}}|array{addressMessage:array{body:string,buttonText?:string,footer?:string,country?:string}}|array{flow:Flow}|array{callPermissionRequest:array{body:string}}|array{orderDetails:OrderDetails}|array{orderStatus:OrderStatus}|array{template:array{name:string,language:string,components?:list<mixed>}}
 * @phpstan-type SendRequest array{transport?:Transport,conversation:Conversation,isForwarded?:bool,mentions?:list<string>,quotedMessage?:array{id:string,type?:string,text?:string},content:Content}
 * @phpstan-type Receipt array{id:string,whatsapp_ids:MessageIds,whatsapp_id?:string,conversation:array{id:string,phoneNumber?:string,bsuid?:string,username?:string},timestamp:string,status:string,transport?:'linked_devices'|'official_api',routingReason?:RoutingReason,operationId?:string}
 * @phpstan-type MessageResponse array{id:string,whatsapp_ids:MessageIds,whatsapp_id?:string,conversation:array{id:string,phoneNumber?:string,bsuid?:string,username?:string},timestamp:string,status:string,transport?:'linked_devices'|'official_api',routingReason?:RoutingReason,operationId?:string,type:string,content?:Content,mediaId?:string}
 * @phpstan-type Operation array{operationId:string,status:'pending'|'unknown'|'completed'|'rejected',transport?:'linked_devices'|'official_api',rejectionCode?:'hybrid_authority_unavailable',receipt?:array{whatsapp_ids:MessageIds,timestamp:string}}
 */
final class MessageModels
{
    private function __construct()
    {
    }
}
