<?php

declare(strict_types=1);
$policy = ['scope' => 'connection','revision' => 'r2','prefer' => null,'allowedTransports' => ['linked_devices','official_api']];
$link = ['revision' => 'r2','paused' => false,'connections' => [['kind' => 'linked_devices','status' => 'connected','enabled' => true]]];
$values = ['presenceMode' => 'off','typingMode' => 'events','labelMode' => 'project','quickReplyMode' => 'cache'];
$projectPolicy = ['projectId' => 'project'] + $values;
$connectionPolicy = ['connectionName' => 'connection','projectId' => 'project','project' => $values,'override' => ['presenceMode' => 'inherit','typingMode' => 'inherit','labelMode' => 'inherit'],'effective' => $values];
$envelope = fn ($data) => ['success' => true,'data' => $data];
$trigger = ['event' => 'message.received','connection' => 'connection','delivery' => 'simulated','eventId' => null,'source' => 'runtime'];
$fixtures = ['fixtures' => [['name' => 'message.received','description' => 'Receive a test message','overrides' => ['text','from']]]];
nativeCases([
 ['POST','/messaging/quicklinks',['configuration' => ['testing' => ['configuration' => ['accountType' => 'business_app','primaryPlatform' => 'ios']]]],$envelope(['purpose' => 'initial','connectionGoal' => 'single','id' => 'ql_testing','url' => 'https://example.invalid/testing','connection' => 'stable-session-id','expiresAt' => null]),fn ($c) => $c->quickLinks->create(['configuration' => ['testing' => ['configuration' => ['accountType' => 'business_app','primaryPlatform' => 'ios']]]])],
 ['GET','/messaging/routing/hybrid?scope=connection&projectId=project&connection=connection',null,$envelope($policy),fn ($c) => $c->hybridLink->getPolicy(['scope' => 'connection','projectId' => 'project','connection' => 'connection'])],
 ['PUT','/messaging/routing/hybrid?scope=team',['expectedRevision' => 'r1','prefer' => null,'allowedTransports' => []],$envelope($policy),fn ($c) => $c->hybridLink->setPolicy(['scope' => 'team'], ['expectedRevision' => 'r1','prefer' => null,'allowedTransports' => []])],
 ['GET','/messaging/connection/hybrid-link',null,$envelope($link),fn ($c) => $c->hybridLink->state('connection')],
 ['PUT','/messaging/connection/hybrid-link',['expectedRevision' => 'r1','paused' => false],$envelope(['revision' => 'r2','paused' => false]),fn ($c) => $c->hybridLink->setPaused('connection', ['expectedRevision' => 'r1','paused' => false])],
 ['GET','/messaging/projects/project/observation-policy',null,$envelope($projectPolicy),fn ($c) => $c->observationPolicies->retrieveForProject('project')],
 ['GET','/messaging/connection/observation-policy',null,$envelope($connectionPolicy),fn ($c) => $c->observationPolicies->retrieveForConnection('connection')],
 ['POST','/messaging/cloud-api/embedded-signup',['quicklinkId' => 'link','result' => ['code' => 'synthetic_fixture','wabaId' => 'waba','phoneNumberId' => 'phone','coexistence' => false]],$envelope(['stage' => 'complete']),fn ($c) => $c->cloudOnboarding->advance(['quicklinkId' => 'link','result' => ['code' => 'synthetic_fixture','wabaId' => 'waba','phoneNumberId' => 'phone','coexistence' => false]])],
 ['POST','/messaging/projects/project/test-history-fixtures',['messages' => [['id' => 'message','senderPhone' => '+15555555555','text' => 'Fixture','timestamp' => 1,'fromMe' => false]]],['fixtureId' => 'fixture'],fn ($c) => $c->testing->createHistoryFixture('project', ['messages' => [['id' => 'message','senderPhone' => '+15555555555','text' => 'Fixture','timestamp' => 1,'fromMe' => false]]])],
 ['POST','/messaging/connection/test-events',['event' => 'message.received','fromConnection' => 'sender','overrides' => ['text' => 'Fixture']],$trigger,fn ($c) => $c->testing->triggerEvent('connection', ['event' => 'message.received','fromConnection' => 'sender','overrides' => ['text' => 'Fixture']])],
 ['GET','/messaging/test-events/fixtures',null,$fixtures,fn ($c) => $c->testing->listEventFixtures()],
 ['GET','/messaging/connection/phone',null,['connection' => 'connection','phone' => '+15555555555','online' => false,'devices' => [['deviceId' => 1]]],fn ($c) => $c->testing->getPhone('connection')],
 ['POST','/messaging/connection/phone/messages',['to' => '+15555555555','text' => 'Fixture'],['connection' => 'connection','to' => '+15555555555','messageId' => null],fn ($c) => $c->testing->sendPhoneMessage('connection', ['to' => '+15555555555','text' => 'Fixture']),null,['status' => 202]],
 ['POST','/messaging/connection/phone/devices/1/unlink',null,['connection' => 'connection','deviceId' => 1,'unlinked' => true],fn ($c) => $c->testing->unlinkPhoneDevice('connection', 1)],
], fn ($credential, $url) => new Polymorfa\MessagingClient($credential, baseUrl:$url));
raises(fn () => (new Polymorfa\MessagingClient($credential))->testing->unlinkPhoneDevice('connection', 0), Polymorfa\ValidationException::class);
$history = [];
new Polymorfa\SystemClient(baseUrl:'http://api.fixture.invalid', http:mocked([], $history));
nativeCases([
 ['GET','/messaging/info/status',null,['status' => 'ok','uptime' => '1s','version' => 'fixture','env' => 'testing'],fn ($c) => $c->status()],
 ['GET','/messaging/info/version',null,['version' => 'fixture','buildTime' => 'now','env' => 'testing','apiVersion' => '2026-09-22','minSupportedVersion' => '2026-09-22'],fn ($c) => $c->version()],
 ['GET','/health',null,['status' => 'ok','checks' => ['database' => ['status' => 'ok']]],fn ($c) => $c->health()],
 ['GET','/ping',null,['status' => 'pong'],fn ($c) => $c->ping()],
], fn ($credential, $url) => new Polymorfa\SystemClient(baseUrl:$url), authenticated:false);
nativeCases([
 ['GET','/messaging/bridge/route',null,['wsUrl' => 'wss://fixture.invalid/bridge','region' => 'US','kind' => 'sandbox','signal' => 'customer','tokenKind' => 'project','expiresAt' => 100],fn ($c) => $c->routes->resolve()],
], fn ($credential, $url) => new Polymorfa\BridgeClient($credential, baseUrl:$url), Polymorfa\Credential::projectToken('pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'));
raises(fn () => new Polymorfa\BridgeClient($credential), Polymorfa\ConfigurationException::class);
