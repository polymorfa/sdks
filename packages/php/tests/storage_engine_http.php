<?php

declare(strict_types=1);

require_once __DIR__.'/storage_engine.php';

use Polymorfa\{Credential,ProjectClient};
use Polymorfa\Storage\{ApiEventSource,Batch,Checkpoint,Engine,Sync};

$process = proc_open([PHP_BINARY,__DIR__.'/storage_engine_server.php'], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes);
storageCheck(is_resource($process), 'native storage event server starts');
try {
    $wire = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
    $adapter = new StorageEngineMemory();
    $engine = new Engine($adapter);
    $engine->apply(new Batch('*', [new Checkpoint('*', 'events', 'old', expectedCursor:null)]));
    $client = new ProjectClient(Credential::organizationApiKey('pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'), 'project', baseUrl:$wire['url']);
    $sync = null;
    $sync = new Sync(new ApiEventSource($client->events), $engine, onApplied:static function (array $item) use (&$sync, $engine): void {
        storageCheck($engine->getCheckpoint('*', 'events')['cursor'] === 'new', 'native cursor committed before return');
        $sync->close();
    });
    $sync->pump();
    $state = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
    storageCheck($state['valid'] && $state['calls'] === ['GET /platform/projects/project/events/stream','POST /platform/projects/project/events/stream/native-stream/ack'], 'actual native HTTP manual ACK and saved cursor');
    storageCheck($engine->hasEvent('s', 'evt-0-message.received') && $engine->get('messages', ['sessionId' => 's','messageId' => '5001'])['text'] === 'original', 'native encoded webhook reduced into customer storage');
} finally {
    proc_terminate($process);
    foreach ($pipes as $pipe) {
        fclose($pipe);
    } proc_close($process);
}
echo "PHP native Events HTTP -> decoded webhook -> storage -> checkpoint -> manual ACK proof passed.\n";
