<?php

declare(strict_types=1);
$mode = $argv[1] ?? 'valid';
$fixture = json_decode(file_get_contents(__DIR__.'/fixtures/d1-bridge-fixtures.json'), true, flags:JSON_THROW_ON_ERROR);
$server = stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
echo json_encode(['url' => 'http://'.stream_socket_get_name($server, false)])."\n";
flush();
$calls = 0;
$valid = true;
$nonces = [];
for (;;) {
    $read = [$server,STDIN];
    $write = $except = null;
    if (stream_select($read, $write, $except, 10) < 1) {
        break;
    }if (in_array(STDIN, $read, true)) {
        fgets(STDIN);
        break;
    }
    $peer = stream_socket_accept($server, 10);
    stream_set_timeout($peer, 5);
    $line = fgets($peer);
    $headers = [];
    while (($header = fgets($peer)) !== false && $header !== "\r\n") {
        [$name,$value] = explode(':', $header, 2);
        $headers[strtolower($name)] = trim($value);
    }
    $body = '';
    $length = (int)($headers['content-length'] ?? 0);
    while (strlen($body) < $length) {
        $part = fread($peer, $length - strlen($body));
        if ($part === false || $part === '') {
            break;
        }$body .= $part;
    }
    [$method,$path] = explode(' ', $line);
    $nonce = $headers['polymorfa-storage-nonce'] ?? '';
    $calls++;
    $valid = $valid && preg_match('/^[A-Za-z0-9_-]{43}$/D', $nonce) && !isset($nonces[$nonce]) && ($headers['authorization'] ?? '') === 'Bearer '.$fixture['secret'] && !isset($headers['cookie'],$headers['origin']) && ($headers['polymorfa-storage-signature'] ?? '') === 'v1='.hash_hmac('sha256', $nonce.'.'.$method.'.'.$path.'.'.$body, $fixture['secret']);
    $nonces[$nonce] = true;
    $status = 200;
    $extra = '';
    $data = ['atomicCommit' => true,'maxCommitSize' => 50,'maxGetSize' => 1000,'maxQuerySize' => 1000,'maxBodyBytes' => 8388608,'conditionalDeletes' => true,'setupAllowed' => true];
    if ($path === '/setup') {
        $data = ['ok' => true];
    }
    if ($path === '/get') {
        $data = [['_id' => 'kother','_rev' => $mode === 'malformed-row' ? 0 : 1,'_v' => new stdClass(),'sessionId' => 'other']];
    }
    if ($path === '/commit') {
        $data = ['ok' => false,'conflicts' => ['foreign']];
    }
    if ($path === '/query') {
        $data = [['_id' => 'kother:m1','_rev' => 1,'_v' => new stdClass(),'sessionId' => 'other','messageId' => 'm1','chatId' => 'chat','timestamp' => 1]];
        if ($mode === 'reordered-query') {
            $data = [['_id' => 'kexpected:m2','_rev' => 1,'_v' => new stdClass(),'sessionId' => 'expected','messageId' => 'm2','chatId' => 'chat','timestamp' => 2],['_id' => 'kexpected:m1','_rev' => 1,'_v' => new stdClass(),'sessionId' => 'expected','messageId' => 'm1','chatId' => 'chat','timestamp' => 1]];
        }
    }

    $envelope = ['contract' => 'polymorfa-d1-storage-v1','schemaVersion' => 2,'authority' => $fixture['authority'],'tablePrefix' => $fixture['tablePrefix'],'data' => $data];
    if ($mode === 'authority') {
        $envelope['authority'] = 'other';
    }if ($mode === 'prefix') {
        $envelope['tablePrefix'] = 'other_';
    }if ($mode === 'schema') {
        $envelope['schemaVersion'] = 3;
    }if ($mode === 'capabilities') {
        $envelope['data']['atomicCommit'] = false;
    }
    $raw = json_encode($envelope);
    if ($mode === 'oversize') {
        $raw = str_repeat('x', 8388609);
    }
    $signature = 'v1='.hash_hmac('sha256', $nonce.'.200.'.$raw, $fixture['secret']);
    if ($mode === 'nonce') {
        $nonce = str_repeat('A', 43);
    }if ($mode === 'signature') {
        $signature = 'v1='.str_repeat('0', 64);
    }if ($mode === 'body') {
        $raw .= ' ';
    }
    if ($mode !== 'unsigned') {
        $extra = "Polymorfa-Storage-Nonce: $nonce\r\nPolymorfa-Storage-Signature: $signature\r\n";
    }
    if ($mode === 'redirect') {
        $status = 302;
        $extra = "Location: http://127.0.0.1:1/private?capability=synthetic\r\n";
    }
    if ($mode === 'stall') {
        fwrite($peer, "HTTP/1.1 200 Fixture\r\nContent-Length: 100\r\nConnection: close\r\n\r\n");
        usleep(300000);
    } else {
        @fwrite($peer, "HTTP/1.1 $status Fixture\r\nContent-Type: application/json\r\n$extra".'Content-Length: '.strlen($raw)."\r\nConnection: close\r\n\r\n".$raw);
    }
    fclose($peer);
}
fclose($server);
echo json_encode(['calls' => $calls,'valid' => (bool)$valid])."\n";
flush();
