<?php

declare(strict_types=1);
$definition = ['version' => 1,'kind' => 'standard','category' => 'UTILITY','language' => 'en_US','header' => ['format' => 'text','text' => 'Header'],'body' => 'Hello {{name}}','buttons' => [['type' => 'url','text' => 'Details','url' => 'https://fixture.invalid']],'variables' => [['name' => 'name','type' => 'text','example' => 'Ada']]];
$projectTemplate = ['id' => 'template','name' => 'welcome','category' => 'UTILITY','language' => 'en_US','status' => 'DRAFT','kind' => 'standard','definition' => $definition,'sampleValues' => ['name' => 'Ada'],'cloudLinks' => [],'createdAt' => 1,'updatedAt' => 2];
$cloudTemplate = ['id' => 'cloud','tenantId' => 'team','connection' => 'connection','wabaId' => 'waba','name' => 'welcome','language' => 'en_US','category' => 'UTILITY','status' => 'APPROVED','components' => [['type' => 'BODY','text' => 'Hi']],'createdAt' => '2026-10-11T00:00:00Z','updatedAt' => '2026-10-11T00:00:00Z'];
$envelope = fn ($data) => ['success' => true,'data' => $data];
nativeCases([
 ['GET','/messaging/projects/project/templates',null,$envelope([$projectTemplate]),fn ($c) => $c->templates->list('project')],
 ['POST','/messaging/projects/project/templates',['name' => 'welcome','definition' => $definition],$envelope($projectTemplate),fn ($c) => $c->templates->create('project', ['name' => 'welcome','definition' => $definition])],
 ['GET','/messaging/projects/project/templates/template',null,$envelope($projectTemplate),fn ($c) => $c->templates->retrieve('project', 'template')],
 ['PATCH','/messaging/projects/project/templates/template',['status' => 'DRAFT','sampleValues' => ['name' => 'Ada']],$envelope($projectTemplate),fn ($c) => $c->templates->update('project', 'template', ['status' => 'DRAFT','sampleValues' => ['name' => 'Ada']])],
 ['DELETE','/messaging/projects/project/templates/template',null,['success' => true],fn ($c) => $c->templates->delete('project', 'template')],
 ['POST','/messaging/projects/project/templates/template/preview',[], $envelope(['rendered' => 'Hello Ada']),fn ($c) => $c->templates->preview('project', 'template')],
 ['POST','/messaging/projects/project/templates/template/submit',['connection' => 'connection'],$envelope(['accepted' => true]),fn ($c) => $c->templates->submit('project', 'template', ['connection' => 'connection'])],
 ['GET','/messaging/connection/templates',null,$envelope([$cloudTemplate]),fn ($c) => $c->cloudTemplates->list('connection')],
 ['GET','/messaging/connection/templates/welcome?language=en_US',null,$envelope($cloudTemplate),fn ($c) => $c->cloudTemplates->retrieve('connection', 'welcome', ['language' => 'en_US'])],
 ['POST','/messaging/connection/templates',['name' => 'welcome','language' => 'en_US','category' => 'UTILITY','components' => []],$envelope($cloudTemplate),fn ($c) => $c->cloudTemplates->create('connection', ['name' => 'welcome','language' => 'en_US','category' => 'UTILITY','components' => []])],
 ['PATCH','/messaging/connection/templates/welcome?language=en_US',['components' => []],$envelope(['accepted' => true,'name' => 'welcome','language' => 'en_US']),fn ($c) => $c->cloudTemplates->update('connection', 'welcome', ['components' => []], ['language' => 'en_US'])],
 ['DELETE','/messaging/connection/templates/welcome',null,['success' => true],fn ($c) => $c->cloudTemplates->delete('connection', 'welcome')],
], fn ($credential, $url) => new Polymorfa\MessagingClient($credential, baseUrl:$url));
$history = [];
$client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse(['error' => ['code' => 'unknown_outcome']], 503)], $history));
raises(fn () => $client->cloudTemplates->create('connection', ['name' => 'welcome','language' => 'en_US','category' => 'UTILITY','components' => []], new Polymorfa\RequestOptions(idempotencyKey:'safe_key', maxNetworkRetries:3)), Polymorfa\ServerException::class);
check(count($history) === 1, 'Cloud template provider write is sent once');
