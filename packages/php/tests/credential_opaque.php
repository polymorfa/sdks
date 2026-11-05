<?php
declare(strict_types=1);
$fixture = json_decode(file_get_contents(__DIR__.'/../../../contracts/machine-credentials.v1.json'), true, flags: JSON_THROW_ON_ERROR);
foreach ($fixture['opaque'] as $vector) {
    $factory = $vector['kind'] === 'key' ? 'organizationApiKey' : 'projectToken';
    Polymorfa\Credential::$factory($vector['token']);
    foreach ([str_replace('_A','_B',$vector['token']),$vector['token'].'=', $vector['token']."\n", substr($vector['token'],0,-1).'!'] as $bad) raises(fn () => Polymorfa\Credential::$factory($bad), Polymorfa\ConfigurationException::class);
}
foreach (array_merge($fixture['client']['cases'], $fixture['client']['rejections']) as $vector) Polymorfa\Credential::clientToken($vector['token']);
foreach ([400,13000] as $size) {
    $raw = str_repeat("\0",$size);
    $body = rtrim(strtr(base64_encode($raw.pack('N',crc32($raw))),'+/','-_'),'=');
    foreach (['organizationApiKey'=>'pmfa_','projectToken'=>'pmfa_pt_'] as $factory=>$prefix) {
        $value=$prefix.$body; $credential=Polymorfa\Credential::$factory($value);
        if (strlen($value)<=512 || str_contains(print_r($credential,true),$value)) throw new RuntimeException('Credential growth/redaction failed');
    }
    Polymorfa\Credential::clientToken('pmfa_ct_'.rtrim(strtr(base64_encode($raw),'+/','-_'),'='));
}
$token=$fixture['client']['cases'][0]['token']; $raw=base64_decode(strtr(substr($token,8),'-_','+/')); $raw[strlen($raw)-1]=chr(ord($raw[strlen($raw)-1])^1);
Polymorfa\Credential::clientToken('pmfa_ct_'.rtrim(strtr(base64_encode($raw),'+/','-_'),'='));

$method = new ReflectionMethod(Polymorfa\HttpTransport::class, 'redactError');
$secret = 'pmfa_ct_'.str_repeat('A',17000);
$redacted = $method->invoke(null,['message'=>$secret,'details'=>['apiKey'=>'synthetic','projectToken'=>$secret,'nested'=>[$secret]]]);
if (str_contains(json_encode($redacted, JSON_THROW_ON_ERROR),$secret) || str_contains(json_encode($redacted, JSON_THROW_ON_ERROR),'synthetic')) throw new RuntimeException('Error credential leaked');

$values=[];
foreach ($fixture['opaque'] as $v) $values[]=[$v['kind']==='key'?'organizationApiKey':'projectToken',$v['token']];
foreach ($fixture['client']['cases'] as $v) $values[]=['clientToken',$v['token']];
$values[]=['clientToken','pmfa_ct_'.rtrim(strtr(base64_encode(str_repeat("\0",600)),'+/','-_'),'=')];
foreach ($values as [$factory,$token]) {
    $history=[];
    $http=mocked([jsonResponse(['error'=>['code'=>'unauthorized','message'=>$token,'details'=>['apiKey'=>'synthetic','projectToken'=>$token]]],401)],$history);
    $sdk=new Polymorfa\MessagingClient(Polymorfa\Credential::$factory($token),http:$http,maxNetworkRetries:0);
    $error=raises(fn ()=>$sdk->profile->get('s'),Polymorfa\AuthenticationException::class);
    check($history[0]['request']->getHeaderLine('Authorization')==='Bearer '.$token,'Credential changed');
    check(!str_contains($error->getMessage(),$token),'Error credential leaked');
}
