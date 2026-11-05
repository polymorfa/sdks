<?php

declare(strict_types=1);
$customer = ['id' => 'customer','orgId' => 'org','projectId' => 'project','name' => null,'externalCustomerId' => null,'status' => 'active','isDefault' => false,'archivedAt' => null,'createdAt' => 1,'updatedAt' => 2];
$summary = $customer + ['numberCount' => 1,'connectedNumberCount' => 0,'activePairingLinkState' => null,'lastActivityAt' => null,'needsAttention' => false];
$status = ['enabled' => false,'enabledAt' => null,'enabledBy' => null,'defaultCustomer' => $customer];
$number = ['id' => 'number','customerId' => 'customer','sessionId' => 'support','name' => null,'phoneMasked' => null,'status' => 'stopped','backend' => null,'createdAt' => 1];
$event = ['id' => 'event','action' => 'update','fromStatus' => null,'toStatus' => null,'sessionId' => null,'pairingLinkId' => null,'metadata' => ['fields' => ['name']],'occurredAt' => 1];
$link = ['id' => 'link','orgId' => 'org','projectId' => 'project','customerId' => 'customer','expectedPhoneMasked' => null,'methods' => ['qr'],'locale' => null,'theme' => null,'expiresAt' => 100,'status' => 'active','attemptCount' => 0,'maxAttempts' => 2,'pendingSessionId' => null,'createdBy' => null,'reservedAt' => null,'openedAt' => null,'connectingAt' => null,'connectedAt' => null,'failedAt' => null,'expiredAt' => null,'revokedAt' => null,'lastErrorCode' => null,'failedExchangeCount' => 0,'phoneMismatchCount' => 0,'createdAt' => 1,'updatedAt' => 2];
$cases = [
 ['GET','/platform/projects/project/customers/status',null,['data' => $status],fn ($c) => $c->customers->status('project')],
 ['POST','/platform/projects/project/customers/enable',null,['data' => $status + ['migratedNumberCount' => 1]],fn ($c) => $c->customers->enable('project')],
 ['GET','/platform/customers?projectId=project&limit=2&isDefault=false&hasNumbers=true&needsAttention=false',null,['data' => [$summary],'page' => ['nextCursor' => null,'hasMore' => false]],fn ($c) => $c->customers->list(['projectId' => 'project','limit' => 2,'isDefault' => false,'hasNumbers' => true,'needsAttention' => false])],
 ['POST','/platform/customers',['projectId' => 'project','name' => null],['data' => $customer],fn ($c) => $c->customers->create(['projectId' => 'project','name' => null])],
 ['GET','/platform/customers/customer?projectId=project',null,['data' => $customer],fn ($c) => $c->customers->retrieve('customer', 'project')],
 ['PATCH','/platform/customers/customer',['name' => null,'externalCustomerId' => null],['data' => $customer],fn ($c) => $c->customers->update('customer', ['name' => null,'externalCustomerId' => null])],
 ['POST','/platform/customers/customer/archive',[],['data' => $customer],fn ($c) => $c->customers->archive('customer')],
 ['POST','/platform/customers/customer/restore',['projectId' => 'project'],['data' => $customer],fn ($c) => $c->customers->restore('customer', ['projectId' => 'project'])],
 ['GET','/platform/customers/customer/numbers?projectId=project',null,['data' => [$number]],fn ($c) => $c->customers->listNumbers('customer', 'project')],
 ['GET','/platform/customers/customer/events?projectId=project&limit=2',null,['data' => [$event]],fn ($c) => $c->customers->listEvents('customer', ['projectId' => 'project','limit' => 2])],
 ['POST','/platform/customers/customer/pairing-links',['expectedPhone' => null,'methods' => ['qr']],['data' => $link + ['url' => null]],fn ($c) => $c->customers->createPairingLink('customer', ['expectedPhone' => null,'methods' => ['qr']])],
 ['GET','/platform/customers/customer/pairing-links?projectId=project',null,['data' => [$link]],fn ($c) => $c->customers->listPairingLinks('customer', 'project')],
 ['DELETE','/platform/customers/customer/pairing-links/link?projectId=project',null,['data' => $link],fn ($c) => $c->customers->revokePairingLink('customer', 'link', 'project')],
 ['POST','/platform/customers/customer/numbers/support/transfer',['projectId' => 'project','sourceCustomerId' => 'other','confirm' => true],['data' => $number],fn ($c) => $c->customers->transferNumber('customer', 'support', ['projectId' => 'project','sourceCustomerId' => 'other','confirm' => true])],
];
nativeCases($cases, fn ($credential, $url) => new Polymorfa\Client($credential, baseUrl:$url));
