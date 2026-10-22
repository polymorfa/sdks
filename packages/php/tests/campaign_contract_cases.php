<?php

declare(strict_types=1);

// Independent public-wire fixtures. No implementation codec builds expectations.
$ccCampaign = '33333333-3333-4333-8333-333333333333';
$ccCustomer = '22222222-2222-4222-8222-222222222222';
$ccFlowId = '44444444-4444-4444-8444-444444444444';
$ccJobId = '66666666-6666-4666-8666-666666666666';
$ccDefinition = ['entryNodeId' => 'a', 'nodes' => [['id' => 'a', 'send' => ['kind' => 'text', 'text' => 'Hello'], 'edges' => [['match' => ['kind' => 'keyword', 'value' => 'STOP'], 'to' => 'b']]], ['id' => 'b', 'edges' => []]]];
$ccFlowInput = ['name' => 'Reply', 'definition' => $ccDefinition];
$ccFlowData = ['id' => $ccFlowId, 'flowKey' => $ccFlowId, 'revision' => 1, 'name' => 'Reply', 'definition' => $ccDefinition, 'createdAt' => 0, 'futureExtension' => (object) ['kept' => true]];
$ccFlowData['definition']['nodes'][0]['edges'][0]['match']['value'] = 'stop';
$ccLinks = [['key' => 'a', 'url' => 'https://example.com/', 'uniqueOpens' => 0, 'totalOpens' => 0]];
$ccAssignment = ['campaignId' => $ccCampaign, 'replyFlowId' => null];
$ccCustody = ['signalModeDefault' => null, 'effectiveSignalMode' => 'standard', 'revision' => 0];
$ccProjectUpdate = ['expectedRevision' => 0, 'signalModeDefault' => 'zero_knowledge'];
$ccCustomerUpdate = ['expectedRevision' => 0, 'signalModeDefault' => null];
$ccProfile = ['id' => $ccCustomer, 'phone' => '+15555555555', 'revision' => 1, 'tags' => [], 'attributes' => new stdClass(), 'provenance' => null, 'createdAt' => 0, 'updatedAt' => 0];
$ccPut = ['tags' => [], 'attributes' => []];
$ccPutWire = ['tags' => [], 'attributes' => new stdClass()];
$ccConsent = ['source' => 'api', 'reference' => 'form', 'purpose' => 'campaigns', 'allowed' => false, 'assertedAt' => 0, 'id' => $ccJobId, 'profileRevision' => 1, 'createdAt' => 0];
$ccRetarget = ['id' => '88888888-8888-4888-8888-888888888888', 'name' => 'Replied', 'source' => 'campaign', 'recipientCount' => 0, 'fileId' => null, 'columns' => null, 'sampleRow' => null, 'mapping' => new stdClass(), 'createdAt' => 0, 'updatedAt' => 0, 'sourceCampaignId' => $ccCampaign, 'outcome' => 'replied', 'matchedCount' => 0, 'optedOutCount' => 0];
$ccStop = ['teamId' => $ccProject, 'enabled' => false, 'locale' => null, 'revision' => 0, 'textRevision' => 1, 'acknowledgement' => null, 'updatedAt' => null];
$ccSummary = ['enabled' => false, 'counts' => ['queued' => 0, 'admitted' => 0, 'completed' => 0, 'failed' => 0, 'unknown' => 0]];
$ccPage = ['nextCursor' => null, 'hasMore' => false];
$ccOrg = new Polymorfa\Client($ccCredential, baseUrl: $ccUrl);
$ccMessaging = new Polymorfa\MessagingClient($ccCredential, baseUrl: $ccUrl);
$ccJson = static fn (mixed $data): string => json_encode(['data' => $data], JSON_THROW_ON_ERROR);
$ccMessagingJson = static fn (mixed $data): string => json_encode(['success' => true, 'data' => $data], JSON_THROW_ON_ERROR);
$ccRun = static function (array $case, ?Polymorfa\Credential $principal = null) use ($ccHttp, $ccUrl, $ccCredential): mixed {
    [$name, $method, $path, $body, $response, $invoke] = $case;
    $principal ??= $ccCredential;
    $config = ['method' => $method, 'path' => $path, 'body' => $body, 'response' => $response, 'authorization' => $principal->authorization(), ...($case[6] ?? [])];
    $ccHttp->post($ccUrl.'/__case', ['json' => $config]);
    $result = $invoke();
    ccCheck($result->metadata->requestId === 'campaign_contract_request', $name.' metadata');
    ccCheck($result->metadata->apiVersion === null, $name.' server-version metadata does not invent a header');
    if (($config['contentType'] ?? 'application/json') === 'application/json') {
        ccCheck($result->data === json_decode($response, true, flags: JSON_THROW_ON_ERROR), $name.' typed response fields and extensions');
    }
    return $result;
};
$ccOptions = (object) ['value' => null];
$ccCases = [
    ['getProjectCampaignLinks', 'GET', '/messaging/projects/slug/campaigns/'.$ccCampaign.'/links', null, $ccMessagingJson($ccLinks), fn () => $ccMessaging->campaigns->links('slug', $ccCampaign, $ccOptions->value)],
    ['testSendCampaign', 'POST', '/messaging/projects/slug/campaigns/'.$ccCampaign.'/test-send', $ccSendWire, $ccMessagingJson($ccSendData), fn () => $ccMessaging->campaigns->testSend('slug', $ccCampaign, $ccSendBody, $ccOptions->value)],
    ['createCampaignReplyFlow', 'POST', '/messaging/projects/slug/campaign-reply-flows', $ccFlowInput, $ccMessagingJson($ccFlowData), fn () => $ccMessaging->campaigns->createReplyFlow('slug', $ccFlowInput, $ccOptions->value)],
    ['getCampaignReplyFlow', 'GET', '/messaging/projects/slug/campaign-reply-flows/'.$ccFlowId, null, $ccMessagingJson($ccFlowData), fn () => $ccMessaging->campaigns->getReplyFlow('slug', $ccFlowId, $ccOptions->value)],
    ['setCampaignReplyFlow', 'PUT', '/messaging/projects/slug/campaigns/'.$ccCampaign.'/reply-flow', ['replyFlowId' => null], $ccMessagingJson($ccAssignment), fn () => $ccMessaging->campaigns->setReplyFlow('slug', $ccCampaign, ['replyFlowId' => null], $ccOptions->value)],
    ['exportProjectCampaignRecipients', 'GET', '/messaging/projects/slug/campaigns/'.$ccCampaign.'/recipients/export?limit=2', null, "phone,status\r\n\"+15555555555\",sent\r\n", fn () => $ccMessaging->campaigns->exportRecipients('slug', $ccCampaign, ['limit' => 2], $ccOptions->value), ['contentType' => 'text/csv; charset=utf-8', 'headers' => ['Polymorfa-Next-Cursor' => 'next', 'Content-Disposition' => 'attachment; filename="recipients.csv"']]],
    ['getProjectSignalCustody', 'GET', '/platform/projects/'.$ccProject.'/signal-custody', null, $ccJson($ccCustody), fn () => $ccOrg->projects->getSignalCustody($ccProject, $ccOptions->value)],
    ['updateProjectSignalCustody', 'PUT', '/platform/projects/'.$ccProject.'/signal-custody', $ccProjectUpdate, $ccJson($ccCustody), fn () => $ccOrg->projects->updateSignalCustody($ccProject, $ccProjectUpdate, $ccOptions->value)],
    ['getCustomerSignalCustody', 'GET', '/platform/projects/'.$ccProject.'/customers/'.$ccCustomer.'/signal-custody', null, $ccJson($ccCustody), fn () => $ccOrg->customers->getSignalCustody($ccProject, $ccCustomer, $ccOptions->value)],
    ['updateCustomerSignalCustody', 'PUT', '/platform/projects/'.$ccProject.'/customers/'.$ccCustomer.'/signal-custody', $ccCustomerUpdate, $ccJson($ccCustody), fn () => $ccOrg->customers->updateSignalCustody($ccProject, $ccCustomer, $ccCustomerUpdate, $ccOptions->value)],
    ['testSendPlatformCampaign', 'POST', '/platform/campaigns/'.$ccCampaign.'/test-send', ['projectId' => $ccProject, ...$ccSendWire], $ccJson($ccSendData), fn () => $ccOrg->campaigns->testSend($ccCampaign, ['projectId' => $ccProject, ...$ccSendBody], $ccOptions->value)],
    ['createPlatformCampaignReplyFlow', 'POST', '/platform/campaign-reply-flows', ['projectId' => $ccProject, ...$ccFlowInput], $ccJson($ccFlowData), fn () => $ccOrg->campaigns->createReplyFlow(['projectId' => $ccProject, ...$ccFlowInput], $ccOptions->value)],
    ['getPlatformCampaignReplyFlow', 'GET', '/platform/campaign-reply-flows/'.$ccFlowId.'?projectId='.$ccProject, null, $ccJson($ccFlowData), fn () => $ccOrg->campaigns->getReplyFlow($ccFlowId, ['projectId' => $ccProject], $ccOptions->value)],
    ['setPlatformCampaignReplyFlow', 'PUT', '/platform/campaigns/'.$ccCampaign.'/reply-flow', ['projectId' => $ccProject, 'replyFlowId' => null], $ccJson($ccAssignment), fn () => $ccOrg->campaigns->setReplyFlow($ccCampaign, ['projectId' => $ccProject, 'replyFlowId' => null], $ccOptions->value)],
    ['exportCampaignRecipients', 'GET', '/platform/campaigns/'.$ccCampaign.'/recipients/export?projectId='.$ccProject.'&limit=2', null, "phone,status\r\n", fn () => $ccOrg->campaigns->exportRecipients($ccCampaign, ['projectId' => $ccProject, 'limit' => 2], $ccOptions->value), ['contentType' => 'text/csv']],
    ['getCampaignLinks', 'GET', '/platform/campaigns/'.$ccCampaign.'/links?projectId='.$ccProject, null, $ccJson($ccLinks), fn () => $ccOrg->campaigns->links($ccCampaign, ['projectId' => $ccProject], $ccOptions->value)],
    ['listCampaignLaunchApprovals', 'GET', '/platform/campaigns/'.$ccCampaign.'/approvals?projectId='.$ccProject, null, $ccJson([]), fn () => $ccOrg->campaigns->listLaunchApprovals($ccCampaign, ['projectId' => $ccProject], $ccOptions->value)],
    ['getCampaignSettings', 'GET', '/platform/campaign-settings', null, $ccJson(['launchApproval' => ['recipientThreshold' => null]]), fn () => $ccOrg->campaigns->getSettings($ccOptions->value)],
    ['createAudienceFromCampaign', 'POST', '/platform/audiences/from-campaign', ['name' => 'Replied', 'campaignId' => $ccCampaign, 'outcome' => 'replied'], $ccJson($ccRetarget), fn () => $ccOrg->audiences->createFromCampaign(['name' => 'Replied', 'campaignId' => $ccCampaign, 'outcome' => 'replied'], $ccOptions->value)],
    ['listAudienceProfiles', 'GET', '/platform/audience-profiles?cursor='.$ccCustomer.'&limit=2', null, json_encode(['data' => [$ccProfile], 'page' => $ccPage], JSON_THROW_ON_ERROR), fn () => $ccOrg->audienceProfiles->list(['cursor' => $ccCustomer, 'limit' => 2], $ccOptions->value)],
    ['getAudienceProfile', 'GET', '/platform/audience-profiles/%2B15555555555', null, $ccJson($ccProfile), fn () => $ccOrg->audienceProfiles->retrieve('+15555555555', $ccOptions->value)],
    ['putAudienceProfile', 'PUT', '/platform/audience-profiles/%2B15555555555', $ccPutWire, $ccJson($ccProfile), fn () => $ccOrg->audienceProfiles->put('+15555555555', $ccPut, $ccOptions->value)],
    ['deleteAudienceProfile', 'DELETE', '/platform/audience-profiles/%2B15555555555?expectedRevision=1', null, $ccJson(['deleted' => true, 'phone' => '+15555555555', 'revision' => 2]), fn () => $ccOrg->audienceProfiles->delete('+15555555555', 1, $ccOptions->value)],
    ['listAudienceProfileConsent', 'GET', '/platform/audience-profiles/%2B15555555555/consent', null, json_encode(['data' => [$ccConsent], 'page' => $ccPage], JSON_THROW_ON_ERROR), fn () => $ccOrg->audienceProfiles->listConsent('+15555555555', [], $ccOptions->value)],
    ['createAudienceProfileImport', 'POST', '/platform/audience-profile-imports', ['replayKey' => 'fixture', 'csvBase64' => base64_encode("phone\n+15555555555\n")], $ccJson($ccJob), fn () => $ccOrg->audienceProfiles->imports->create(['replayKey' => 'fixture', 'csvBase64' => base64_encode("phone\n+15555555555\n")], $ccOptions->value)],
    ['getAudienceProfileImport', 'GET', '/platform/audience-profile-imports/'.$ccJobId, null, $ccJson($ccJob), fn () => $ccOrg->audienceProfiles->imports->retrieve($ccJobId, $ccOptions->value)],
    ['cancelAudienceProfileImport', 'DELETE', '/platform/audience-profile-imports/'.$ccJobId, null, $ccJson($ccJob), fn () => $ccOrg->audienceProfiles->imports->cancel($ccJobId, $ccOptions->value)],
    ['getStopConfirmationSettings', 'GET', '/platform/optouts/confirmation-settings', null, $ccJson($ccStop), fn () => $ccOrg->optOuts->getConfirmationSettings($ccOptions->value)],
    ['updateStopConfirmationSettings', 'PUT', '/platform/optouts/confirmation-settings', ['teamId' => $ccProject, 'enabled' => false, 'locale' => null, 'revision' => 0], $ccJson($ccStop), fn () => $ccOrg->optOuts->updateConfirmationSettings(['teamId' => $ccProject, 'enabled' => false, 'locale' => null, 'revision' => 0], $ccOptions->value)],
    ['getStopConfirmationSummary', 'GET', '/platform/optouts/confirmation-summary', null, $ccJson($ccSummary), fn () => $ccOrg->optOuts->getConfirmationSummary($ccOptions->value)],
];
foreach ($ccCases as $ccCase) {
    $ccResponse = $ccRun($ccCase);
    if (str_starts_with($ccCase[0], 'export')) {
        ccCheck($ccResponse->data->csv === $ccCase[4], 'CSV bytes and CRLF retained');
    }
}
echo count($ccCases)." independent PHP30 public operation fixtures passed.\n";
$ccOptions->value = new Polymorfa\RequestOptions(apiVersion: '2026-09-22');
foreach ($ccCases as $ccCase) {
    $ccCase[6]['version'] = '2026-09-22';
    $ccRun($ccCase);
}
$ccOptions->value = null;
echo "30 explicit contract-version overrides passed.\n";


