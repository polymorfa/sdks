<?php

declare(strict_types=1);

namespace PolymorfaExample;

use Polymorfa\{MessagingClient,RequestOptions,WebhookEvent};

/** Private application-owned example state. Never HMS; bounded and manually reset. */
final class Conversation
{
    public function __construct(private string $directory, private string $session, private string $peer, private MessagingClient $client) {}

    private function update(callable $operation): mixed
    {
        $previous = umask(0077);
        $lock = fopen($this->directory.'/conversation.lock', 'c+');
        try {
            if ($lock === false || !flock($lock, LOCK_EX)) { throw new \RuntimeException('State unavailable.'); }
            $path = $this->directory.'/conversation.json';
            $state = is_file($path) ? json_decode((string)file_get_contents($path), true, flags:JSON_THROW_ON_ERROR) : ['scope'=>hash('sha256',$this->session.':'.$this->peer),'messages'=>[],'attempts'=>[],'eventIds'=>[],'peerId'=>'','receivedEvents'=>0,'lastEvent'=>''];
            if (($state['scope']??null)!==hash('sha256',$this->session.':'.$this->peer)) { throw new \RuntimeException('Use a distinct state directory for this Number and recipient.'); }
            $result = $operation($state);
            if (file_put_contents($path,json_encode($state,JSON_THROW_ON_ERROR),LOCK_EX) === false) { throw new \RuntimeException('State unavailable.'); }
            return $result;
        } finally {
            if (is_resource($lock)) { flock($lock,LOCK_UN);fclose($lock); }
            umask($previous);
        }
    }
    public function snapshot(): array
    {
        return $this->update(fn(array &$state): array => ['messages'=>$state['messages'],'peer'=>$this->peer,'session'=>$this->session,'receivedEvents'=>$state['receivedEvents'],'lastEvent'=>$state['lastEvent']]);
    }
    public function send(string $raw, string $key): array
    {
        try { $body = json_decode($raw,true,flags:JSON_THROW_ON_ERROR); } catch (\JsonException) { $body = null; }
        if (strlen($raw)>16384 || !is_array($body) || array_keys($body)!==['text'] || !is_string($body['text']) || trim($body['text'])==='' || strlen($body['text'])>4096 || !preg_match('/^[a-fA-F0-9]{8}(?:-[a-fA-F0-9]{4}){3}-[a-fA-F0-9]{12}$/D',$key)) { return [400,['error'=>'send_text_with_uuid_key']]; }
        $previous=umask(0077);$lock=fopen($this->directory.'/send.lock','c+');umask($previous);
        if ($lock===false) { throw new \RuntimeException('State unavailable.'); }
        if (!flock($lock,LOCK_EX|LOCK_NB)) { fclose($lock);return [429,['error'=>'send_in_progress']]; }
        try {
            $prior=$this->update(function(array &$state) use($key,$body): ?array {
                if (isset($state['attempts'][$key])) {
                    $attempt=$state['attempts'][$key];
                    if ($attempt['text']!==$body['text']) { return [409,['error'=>'key_has_different_text']]; }
                    if ($attempt['message']!==null) { return [200,$attempt['message']]; }
                } else {
                    if (count($state['attempts'])>=128) { return [429,['error'=>'example_send_capacity_reached']]; }
                    $state['attempts'][$key]=['text'=>$body['text'],'message'=>null];
                }
                return null;
            });
            if ($prior!==null) { return $prior; }
            try {
                $response=$this->client->messages->send($this->session,['conversation'=>['phoneNumber'=>$this->peer],'content'=>['text'=>$body['text']]],new RequestOptions(timeout:60,idempotencyKey:$key));
                $receipt=$response->data['data'];$timestamp=strtotime($receipt['timestamp']);
                if (!$response->data['success'] || !$receipt['id'] || $timestamp===false) { throw new \RuntimeException('Invalid receipt.'); }
                $message=['id'=>$receipt['id'],'clientId'=>$key,'text'=>$body['text'],'createdAt'=>$timestamp*1000,'direction'=>'outbound','status'=>'sent','receipt'=>$receipt['status']];
                $this->update(function(array &$state) use($key,$receipt,$message): void {
                    $state['peerId']=$receipt['conversation']['id']??$state['peerId'];
                    self::upsert($state,$message);$state['attempts'][$key]['message']=$message;
                });
                return [200,$message];
            } catch (\Throwable) { return [502,['error'=>'send_outcome_unknown_retry_same_key']]; }
        } finally { flock($lock,LOCK_UN);fclose($lock); }
    }
    private static function upsert(array &$state, array $message): void
    {
        foreach ($state['messages'] as $i=>$old) { if ($old['id']===$message['id']) { $state['messages'][$i]=$message;return; } }
        $state['messages'][]=$message;$state['messages']=array_slice($state['messages'],-100);
    }
    public function receive(WebhookEvent $event): void
    {
        if ($event->session!==$this->session || !is_array($event->payload)) { return; }
        $this->update(function(array &$state) use($event): void {
            if (in_array($event->id,$state['eventIds'],true)) { return; }
            $p=$event->payload;$c=$p['conversation']??[];
            $assigned=$state['peerId']!=='' ? ($c['id']??null)===$state['peerId'] : ltrim($c['phoneNumber']??'','+')===ltrim($this->peer,'+');
            if (!$assigned) { return; }
            if ($event->event==='message.received') {
                if (($p['fromMe']??null)!==false || ($p['isGroup']??null)!==false || !is_string($p['text']??null) || $p['text']==='' || strlen($p['text'])>4096 || !is_string($p['id']??null) || (!is_int($p['timestamp']??null) && !is_float($p['timestamp']??null))) { return; }
                self::upsert($state,['id'=>$p['id'],'text'=>$p['text'],'createdAt'=>(int)($p['timestamp']*1000),'direction'=>'inbound','status'=>'sent','receipt'=>'received']);
            } elseif ($event->event==='message.ack') {
                $ranks=['sent'=>1,'server'=>1,'delivered'=>2,'delivery'=>2,'read'=>3,'played'=>3];
                $ids=array_column($p['messages']??[],'id');$receipt=$p['type']??'';
                foreach ($state['messages'] as &$message) { if ($message['direction']==='outbound' && in_array($message['id'],$ids,true) && ($ranks[$receipt]??0)>($ranks[$message['receipt']]??0)) { $message['receipt']=$receipt; } }unset($message);
            } else { return; }
            $state['eventIds']=array_slice([...$state['eventIds'],$event->id],-1024);$state['receivedEvents']++;$state['lastEvent']=$event->event;
        });
    }
}
