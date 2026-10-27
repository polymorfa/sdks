<?php

declare(strict_types=1);
$platformSession = ['_id' => 'number','_creationTime' => 1,'projectId' => 'project','sessionId' => 'support','name' => 'support','phone' => null,'platform' => null,'isBusiness' => false,'testMode' => true,'tierOverride' => null,'status' => 'stopped','messageCount' => 0,'lastActiveAt' => null,'paidUntil' => null];
$session = ['sessionId' => 'support','name' => 'support','tenantId' => 'org','type' => 'linked_device','testMode' => true,'status' => 'stopped','createdAt' => '2026-10-11T00:00:00Z','updatedAt' => '2026-10-11T00:00:00Z'];
$quote = ['id' => 'quote','status' => 'queued','failureReason' => null,'expiresAtMs' => 100,'quote' => ['tier' => 'pro','tierOverride' => 'pro','amountCents' => 1.234567,'priceVersion' => '1','action' => 'upgrade','effectiveAtMs' => 90,'replacesWindowId' => null,'hybridTransition' => ['action' => 'merge','survivingNumberId' => 'number','absorbNumberId' => 'other','status' => 'scheduled']]];
$capabilities = ['session' => 'support','projectId' => 'project','status' => 'synced','syncedAt' => '2026-10-11T00:00:00Z','checkedAt' => null,'accountType' => 'business','capabilities' => [['key' => 'channels','source' => 'server','kind' => 'feature','unit' => null,'value' => false],['key' => 'group.limit','source' => 'client_default','kind' => 'limit','unit' => 'members','value' => 10]]];
$cases = [
 ['GET','/platform/sessions?projectId=project',null,['data' => [$platformSession]],fn ($c) => $c->sessions->list(['projectId' => 'project'])],
 ['GET','/platform/sessions/support',null,['success' => true,'data' => $session],fn ($c) => $c->sessions->retrieve('support')],
 ['PUT','/platform/sessions/support',['configuration' => ['set' => ['hms' => ['enabled' => false]]],'revision' => 2],['success' => true,'data' => $session],fn ($c) => $c->sessions->update('support', ['configuration' => ['set' => ['hms' => ['enabled' => false]]],'revision' => 2])],
 ['POST','/platform/sessions/support/start',['projectId' => 'project'],['data' => ['starting' => true,'sessionId' => 'support']],fn ($c) => $c->sessions->start('support', ['projectId' => 'project'])],
 ['POST','/platform/sessions/support/stop',[],['data' => ['stopping' => true,'sessionId' => 'support']],fn ($c) => $c->sessions->stop('support')],
 ['POST','/platform/sessions/stop',['sessionIds' => ['support'],'projectId' => 'project'],['data' => ['stopping' => 1]],fn ($c) => $c->sessions->stopMany(['sessionIds' => ['support'],'projectId' => 'project'])],
 ['DELETE','/platform/sessions/support',null,['data' => ['removed' => true,'sessionId' => 'support']],fn ($c) => $c->sessions->delete('support')],
 ['POST','/platform/sessions/delete',['sessionIds' => ['support']],['data' => ['removed' => 1]],fn ($c) => $c->sessions->deleteMany(['sessionIds' => ['support']])],
 ['POST','/platform/sessions/support/tier-quotes',['tierOverride' => 'pro','hybridMerge' => ['absorbNumberId' => 'other']],['data' => $quote],fn ($c) => $c->sessions->quoteTierChange('support', ['tierOverride' => 'pro','hybridMerge' => ['absorbNumberId' => 'other']])],
 ['GET','/platform/sessions/support/tier-quotes/quote',null,['data' => $quote],fn ($c) => $c->sessions->retrieveTierChange('support', 'quote')],
 ['PATCH','/platform/sessions/support',['quoteId' => 'quote'],['data' => $quote],fn ($c) => $c->sessions->setTierOverride('support', ['quoteId' => 'quote'])],
 ['GET','/platform/sessions/support/capabilities',null,['data' => $capabilities],fn ($c) => $c->sessions->getCapabilities('support')],
];
nativeCases($cases, fn ($credential, $url) => new Polymorfa\Client($credential, baseUrl:$url));
$guard = new Polymorfa\Client($credential);
raises(fn () => $guard->sessions->quoteTierChange('support', ['tierOverride' => 'pro','hybridResolution' => ['action' => 'keep','transport' => 'linked_devices'],'hybridMerge' => ['absorbNumberId' => 'other']]), Polymorfa\ValidationException::class);
raises(fn () => $guard->sessions->setTierOverride('support', ['quoteId' => ' ']), Polymorfa\ValidationException::class);
