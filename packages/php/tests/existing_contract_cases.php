<?php

declare(strict_types=1);

$ecBase = '/messaging/projects/slug/campaigns';
$ecPath = $ecBase.'/'.$ecId;
$ecPlatform = '/platform/campaigns/'.$ecId;
$ecEnvelope = static fn (mixed $data): array => ['success' => true,'data' => $data];
$ecData = static fn (mixed $data): array => ['data' => $data];
$ecOperation = $ecCampaign + ['operationId' => 'operation'];
$ecStop = $ecCampaign + ['operationId' => null];
$ecFollowReport = ['total' => 0,'waiting' => 0,'scheduled' => 0,'sending' => 0,'sent' => 0,'delivered' => 0,'read' => 0,'replied' => 0,'cancelled' => 0,'expired' => 0,'failed' => 0,'unknown' => 0,'nextDueAt' => null];
$ecReport = ['campaignId' => $ecId,'recipientCount' => 0,'sentCount' => 0,'deliveredCount' => 0,'readCount' => 0,'failedCount' => 0,'skippedCount' => 0,'respondedCount' => 0,'responseRate' => 0,'experiment' => null,'averageResponseTimeMs' => null,'minResponseTimeMs' => null,'maxResponseTimeMs' => null,'followUps' => $ecFollowReport];
$ecRecipient = ['id' => 'recipient','phone' => '+15555555555','variables' => (object)['0' => false],'variantKey' => null,'status' => 'failed','attempts' => 0,'lastError' => 'missing_variable','externalMessageId' => null,'queuedAt' => 0,'sentAt' => null,'deliveredAt' => null,'readAt' => null,'failedAt' => null,'respondedAt' => null,'failureReason' => 'missing_variable','nextMessageAt' => 0.25,'messagesSent' => 0,'sequenceError' => 'future_safe_code','followUp' => null];
$ecPage = ['nextCursor' => null,'hasMore' => false];
$ecAdded = ['campaignId' => $ecId,'added' => 0,'recipientCount' => 0,'duplicateCount' => 0,'invalidCount' => 0,'invalidRows' => []];
$ecOptions = (object)['value' => null];
$ecCases = [
 ['listCampaigns','GET',$ecBase,null,$ecEnvelope([$ecCampaign]),fn () => $ecMessaging->campaigns->list('slug', $ecOptions->value)],
 ['getCampaign','GET',$ecPath,null,$ecEnvelope($ecCampaign),fn () => $ecMessaging->campaigns->retrieve('slug', $ecId, $ecOptions->value)],
 ['createCampaign','POST',$ecBase,['name' => 'Draft','variableMapping' => (object)[],'trackedLinks' => null],$ecEnvelope($ecCampaign),fn () => $ecMessaging->campaigns->create('slug', ['name' => 'Draft','variableMapping' => [],'trackedLinks' => null], $ecOptions->value)],
 ['updateProjectCampaign','PATCH',$ecPath,['templateId' => null,'variableMapping' => null,'trackedLinks' => null],$ecEnvelope($ecCampaign),fn () => $ecMessaging->campaigns->update('slug', $ecId, ['templateId' => null,'variableMapping' => null,'trackedLinks' => null], $ecOptions->value)],
 ['launchCampaign','POST',$ecPath.'/launch',['scheduledAt' => 0,'skipMissingVariables' => false],$ecEnvelope($ecOperation),fn () => $ecMessaging->campaigns->launch('slug', $ecId, ['scheduledAt' => 0,'skipMissingVariables' => false], $ecOptions->value)],
 ['pauseCampaign','POST',$ecPath.'/pause',null,$ecEnvelope($ecOperation),fn () => $ecMessaging->campaigns->pause('slug', $ecId, $ecOptions->value)],
 ['rescheduleCampaign','POST',$ecPath.'/reschedule',['scheduledAt' => null],$ecEnvelope($ecOperation),fn () => $ecMessaging->campaigns->reschedule('slug', $ecId, ['scheduledAt' => null], $ecOptions->value)],
 ['resumeCampaign','POST',$ecPath.'/resume',null,$ecEnvelope($ecOperation),fn () => $ecMessaging->campaigns->resume('slug', $ecId, $ecOptions->value)],
 ['stopCampaign','POST',$ecPath.'/stop',null,$ecEnvelope($ecStop),fn () => $ecMessaging->campaigns->stop('slug', $ecId, $ecOptions->value)],
 ['listPlatformCampaigns','GET','/platform/campaigns?projectId='.$ecProject,null,$ecData([$ecCampaign]),fn () => $ecOrg->campaigns->list(['projectId' => $ecProject], $ecOptions->value)],
 ['getPlatformCampaign','GET',$ecPlatform.'?projectId='.$ecProject,null,$ecData($ecCampaign),fn () => $ecOrg->campaigns->retrieve($ecId, ['projectId' => $ecProject], $ecOptions->value)],
 ['createPlatformCampaign','POST','/platform/campaigns',['projectId' => $ecProject,'name' => 'Draft','messagesArray' => [(object)[],['source' => str_repeat('x', 4097),'footer' => '','delayAfterSec' => 0,'future' => false]],'variableMapping' => (object)['0' => (object)[]]],$ecData($ecCampaign),fn () => $ecOrg->campaigns->create(['projectId' => $ecProject,'name' => 'Draft','messagesArray' => [[],['source' => str_repeat('x', 4097),'footer' => '','delayAfterSec' => 0,'future' => false]],'variableMapping' => ['0' => []]], $ecOptions->value)],
 ['updateCampaign','PATCH',$ecPlatform.'?projectId='.$ecProject,['future' => false,'templateId' => null,'trackedLinks' => null,'variableMapping' => null],$ecData($ecCampaign),fn () => $ecOrg->campaigns->update($ecId, ['future' => false,'templateId' => null,'trackedLinks' => null,'variableMapping' => null], ['projectId' => $ecProject], $ecOptions->value)],
 ['launchPlatformCampaign','POST',$ecPlatform.'/launch',['projectId' => $ecProject,'scheduledAt' => 0,'skipMissingVariables' => false],$ecData(['id' => $ecId,'status' => 'queued','operationId' => 'operation','future' => false]),fn () => $ecOrg->campaigns->launch($ecId, ['projectId' => $ecProject,'scheduledAt' => 0,'skipMissingVariables' => false], $ecOptions->value)],
 ['getCampaignAnalytics','GET',$ecPath.'/analytics',null,$ecEnvelope($ecReport),fn () => $ecMessaging->campaigns->analytics('slug', $ecId, $ecOptions->value)],
 ['getPlatformCampaignAnalytics','GET',$ecPlatform.'/analytics?projectId='.$ecProject,null,$ecData($ecReport),fn () => $ecOrg->campaigns->analytics($ecId, ['projectId' => $ecProject], $ecOptions->value)],
 ['listProjectCampaignRecipients','GET',$ecPath.'/recipients?reason=missing_variable&status=failed&cursor=next&limit=100',null,$ecEnvelope([$ecRecipient]) + ['page' => $ecPage],fn () => $ecMessaging->campaigns->listRecipients('slug', $ecId, ['reason' => 'missing_variable','status' => 'failed','cursor' => 'next','limit' => 100], $ecOptions->value)],
 ['listCampaignRecipients','GET',$ecPlatform.'/recipients?projectId='.$ecProject.'&reason=missing_variable&status=failed&cursor=next&limit=100',null,$ecData([array_replace($ecRecipient, ['nextMessageAt' => 0])]) + ['page' => $ecPage],fn () => $ecOrg->campaigns->recipients($ecId, ['projectId' => $ecProject,'reason' => 'missing_variable','status' => 'failed','cursor' => 'next','limit' => 100], $ecOptions->value)],
 ['addProjectCampaignRecipients','POST',$ecPath.'/recipients',['recipients' => [['phone' => '+15555555555','variables' => (object)[]]]],$ecEnvelope($ecAdded),fn () => $ecMessaging->campaigns->addRecipients('slug', $ecId, ['recipients' => [['phone' => '+15555555555','variables' => []]]], $ecOptions->value)],
 ['addCampaignRecipients','POST',$ecPlatform.'/recipients',['projectId' => $ecProject,'recipients' => []],$ecData($ecAdded),fn () => $ecOrg->campaigns->addRecipients($ecId, ['projectId' => $ecProject,'recipients' => []], $ecOptions->value)],
];
foreach ($ecCases as [$name,$method,$path,$body,$result,$invoke]) {
    $r = $ecRun($method, $path, $body, $result, $invoke);
    ecCheck($r->data === json_decode(json_encode($result, JSON_THROW_ON_ERROR), true, flags:JSON_THROW_ON_ERROR), $name.' required null/false/0 and forward fields');
}
$ecOptions->value = new Polymorfa\RequestOptions(apiVersion:'2026-10-14');
foreach ($ecCases as [$name,$method,$path,$body,$result,$invoke]) {
    $ecRun($method, $path, $body, $result, $invoke, ['version' => '2026-10-14']);
}
$ecOptions->value = null;
$ecRun('GET', $ecPlatform.'?projectId='.$ecProject, null, ['data' => null], fn () => $ecOrg->campaigns->retrieve($ecId, ['projectId' => $ecProject]));
$ecRun('PATCH', $ecPlatform.'?projectId='.$ecProject, (object)[], ['data' => $ecCampaign], fn () => $ecOrg->campaigns->update($ecId, [], ['projectId' => $ecProject]));
// Response policy has no outbound link-count or mapping-fallback quota.
$ecNormalized = $ecCampaign;
$ecNormalized['trackedLinks'] = array_fill(0, 6, ['key' => 'a','url' => 'https://example.com/']);
$ecNormalized['variableMapping'] = (object)['0' => (object)['fallback' => str_repeat('x', 1025)]];
$ecRun('GET', $ecPath, null, $ecEnvelope($ecNormalized), fn () => $ecMessaging->campaigns->retrieve('slug', $ecId));
$ecReturnedFollow = $ecCampaign;
$ecReturnedFollow['followUp'] = ['message' => ['type' => 'text','text' => 'Hello']];
$ecRun('GET', $ecPath, null, $ecEnvelope($ecReturnedFollow), fn () => $ecMessaging->campaigns->retrieve('slug', $ecId));
$ecLinks = [['key' => 'a','url' => 'https://EXAMPLE.com'],['key' => 'b','url' => 'https://EXAMPLE.com']];
$ecRun('PATCH', $ecPath, ['trackedLinks' => $ecLinks], $ecEnvelope($ecCampaign), fn () => $ecMessaging->campaigns->update('slug', $ecId, ['trackedLinks' => $ecLinks]));
foreach (['templateId','variableMapping','trackedLinks'] as $field) {
    $ecRun('PATCH', $ecPath, [$field => null], $ecEnvelope($ecCampaign), fn () => $ecMessaging->campaigns->update('slug', $ecId, [$field => null]));
}
// Read delivery is a fact, distinct from descriptor-only saved writes and consent.
$ecObs = ['presenceMode' => 'off','typingMode' => 'off','labelMode' => 'off','quickReplyMode' => 'off'];
$ecConfig = ['effective' => ['observation' => $ecObs,'historySync' => ['mode' => 'metadata_only','requestFull' => false,'delivery' => 'archive'],'hms' => ['enabled' => false]],'overrides' => (object)[],'requestedHistory' => ['mode' => 'deliver','requestFull' => false,'delivery' => 'descriptor'],'sources' => ['historySync.mode' => 'consent','historySync.requestFull' => 'team','historySync.delivery' => 'platform','hms' => 'platform','observation.presenceMode' => 'platform','observation.typingMode' => 'platform','observation.labelMode' => 'platform','observation.quickReplyMode' => 'platform'],'revisions' => ['team' => 0,'project' => 0,'session' => 0],'historyConsent' => 'declined'];
$ecSession = ['sessionId' => 's','name' => 's','tenantId' => 'org','type' => 'linked_device','testMode' => false,'status' => 'CONNECTED','createdAt' => '2026-10-16T00:00:00Z','updatedAt' => '2026-10-16T00:00:00Z','signalMode' => 'zero_knowledge','configuration' => $ecConfig];
$ecA = $ecOrg->project($ecProject);
$ecBProject = '22222222-2222-4222-8222-222222222222';
$ecB = $ecOrg->project($ecBProject);
foreach ([$ecA,$ecB,$ecA] as $view) {
    $selected = $view === $ecA ? $ecProject : $ecBProject;
    $r = $ecRun('GET', '/platform/session-configuration?projectId='.$selected, null, ['data' => $ecConfig], fn () => $view->sessionConfiguration->retrieve(new Polymorfa\RequestOptions(apiVersion:'2026-10-14')), ['version' => '2026-10-14']);
    ecCheck($r->data['revisions']['session'] === 0 && $r->data['requestedHistory']['delivery'] === 'descriptor' && $r->data['effective']['historySync']['delivery'] === 'archive', 'Owner views and consent divergence retained');
}
foreach ([['set' => ['historySync' => ['delivery' => 'descriptor','requestFull' => false]]],['reset' => ['historySync.delivery']]] as $patch) {
    $ecRun('PUT', '/platform/session-configuration', ['configuration' => $patch,'revision' => 0,'projectId' => $ecProject], ['data' => $ecConfig], fn () => $ecA->sessionConfiguration->update(['configuration' => $patch,'revision' => 0]), ['version' => '2026-10-14']);
    $ecRun('PUT', '/platform/sessions/s', ['configuration' => $patch,'revision' => 0], $ecEnvelope($ecSession), fn () => $ecOrg->sessions->update('s', ['configuration' => $patch,'revision' => 0]), ['version' => '2026-10-14']);
    $ecRun('PUT', '/platform/sessions/s', ['configuration' => $patch,'revision' => 0], $ecEnvelope($ecSession), fn () => $ecMessaging->sessions->update('s', ['configuration' => $patch,'revision' => 0], new Polymorfa\RequestOptions(apiVersion:'2026-09-22')));
}
$ecRun('PUT', '/platform/session-configuration', ['configuration' => ['reset' => ['historySync']],'revision' => 0], ['data' => $ecConfig], fn () => $ecOrg->sessionConfiguration->update(['configuration' => ['reset' => ['historySync']],'revision' => 0]));
$ecOldConfig = $ecConfig;
unset($ecOldConfig['effective']['historySync']['delivery'],$ecOldConfig['requestedHistory']['delivery'],$ecOldConfig['sources']['historySync.delivery']);
$ecRun('GET', '/platform/session-configuration', null, ['data' => $ecOldConfig], fn () => $ecOrg->sessionConfiguration->retrieve());
foreach ([$ecOrg,$ecMessaging] as $client) {
    foreach ([null,'standard','zero_knowledge'] as $mode) {
        $fact = $ecSession;
        if ($mode === null) {
            unset($fact['signalMode']);
        } else {
            $fact['signalMode'] = $mode;
        }
        $ecRun('GET', '/platform/sessions/s', null, $ecEnvelope($fact), fn () => $client->sessions->retrieve('s'));
    }
}
$ecLink = ['purpose' => 'initial','connectionGoal' => 'single','id' => 'link','url' => 'https://link.polymorfa.com/link','session' => 's','expiresAt' => null];
foreach ([[],['signalMode' => 'standard'],['signalMode' => 'zero_knowledge'],['configuration' => ['historySync' => ['delivery' => 'descriptor','consent' => 'force_off','requestFull' => false],'hms' => ['enabled' => false],'observation' => ['typingMode' => 'off'],'methods' => ['qr'],'defaultMethod' => null,'prefillPhone' => '+15555555555','allowPhoneChange' => false]],['purpose' => 'add_connection','session' => 's','addConnection' => 'linked_devices','connectionGoal' => 'hybrid','configuration' => ['testing' => ['country' => 'US'],'historySync' => ['consent' => 'ask']]]] as $input) {
    $new = isset($input['signalMode']) || isset($input['configuration']['historySync']['delivery']);
    $ecRun('POST', '/messaging/quicklinks', $input === [] ? (object)[] : $input, $ecEnvelope($ecLink), fn () => $ecMessaging->quickLinks->create($input), ['version' => $new ? '2026-10-14' : '2026-09-22']);
    $ecRun('POST', '/messaging/quicklinks', $input === [] ? (object)[] : $input, $ecEnvelope($ecLink), fn () => $ecMessaging->quickLinks->create($input, new Polymorfa\RequestOptions(apiVersion:'2026-09-22')));
}
