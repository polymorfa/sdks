<?php

declare(strict_types=1);

// Wire expectations come from contracts/campaign-frequency-cap.json,
// contracts/campaign-segments-drip.json and the pinned TypeScript producer tests.
// Uses $campaign, $recipient and $analytics from campaigns.php.

$segProject = '11111111-1111-4111-8111-111111111111';
$segId = '22222222-2222-4222-8222-222222222222';
$segRules = ['match' => 'all','groups' => [['match' => 'any','conditions' => [
    ['field' => 'tag','operator' => 'contains','value' => 'vip'],
    ['field' => 'attribute','name' => 'spend','operator' => 'greater_than','value' => 100],
    ['field' => 'consent','operator' => 'equals','value' => true],
]]]];
$segment = ['id' => $segId,'name' => 'VIP','revision' => 2,'rules' => $segRules,'createdAt' => 1,'updatedAt' => 2];
$segPreview = ['matchedCount' => 4,'optedOutCount' => 1,'consentWithheldCount' => 1,'eligibleCount' => 2,'sample' => [['phone' => '+49*******12','tags' => ['vip']]],'evaluatedAt' => 3];
$limits = ['maxPer24Hours' => 2,'maxPer7Days' => 5];
$capSettings = ['teamId' => $segProject,'maxPer24Hours' => 2,'maxPer7Days' => 5,'revision' => 1,'updatedAt' => null];
$dripStats = ['enrollment' => 'continuous','enrolled' => 3,'enrolledByApi' => 1,'active' => 1,'completed' => 1,'exited' => 1,'steps' => [['step' => 0,'entered' => 3,'waiting' => 1,'sent' => 2,'delivered' => 2,'read' => 1,'replied' => 1,'exited' => 1,'failed' => 0]]];
$dripCampaign = array_replace($campaign, ['frequencyCap' => ['maxPer24Hours' => 2,'maxPer7Days' => null],'drip' => ['enrollment' => 'audience','exitOnReply' => false,'exitOnLinkClick' => true],'enrollmentOpen' => false,'pauseReason' => null,'segmentId' => null,'segmentSnapshot' => ['revision' => 3,'evaluatedAt' => 1,'matchedCount' => 4]]);
$enrollment = ['campaignId' => $segId,'recipientId' => $segProject,'phone' => '+5511999990000','created' => false,'status' => 'skipped','enrolledAt' => 1800000000000];
$capRecipient = array_replace($recipient, ['status' => 'skipped','failureReason' => 'frequency_cap','lastError' => 'frequency_cap_exceeded','sequenceError' => 'link_clicked','messagesSent' => 1]);
$capAnalytics = $analytics + ['frequencyCap' => ['skippedRecipientCount' => 3],'drip' => $dripStats];
$window = ['days' => ['monday'],'hours' => [['start' => '09:00','end' => '17:00']]];
$steps = [['source' => 'hi'],['source' => 'later','delayAfterSec' => 2592000,'delayUnit' => 'days','sendWindow' => $window]];
$q = '?projectId='.$segProject;

