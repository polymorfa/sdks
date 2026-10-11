<?php

declare(strict_types=1);
$quick = ['id' => 'quick','projectId' => null,'enabled' => false,'successCallbackUrl' => null,'failureCallbackUrl' => null,'businessName' => null,'headline' => null,'description' => null,'successMessage' => null,'supportUrl' => null,'privacyUrl' => null,'termsUrl' => null,'accent' => null,'theme' => 'system','hideWatermark' => false,'allowPhoneChange' => false,'shape' => null,'radiusPx' => null,'logoMode' => 'none','logoStorageId' => null,'logoSourceStorageId' => null,'logoUrl' => null,'historySync' => 'ask','methods' => null,'defaultMethod' => null,'createdAt' => 1,'updatedAt' => 2];
$configuration = ['effective' => ['observation' => ['presenceMode' => 'off','typingMode' => 'off','labelMode' => 'off','quickReplyMode' => 'off'],'historySync' => ['mode' => 'metadata_only','requestFull' => false],'hms' => ['enabled' => false]],'overrides' => [],'sources' => ['historySync.mode' => 'platform','historySync.requestFull' => 'platform','hms' => 'platform','observation.presenceMode' => 'platform','observation.typingMode' => 'platform','observation.labelMode' => 'platform','observation.quickReplyMode' => 'platform'],'requestedHistory' => ['mode' => 'metadata_only','requestFull' => false],'revisions' => ['team' => 0,'project' => 0,'session' => 0]];
$cases = [
 ['GET','/platform/quicklink',null,['data' => $quick],fn ($c) => $c->quickLinkSettings->retrieve(),$quick],
 ['PUT','/platform/quicklink',['enabled' => false,'headline' => null,'methods' => []],['data' => $quick],fn ($c) => $c->quickLinkSettings->update(['enabled' => false,'headline' => null,'methods' => []]),$quick],
 ['GET','/platform/session-configuration',null,['data' => $configuration],fn ($c) => $c->sessionConfiguration->retrieve(),$configuration],
 ['PUT','/platform/session-configuration',['configuration' => ['reset' => ['hms']],'revision' => 0],['data' => $configuration],fn ($c) => $c->sessionConfiguration->update(['configuration' => ['reset' => ['hms']],'revision' => 0]),$configuration],
 ['GET','/platform/media/media',null,['data' => ['id' => 'media','size' => 2]],fn ($c) => $c->media->retrieve('media')],
 ['DELETE','/platform/media/media',null,['data' => ['deleted' => true]],fn ($c) => $c->media->delete('media')],
 ['POST','/platform/media/uploads',['contentType' => 'image/png'],['data' => ['url' => 'https://storage.example/upload']],fn ($c) => $c->media->createUpload(['contentType' => 'image/png'])],
];
nativeCases($cases, fn ($credential, $url) => new Polymorfa\Client($credential, baseUrl:$url));
$projectQuick = $quick;
$projectQuick['projectId'] = 'project';
$cases = [
 ['GET','/platform/quicklink?projectId=project',null,['data' => $projectQuick],fn ($c) => $c->quickLinkSettings->retrieve(),$projectQuick],
 ['PUT','/platform/quicklink',['enabled' => false,'projectId' => 'project'],['data' => $projectQuick],fn ($c) => $c->quickLinkSettings->update(['enabled' => false]),$projectQuick],
 ['GET','/platform/session-configuration?projectId=project',null,['data' => $configuration],fn ($c) => $c->sessionConfiguration->retrieve(),$configuration],
 ['PUT','/platform/session-configuration',['configuration' => ['reset' => ['hms']],'revision' => 0,'projectId' => 'project'],['data' => $configuration],fn ($c) => $c->sessionConfiguration->update(['configuration' => ['reset' => ['hms']],'revision' => 0]),$configuration],
];
nativeCases($cases, fn ($credential, $url) => (new Polymorfa\Client($credential, baseUrl:$url))->project('project'));
$history = [];
$c = new Polymorfa\Client($credential, http:mocked([jsonResponse(['data' => null])], $history));
check($c->quickLinkSettings->retrieve()->data === null, 'Unset QuickLink settings remain null');
