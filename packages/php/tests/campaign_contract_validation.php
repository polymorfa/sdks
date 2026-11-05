<?php

declare(strict_types=1);

$ccConfigure(['method' => 'GET', 'path' => '/platform/campaign-settings', 'response' => $ccJson(['launchApproval' => ['recipientThreshold' => null]])]);
foreach (["\u{00a0}", "\u{feff}"] as $ccBlankKey) {
    ccThrows(fn () => $ccOrg->campaigns->getSettings(new Polymorfa\RequestOptions(idempotencyKey: $ccBlankKey)), Polymorfa\ConfigurationException::class);
}
ccCheck($ccObservations() === [], 'Unicode blank keys fail before HTTP');

$ccHttp->post($ccUrl.'/__case', ['json' => []]);
$ccInvalid = [
    fn () => $ccOrg->projects->updateSignalCustody($ccProject, ['expectedRevision' => 0, 'signalModeDefault' => null]),
    fn () => $ccOrg->projects->updateSignalCustody($ccProject, ['expectedRevision' => false, 'signalModeDefault' => 'standard']),
    fn () => $ccOrg->customers->updateSignalCustody($ccProject, $ccCustomer, ['expectedRevision' => 0]),
    fn () => $ccOrg->projects->getSignalCustody('bad'),
    fn () => $ccOrg->campaigns->links($ccCampaign, ['projectId' => $ccProject, 'unexpected' => true]),
    fn () => $ccMessaging->campaigns->testSend('slug', $ccCampaign, [...$ccSendBody, 'variables' => ['bad key' => 'x']]),
    fn () => $ccMessaging->campaigns->testSend('slug', $ccCampaign, [...$ccSendBody, 'variables' => ['a' => null]]),
    fn () => $ccMessaging->campaigns->testSend('slug', $ccCampaign, [...$ccSendBody, 'variables' => ['a' => INF]]),
    fn () => $ccMessaging->campaigns->testSend('slug', $ccCampaign, [...$ccSendBody, 'variables' => ['a' => str_repeat("\u{1f600}", 513)]]),
    fn () => $ccMessaging->campaigns->testSend('slug', $ccCampaign, [...$ccSendBody, 'variables' => array_fill_keys(range(0, 50), 'x')]),
    fn () => $ccMessaging->campaigns->createReplyFlow('slug', [...$ccFlowInput, 'extra' => true]),
    fn () => $ccMessaging->campaigns->createReplyFlow('slug', ['name' => 'Reply', 'definition' => ['entryNodeId' => 'a', 'nodes' => []]]),
    fn () => $ccMessaging->campaigns->setReplyFlow('slug', $ccCampaign, []),
    fn () => $ccMessaging->campaigns->setReplyFlow('slug', $ccCampaign, ['replyFlowId' => false]),
    fn () => $ccMessaging->campaigns->exportRecipients('slug', $ccCampaign, ['reason' => 'other', 'cursor' => 'next']),
    fn () => $ccMessaging->campaigns->exportRecipients('slug', $ccCampaign, ['status' => 'failed', 'limit' => 999]),
    fn () => $ccMessaging->campaigns->exportRecipients('slug', $ccCampaign, ['limit' => 0]),
    fn () => $ccOrg->audienceProfiles->put('+15555555555', ['tags' => [], 'attributes' => [], 'expectedRevision' => 0]),
    fn () => $ccOrg->audienceProfiles->put('+15555555555', ['tags' => [], 'attributes' => [], 'provenance' => null]),
    fn () => $ccOrg->audienceProfiles->put('+15555555555', ['tags' => ['a', 'a'], 'attributes' => []]),
    fn () => $ccOrg->audienceProfiles->put('+15555555555', ['tags' => [], 'attributes' => ['bad key' => 'x']]),
    fn () => $ccOrg->audienceProfiles->put('+15555555555', ['tags' => [], 'attributes' => ['a' => "\0"]]),
    fn () => $ccOrg->audienceProfiles->retrieve('15555555555'),
    fn () => $ccOrg->audienceProfiles->list(['cursor' => 'not-uuid']),
    fn () => $ccOrg->audienceProfiles->list(['limit' => 101]),
    fn () => $ccOrg->audienceProfiles->imports->create(['replayKey' => 'x', 'csvBase64' => 'Zh==']),
    fn () => $ccOrg->audienceProfiles->imports->create(['replayKey' => 'x', 'csvBase64' => base64_encode("a\0b")]),
    fn () => $ccOrg->audienceProfiles->imports->create(['replayKey' => 'x', 'csvBase64' => base64_encode("\xff")]),
    fn () => $ccOrg->audienceProfiles->imports->create(['replayKey' => 'x', 'csvBase64' => base64_encode('csv'), 'mapping' => ['phone' => 'phone', 'tags' => 'phone', 'attributes' => 'attributes']]),
    fn () => $ccOrg->audienceProfiles->imports->create(['replayKey' => 'x', 'csvBase64' => base64_encode('csv'), 'mapping' => ['phone' => "ph\u{0085}one", 'tags' => 'tags', 'attributes' => 'attributes']]),
    fn () => $ccOrg->optOuts->updateConfirmationSettings(['teamId' => $ccProject, 'enabled' => true, 'locale' => null, 'revision' => 0]),
    fn () => $ccOrg->optOuts->updateConfirmationSettings(['teamId' => $ccProject, 'enabled' => false, 'locale' => null, 'revision' => 2147483647]),
    fn () => $ccOrg->audiences->createFromCampaign(['name' => "\u{feff}", 'campaignId' => $ccCampaign, 'outcome' => 'replied']),
];
foreach ($ccInvalid as $ccInvoke) {
    ccThrows($ccInvoke, Polymorfa\ConfigurationException::class);
}
foreach (['Idempotency-Key', 'IDEMPOTENCY-KEY', 'idempotency-key'] as $ccHeaderName) {
    ccThrows(fn () => $ccOrg->campaigns->getSettings(new Polymorfa\RequestOptions(headers: [$ccHeaderName => 'key'])), Polymorfa\ConfigurationException::class);
}
foreach (["", "\t", "x\0y", str_repeat('x', 256)] as $ccKey) {
    ccThrows(fn () => $ccOrg->campaigns->getSettings(new Polymorfa\RequestOptions(idempotencyKey: $ccKey)), Polymorfa\ConfigurationException::class);
}
$ccAlreadyCancelled = new Polymorfa\CancellationToken();
$ccAlreadyCancelled->cancel();
ccThrows(fn () => $ccOrg->projects->getSignalCustody($ccProject, new Polymorfa\RequestOptions(cancellation: $ccAlreadyCancelled)), Polymorfa\CancelledException::class);
ccThrows(fn () => $ccMessaging->campaigns->exportRecipients('slug', $ccCampaign, [], new Polymorfa\RequestOptions(cancellation: $ccAlreadyCancelled)), Polymorfa\CancelledException::class);
ccCheck($ccObservations() === [], 'Validation, reserved headers and pre-cancellation refuse before HTTP');