// Organization surface: frequency cap, segments, drip, enrollment, reads.
$cases = [
    ['GET','/platform/campaign-settings/frequency-cap',null,['data' => $capSettings],fn ($c) => $c->campaigns->getFrequencyCap()],
    ['PUT','/platform/campaign-settings/frequency-cap',$limits + ['revision' => 1],['data' => array_replace($capSettings, ['revision' => 2,'updatedAt' => 1800000000000])],fn ($c) => $c->campaigns->updateFrequencyCap($limits + ['revision' => 1])],
    ['PUT','/platform/campaign-settings/frequency-cap',['maxPer24Hours' => null,'maxPer7Days' => null,'revision' => 2],['data' => array_replace($capSettings, ['maxPer24Hours' => null,'maxPer7Days' => null,'revision' => 3])],fn ($c) => $c->campaigns->updateFrequencyCap(['maxPer24Hours' => null,'maxPer7Days' => null,'revision' => 2])],
    ['POST','/platform/campaigns',['projectId' => $segProject,'name' => 'cap','frequencyCap' => $limits],['data' => $dripCampaign],fn ($c) => $c->campaigns->create(['projectId' => $segProject,'name' => 'cap','frequencyCap' => $limits])],
    ['PATCH','/platform/campaigns/c'.$q,['frequencyCap' => null],['data' => $dripCampaign],fn ($c) => $c->campaigns->update('c', ['frequencyCap' => null], ['projectId' => $segProject])],
    ['GET','/platform/campaigns/c'.$q,null,['data' => $dripCampaign],fn ($c) => $c->campaigns->retrieve('c', ['projectId' => $segProject])],
    ['GET','/platform/campaigns/c/analytics'.$q,null,['data' => $capAnalytics],fn ($c) => $c->campaigns->analytics('c', ['projectId' => $segProject])],
    ['GET','/platform/campaigns/c/recipients'.$q.'&status=skipped&reason=frequency_cap',null,['data' => [$capRecipient],'page' => ['nextCursor' => null,'hasMore' => false]],fn ($c) => $c->campaigns->recipients('c', ['projectId' => $segProject,'status' => 'skipped','reason' => 'frequency_cap'])],
    ['POST','/platform/campaigns',['projectId' => $segProject,'name' => 'VIP drip','segmentId' => 's','drip' => ['enrollment' => 'continuous'],'messagesArray' => $steps],['data' => $dripCampaign],fn ($c) => $c->campaigns->create(['projectId' => $segProject,'name' => 'VIP drip','segmentId' => 's','drip' => ['enrollment' => 'continuous'],'messagesArray' => $steps])],
    ['PATCH','/platform/campaigns/c'.$q,['drip' => ['enrollment' => 'audience']],['data' => $dripCampaign],fn ($c) => $c->campaigns->update('c', ['drip' => ['enrollment' => 'audience']], ['projectId' => $segProject])],
    ['PATCH','/platform/campaigns/c'.$q,['drip' => null,'segmentId' => null],['data' => $dripCampaign],fn ($c) => $c->campaigns->update('c', ['drip' => null,'segmentId' => null], ['projectId' => $segProject])],
    ['PATCH','/platform/campaigns/c'.$q,['messagesArray' => [['source' => 'later','delayAfterSec' => 2592000,'delayUnit' => 'days']]],['data' => $dripCampaign],fn ($c) => $c->campaigns->update('c', ['messagesArray' => [['source' => 'later','delayAfterSec' => 2592000,'delayUnit' => 'days']]], ['projectId' => $segProject])],
    ['POST','/platform/campaigns/c%2F1/enrollments',['projectId' => $segProject,'phone' => '+5511999990000'],['data' => $enrollment],fn ($c) => $c->campaigns->enroll('c/1', ['projectId' => $segProject,'phone' => '+5511999990000'])],
    ['GET','/platform/audience-segments?limit=10',null,['data' => [$segment],'page' => ['hasMore' => true,'nextCursor' => 'next']],fn ($c) => $c->audienceSegments->list(['limit' => 10])],
    ['GET','/platform/audience-segments?limit=10&cursor=next',null,['data' => [$segment],'page' => ['hasMore' => false,'nextCursor' => null]],fn ($c) => $c->audienceSegments->list(['limit' => 10,'cursor' => 'next'])],
    ['GET','/platform/audience-segments/s%2F1',null,['data' => $segment],fn ($c) => $c->audienceSegments->retrieve('s/1')],
    ['POST','/platform/audience-segments',['name' => 'VIP','rules' => $segRules],['data' => $segment],fn ($c) => $c->audienceSegments->create(['name' => 'VIP','rules' => $segRules])],
    ['PATCH','/platform/audience-segments/s',['expectedRevision' => 1,'rules' => $segRules],['data' => $segment],fn ($c) => $c->audienceSegments->update('s', ['expectedRevision' => 1,'rules' => $segRules])],
    ['GET','/platform/audience-segments/s/preview',null,['data' => $segPreview + ['revision' => 2]],fn ($c) => $c->audienceSegments->preview('s')],
    ['POST','/platform/audience-segments/preview',['rules' => $segRules],['data' => $segPreview],fn ($c) => $c->audienceSegments->previewRules($segRules)],
    ['DELETE','/platform/audience-segments/s?expectedRevision=2',null,['data' => ['deleted' => true,'id' => $segId]],fn ($c) => $c->audienceSegments->delete('s', 2)],
];
nativeCases($cases, fn ($credential, $url) => new Polymorfa\Client($credential, baseUrl:$url));

