<?php

declare(strict_types=1);
$trunk = ['id' => 'trunk','projectId' => 'project','name' => 'PBX','enabled' => false,'direction' => 'both','outbound' => ['targetUri' => 'sip:pbx.example.com','transport' => 'tls','authUsername' => null,'hasPassword' => false,'fromUser' => null],'inbound' => ['username' => 'user','realm' => 'polymorfa','session' => null,'allowedAddresses' => [],'allowedDestinations' => []],'codecs' => ['opus'],'maxConcurrentCalls' => 1,'revision' => 2,'createdAt' => '2026-10-11T00:00:00Z','updatedAt' => '2026-10-11T00:00:00Z'];
$credentials = ['username' => 'user','password' => 'synthetic_fixture_only','realm' => 'polymorfa'];
$input = ['name' => 'PBX','direction' => 'outbound','outbound' => ['targetUri' => 'sip:pbx.example.com','transport' => 'tls','authUsername' => null],'enabled' => false];
$endpoint = ['status' => 'hosted','host' => 'sip.example.com','transports' => [['transport' => 'tls','port' => 5061,'srtp' => 'required']],'rtp' => ['protocol' => 'udp','portMin' => 10000,'portMax' => 20000]];
$cases = [
 ['GET','/platform/sip-trunks?projectId=project',null,['data' => [$trunk]],fn ($c) => $c->sipTrunks->list('project'),[$trunk]],
 ['GET','/platform/sip/endpoint',null,['data' => $endpoint],fn ($c) => $c->sipTrunks->endpoint(),$endpoint],
 ['POST','/platform/sip-trunks',$input + ['projectId' => 'project'],['data' => ['trunk' => $trunk,'inboundCredentials' => $credentials]],fn ($c) => $c->sipTrunks->create($input, 'project'),['trunk' => $trunk,'inboundCredentials' => $credentials]],
 ['GET','/platform/sip-trunks/trunk',null,['data' => $trunk],fn ($c) => $c->sipTrunks->retrieve('trunk'),$trunk],
 ['PATCH','/platform/sip-trunks/trunk',['enabled' => false,'expectedRevision' => 2,'outbound' => ['authUsername' => null]],['data' => $trunk],fn ($c) => $c->sipTrunks->update('trunk', ['enabled' => false,'expectedRevision' => 2,'outbound' => ['authUsername' => null]]),$trunk],
 ['DELETE','/platform/sip-trunks/trunk',null,['data' => ['id' => 'trunk','deleted' => true]],fn ($c) => $c->sipTrunks->delete('trunk'),['id' => 'trunk','deleted' => true]],
 ['POST','/platform/sip-trunks/trunk/credentials',null,['data' => $credentials],fn ($c) => $c->sipTrunks->rotateCredentials('trunk'),$credentials],
];
nativeCases($cases, fn ($credential, $url) => new Polymorfa\Client($credential, baseUrl:$url));
$history = [];
$client = new Polymorfa\Client($credential, http:mocked([jsonResponse(['data' => $trunk])], $history));
$project = $client->project('other');
$error = raises(fn () => $project->sipTrunks->delete('trunk', new Polymorfa\RequestOptions(idempotencyKey:'write_key')), Polymorfa\NotFoundException::class);
check(count($history) === 1 && $history[0]['request']->getMethod() === 'GET' && $history[0]['request']->getHeaderLine('Idempotency-Key') === '' && $error->errorCode === 'resource_not_found', 'SIP project confinement before effects');
$history = [];
$client = new Polymorfa\Client($credential, http:mocked([jsonResponse(['data' => ['status' => 'sip_not_hosted','host' => null,'transports' => [],'rtp' => null]])], $history));
check($client->sipTrunks->endpoint()->data['status'] === 'sip_not_hosted', 'Unavailable endpoint is data');
