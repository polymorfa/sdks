<?php

declare(strict_types=1);
$record = ['callId' => 'c1','projectId' => 'p1','sessionId' => 'support','direction' => 'outbound','upstream' => 'linked_device','outcome' => 'answered','state' => 'ended','hasVideo' => true,'peerRef' => 'opaque','startedAt' => '2026-10-11T00:00:00Z','connectedAt' => '2026-10-11T00:00:01Z','endedAt' => '2026-10-11T00:00:03Z','durationSeconds' => 1.234567,'endReason' => 'remote_hangup'];
$detail = ['call' => array_diff_key($record, ['upstream' => true,'outcome' => true]) + ['live' => false,'backend' => 'linked_device','endReason' => ['code' => 'remote_hangup','label' => 'Ended'],'answeredBy' => null,'exclusive' => null],'participants' => [['id' => 'participant1','state' => 'left','firstSeenAt' => '2026-10-11T00:00:00Z','updatedAt' => '2026-10-11T00:00:03Z','leftReason' => null]],'connections' => [['id' => 'connection1','participant' => 'server:participant1','transport' => 'socket','joinedAt' => null,'leftAt' => null,'reason' => null]],'telemetry' => ['status' => 'reported','source' => 'media_server','setupMs' => 12.5,'ringMs' => null,'codec' => 'opus','jitterMs' => null,'packetsLost' => null,'rttMs' => null,'receivedKbps' => null,'sentKbps' => null],'appReports' => ['status' => 'reported','connections' => [['connectionId' => 'connection1','participant' => 'server:participant1','client' => ['sdk' => 'php','version' => 'dev','platform' => 'other'],'quality' => ['reportedAt' => '2026-10-11T00:00:03Z','rttMs' => 12.5,'jitterMs' => null,'packetsLost' => null,'packetsReceived' => null,'audioCodec' => 'opus','videoCodec' => null,'candidateType' => 'relay','reconnects' => null],'errors' => [['code' => 'media_timeout','reportedAt' => '2026-10-11T00:00:03Z']]]],'truncated' => false],'history' => ['events' => [['eventId' => 'e1','type' => 'call.ended','occurredAt' => '2026-10-11T00:00:03Z']],'truncated' => false],'correlation' => ['callId' => 'c1','sessionId' => 'support']];
$detail['call']['endReason'] = ['code' => 'remote_hangup','label' => 'Ended'];
$metrics = ['calls' => 1,'answered' => 1,'missed' => 0,'declined' => 0,'failed' => 0,'inProgress' => 0,'answerRate' => 1,'totalDurationSeconds' => 1.234567,'averageDurationSeconds' => 1.234567];
$stats = ['since' => '2026-10-11T00:00:00Z','until' => '2026-10-12T00:00:00Z','timezone' => 'UTC','groupBy' => 'session','totals' => $metrics,'groups' => [$metrics + ['key' => 'support','start' => null]],'groupsTruncated' => false,'heatmap' => [['dayOfWeek' => 7,'hour' => 0,'calls' => 1,'answered' => 1]]];
nativeCases([
 ['GET','/platform/calls/c1?projectId=p1',null,['data' => $detail],fn ($c) => $c->retrieve('c1'),$detail],
 ['GET','/platform/calls/stats?projectId=p1&direction=outbound&groupBy=session&timezone=UTC',null,['data' => $stats],fn ($c) => $c->stats(['direction' => 'outbound','groupBy' => 'session','timezone' => 'UTC']),$stats],
 ['GET','/platform/calls?projectId=p1&limit=2',null,['data' => [$record],'page' => ['hasMore' => false,'nextCursor' => null]],fn ($c) => $c->list(['limit' => 2])->response],
], fn ($credential, $url) => new Polymorfa\Resources\CallRecords(new Polymorfa\HttpTransport($credential, $url), 'p1'));
$c = new Polymorfa\Resources\CallRecords(new Polymorfa\HttpTransport($credential), 'p1');
foreach ([fn () => $c->list(['projectId' => 'other']),fn () => $c->list(['limit' => 101]),fn () => $c->list(['since' => '2026-02-30T00:00:00Z']),fn () => $c->stats(['direction' => 'other']),fn () => $c->retrieve('with space')] as $invoke) {
    raises($invoke, Polymorfa\ConfigurationException::class);
}
$mock = new GuzzleHttp\Handler\MockHandler([
 new GuzzleHttp\Psr7\Response(200, ['content-type' => 'text/csv','polymorfa-next-cursor' => 'next'], "callId\r\nc1\r\n"),
 new GuzzleHttp\Psr7\Response(200, ['content-type' => 'text/csv'], "callId\r\nc2\r\n"),
 new GuzzleHttp\Psr7\Response(200, ['content-type' => 'application/x-ndjson'], "{\"callId\":\"c1\"}\n"),
 new GuzzleHttp\Psr7\Response(200, ['content-type' => 'text/csv','polymorfa-next-cursor' => 'again'], "callId\r\nc1\r\n"),
]);
$exports = new Polymorfa\Resources\CallRecords(new Polymorfa\HttpTransport($credential, 'https://api.example', http:new GuzzleHttp\Client(['handler' => $mock])), 'p1');
check(implode('', iterator_to_array($exports->exportAll())) === "callId\r\nc1\r\nc2\r\n", 'CSV export header occurs once');
check($exports->export(['format' => 'ndjson'])->data['body'] === "{\"callId\":\"c1\"}\n", 'NDJSON export');
raises(fn () => iterator_to_array($exports->exportAll(['cursor' => 'again'])), Polymorfa\ServerException::class);
$listener = stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
$address = stream_socket_get_name($listener, false);
fclose($listener);
$process = proc_open([PHP_BINARY,'-S',$address,__DIR__.'/call-export-server.php'], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes);
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
    $wireExports = new Polymorfa\Resources\CallRecords(new Polymorfa\HttpTransport($credential, 'http://'.$address), 'p1');
    check(implode('', iterator_to_array($wireExports->exportAll())) === "callId\r\nc1\r\nc2\r\n", 'Native CSV export pagination');
    $r = $wireExports->export(['format' => 'ndjson']);
    check($r->data['body'] === "{\"callId\":\"c1\"}\n" && $r->metadata->requestId === 'call_export_wire', 'Native NDJSON export and metadata');
} finally {
    proc_terminate($process);
    foreach ($pipes as $pipe) {
        fclose($pipe);
    } proc_close($process);
}
