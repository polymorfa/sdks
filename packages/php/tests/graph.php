<?php

declare(strict_types=1);
$catalogs = ['data' => [['id' => '123','name' => 'Products']],'paging' => ['cursors' => ['before' => 'before','after' => 'after']]];
$products = ['data' => [['id' => '456','retailer_id' => 'sku','name' => 'Product','availability' => 'in stock']],'paging' => ['cursors' => ['after' => 'next']]];
$marketing = ['id' => 'waba','marketing_messages_lite_api_status' => 'IN_REVIEW','marketing_messages_onboarding_status' => 'UNAVAILABLE'];
$key = ['data' => [['business_public_key' => 'PUBLIC KEY','business_public_key_signature_status' => 'VALID']]];
nativeCases([
 ['GET','/graph/whatsapp/v26.0/waba/product_catalogs?limit=2&after=cursor',null,$catalogs,fn ($c) => $c->cloudCatalogs->list('waba', ['version' => 'v26.0','limit' => 2,'after' => 'cursor'])],
 ['GET','/graph/whatsapp/v26.0/waba/product_catalogs/123/products?limit=2',null,$products,fn ($c) => $c->cloudCatalogs->listProducts('waba', '123', ['version' => 'v26.0','limit' => 2])],
 ['GET','/graph/whatsapp/v26.0/waba/marketing_messages/status',null,$marketing,fn ($c) => $c->cloudMarketing->status('waba', ['version' => 'v26.0'])],
 ['GET','/graph/whatsapp/v26.0/phone/whatsapp_business_encryption',null,$key,fn ($c) => $c->flowEncryption->retrieve('phone', ['version' => 'v26.0'])],
 ['POST','/graph/whatsapp/v26.0/phone/whatsapp_business_encryption',['business_public_key' => 'PUBLIC KEY'],['success' => true],fn ($c) => $c->flowEncryption->register('phone', ['businessPublicKey' => 'PUBLIC KEY'], ['version' => 'v26.0'])],
], fn ($credential, $url) => new Polymorfa\MessagingClient($credential, baseUrl:$url));
$history = [];
$client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse(['error' => ['code' => 'unavailable']], 503)], $history));
raises(fn () => $client->flowEncryption->register('phone', ['businessPublicKey' => 'PUBLIC KEY'], ['version' => 'v26.0'], new Polymorfa\RequestOptions(maxNetworkRetries:3, idempotencyKey:'fixture-key')), Polymorfa\ServerException::class);
check(count($history) === 1, 'Graph key registration never retries even with an explicit key');
raises(fn () => $client->cloudCatalogs->listProducts('waba', 'nonnumeric', ['version' => 'v26.0']), Polymorfa\ConfigurationException::class);
$history = [];
$client = new Polymorfa\MessagingClient(Polymorfa\Credential::clientToken('pmfa_ct_'.str_repeat('a', 115).'A'), http:mocked([], $history));
foreach ([fn () => $client->cloudCatalogs->list('waba', ['version' => 'v26.0']),fn () => $client->cloudMarketing->status('waba', ['version' => 'v26.0']),fn () => $client->flowEncryption->retrieve('phone', ['version' => 'v26.0'])] as $invoke) {
    raises($invoke,Polymorfa\ConfigurationException::class);
}
check($history === [],'Graph methods reject client tokens before transport');
