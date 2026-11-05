<?php

declare(strict_types=1);
require_once dirname(__DIR__).'/vendor/autoload.php';
require_once __DIR__.'/storage_engine_fixture.php';

use Polymorfa\Storage\{ClearChat,Engine,EventReducer,HistoryReducer,Rows,Schema,SqlAdapter,Upsert};
use Polymorfa\WebhookEvent;

// Historical MESSAGE_EDIT upserts honor chat.clear/chat.delete watermarks like the TS producer.
function editGuardCheck(bool $ok, string $message): void
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
function editGuardWire(Upsert|ClearChat $op): array
{
    if ($op instanceof ClearChat) {
        return ['kind' => 'clearChat','sessionId' => $op->sessionId,'chatId' => $op->chatId,'upTo' => $op->upTo];
    }
    $out = ['kind' => 'upsert','entity' => $op->entity,'key' => $op->key,'fields' => array_map(fn ($v) => ['value' => $v->value,'version' => $v->version], $op->fields)];
    if ($op->guard !== null) {
        $out['guard'] = get_object_vars($op->guard);
    }
    return $out;
}
$editGuardFixture = json_decode(file_get_contents(__DIR__.'/fixtures/history-edit-guard/fixture.json'), true, flags:JSON_THROW_ON_ERROR);
editGuardCheck(count($editGuardFixture['cases']) === 13, 'edit guard cases');
$editGuardMismatches = [];
foreach (['memory','sqlite'] as $kind) {
    foreach ($editGuardFixture['cases'] as $c) {
        if ($kind === 'memory') {
            $adapter = new StorageEngineMemory(1000);
        } else {
            $adapter = SqlAdapter::pdo(new PDO('sqlite::memory:'), 'edit_guard_');
            $adapter->setup();
        }
        $engine = new Engine($adapter);
        foreach ($c['steps'] as $i => $step) {
            if (isset($step['history'])) {
                $h = $step['history'];
                $batch = HistoryReducer::reduce($h['sessionId'], $h['chunk'], chunkId:$h['chunkId']);
            } else {
                $e = $step['event'];
                $batch = EventReducer::reduce(new WebhookEvent($e['id'], $e['session'], $e['timestamp'], $e['event'], $e['payload'], $e, true));
            }
            if (Rows::canonical(array_map(editGuardWire(...), $batch->operations)) !== Rows::canonical($step['operations'])) {
                $editGuardMismatches[] = $kind.' '.$c['name'].' step '.$i.' operations';
            }
            editGuardCheck($engine->apply($batch)->applied === $step['applied'], $c['name'].' applied '.$i);
        }
        foreach ($c['expect'] as $x) {
            $row = $engine->get($x['entity'], $x['key']);
            $text = $row === null ? null : ($row['text'] ?? null);
            editGuardCheck($text === $x['text'], $kind.' '.$c['name'].' text '.json_encode($text).' want '.json_encode($x['text']));
        }
        foreach ($c['rows'] as $entity => $rows) {
            foreach ($rows as $want) {
                $row = $engine->get($entity, array_intersect_key($want, array_flip(Schema::definition($entity)['key'])));
                editGuardCheck($row !== null && Rows::canonical($row) === Rows::canonical($want), $kind.' '.$c['name'].' rows '.$entity);
            }
        }
    }
}
editGuardCheck($editGuardMismatches === [], implode(', ', $editGuardMismatches));
echo 'History edit guard: '.count($editGuardFixture['cases'])." public memory/SQLite producer cases\n";
