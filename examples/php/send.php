<?php

declare(strict_types=1);

require dirname(__DIR__,2).'/packages/php/vendor/autoload.php';

use Polymorfa\{Credential,MessagingClient,RequestOptions};

$client=new MessagingClient(Credential::organizationApiKey((string)getenv('POLYMORFA_API_KEY')));
$response=$client->messages->send((string)getenv('POLYMORFA_SESSION'),[
    'conversation'=>['phoneNumber'=>(string)getenv('POLYMORFA_RECIPIENT')],
    'content'=>['text'=>'Hello from PHP'],
],new RequestOptions(idempotencyKey:(string)getenv('POLYMORFA_IDEMPOTENCY_KEY')));
echo $response->data['data']['id']."\n";
