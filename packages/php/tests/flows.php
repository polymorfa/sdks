<?php

declare(strict_types=1);
$flowId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
$draft = ['id' => $flowId,'name' => 'Booking','status' => 'draft','version' => '7.1','screenCount' => 1,'metaLinks' => [],'createdAt' => 10,'updatedAt' => 20,'definition' => ['version' => '7.1','screens' => [['id' => 'START','terminal' => true]]]];
$key = ['id' => 'key1','state' => 'uncertain','fingerprint' => 'sha1','publicKey' => 'PUBLIC KEY','errorCode' => 'provider_timeout','createdAt' => 10,'activatedAt' => null,'retireAfter' => null];
$custody = ['custody' => 'managed','activeKeyId' => null,'keys' => [$key]];
$endpoint = ['id' => 'ep1','orgId' => 'o1','projectId' => 'p1','flowId' => $flowId,'sessionId' => 's1','mode' => 'function','url' => null,'functionId' => 'fn1','deploymentId' => null,'enabled' => false,'revision' => 2,'endpointUri' => 'https://api.polymorfa.com/flow/ep1','createdAt' => 10,'updatedAt' => 20];
$operation = ['id' => 'op1','requestId' => 'request1','flowId' => $flowId,'flowName' => 'Booking','sessionId' => 's1','session' => 'support','action' => 'upload','state' => 'uncertain','resolution' => null,'wabaId' => null,'metaFlowId' => null,'definitionDigest' => 'digest','providerStatus' => null,'errorCode' => 'provider_timeout','providerCode' => null,'providerSubcode' => null,'createdAt' => 10,'updatedAt' => 20,'completedAt' => null];
$result = ['operation' => $operation,'flow' => $draft];
$receipt = ['id' => 'r1','flowId' => $flowId,'endpointId' => 'ep1','sessionId' => 's1','mode' => 'function','action' => 'INIT','outcome' => 'succeeded','httpStatus' => 200,'errorCode' => null,'keyId' => 'key1','functionInvocationId' => 'inv1','durationMs' => 12.5,'createdAt' => 10,'completedAt' => 20];
$path = '/platform/flows/'.$flowId;
$cases = [
 ['GET','/platform/flows?projectId=p1',null,['data' => [$draft]],fn ($c) => $c->list(),[$draft]],
 ['POST','/platform/flows',['name' => 'Booking','definition' => ['version' => '7.1'],'projectId' => 'p1'],['data' => $draft],fn ($c) => $c->create(['name' => 'Booking','definition' => ['version' => '7.1']]),$draft],
 ['GET',$path.'?projectId=p1',null,['data' => $draft],fn ($c) => $c->retrieve($flowId),$draft],
 ['PATCH',$path,['expectedUpdatedAt' => 20,'name' => 'Booking','projectId' => 'p1'],['data' => $draft],fn ($c) => $c->update($flowId, ['expectedUpdatedAt' => 20,'name' => 'Booking']),$draft],
 ['DELETE',$path.'?projectId=p1',null,['data' => ['ok' => true]],fn ($c) => $c->delete($flowId),['ok' => true]],
 ['POST',$path.'/upload',['sessionId' => 's1','categories' => ['APPOINTMENT_BOOKING'],'requestId' => 'request1','projectId' => 'p1'],['data' => $result],fn ($c) => $c->upload($flowId, ['sessionId' => 's1','categories' => ['APPOINTMENT_BOOKING'],'requestId' => 'request1']),$result],
 ['POST',$path.'/publish',['sessionId' => 's1','projectId' => 'p1'],['data' => $result],fn ($c) => $c->publish($flowId, ['sessionId' => 's1']),$result],
 ['POST',$path.'/deprecate',['sessionId' => 's1','projectId' => 'p1'],['data' => $result],fn ($c) => $c->deprecate($flowId, ['sessionId' => 's1']),$result],
 ['POST',$path.'/discard',['sessionId' => 's1','projectId' => 'p1'],['data' => $result],fn ($c) => $c->discard($flowId, ['sessionId' => 's1']),$result],
 ['POST',$path.'/sync',['sessionId' => 's1','projectId' => 'p1'],['data' => $result],fn ($c) => $c->sync($flowId, ['sessionId' => 's1']),$result],
 ['GET',$path.'/receipts?projectId=p1',null,['data' => [$operation]],fn ($c) => $c->receipts($flowId),[$operation]],
 ['GET',$path.'/endpoint?sessionId=s1&projectId=p1',null,['data' => ['endpoint' => null,'encryption' => $custody]],fn ($c) => $c->endpoint($flowId, 's1'),['endpoint' => null,'encryption' => $custody]],
 ['PUT',$path.'/endpoint',['sessionId' => 's1','mode' => 'function','functionId' => 'fn1','deploymentId' => null,'enabled' => false,'expectedRevision' => 2,'projectId' => 'p1'],['data' => ['endpoint' => $endpoint,'encryption' => $custody]],fn ($c) => $c->setEndpoint($flowId, ['sessionId' => 's1','mode' => 'function','functionId' => 'fn1','deploymentId' => null,'enabled' => false,'expectedRevision' => 2]),['endpoint' => $endpoint,'encryption' => $custody]],
 ['DELETE',$path.'/endpoint?sessionId=s1&projectId=p1',null,['data' => ['ok' => true]],fn ($c) => $c->deleteEndpoint($flowId, 's1'),['ok' => true]],
 ['GET',$path.'/endpoint/receipts?sessionId=s1&limit=2&projectId=p1',null,['data' => [$receipt]],fn ($c) => $c->endpointReceipts($flowId, ['sessionId' => 's1','limit' => 2]),[$receipt]],
 ['GET','/platform/flow-encryption-keys?sessionId=s1&projectId=p1',null,['data' => $custody],fn ($c) => $c->encryptionKey('s1'),$custody],
 ['POST','/platform/flow-encryption-keys/rotate',['sessionId' => 's1','projectId' => 'p1'],['data' => $custody + ['key' => $key]],fn ($c) => $c->rotateEncryptionKey('s1'),$custody + ['key' => $key]],
 ['PUT',$path.'/endpoint',['sessionId' => 's1','mode' => 'forward','url' => 'https://customer.example/flow','rotateSigningSecret' => true,'projectId' => 'p1'],['data' => ['endpoint' => $endpoint,'signingSecret' => 'one-time-fixture','encryption' => $custody]],fn ($c) => $c->setEndpoint($flowId, ['sessionId' => 's1','mode' => 'forward','url' => 'https://customer.example/flow','rotateSigningSecret' => true]),['endpoint' => $endpoint,'signingSecret' => 'one-time-fixture','encryption' => $custody]],
 ['PUT',$path.'/endpoint',['sessionId' => 's1','mode' => 'direct','url' => 'https://customer.example/direct','projectId' => 'p1'],['data' => ['endpoint' => $endpoint,'encryption' => $custody]],fn ($c) => $c->setEndpoint($flowId, ['sessionId' => 's1','mode' => 'direct','url' => 'https://customer.example/direct']),['endpoint' => $endpoint,'encryption' => $custody]],
];
nativeCases($cases, fn ($credential, $url) => new Polymorfa\Resources\Flows(new Polymorfa\HttpTransport($credential, $url), 'p1'));
$flows = new Polymorfa\Resources\Flows(new Polymorfa\HttpTransport($credential), 'p1');
foreach ([fn () => $flows->retrieve('bad'),fn () => $flows->endpoint($flowId, ''),fn () => $flows->endpointReceipts($flowId, ['limit' => 0]),fn () => $flows->setEndpoint($flowId, ['sessionId' => 's1','mode' => 'direct','url' => 'https://user:pass@example.com']),fn () => $flows->setEndpoint($flowId, ['sessionId' => 's1','mode' => 'function','functionId' => ''])] as $invoke) {
    raises($invoke, Polymorfa\ValidationException::class);
}
raises(fn () => $flows->create(['name' => 'Booking','definition' => [],'projectId' => 'other']), Polymorfa\ConfigurationException::class);
$history = [];
$flows = new Polymorfa\Resources\Flows(new Polymorfa\HttpTransport($credential, http:mocked([jsonResponse(['error' => ['code' => 'unavailable']], 503)], $history)), 'p1');
raises(fn () => $flows->publish($flowId, ['sessionId' => 's1'], new Polymorfa\RequestOptions(idempotencyKey:'write-key', maxNetworkRetries:3)), Polymorfa\ServerException::class);
check(count($history) === 1, 'Flow provider writes never retry');
$history = [];
$flows = new Polymorfa\Resources\Flows(new Polymorfa\HttpTransport($credential, http:mocked([jsonResponse(['data' => null])], $history)), 'p1');
check($flows->retrieve($flowId)->data === null,'Missing Flow preserves null');
