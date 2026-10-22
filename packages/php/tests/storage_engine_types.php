<?php

declare(strict_types=1);

use Polymorfa\Storage\{Adapter,ApiEventSource,Batch,Checkpoint,ClearChat,Delete,Engine,FieldWrite,HistoryIdentityIndex,HistoryReducer,Patch,Sync,Upsert,Watermark};
use Polymorfa\Resources\Events;

/** Static public policy API usage, intentionally not executed against a network. */
function storageEngineTypedUsage(Adapter $adapter, Events $events): void
{
    $storage = new Engine($adapter);
    $storage->apply(new Batch('session', [
        new Upsert('messages', ['sessionId' => 'session','messageId' => 'm'], ['text' => new FieldWrite('body', 1)], new Watermark('session', 'chat', 1)),
        new Patch('messages', ['sessionId' => 'session','messageId' => 'm'], ['starred' => new FieldWrite(false, 2)]),
        new Delete('media', ['sessionId' => 'session','messageId' => 'm']),
        new ClearChat('session', 'chat', 2),
        new Checkpoint('session', 'events', 'cursor', expectedCursor:null),
    ], 'event', 'message.received'));
    HistoryReducer::reduce('session', ['syncType' => 2], new HistoryIdentityIndex(messages:[['nativeId' => 'wa','id' => 'opaque','chatId' => 'chat','fromMe' => false]]));
    $sync = new Sync(new ApiEventSource($events, 'project'), $storage);
    $sync->close();
}