// Messaging surface keeps the project slug path and the global API version.
$base = '/messaging/projects/'.$segProject.'/campaigns';
$cases = [
    ['POST',$base,['name' => 'cap','frequencyCap' => $limits],['success' => true,'data' => $dripCampaign],fn ($c) => $c->campaigns->create($segProject, ['name' => 'cap','frequencyCap' => $limits])],
    ['PATCH',$base.'/c',['frequencyCap' => null],['success' => true,'data' => $dripCampaign],fn ($c) => $c->campaigns->update($segProject, 'c', ['frequencyCap' => null])],
    ['PATCH',$base.'/c',['drip' => ['enrollment' => 'audience']],['success' => true,'data' => $dripCampaign],fn ($c) => $c->campaigns->update($segProject, 'c', ['drip' => ['enrollment' => 'audience']])],
    ['GET',$base.'/c',null,['success' => true,'data' => $dripCampaign],fn ($c) => $c->campaigns->retrieve($segProject, 'c')],
    ['GET',$base.'/c/analytics',null,['success' => true,'data' => $capAnalytics],fn ($c) => $c->campaigns->analytics($segProject, 'c')],
    ['GET',$base.'/c/recipients?status=skipped&reason=frequency_cap',null,['success' => true,'data' => [$capRecipient],'page' => ['nextCursor' => null,'hasMore' => false]],fn ($c) => $c->campaigns->listRecipients($segProject, 'c', ['status' => 'skipped','reason' => 'frequency_cap'])],
    ['POST',$base.'/c/enrollments',['phone' => '+5511999990000','variables' => ['vip' => true]],['success' => true,'data' => $enrollment],fn ($c) => $c->campaigns->enroll($segProject, 'c', ['phone' => '+5511999990000','variables' => ['vip' => true]])],
];
nativeCases($cases, fn ($credential, $url) => new Polymorfa\MessagingClient($credential, baseUrl:$url));

// Writes and both previews are sent once; ordinary reads keep the client retry policy.
foreach ([[409,'conflict',Polymorfa\ConflictException::class],[403,'feature_unavailable',Polymorfa\AuthorizationException::class],[409,'state_conflict',Polymorfa\ConflictException::class],[503,'unavailable',Polymorfa\ServerException::class]] as [$status,$code,$type]) {
    $calls = [
        fn ($c, $m) => $c->campaigns->updateFrequencyCap(['maxPer24Hours' => 1,'maxPer7Days' => 1,'revision' => 0], new Polymorfa\RequestOptions(headers:['X-Caller' => 'kept'])),
        fn ($c, $m) => $c->audienceSegments->update('s', ['expectedRevision' => 2,'name' => 'new']),
        fn ($c, $m) => $c->audienceSegments->create(['name' => 'n','rules' => $segRules]),
        fn ($c, $m) => $c->audienceSegments->delete('s', 2),
        fn ($c, $m) => $c->audienceSegments->preview('s'),
        fn ($c, $m) => $c->audienceSegments->previewRules($segRules),
        fn ($c, $m) => $c->campaigns->enroll('c', ['projectId' => $segProject,'phone' => '+1']),
        fn ($c, $m) => $m->campaigns->enroll($segProject, 'c', ['phone' => '+1'], new Polymorfa\RequestOptions(idempotencyKey:'caller-key')),
    ];
    foreach ($calls as $index => $call) {
        $history = [];
        $http = mocked(array_fill(0, 3, jsonResponse(['error' => ['code' => $code,'message' => 'Unavailable, deleted segment or evaluation timeout']], $status)), $history);
        $client = new Polymorfa\Client($credential, http:$http, maxNetworkRetries:2);
        $messaging = new Polymorfa\MessagingClient($credential, http:$http, maxNetworkRetries:2);
        $error = raises(fn () => $call($client, $messaging), $type);
        check($error->errorCode === $code && $error->status === $status && $error->requestId === 'req_test', "Segment/drip error $status $code $index keeps safe metadata");
        check(count($history) === 1, "Segment/drip write or preview $index sent once on $status");
        if ($index === 0) {
            check($history[0]['request']->getHeaderLine('X-Caller') === 'kept', 'Caller metadata preserved');
        }
        if ($index === 7) {
            check($history[0]['request']->getHeaderLine('Idempotency-Key') === 'caller-key', 'Caller idempotency key preserved without replay');
        }
        if ($index === 6) {
            check(!$history[0]['request']->hasHeader('Idempotency-Key'), 'Enrollment does not invent an idempotency key');
        }
    }
}
$history = [];
$client = new Polymorfa\Client($credential, http:mocked([jsonResponse(['error' => ['code' => 'unavailable','message' => 'retry']], 503),jsonResponse(['error' => ['code' => 'unavailable','message' => 'retry']], 503),jsonResponse(['data' => $segment])], $history), maxNetworkRetries:2);
check($client->audienceSegments->retrieve('s')->data['data']['revision'] === 2 && count($history) === 3, 'Segment reads keep the retry policy');

