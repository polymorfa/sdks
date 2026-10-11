<?php

declare(strict_types=1);
$policy = ['blockedCountryCodes' => ['44','1876'],'optOutCount' => 1,'revision' => 2,'updatedAt' => null];
$opt = ['id' => 'o1','phoneNumber' => '+15551234567','bsuid' => null,'note' => null,'source' => 'api','createdAt' => '2026-10-11T00:00:00Z'];
nativeCases([
 ['GET','/platform/call-policy',null,['data' => $policy],fn ($c) => $c->retrieve(),$policy],
 ['PUT','/platform/call-policy',['blockedCountryCodes' => ['44','1876'],'expectedRevision' => 1],['data' => $policy],fn ($c) => $c->update(['blockedCountryCodes' => ['44','1876'],'expectedRevision' => 1]),$policy],
], fn ($credential, $url) => new Polymorfa\Resources\CallPolicy(new Polymorfa\HttpTransport($credential, $url)));
$retention = ['policy' => 'custom','retentionDays' => 120,'appliesTo' => ['call_records','call_events','client_reports'],'revision' => 2,'updatedAt' => null];
nativeCases([
 ['GET','/platform/call-retention',null,['data' => $retention],fn ($c) => $c->retrieve(),$retention],
 ['PUT','/platform/call-retention',['policy' => 'custom','retentionDays' => 120,'expectedRevision' => 1],['data' => $retention],fn ($c) => $c->update(['policy' => 'custom','retentionDays' => 120,'expectedRevision' => 1]),$retention],
], fn ($credential, $url) => new Polymorfa\Resources\CallRetention(new Polymorfa\HttpTransport($credential, $url)));
$import = ['added' => 1,'existing' => 1,'rejected' => [['index' => 2,'reason' => 'missing_identifier']]];
$entries = [['phoneNumber' => '+15551234567'],['bsuid' => 'business-user'],['note' => 'Missing identity']];
nativeCases([
 ['GET','/platform/call-opt-outs?limit=2&phoneNumber=%2B15551234567',null,['data' => [$opt],'page' => ['hasMore' => false,'nextCursor' => null]],fn ($c) => $c->list(['limit' => 2,'phoneNumber' => '+15551234567'])->response],
 ['POST','/platform/call-opt-outs',['phoneNumber' => '+15551234567'],['data' => $opt],fn ($c) => $c->create(['phoneNumber' => '+15551234567']),$opt],
 ['POST','/platform/call-opt-outs/import',['entries' => $entries],['data' => $import],fn ($c) => $c->import(['entries' => $entries]),$import],
 ['DELETE','/platform/call-opt-outs/o1',null,['data' => ['id' => 'o1','deleted' => true]],fn ($c) => $c->delete('o1'),['id' => 'o1','deleted' => true]],
], fn ($credential, $url) => new Polymorfa\Resources\CallOptOuts(new Polymorfa\HttpTransport($credential, $url)));
$policyClient = new Polymorfa\Resources\CallPolicy(new Polymorfa\HttpTransport($credential));
foreach ([['blockedCountryCodes' => ['+44']],['blockedCountryCodes' => array_fill(0, 301, '1')],['blockedCountryCodes' => [],'expectedRevision' => -1]] as $bad) {
    raises(fn () => $policyClient->update($bad), Polymorfa\ValidationException::class);
}
$optClient = new Polymorfa\Resources\CallOptOuts(new Polymorfa\HttpTransport($credential));
raises(fn () => $optClient->create(['phoneNumber' => 'a','bsuid' => 'b']), Polymorfa\ValidationException::class);
raises(fn () => $optClient->create([]), Polymorfa\ValidationException::class);
raises(fn () => $optClient->import(['entries' => []]), Polymorfa\ValidationException::class);
raises(fn () => $optClient->list(['phoneNumber' => 'a','bsuid' => 'b']), Polymorfa\ValidationException::class);
