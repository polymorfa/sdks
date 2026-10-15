<?php

declare(strict_types=1);
require_once __DIR__.'/storage_engine.php';

use Polymorfa\Storage\{Batch,ClearChat,Engine,FieldWrite,Schema,Upsert};

foreach (['slow','expired','stolen'] as $scenario) {
    $clock = 0;
    $adapter = new class () extends StorageEngineMemory {
        public ?Closure $onQuery = null;
        public function query(string $entity, array $query, ?Polymorfa\CancellationToken $cancellation = null): array
        {
            $result = parent::query($entity, $query, $cancellation);
            $this->onQuery?->__invoke($this);
            return $result;
        }
    };
    $engine = new Engine($adapter, leaseDurationMs:10000, now:static function () use (&$clock): int {
        return $clock;
    });
    $ops = [];
    foreach (['a','b','c'] as $id) {
        $ops[] = new Upsert('messages', ['sessionId' => 'renew','messageId' => $id], ['chatId' => new FieldWrite('chat', 0),'timestamp' => new FieldWrite(1, 0)]);
    }
    $engine->apply(new Batch('renew', $ops));
    $queries = 0;
    $leaseId = Schema::encodeKey('leases', ['sessionId' => 'renew']);
    $adapter->onQuery = static function ($memory) use (&$clock, &$queries, $scenario, $leaseId): void {
        $clock += $scenario === 'expired' ? 11000 : 4000;
        $queries++;
        if ($scenario === 'stolen' && $queries === 2) {
            $memory->rows['leases'][$leaseId]['_rev']++;
            $memory->rows['leases'][$leaseId]['owner'] = 'replacement-owner';
            $memory->rows['leases'][$leaseId]['expiresAt'] = $clock + 10000;
        }
    };
    $batch = new Batch('renew', [new ClearChat('renew', 'chat', 1)], 'clear-event');
    if ($scenario === 'slow') {
        storageCheck($engine->apply($batch)->applied && $clock > 10000 && $adapter->rows['messages'] === [], 'slow clear renews unchanged10sTTL before child queries');
        $renewals = 0;
        foreach ($adapter->commits as $writes) {
            if (count($writes) === 1 && $writes[0]['entity'] === 'leases' && isset($writes[0]['expectedRev']) && $writes[0]['row']['owner'] !== null) {
                $renewals++;
            }
        } storageCheck($renewals >= 3, 'slow planner uses conditional fence-only lease renewals');
    } else {
        storageRaises(fn () => $engine->apply($batch), 'storage_lease_lost');
        storageCheck(count($adapter->rows['messages']) === 3 && !$engine->hasEvent('renew', 'clear-event'), 'expired/stolen planner cannot delete or mark event');
        if ($scenario === 'stolen') {
            storageCheck($adapter->rows['leases'][$leaseId]['owner'] === 'replacement-owner', 'stale cleanup never replaces successor lease');
        }
    }
}
echo "PHP clear planning: unchanged10sTTL with4s per query renews conditionally; expired/stolen writers cannot delete or advance markers.\n";

foreach (['slow','expired','stolen'] as $scenario) {
    $clock = 0;
    $reads = 0;
    $leaseId = Schema::encodeKey('leases', ['sessionId' => 'planning']);
    $adapter = new class () extends StorageEngineMemory {
        public ?Closure $onGet = null;
        public function get(string $entity, array $ids, ?Polymorfa\CancellationToken $cancellation = null): array
        {
            $result = parent::get($entity, $ids, $cancellation);
            if ($entity !== 'leases') {
                $this->onGet?->__invoke($this);
            } return $result;
        }
    };
    $adapter->onGet = static function ($memory) use (&$clock, &$reads, $scenario, $leaseId): void {
        $clock += $scenario === 'expired' ? 11000 : 4000;
        $reads++;
        if ($scenario === 'stolen' && $reads === 2) {
            $memory->rows['leases'][$leaseId]['_rev']++;
            $memory->rows['leases'][$leaseId]['owner'] = 'replacement-owner';
            $memory->rows['leases'][$leaseId]['expiresAt'] = $clock + 10000;
        }
    };
    $engine = new Engine($adapter, leaseDurationMs:10000, now:static function () use (&$clock): int {
        return $clock;
    });
    $batch = new Batch('planning', [
        new Upsert('chats', ['sessionId' => 'planning','chatId' => 'chat'], ['name' => new FieldWrite('chat', 0)]),
        new Upsert('contacts', ['sessionId' => 'planning','contactId' => 'contact'], ['pushName' => new FieldWrite('contact', 0)]),
        new Upsert('messages', ['sessionId' => 'planning','messageId' => 'message'], ['text' => new FieldWrite('message', 0)]),
    ], 'planning-event');
    if ($scenario === 'slow') {
        storageCheck($engine->apply($batch)->applied && $clock > 10000, 'bounded planning renews unchanged10sTTL between4s native reads');
    } else {
        storageRaises(fn () => $engine->apply($batch), 'storage_lease_lost');
        storageCheck(($adapter->rows['messages'] ?? []) === [] && ($adapter->rows['events'] ?? []) === [], 'expired/stolen planning performs no payload/marker write');
    }
}
echo "PHP bounded planning: slow marker/entity reads renew exact CAS fence; expired/stolen read planners remain refused.\n";
