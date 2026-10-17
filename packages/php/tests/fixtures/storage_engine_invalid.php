<?php

declare(strict_types=1);

use Polymorfa\Storage\{Batch,Checkpoint,FieldWrite,Watermark};

// Intentionally invalid public calls for the negative static boundary check.
new FieldWrite('value', 'not-a-version');
new Batch('session', ['not-an-operation']);
new Checkpoint('session', 'events', 'cursor', expectedCursor:17);
new Watermark('session', 'chat', true);
