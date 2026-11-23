<?php

declare(strict_types=1);

use Polymorfa\Storage\{Batch,Checkpoint,FieldWrite,Watermark};

// Intentionally invalid public calls for the negative static boundary check.
new FieldWrite('value', 'not-a-version');
new Batch('connection', ['not-an-operation']);
new Checkpoint('connection', 'events', 'cursor', expectedCursor:17);
new Watermark('connection', 'chat', true);