// Independent compact-byte boundaries include Unicode, HTML and literal slashes.
$ccBudgetNodes = [];
for ($ccIndex = 0; $ccIndex < 6; ++$ccIndex) {
    $ccBudgetNodes[] = ['id' => 'n'.$ccIndex, 'send' => ['kind' => 'text', 'text' => $ccIndex === 5 ? str_repeat('x', 4096) : str_repeat("<>&/\u{2028}\u{2029}", 409).'xxxxxx'], 'edges' => []];
}
$ccJsonFlags = JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS;
$ccExcess = strlen(json_encode($ccBudgetNodes, $ccJsonFlags)) - 24576;
$ccBudgetNodes[5]['send']['text'] = substr($ccBudgetNodes[5]['send']['text'], 0, 4096 - $ccExcess);
ccCheck(strlen(json_encode($ccBudgetNodes, $ccJsonFlags)) === 24576, 'Independent nodes-only exact24KiB fixture');
$ccBudgetBody = ['name' => 'Budget', 'definition' => ['entryNodeId' => 'n0', 'nodes' => $ccBudgetNodes]];
$ccConfigure(['method' => 'POST', 'path' => '/messaging/projects/slug/campaign-reply-flows', 'body' => $ccBudgetBody, 'response' => $ccMessagingJson($ccFlowData)]);
$ccMessaging->campaigns->createReplyFlow('slug', $ccBudgetBody);
$ccBudgetBody['definition']['nodes'][5]['send']['text'] .= 'x';
$ccHttp->post($ccUrl.'/__case', ['json' => []]);
ccThrows(fn () => $ccMessaging->campaigns->createReplyFlow('slug', $ccBudgetBody), Polymorfa\ConfigurationException::class);
$ccKeywordBody = $ccFlowInput;
$ccKeywordBody['definition']['nodes'][0]['edges'][0]['match']['value'] = str_repeat("i\u{0307}", 32);
ccThrows(fn () => $ccMessaging->campaigns->createReplyFlow('slug', $ccKeywordBody), Polymorfa\ConfigurationException::class);