// Malformed input and missing project selection fail closed before sending.
$history = [];
$client = new Polymorfa\Client($credential, http:mocked([], $history));
foreach (['', ' '] as $blank) {
    raises(fn () => $client->audienceSegments->retrieve($blank), Polymorfa\ConfigurationException::class);
}
foreach ([
    ['field' => 'future'],
    ['field' => 'attribute','name' => 'x','operator' => 'equals','value' => [1]],
    ['field' => 'attribute','name' => 'x','operator' => 'in','values' => [true]],
    ['field' => 'attribute','name' => 'x','operator' => 'greater_than','value' => '1'],
    ['field' => 'consent','operator' => 'equals','value' => 1],
    ['field' => 'tag','operator' => 'contains','value' => 'a','extra' => 1],
] as $bad) {
    raises(fn () => $client->audienceSegments->previewRules(['match' => 'all','groups' => [['match' => 'all','conditions' => [$bad]]]]), Polymorfa\ConfigurationException::class);
}
foreach ([['phone' => '+1'],['projectId' => 'not-a-uuid','phone' => '+1']] as $bad) {
    raises(fn () => $client->campaigns->enroll('c', $bad), Polymorfa\ConfigurationException::class);
}
foreach ([[['projectId' => $segProject,'name' => 'o','messagesArray' => [['delayAfterSec' => 86401]]]],[['projectId' => $segProject,'name' => 'o','drip' => null,'messagesArray' => [['delayAfterSec' => 86401]]]]] as [$body]) {
    $error = raises(fn () => $client->campaigns->create($body), Polymorfa\ConfigurationException::class);
    check(str_contains($error->getMessage(), 'delayAfterSec'), 'Ordinary create keeps the one-day step bound');
}
$error = raises(fn () => $client->campaigns->update('c', ['messagesArray' => [['delayAfterSec' => 2592001]]], ['projectId' => $segProject]), Polymorfa\ConfigurationException::class);
check(str_contains($error->getMessage(), 'delayAfterSec'), 'PATCH keeps the 30-day step bound');
check($history === [], 'Invalid segment, enrollment or step input reached the network');

// An empty drip input is a JSON object, not a list.
$history = [];
$client = new Polymorfa\Client($credential, http:mocked([jsonResponse(['data' => $dripCampaign])], $history));
$client->campaigns->create(['projectId' => $segProject,'name' => 'drip','drip' => [],'messagesArray' => [['delayAfterSec' => 2592000]]]);
check((string) $history[0]['request']->getBody() === '{"projectId":"'.$segProject.'","name":"drip","drip":{},"messagesArray":[{"delayAfterSec":2592000}]}', 'Empty drip input stays an object and admits a 30-day step');

// A project client has no organization segment authority.
check(!property_exists(new Polymorfa\ProjectClient($credential, $segProject), 'audienceSegments'), 'Project clients exclude audience segments');
echo "Frequency caps, audience segments, drips and enrollment passed on both audiences.\n";
