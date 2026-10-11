<?php

declare(strict_types=1);
$policy = ['scope' => 'session','revision' => 'r2','prefer' => null,'allowedTransports' => ['linked_devices','official_api']];
$link = ['revision' => 'r2','paused' => false,'connections' => [['kind' => 'linked_devices','status' => 'connected','enabled' => true]]];
$values = ['presenceMode' => 'off','typingMode' => 'events','labelMode' => 'project','quickReplyMode' => 'cache'];
$projectPolicy = ['projectId' => 'project'] + $values;
$sessionPolicy = ['sessionName' => 'session','projectId' => 'project','project' => $values,'override' => ['presenceMode' => 'inherit','typingMode' => 'inherit','labelMode' => 'inherit'],'effective' => $values];
$envelope = fn ($data) => ['success' => true,'data' => $data];
$trigger = ['event' => 'message.received','session' => 'session','delivery' => 'simulated','eventId' => null,'source' => 'runtime'];
$fixtures = ['fixtures' => [['name' => 'message.received','description' => 'Receive a test message','overrides' => ['text','from']]]];
nativeCases([
 ['GET','/messaging/routing/hybrid?scope=session&projectId=project&session=session',null,$envelope($policy),fn ($c) => $c->hybridLink->getPolicy(['scope' => 'session','projectId' => 'project','session' => 'session'])],
 ['PUT','/messaging/routing/hybrid?scope=team',['expectedRevision' => 'r1','prefer' => null,'allowedTransports' => []],$envelope($policy),fn ($c) => $c->hybridLink->setPolicy(['scope' => 'team'], ['expectedRevision' => 'r1','prefer' => null,'allowedTransports' => []])],
 ['GET','/messaging/session/hybrid-link',null,$envelope($link),fn ($c) => $c->hybridLink->state('session')],
 ['PUT','/messaging/session/hybrid-link',['expectedRevision' => 'r1','paused' => false],$envelope(['revision' => 'r2','paused' => false]),fn ($c) => $c->hybridLink->setPaused('session', ['expectedRevision' => 'r1','paused' => false])],
 ['GET','/messaging/projects/project/observation-policy',null,$envelope($projectPolicy),fn ($c) => $c->observationPolicies->retrieveForProject('project')],
 ['GET','/messaging/session/observation-policy',null,$envelope($sessionPolicy),fn ($c) => $c->observationPolicies->retrieveForSession('session')],
 ['POST','/messaging/cloud-api/embedded-signup',['quicklinkId' => 'link','result' => ['code' => 'synthetic_fixture','wabaId' => 'waba','phoneNumberId' => 'phone','coexistence' => false]],$envelope(['stage' => 'complete']),fn ($c) => $c->cloudOnboarding->advance(['quicklinkId' => 'link','result' => ['code' => 'synthetic_fixture','wabaId' => 'waba','phoneNumberId' => 'phone','coexistence' => false]])],
 ['POST','/messaging/testing/project/history-fixtures',['messages' => [['id' => 'message','senderPhone' => '+15555555555','text' => 'Fixture','timestamp' => 1,'fromMe' => false]]],['fixtureId' => 'fixture'],fn ($c) => $c->testing->createHistoryFixture('project', ['messages' => [['id' => 'message','senderPhone' => '+15555555555','text' => 'Fixture','timestamp' => 1,'fromMe' => false]]])],
 ['POST','/messaging/testing/project/events',['session' => 'session','event' => 'message.received','fromSession' => 'sender','overrides' => ['text' => 'Fixture']],$trigger,fn ($c) => $c->testing->triggerEvent('project', ['session' => 'session','event' => 'message.received','fromSession' => 'sender','overrides' => ['text' => 'Fixture']])],
 ['GET','/messaging/testing/project/events/fixtures',null,$fixtures,fn ($c) => $c->testing->listEventFixtures('project')],
 ['GET','/messaging/testing/project/numbers/session/phone',null,['session' => 'session','phone' => '+15555555555','online' => false,'devices' => [['deviceId' => 1]]],fn ($c) => $c->testing->getPhone('project', 'session')],
 ['POST','/messaging/testing/project/numbers/session/phone/messages',['to' => '+15555555555','text' => 'Fixture'],['session' => 'session','to' => '+15555555555','messageId' => null],fn ($c) => $c->testing->sendPhoneMessage('project', 'session', ['to' => '+15555555555','text' => 'Fixture'])],
 ['POST','/messaging/testing/project/numbers/session/phone/devices/1/unlink',null,['session' => 'session','deviceId' => 1,'unlinked' => true],fn ($c) => $c->testing->unlinkPhoneDevice('project', 'session', 1)],
], fn ($credential, $url) => new Polymorfa\MessagingClient($credential, baseUrl:$url));
raises(fn () => (new Polymorfa\MessagingClient($credential))->testing->unlinkPhoneDevice('project', 'session', 0), Polymorfa\ValidationException::class);
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
], fn ($credential, $url) => new Polymorfa\BridgeClient($credential, baseUrl:$url), Polymorfa\Credential::projectToken('pmfa_pt_'.str_repeat('a', 93).'A'));
raises(fn () => new Polymorfa\BridgeClient($credential),Polymorfa\ConfigurationException::class);
