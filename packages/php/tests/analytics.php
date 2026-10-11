<?php

declare(strict_types=1);
$p = '11111111-1111-1111-1111-111111111111';
$s = '22222222-2222-2222-2222-222222222222';
$outcome = ['total' => 2,'answered' => 1,'missed' => 1,'declined' => 0,'failed' => 0,'ringing' => 0,'answerRate' => 0.5,'talkSeconds' => 1.234567,'timedAnswered' => 1,'timedPickup' => 1,'averageTalkSeconds' => 1.234567,'medianTalkSeconds' => 1.234567,'p95TalkSeconds' => 1.234567,'averagePickupMs' => null,'p95PickupMs' => null,'shortAnswered' => 0,'video' => 1];
$calls = $outcome + ['directions' => ['inbound' => $outcome,'outbound' => $outcome],'mediaQuality' => ['measuredCalls' => 1,'averageJitterMs' => 12.5,'averageRttMs' => null,'packetsLost' => null],'appQuality' => ['measuredCalls' => 0,'averageJitterMs' => null,'averageRttMs' => null,'packetLossRate' => null,'reconnects' => null],'endReasons' => [['code' => 'remote_hangup','count' => 1]],'appErrors' => [['code' => 'media_timeout','count' => 1]],'transports' => [['code' => 'websocket','count' => 1]],'multiParticipantCalls' => 1,'followUp' => ['eligibleMissed' => 1,'returnedWithin24h' => 0,'rate' => null,'averageDelayMs' => null,'pendingWindow' => 1,'unknownContact' => 0]];
$segment = ['dimension' => 'message_type','key' => 'text','sendAttempts' => 1,'sent' => 1,'sendFailures' => 0,'sendFailureRate' => 0,'completedConversations' => 1,'deliveredConversations' => 1,'readConversations' => 1,'repliedConversations' => 1,'deliveryRate' => 1,'readRate' => 1,'replyRate' => 1,'averageCustomerReplyMs' => 12.5,'readRateInterval95' => [0.2,1],'replyRateInterval95' => null,'readRateDifference' => null,'replyRateDifference' => null,'shareOfConversations' => 1,'shareOfSends' => 1];
$metrics = ['measured' => true,'observedHours' => 1,'lastObservedAt' => 20,'outgoingMessages' => 1,'incomingMessages' => 1,'sendAttempts' => 1,'sendFailures' => 0,'sendFailureRate' => 0,'businessReplies' => 1,'averageBusinessResponseMs' => 12.5,'onlineMs' => 1000,'disconnects' => 0,'connectFailures' => 0,'streamErrors' => 0,'keepaliveTimeouts' => 0,'engagement' => ['windowHours' => 24,'completedConversations' => 1,'deliveredConversations' => 1,'readConversations' => 1,'repliedConversations' => 1,'deliveryRate' => 1,'readRate' => 1,'replyRate' => 1,'averageCustomerReplyMs' => 12.5,'complete' => true,'droppedConversations' => 0,'droppedRecords' => 0,'droppedReceiptJoins' => 0],'messageAnalysis' => ['complete' => true,'segments' => [$segment]],'customerActivity' => ['observed' => true,'onlineSignals' => 1,'offlineSignals' => 0,'typingSignals' => 1],'accountActivity' => ['observed' => true,'primaryPhoneActivitySignals' => 1,'primaryPhoneActivePeriods' => 1,'completedPhoneActivityPeriods' => 1,'phoneActivityMs' => 1000,'averagePhoneActivityMs' => 1000,'phoneQuietGaps' => 0,'phoneQuietMs' => 0,'averagePhoneQuietMs' => null,'primaryPhoneMessages' => 1,'otherDeviceMessages' => 0,'primaryPhoneReplies' => 1,'otherDeviceReplies' => 0,'averagePrimaryPhoneResponseMs' => 12.5,'averageOtherDeviceResponseMs' => null,'lastPrimaryPhoneAt' => 20],'responseQueue' => null,'deviceAnalytics' => ['detector' => 'message_id_prefix/v1','measured' => true,'complete' => true,'observedBuckets' => 1,'customerMessages' => 1,'accountMessages' => 1,'customerPlatforms' => [['platform' => 'android','messages' => 1,'share' => 1]],'accountPlatforms' => [],'inventory' => ['listObserved' => true,'listCurrent' => false,'observedAt' => 20,'deviceCount' => 1,'truncated' => false,'devices' => [['deviceIndex' => 0,'estimatedPlatform' => 'android','reportedClass' => 'phone','lastActiveAt' => null,'listed' => null]]]],'recipientActivity' => ['measured' => true,'complete' => false,'observedBuckets' => 1,'droppedSignals' => 0,'truncated' => false,'rows' => [['ts' => 20,'recipientCountry' => 'US','recipientDeviceCount' => 'primary_only','deviceSource' => 'primary','incomingMessages' => 1,'deliveryReceipts' => 1,'readReceipts' => 1,'onlineSignals' => 1,'offlineSignals' => 0,'typingSignals' => 1,'lastSignalAt' => 20,'quietGaps' => 0,'quietGapMs' => 0,'averageQuietGapMs' => null]]],'conversationBreakdown' => ['measured' => true,'complete' => true,'observedBuckets' => 1,'droppedConversations' => 0,'truncated' => false,'buckets' => [['ts' => 20,'complete' => true]],'rows' => [['recipientCountry' => 'US','recipientDeviceCount' => 'one_linked','ts' => 20,'messageType' => 'text','textBand' => 'short','origin' => 'api','callingCode' => '1','customerDevices' => 'single','completedConversations' => 1,'deliveredConversations' => 1,'readConversations' => 1,'repliedConversations' => 1,'replyLatencySumMs' => 12.5,'readRate' => 1,'replyRate' => 1,'averageCustomerReplyMs' => 12.5]]],'calls' => $calls];
$analytics = ['enabled' => true,'period' => ['start' => 0,'end' => 20],'requestVitals' => ['requests' => 1,'failures' => 0,'errorRate' => 0],'summary' => $metrics + ['totalNumbers' => 1,'measuredNumbers' => 1,'connectedNumbers' => 1],'numbers' => [$metrics + ['sessionId' => $s,'projectId' => $p,'projectName' => 'Project','name' => 'support','backend' => 'linked_devices','status' => 'connected']],'series' => [['sessionId' => $s,'ts' => 20,'outgoingMessages' => 1,'incomingMessages' => 1,'sendFailures' => 0,'businessReplies' => 1,'averageBusinessResponseMs' => 12.5,'onlineMs' => 1000,'disconnects' => 0,'customerOnlineSignals' => 1,'customerTypingSignals' => 1,'primaryPhoneMessages' => 1,'otherDeviceMessages' => 0,'primaryPhoneReplies' => 1,'phoneActivePeriods' => 1,'completedPhoneActivityPeriods' => 1,'phoneActivityMs' => 1000,'phoneQuietGaps' => 0,'phoneQuietMs' => 0]],'callSeries' => [$outcome + ['sessionId' => $s,'ts' => 20]]];
$disabled = ['enabled' => false,'period' => ['start' => 0,'end' => 20],'requestVitals' => ['requests' => 0,'failures' => 0,'errorRate' => null],'summary' => null,'numbers' => [],'series' => [],'callSeries' => []];
nativeCases([['GET','/platform/analytics?projectId='.$p.'&sessionId='.$s.'&start=0&end=20',null,['data' => $analytics],fn ($c) => $c->get(['projectId' => $p,'sessionId' => $s,'start' => 0,'end' => 20]),$analytics]], fn ($credential, $url) => new Polymorfa\Resources\AnalyticsResource(new Polymorfa\HttpTransport($credential, $url)));
nativeCases([['GET','/platform/projects/'.$p.'/analytics?sessionId='.$s, null,['data' => $disabled],fn ($c) => $c->get(['projectId' => $p,'sessionId' => $s]),$disabled]], fn ($credential, $url) => new Polymorfa\Resources\AnalyticsResource(new Polymorfa\HttpTransport($credential, $url), $p));
$analyticsClient = new Polymorfa\Resources\AnalyticsResource(new Polymorfa\HttpTransport($credential), $p);
foreach ([fn () => $analyticsClient->get(['start' => 20,'end' => 0]),fn () => $analyticsClient->get(['sessionId' => 'bad']),fn () => $analyticsClient->get(['projectId' => $s]),fn () => $analyticsClient->metrics(['windowHours' => 0]),fn () => $analyticsClient->metrics(['format' => 'invalid']),fn () => $analyticsClient->metrics(['segments' => 'false'])] as $invoke) {
    raises($invoke, Polymorfa\ValidationException::class);
}
$listener = stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
$address = stream_socket_get_name($listener, false);
fclose($listener);
$process = proc_open([PHP_BINARY,'-S',$address,__DIR__.'/analytics-server.php'], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes);
try {
    $http = new GuzzleHttp\Client(['http_errors' => false]);
    for ($attempt = 0;$attempt < 100;$attempt++) {
        try {
            $http->get('http://'.$address.'/ready');
            break;
        } catch (GuzzleHttp\Exception\ConnectException) {
            usleep(10000);
        }
    }
    $transport = new Polymorfa\HttpTransport($credential, 'http://'.$address);
    $r = (new Polymorfa\Resources\AnalyticsResource($transport))->metrics(['windowHours' => 24,'segments' => false]);
    check(str_contains($r->data, 'polymorfa_analytics_enabled 0'), 'Native Prometheus text');
    $r = (new Polymorfa\Resources\AnalyticsResource($transport, $p))->metrics(['format' => 'openmetrics']);
    check(str_ends_with($r->data, "# EOF\n"), 'Native OpenMetrics text');
} finally {
    proc_terminate($process);
    foreach ($pipes as $pipe) {
        fclose($pipe);
    } proc_close($process);
}
