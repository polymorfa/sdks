<?php

declare(strict_types=1);
$passkeyCredential = \Polymorfa\Credential::organizationApiKey('pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k');
$f = json_decode(file_get_contents(dirname(__DIR__,3).'/contracts/fixtures/passkeys.candidate.json'),true,512,JSON_THROW_ON_ERROR);
$cases = [
 ['POST','/challenge',$f['issue'],'ticket',fn($c) => $c->passkeys->issueChallenge($f['session'],$f['issue'])],
 ['GET','/challenge/'.rawurlencode($f['ticketId']),null,'ticket',fn($c) => $c->passkeys->getChallenge($f['session'],$f['ticketId'])],
 ['POST','/assertion',$f['assertion'],'assertionResult',fn($c) => $c->passkeys->submitAssertion($f['session'],$f['assertion'])],
 ['GET','/confirmation',null,null,fn($c) => $c->passkeys->getConfirmation($f['session'])],
 ['POST','/confirmation',$f['confirm'],null,fn($c) => $c->passkeys->confirm($f['session'],$f['confirm'])],
];
foreach ($cases as [$method,$suffix,$body,$key,$invoke]) {
 $reply = ['success'=>true,'data'=>$key === null ? ['status'=>'waiting_for_pairing','skipHandoffUX'=>false] : $f[$key]];
 $history=[]; $client=new \Polymorfa\MessagingClient($passkeyCredential,http:mocked([jsonResponse($reply)],$history));
 check($invoke($client)->data === $reply,'passkey response');
 $r=$history[0]['request']; check($r->getMethod()===$method && $r->getUri()->getPath()==='/messaging/desk%2F1/passkey'.$suffix,'passkey path');
 check($r->getHeaderLine('Authorization')==='Bearer pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k' && $r->hasHeader('Polymorfa-Version'),'passkey headers');
 check($body === null || json_decode((string)$r->getBody(),true)===$body,'passkey body');
}
foreach ($f['statuses'] as $status) {
 $h=[]; $c=new \Polymorfa\MessagingClient($passkeyCredential,http:mocked([jsonResponse(['success'=>true,'data'=>['status'=>$status]])],$h));
 check($c->passkeys->getConfirmation('desk')->data['data']['status']===$status,'passkey outcome');
}
foreach (['issueChallenge'=>'issue','submitAssertion'=>'assertion','confirm'=>'confirm'] as $method=>$key) {
 $h=[]; $c=new \Polymorfa\MessagingClient($passkeyCredential,http:mocked([jsonResponse(['error'=>['code'=>'future_passkey','message'=>'refused']],503)],$h));
 raises(fn()=>$c->passkeys->$method('desk',$f[$key],new \Polymorfa\RequestOptions(maxNetworkRetries:3,idempotencyKey:'caller-key')),\Polymorfa\ServerException::class);
 check(count($h)===1,'passkey write must not repeat');
}

foreach ($f['errors'] as $status) {
 $h=[]; $c=new \Polymorfa\MessagingClient($passkeyCredential,http:mocked([jsonResponse(['error'=>['code'=>'future_passkey','message'=>'refused']],$status)],$h));
 $e=raises(fn()=>$c->passkeys->confirm('desk',$f['confirm'],new \Polymorfa\RequestOptions(maxNetworkRetries:3,idempotencyKey:'caller')),\Polymorfa\PolymorfaException::class);
 check($e->status===$status && $e->errorCode==='future_passkey' && count($h)===1,'passkey refusal forwarding');
}
$h=[]; $c=new \Polymorfa\MessagingClient($passkeyCredential,http:mocked([],$h));
$bad=$f['assertion']; $bad['assertion']['id']=str_repeat('x',1365);
raises(fn()=>$c->passkeys->submitAssertion('desk',$bad),\Polymorfa\ValidationException::class);
$bad=$f['assertion']; $bad['assertion']['response']['signatureB64']=str_repeat('x',1048576);
raises(fn()=>$c->passkeys->submitAssertion('desk',$bad),\Polymorfa\ValidationException::class);
check(count($h)===0,'passkey bounds refuse before transport');