$ccHttp->post($ccUrl.'/__case', ['json' => ['method' => 'GET', 'path' => '/messaging/projects/slug/campaigns/'.$ccCampaign.'/recipients/export', 'body' => null, 'authorization' => $ccCredential->authorization(), 'contentType' => 'text/csv', 'response' => "phone,status\r\n", 'bodyDelaySeconds' => 0.12]]);
$ccCancelled = false;
try {
    $ccMessaging->campaigns->exportRecipients('slug', $ccCampaign, [], new Polymorfa\RequestOptions(timeout: 1, cancellation: Polymorfa\CancellationToken::after(0.04)));
} catch (Polymorfa\CancelledException) {
    $ccCancelled = true;
}
ccCheck($ccCancelled, 'CSV cancellation is checked during finite body consumption');

$ccProjectCredential = Polymorfa\Credential::projectToken('pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k');
foreach ([$ccCredential, $ccProjectCredential] as $ccPrincipal) {
    $ccBound = new Polymorfa\ProjectClient($ccPrincipal, $ccProject, baseUrl: $ccUrl);
    $ccBoundCases = [
        ['boundTestSend', 'POST', '/platform/campaigns/'.$ccCampaign.'/test-send', [...$ccSendWire, 'projectId' => $ccProject], $ccJson($ccSendData), fn () => $ccBound->campaigns->testSend($ccCampaign, $ccSendBody)],
        ['boundCreateReply', 'POST', '/platform/campaign-reply-flows', [...$ccFlowInput, 'projectId' => $ccProject], $ccJson($ccFlowData), fn () => $ccBound->campaigns->createReplyFlow($ccFlowInput)],
        ['boundGetReply', 'GET', '/platform/campaign-reply-flows/'.$ccFlowId.'?projectId='.$ccProject, null, $ccJson($ccFlowData), fn () => $ccBound->campaigns->getReplyFlow($ccFlowId)],
        ['boundSetReply', 'PUT', '/platform/campaigns/'.$ccCampaign.'/reply-flow', ['replyFlowId' => null, 'projectId' => $ccProject], $ccJson($ccAssignment), fn () => $ccBound->campaigns->setReplyFlow($ccCampaign, ['replyFlowId' => null])],
        ['boundLinks', 'GET', '/platform/campaigns/'.$ccCampaign.'/links?projectId='.$ccProject, null, $ccJson($ccLinks), fn () => $ccBound->campaigns->links($ccCampaign)],
        ['boundApprovals', 'GET', '/platform/campaigns/'.$ccCampaign.'/approvals?projectId='.$ccProject, null, $ccJson([]), fn () => $ccBound->campaigns->listLaunchApprovals($ccCampaign)],
        ['boundExport', 'GET', '/platform/campaigns/'.$ccCampaign.'/recipients/export?limit=2&projectId='.$ccProject, null, "phone,status\r\n", fn () => $ccBound->campaigns->exportRecipients($ccCampaign, ['limit' => 2]), ['contentType' => 'text/csv']],
        ['boundGetCustody', 'GET', '/platform/projects/'.$ccProject.'/signal-custody', null, $ccJson($ccCustody), fn () => $ccBound->signalCustody->retrieve()],
        ['boundUpdateCustody', 'PUT', '/platform/projects/'.$ccProject.'/signal-custody', $ccProjectUpdate, $ccJson($ccCustody), fn () => $ccBound->signalCustody->update($ccProjectUpdate)],
        ['boundGetCustomerCustody', 'GET', '/platform/projects/'.$ccProject.'/customers/'.$ccCustomer.'/signal-custody', null, $ccJson($ccCustody), fn () => $ccBound->signalCustody->retrieveCustomer($ccCustomer)],
        ['boundUpdateCustomerCustody', 'PUT', '/platform/projects/'.$ccProject.'/customers/'.$ccCustomer.'/signal-custody', $ccCustomerUpdate, $ccJson($ccCustody), fn () => $ccBound->signalCustody->updateCustomer($ccCustomer, $ccCustomerUpdate)],
    ];
    foreach ($ccBoundCases as $ccCase) {
        $ccRun($ccCase, $ccPrincipal);
    }
}
$ccProjectMessaging = new Polymorfa\MessagingClient($ccProjectCredential, baseUrl: $ccUrl);
$ccProjectMessagingCalls = [
    fn () => $ccProjectMessaging->campaigns->links('slug', $ccCampaign),
    fn () => $ccProjectMessaging->campaigns->testSend('slug', $ccCampaign, $ccSendBody),
    fn () => $ccProjectMessaging->campaigns->createReplyFlow('slug', $ccFlowInput),
    fn () => $ccProjectMessaging->campaigns->getReplyFlow('slug', $ccFlowId),
    fn () => $ccProjectMessaging->campaigns->setReplyFlow('slug', $ccCampaign, ['replyFlowId' => null]),
    fn () => $ccProjectMessaging->campaigns->exportRecipients('slug', $ccCampaign, ['limit' => 2]),
];
foreach ($ccProjectMessagingCalls as $ccIndex => $ccInvoke) {
    $ccCase = $ccCases[$ccIndex];
    $ccCase[5] = $ccInvoke;
    $ccRun($ccCase, $ccProjectCredential);
}