$ccAttributes = [];
for ($ccIndex = 0; $ccIndex < 20; ++$ccIndex) {
    $ccAttributes['a'.$ccIndex] = str_repeat("\x01", 64);
}
$ccNeeded = 8192 - strlen(json_encode((object) $ccAttributes, $ccJsonFlags));
foreach ($ccAttributes as &$ccAttribute) {
    $ccAppend = min($ccNeeded, 256 - strlen($ccAttribute));
    $ccAttribute .= str_repeat('x', $ccAppend);
    $ccNeeded -= $ccAppend;
}
unset($ccAttribute);
ccCheck($ccNeeded === 0 && strlen(json_encode((object) $ccAttributes, $ccJsonFlags)) === 8192, 'Independent attributes exact8192-byte fixture');
$ccConfigure(['method' => 'PUT', 'path' => '/platform/audience-profiles/%2B15555555555', 'body' => ['tags' => [], 'attributes' => (object) $ccAttributes], 'response' => $ccJson($ccProfile)]);
$ccOrg->audienceProfiles->put('+15555555555', ['tags' => [], 'attributes' => $ccAttributes]);
$ccAttributes['a19'] .= 'x';
$ccHttp->post($ccUrl.'/__case', ['json' => []]);
ccThrows(fn () => $ccOrg->audienceProfiles->put('+15555555555', ['tags' => [], 'attributes' => $ccAttributes]), Polymorfa\ConfigurationException::class);
ccThrows(fn () => $ccOrg->audienceProfiles->imports->create(['replayKey' => 'over', 'csvBase64' => base64_encode(str_repeat('x', 10 * 1024 * 1024 + 1))]), Polymorfa\ConfigurationException::class);
ccCheck($ccObservations() === [], 'Over-budget and outbound normalized keyword requests refuse before HTTP');

$ccScalarBody = [...$ccSendBody, 'variables' => ['0' => false, 'tiny' => 1e-7, 'fixed' => 1e-6, 'large' => 1e21, 'zero' => -0.0]];
$ccScalarWire = '{"sessionId":"'.$ccSendBody['sessionId'].'","to":"'.$ccSendBody['to'].'","variables":{"0":false,"tiny":1e-7,"fixed":0.000001,"large":1e+21,"zero":0}}';
$ccConfigure(['method' => 'POST', 'path' => '/messaging/projects/slug/campaigns/'.$ccCampaign.'/test-send', 'bodySha256' => hash('sha256', $ccScalarWire), 'maxBodyBytes' => strlen($ccScalarWire), 'response' => $ccMessagingJson($ccSendData)]);
$ccMessaging->campaigns->testSend('slug', $ccCampaign, $ccScalarBody);
echo "Strict request validation, compact quotas and scalar wire spellings passed.\n";

