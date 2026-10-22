<?php

declare(strict_types=1);
require_once dirname(__DIR__).'/vendor/autoload.php';
require_once __DIR__.'/storage_engine_fixture.php';

use Polymorfa\Storage\{Batch,ClearChat,Engine,FieldWrite,HistoryReducer,Reduction,Rows,Schema,SqlAdapter,StorageException,Upsert};

function numericCheck(bool $ok, string $message): void
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
function numericWire(Upsert $op): array
{
    $out = ['kind' => 'upsert','entity' => $op->entity,'key' => $op->key,'fields' => array_map(fn ($v) => ['value' => $v->value,'version' => $v->version], $op->fields)];
    if ($op->guard !== null) {
        $out['guard'] = get_object_vars($op->guard);
    }
    return $out;
}
$numericFixture = json_decode(file_get_contents(__DIR__.'/fixtures/numeric-storage/fixture.json'), true, flags:JSON_THROW_ON_ERROR);
foreach ($numericFixture['strings'] as $v) {
    $batch = HistoryReducer::reduce('numeric', ['syncType' => 3,'chunkOrder' => 16,'progress' => $v['input']]);
    $value = null;
    foreach ($batch->operations as $op) {
        if ($op instanceof Upsert && $op->entity === 'history_progress') {
            $value = $op->fields['progress']->value ?? null;
        }
    }
    numericCheck(($value === null ? null : bin2hex(pack('E', (float)$value))) === $v['bits'], 'public numeric bits '.json_encode($v['input']));
    $helper = Reduction::number($v['input']);
    numericCheck(($helper === null ? null : bin2hex(pack('E', (float)$helper))) === $v['bits'], 'helper bits');
}
foreach (['memory','sqlite'] as $kind) {
    foreach ($numericFixture['histories'] as $h) {
        if ($kind === 'memory') {
            $adapter = new StorageEngineMemory(1000);
        } else {
            $adapter = SqlAdapter::pdo(new PDO('sqlite::memory:'), 'numeric_');
            $adapter->setup();
        }
        $engine = new Engine($adapter);
        $assertRows = static function (array $expected) use ($engine, $h, $adapter): void {
            foreach ($expected as $entity => $rows) {
                $keys = [];
                foreach (array_merge($rows, $h['rows'][$entity]) as $row) {
                    $key = array_intersect_key($row, array_flip(Schema::definition($entity)['key']));
                    $keys[Schema::encodeKey($entity, $key)] = $key;
                }
                $actual = [];
                foreach ($keys as $key) {
                    $row = $engine->get($entity, $key);
                    if ($row !== null) {
                        $actual[] = Rows::canonical($row);
                    }
                }
                $want = array_map(Rows::canonical(...), $rows);
                sort($actual);
                sort($want);
                numericCheck($actual === $want, 'rows '.$entity);
                if ($adapter instanceof StorageEngineMemory) {
                    numericCheck(count($adapter->rows[$entity] ?? []) === count($rows), 'row count');
                }
            }
        };
        $batch = HistoryReducer::reduce('numeric', $h['chunk'], chunkId:$h['name']);
        numericCheck(Rows::canonical(array_map(numericWire(...), $batch->operations)) === Rows::canonical($h['operations']), 'public operations '.$h['name']);
        numericCheck($engine->apply($batch)->applied, 'apply');
        $assertRows($h['rows']);
        numericCheck(!$engine->apply($batch)->applied, 'replay');
        foreach ($h['cleanup'] as $i => $cleanup) {
            $ops = [];
            foreach ($cleanup['operations'] as $op) {
                $ops[] = $op['kind'] === 'clearChat' ? new ClearChat($op['sessionId'], $op['chatId'], $op['upTo']) : new Upsert($op['entity'], $op['key'], array_map(fn ($v) => new FieldWrite($v['value'], $v['version']), $op['fields']));
            }
            $engine->apply(new Batch('numeric', $ops));
            $engine->apply(new Batch('numeric', $batch->operations, 'late-'.$i));
            $assertRows($cleanup['rows']);
        }
    }
}
numericCheck(Reduction::number('16') === 16.0, 'explicit proto number');
foreach (['16',true,0,-1,1.5,9007199254740992,INF] as $revision) {
    numericCheck(!Schema::revision($revision), 'strict revision');
}
try {
    Rows::merge('messages', Rows::empty('messages', ['sessionId' => 'numeric','messageId' => 'strict']), ['timestamp' => new FieldWrite('16', 1)]);
    throw new RuntimeException('numeric string accepted as generic row');
} catch (StorageException) {
}
echo 'Numeric storage: '.count($numericFixture['strings']).' exact-bit vectors; '.count($numericFixture['histories'])." public memory/SQLite histories\n";