function ccThrows(callable $invoke, string $expected): Throwable
{
    try {
        $invoke();
    } catch (Throwable $error) {
        ccCheck($error instanceof $expected, 'Expected '.$expected.', received '.$error::class);
        return $error;
    }
    throw new RuntimeException('Expected '.$expected.' before an effect.');
}

$ccHttp->post($ccUrl.'/__case', ['json' => []]);
$ccBrowser = new Polymorfa\MessagingClient(Polymorfa\Credential::clientToken('pmfa_ct_Zml4dHVyZQ'), baseUrl: $ccUrl);
foreach ([
    fn () => $ccBrowser->campaigns->links('slug', $ccCampaign),
    fn () => $ccBrowser->campaigns->testSend('slug', $ccCampaign, $ccSendBody),
    fn () => $ccBrowser->campaigns->createReplyFlow('slug', $ccFlowInput),
    fn () => $ccBrowser->campaigns->getReplyFlow('slug', $ccFlowId),
    fn () => $ccBrowser->campaigns->setReplyFlow('slug', $ccCampaign, ['replyFlowId' => null]),
    fn () => $ccBrowser->campaigns->exportRecipients('slug', $ccCampaign),
] as $ccInvoke) {
    ccThrows($ccInvoke, Polymorfa\ConfigurationException::class);
}
$ccRestrictedTransport = new Polymorfa\HttpTransport($ccProjectCredential, $ccUrl);
$ccRestrictedCampaigns = new Polymorfa\Resources\Campaigns($ccRestrictedTransport);
$ccRestrictedAudiences = new Polymorfa\Resources\Audiences($ccRestrictedTransport);
$ccRestrictedProfiles = new Polymorfa\Resources\AudienceProfiles($ccRestrictedTransport);
$ccRestrictedOptouts = new Polymorfa\Resources\OptOuts($ccRestrictedTransport);
foreach ([
    fn () => $ccRestrictedCampaigns->getSettings(),
    fn () => $ccRestrictedAudiences->createFromCampaign(['name' => 'Replied', 'campaignId' => $ccCampaign, 'outcome' => 'replied']),
    fn () => $ccRestrictedProfiles->list(),
    fn () => $ccRestrictedProfiles->retrieve('+15555555555'),
    fn () => $ccRestrictedProfiles->put('+15555555555', $ccPut),
    fn () => $ccRestrictedProfiles->delete('+15555555555', 1),
    fn () => $ccRestrictedProfiles->listConsent('+15555555555'),
    fn () => $ccRestrictedProfiles->imports->create(['replayKey' => 'fixture', 'csvBase64' => base64_encode("phone\n")]),
    fn () => $ccRestrictedProfiles->imports->retrieve($ccJobId),
    fn () => $ccRestrictedProfiles->imports->cancel($ccJobId),
    fn () => $ccRestrictedOptouts->getConfirmationSettings(),
    fn () => $ccRestrictedOptouts->updateConfirmationSettings(['teamId' => $ccProject, 'enabled' => false, 'locale' => null, 'revision' => 0]),
    fn () => $ccRestrictedOptouts->getConfirmationSummary(),
] as $ccInvoke) {
    ccThrows($ccInvoke, Polymorfa\ConfigurationException::class);
}
ccCheck(!method_exists($ccBound->campaigns, 'getSettings') && !method_exists($ccBound->campaigns, 'create') && !property_exists($ccBound, 'audienceProfiles') && !property_exists($ccBound, 'optOuts'), 'Organization-only surfaces are absent on ProjectClient');
ccThrows(fn () => $ccBound->project($ccCustomer), Polymorfa\ConfigurationException::class);
ccThrows(function () use ($ccBound, $ccCustomer): void {
    $ccBound->projectId = $ccCustomer;
}, Error::class);
ccThrows(fn () => $ccBound->campaigns->testSend($ccCampaign, [...$ccSendBody, 'projectId' => $ccCustomer]), Polymorfa\ConfigurationException::class);
ccThrows(fn () => $ccBound->campaigns->exportRecipients($ccCampaign, ['projectId' => $ccCustomer]), Polymorfa\ConfigurationException::class);
ccThrows(fn () => $ccBound->signalCustody->update([...$ccProjectUpdate, 'projectId' => $ccCustomer]), Polymorfa\ConfigurationException::class);
ccThrows(fn () => $ccBound->signalCustody->retrieveCustomer(null), TypeError::class);
ccThrows(fn () => $ccBound->signalCustody->updateCustomer($ccCustomer, null), TypeError::class);
ccCheck(json_decode((string) $ccHttp->get($ccUrl.'/__state')->getBody(), true) === [], 'Credential and immutable owner refusals perform no HTTP');
echo "22 bound aliases,6 Project Messaging calls and19 credential denials passed.\n";