foreach ($ccCases as $ccCase) {
    $ccConfigure(['method' => $ccCase[1], 'path' => $ccCase[2], 'body' => $ccCase[3], 'response' => '[]', 'contentType' => str_starts_with($ccCase[0], 'export') ? 'text/html' : 'application/json']);
    ccThrows($ccCase[5], Polymorfa\ServerException::class);
    ccCheck(count($ccObservations()) === 1, $ccCase[0].' rejects malformed success without effect retry');
}
$ccBadProfiles = [
    '{"data":[]}',
    '{"data":{"id":"p","phone":"+15555555555","revision":1,"tags":[],"attributes":[],"provenance":null,"createdAt":0,"updatedAt":0}}',
    '{"data":{"id":"p","phone":"+15555555555","revision":1,"tags":[],"attributes":{},"createdAt":0,"updatedAt":0}}',
];
foreach ($ccBadProfiles as $ccResponse) {
    $ccConfigure(['method' => 'GET', 'path' => '/platform/audience-profiles/%2B15555555555', 'response' => $ccResponse]);
    ccThrows(fn () => $ccOrg->audienceProfiles->retrieve('+15555555555'), Polymorfa\ServerException::class);
}
foreach (['{"data":[]}', '{"data":[],"page":{"hasMore":false}}', '{"data":[],"page":[]}'] as $ccResponse) {
    $ccConfigure(['method' => 'GET', 'path' => '/platform/audience-profiles', 'response' => $ccResponse]);
    ccThrows(fn () => $ccOrg->audienceProfiles->list(), Polymorfa\ServerException::class);
}
foreach ([301, 302, 307, 308, 204] as $ccStatus) {
    $ccConfigure(['method' => 'GET', 'path' => '/messaging/projects/slug/campaigns/'.$ccCampaign.'/recipients/export', 'contentType' => 'text/csv', 'response' => 'csv', 'status' => $ccStatus, 'headers' => ['Location' => 'https://example.com/never-follow']]);
    ccThrows(fn () => $ccMessaging->campaigns->exportRecipients('slug', $ccCampaign), Polymorfa\ServerException::class);
    ccCheck(count($ccObservations()) === 1, 'CSV rejects redirect/204 without following credentials');
}
$ccGolden = (string) file_get_contents(__DIR__.'/fixtures/campaign-flow-normalized-f97.json');
$ccConfigure(['method' => 'GET', 'path' => '/platform/campaign-reply-flows/'.$ccFlowId.'?projectId='.$ccProject, 'response' => $ccGolden]);
$ccGoldenResult = $ccOrg->campaigns->getReplyFlow($ccFlowId, ['projectId' => $ccProject]);
ccCheck(strlen($ccGoldenResult->data['data']['definition']['nodes'][0]['edges'][0]['match']['value']) === 96, 'API-normalized96-byte keyword response is valid');
foreach (['buttons', 'list'] as $ccKind) {
    $ccBadFlow = $ccFlowData;
    $ccBadFlow['definition']['nodes'][0]['send'] = $ccKind === 'buttons' ? ['kind' => 'buttons', 'body' => 'Reply', 'footer' => null, 'buttons' => [['id' => 'a', 'text' => 'A']]] : ['kind' => 'list', 'body' => 'Reply', 'buttonText' => 'Choose', 'rows' => [['id' => 'a', 'title' => 'A', 'description' => null]]];
    $ccConfigure(['method' => 'GET', 'path' => '/platform/campaign-reply-flows/'.$ccFlowId.'?projectId='.$ccProject, 'response' => $ccJson($ccBadFlow)]);
    ccThrows(fn () => $ccOrg->campaigns->getReplyFlow($ccFlowId, ['projectId' => $ccProject]), Polymorfa\ServerException::class);
}
$ccConfigure(['method' => 'GET', 'path' => '/messaging/projects/slug/campaigns/'.$ccCampaign.'/recipients/export', 'response' => "phone,status\r\n", 'contentType' => 'text/csv', 'bodyDelaySeconds' => 0.15, 'headers' => ['X-Polymorfa-Operation-Id' => 'csv-admitted']]);
$ccStarted = microtime(true);
$ccTimeout = ccThrows(fn () => $ccMessaging->campaigns->exportRecipients('slug', $ccCampaign, [], new Polymorfa\RequestOptions(timeout: 0.04, maxNetworkRetries: 0)), Polymorfa\PolymorfaException::class);
ccCheck(($ccTimeout instanceof Polymorfa\ConnectionException || $ccTimeout instanceof Polymorfa\TimeoutException) && $ccTimeout->metadata->operationId === 'csv-admitted' && microtime(true) - $ccStarted < 1 && count($ccObservations()) === 1, 'CSV stalled read retains admitted metadata without restarting body');
$ccConfigure(['method' => 'GET', 'path' => '/platform/campaign-settings', 'response' => $ccJson(['launchApproval' => ['recipientThreshold' => null]]), 'bodyDelaySeconds' => 0.15, 'headers' => ['X-Polymorfa-Operation-Id' => 'json-admitted']]);
$ccTimeout = ccThrows(fn () => $ccOrg->campaigns->getSettings(new Polymorfa\RequestOptions(timeout: 0.04, maxNetworkRetries: 0)), Polymorfa\TimeoutException::class);
ccCheck($ccTimeout->metadata->operationId === 'json-admitted' && count($ccObservations()) === 1, 'JSON stalled response retains admitted metadata');
echo "30 malformed result guards, normalized responses, CSV redirects and native deadlines passed.\n";
