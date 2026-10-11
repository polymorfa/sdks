<?php

declare(strict_types=1);

require dirname(__DIR__,2).'/packages/php/vendor/autoload.php';

use Polymorfa\{AudioFrame,Credential,MediaSocket};

$socket=new MediaSocket(Credential::organizationApiKey((string)getenv('POLYMORFA_API_KEY')),
    (string)getenv('POLYMORFA_CALL_ID'),(string)getenv('POLYMORFA_CONNECTION_ID'),
    participant:(string)getenv('POLYMORFA_PARTICIPANT'));
try {
    $socket->connect();$frame=$socket->receive();
    if($frame instanceof AudioFrame) { echo count($frame->samples)." PCM samples received\n"; }
    $socket->leave();
} finally { $socket->close(); }