// Retain two views from one organization transport and interleave their calls.
$ccViewA = $ccOrg->project($ccProject);
$ccViewB = $ccOrg->project($ccCustomer);
foreach ([
    ['retainedARead', 'GET', '/platform/campaigns/'.$ccCampaign.'/links?projectId='.$ccProject, null, $ccJson($ccLinks), fn () => $ccViewA->campaigns->links($ccCampaign)],
    ['retainedBWrite', 'POST', '/platform/campaigns/'.$ccCampaign.'/test-send', [...$ccSendWire, 'projectId' => $ccCustomer], $ccJson($ccSendData), fn () => $ccViewB->campaigns->testSend($ccCampaign, $ccSendBody)],
    ['retainedAWrite', 'POST', '/platform/campaigns/'.$ccCampaign.'/test-send', [...$ccSendWire, 'projectId' => $ccProject], $ccJson($ccSendData), fn () => $ccViewA->campaigns->testSend($ccCampaign, $ccSendBody)],
    ['retainedBRead', 'GET', '/platform/campaigns/'.$ccCampaign.'/links?projectId='.$ccCustomer, null, $ccJson($ccLinks), fn () => $ccViewB->campaigns->links($ccCampaign)],
    ['retainedACustodyRead', 'GET', '/platform/projects/'.$ccProject.'/signal-custody', null, $ccJson($ccCustody), fn () => $ccViewA->signalCustody->retrieve()],
    ['retainedBCustodyWrite', 'PUT', '/platform/projects/'.$ccCustomer.'/signal-custody', $ccProjectUpdate, $ccJson($ccCustody), fn () => $ccViewB->signalCustody->update($ccProjectUpdate)],
    ['retainedACustodyWrite', 'PUT', '/platform/projects/'.$ccProject.'/signal-custody', $ccProjectUpdate, $ccJson($ccCustody), fn () => $ccViewA->signalCustody->update($ccProjectUpdate)],
    ['retainedBCustodyRead', 'GET', '/platform/projects/'.$ccCustomer.'/signal-custody', null, $ccJson($ccCustody), fn () => $ccViewB->signalCustody->retrieve()],
] as $ccCase) {
    $ccRun($ccCase);
}
echo "Retained A/B views preserve campaign/custody ownership under interleaved reads and writes.\n";
