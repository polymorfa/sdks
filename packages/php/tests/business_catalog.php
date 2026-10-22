<?php

declare(strict_types=1);

$vectors = json_decode(file_get_contents(__DIR__.'/fixtures/business.json'), true, flags:JSON_THROW_ON_ERROR);
$product = $vectors['product'];
$mutation = $vectors['mutation'];
$order = $vectors['order'];
$collection = ['id' => 'collection_1','name' => 'Summer','products' => [$product],'status' => ['status' => 'approved','canAppeal' => false,'commerceUrl' => 'https://example.com/summer','rejectReason' => '']];
$catalogParams = ['id' => 'user_1','after' => 'after_1','limit' => 25,'width' => 256,'height' => 128];
$collectionsParams = ['id' => 'user_1','after' => 'after_1','collectionLimit' => 10,'itemLimit' => 25,'width' => 256,'height' => 128];
$cases = [
 ['GET','/catalog',$catalogParams,null,['products' => [$product],'next' => 'after_2','previous' => 'after_0'],fn ($r) => $r->getCatalog('support', $catalogParams)],
 ['POST','/catalog',[],null,['success' => true],fn ($r) => $r->createCatalog('support')],
 ['PATCH','/catalog/cart',[],['enabled' => true],['success' => true],fn ($r) => $r->setCartEnabled('support', ['enabled' => true])],
 ['GET','/products/product_1',['id' => 'user_1'],null,$product,fn ($r) => $r->getProduct('support', 'product_1', ['id' => 'user_1'])],
 ['POST','/products',[],$mutation,$product,fn ($r) => $r->createProduct('support', $mutation)],
 ['PUT','/products/product_1',[],$mutation,$product,fn ($r) => $r->updateProduct('support', 'product_1', $mutation)],
 ['DELETE','/products/product_1',[],null,['deletedCount' => 1],fn ($r) => $r->deleteProduct('support', 'product_1')],
 ['PATCH','/products/product_1/visibility',[],['hidden' => true],['success' => true],fn ($r) => $r->setProductVisibility('support', 'product_1', ['hidden' => true])],
 ['POST','/products/product_1/appeal',[],['reason' => 'Review requested'],['success' => true],fn ($r) => $r->appealProduct('support', 'product_1', ['reason' => 'Review requested'])],
 ['GET','/collections',$collectionsParams,null,['collections' => [$collection],'next' => 'after_2'],fn ($r) => $r->listCollections('support', $collectionsParams)],
 ['GET','/collections/collection_1',$catalogParams,null,$collection,fn ($r) => $r->getCollection('support', 'collection_1', $catalogParams)],
 ['POST','/collections',[],['name' => 'Summer','productIds' => ['product_1']],['id' => 'collection_1','reviewStatus' => 'pending'],fn ($r) => $r->createCollection('support', ['name' => 'Summer','productIds' => ['product_1']])],
 ['PATCH','/collections/collection_1',[],['name' => 'Autumn','addProductIds' => ['product_2'],'removeProductIds' => ['product_1']],['id' => 'collection_1','reviewStatus' => 'pending'],fn ($r) => $r->updateCollection('support', 'collection_1', ['name' => 'Autumn','addProductIds' => ['product_2'],'removeProductIds' => ['product_1']])],
 ['DELETE','/collections/collection_1',[],null,['success' => true],fn ($r) => $r->deleteCollection('support', 'collection_1')],
 ['POST','/collections/reorder',[],['moves' => [['collectionId' => 'collection_1','fromIndex' => 0,'toIndex' => 1]]],['success' => true],fn ($r) => $r->reorderCollections('support', ['moves' => [['collectionId' => 'collection_1','fromIndex' => 0,'toIndex' => 1]]])],
 ['POST','/collections/collection_1/appeal',[],['reason' => 'Review requested'],['success' => true],fn ($r) => $r->appealCollection('support', 'collection_1', ['reason' => 'Review requested'])],
 ['POST','/orders/order_1/lookup',[],['token' => 'order_lookup_fixture'],$order,fn ($r) => $r->getOrder('support', 'order_1', ['token' => 'order_lookup_fixture'])],
];
foreach ($cases as [$method,$suffix,$query,$body,$data,$invoke]) {
    foreach ($method === 'GET' ? [false] : [false,true] as $accepted) {
        $fixture = ['success' => true,'data' => $accepted ? ['requestId' => 'rpc_1'] : $data];
        $history = [];
        $client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse($fixture, $accepted ? 202 : 200)], $history));
        $result = $invoke($client->business);
        $request = $history[0]['request'];
        parse_str($request->getUri()->getQuery(), $actual);
        check($request->getMethod() === $method && $request->getUri()->getPath() === '/messaging/support/business'.$suffix, 'Catalog route');
        check($actual === array_map(strval(...), $query) && json_decode((string)$request->getBody(), true) === $body, 'Catalog query and body');
        check($result->data === $fixture && $result->metadata->requestId === 'req_test', 'Catalog typed result and metadata');
    }
}
echo count($cases)." typed catalog/product/collection/order methods and async variants passed.\n";
