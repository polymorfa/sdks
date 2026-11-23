<?php

declare(strict_types=1);
$platformConnection = ['_id' => 'number','_creationTime' => 1,'projectId' => 'project','connectionId' => 'support','name' => 'support','phone' => null,'platform' => null,'isBusiness' => false,'testMode' => true,'tierOverride' => null,'status' => 'stopped','messageCount' => 0,'lastActiveAt' => null,'paidUntil' => null];
$connection = ['connectionId' => 'support','name' => 'support','tenantId' => 'team','type' => 'whatsapp','method' => 'linked_device','testMode' => true,'status' => 'stopped','createdAt' => '2026-10-11T00:00:00Z','updatedAt' => '2026-10-11T00:00:00Z'];
$quote = ['id' => 'quote','status' => 'queued','failureReason' => null,'expiresAtMs' => 100,'quote' => ['tier' => 'pro','tierOverride' => 'pro','amountCents' => 1.234567,'priceVersion' => '1','action' => 'upgrade','effectiveAtMs' => 90,'replacesWindowId' => null,'hybridTransition' => ['action' => 'merge','survivingConnectionId' => 'number','absorbConnectionId' => 'other','status' => 'scheduled']]];
$capabilities = ['connection' => 'support','projectId' => 'project','status' => 'synced','syncedAt' => '2026-10-11T00:00:00Z','checkedAt' => null,'accountType' => 'business','capabilities' => [['key' => 'channels','source' => 'server','kind' => 'feature','unit' => null,'value' => false],['key' => 'group.limit','source' => 'client_default','kind' => 'limit','unit' => 'members','value' => 10]]];
$cases = [
 ['GET','/platform/connections?projectId=project',null,['data' => [$platformConnection]],fn ($c) => $c->connections->list(['projectId' => 'project'])],
 ['GET','/platform/connections/support',null,['success' => true,'data' => $connection],fn ($c) => $c->connections->retrieve('support')],
 ['PUT','/platform/connections/support',['configuration' => ['set' => ['hms' => ['enabled' => false]]],'revision' => 2],['success' => true,'data' => $connection],fn ($c) => $c->connections->update('support', ['configuration' => ['set' => ['hms' => ['enabled' => false]]],'revision' => 2])],
 ['POST','/platform/connections/support/start',['projectId' => 'project'],['data' => ['starting' => true,'connectionId' => 'support']],fn ($c) => $c->connections->start('support', ['projectId' => 'project'])],
 ['POST','/platform/connections/support/stop',[],['data' => ['stopping' => true,'connectionId' => 'support']],fn ($c) => $c->connections->stop('support')],
 ['POST','/platform/connections/stop',['connectionIds' => ['support'],'projectId' => 'project'],['data' => ['stopping' => 1]],fn ($c) => $c->connections->stopMany(['connectionIds' => ['support'],'projectId' => 'project'])],
 ['DELETE','/platform/connections/support',null,['data' => ['removed' => true,'connectionId' => 'support']],fn ($c) => $c->connections->delete('support')],
 ['POST','/platform/connections/delete',['connectionIds' => ['support']],['data' => ['removed' => 1]],fn ($c) => $c->connections->deleteMany(['connectionIds' => ['support']])],
 ['POST','/platform/connections/support/tier-quotes',['tierOverride' => 'pro','hybridMerge' => ['absorbConnectionId' => 'other']],['data' => $quote],fn ($c) => $c->connections->quoteTierChange('support', ['tierOverride' => 'pro','hybridMerge' => ['absorbConnectionId' => 'other']])],
 ['GET','/platform/connections/support/tier-quotes/quote',null,['data' => $quote],fn ($c) => $c->connections->retrieveTierChange('support', 'quote')],
 ['PATCH','/platform/connections/support',['quoteId' => 'quote'],['data' => $quote],fn ($c) => $c->connections->setTierOverride('support', ['quoteId' => 'quote'])],
 ['GET','/platform/connections/support/capabilities',null,['data' => $capabilities],fn ($c) => $c->connections->getCapabilities('support')],
];
nativeCases($cases, fn ($credential, $url) => new Polymorfa\Client($credential, baseUrl:$url));
$guard = new Polymorfa\Client($credential);
raises(fn () => $guard->connections->quoteTierChange('support', ['tierOverride' => 'pro','hybridResolution' => ['action' => 'keep','transport' => 'linked_devices'],'hybridMerge' => ['absorbConnectionId' => 'other']]), Polymorfa\ValidationException::class);
raises(fn () => $guard->connections->setTierOverride('support', ['quoteId' => ' ']), Polymorfa\ValidationException::class);
