<?php

declare(strict_types=1);
$audience = ['id' => 'audience','name' => 'Audience','source' => 'api','recipientCount' => 1,'fileId' => null,'columns' => null,'sampleRow' => null,'mapping' => null,'createdAt' => 1,'updatedAt' => 2];
$import = $audience + ['duplicateCount' => 0,'invalidCount' => 1,'invalidRows' => [['row' => 2,'reason' => 'invalid_phone']]];
$member = ['id' => 'member','phone' => '+15555555555','variables' => ['name' => 'Ada'],'createdAt' => 1];
$added = ['listId' => 'audience','added' => 1,'recipientCount' => 1,'duplicateCount' => 0,'invalidCount' => 0,'invalidRows' => []];
$data = fn ($data) => ['data' => $data];
nativeCases([
 ['GET','/platform/audiences',null,$data(['items' => [$audience]]),fn ($c) => $c->audiences->list()],
 ['POST','/platform/audiences',['name' => 'Audience','source' => 'api','members' => [['phone' => '+15555555555']]],$data($import),fn ($c) => $c->audiences->create(['name' => 'Audience','source' => 'api','members' => [['phone' => '+15555555555']]])],
 ['GET','/platform/audiences/audience',null,$data($audience),fn ($c) => $c->audiences->retrieve('audience')],
 ['DELETE','/platform/audiences/audience',null,$data(['deleted' => true]),fn ($c) => $c->audiences->delete('audience')],
 ['POST','/platform/audiences/audience/members',['members' => [['phone' => '+15555555555','variables' => ['name' => 'Ada']]]],$data($added),fn ($c) => $c->audiences->addMembers('audience', ['members' => [['phone' => '+15555555555','variables' => ['name' => 'Ada']]]])],
 ['GET','/platform/audiences/audience/members?cursor=next&limit=2',null,['data' => [$member],'page' => ['nextCursor' => null,'hasMore' => false]],fn ($c) => $c->audiences->listMembers('audience', ['cursor' => 'next','limit' => 2])],
 ['DELETE','/platform/audiences/audience/members/%2B15555555555',null,$data(['removed' => true,'listId' => 'audience','phone' => '+15555555555','recipientCount' => 0]),fn ($c) => $c->audiences->deleteMember('audience', '+15555555555')],
 ['POST','/platform/audiences/uploads',['filename' => 'audience.csv'],$data(['fileId' => 'file','url' => 'https://fixture.invalid/upload']),fn ($c) => $c->audiences->createUpload(['filename' => 'audience.csv'])],
], fn ($credential, $url) => new Polymorfa\Client($credential, baseUrl:$url));
$history = [];
$client = new Polymorfa\Client($credential, http:mocked([jsonResponse($data($import))], $history));
$client->audiences->create(['name' => 'File audience','fileId' => 'file','mapping' => ['phone' => 'Phone','variables' => ['name' => 'Name']]]);
check(json_decode((string)$history[0]['request']->getBody(), true)['mapping']['variables'] === ['name' => 'Name'], 'File import mapping retained');
