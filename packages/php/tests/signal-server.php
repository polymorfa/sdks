<?php

declare(strict_types=1);
$mode = $argv[1] ?? 'valid';
$fixture = json_decode(file_get_contents(__DIR__.'/fixtures/signal-sidecar.json'), true, flags:JSON_THROW_ON_ERROR);
$server = stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
echo json_encode(['url' => 'http://'.stream_socket_get_name($server, false)])."\n";
flush();
$calls = $acks = $sends = 0;
$valid = true;
$streams = [];
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
    $calls++;
    foreach (['cookie','origin','polymorfa-version','last-event-id','x-caller-private'] as $name) {
        $valid = $valid && !isset($headers[$name]);
    }
    $status = 200;
    $reply = '{}';
    $extra = '';
    if ($path === '/healthz') {
        $valid = $valid && !isset($headers['authorization']);
        $reply = '{"status":"ok"}';
    } else {
        $valid = $valid && ($headers['authorization'] ?? '') === 'Bearer '.$fixture['secret'];
        if ($path === '/v1/sessions') {
            $reply = '{"node_id":"fixture-node","sessions":[{"id":"session-fixture","lease_generation":7,"claimed":true,"has_device_keys":true,"state":"connected","pn":null,"lid":null}]}';
        } elseif (str_ends_with($path, '/messages')) {
            $sends++;
            $data = json_decode($body, true, flags:JSON_THROW_ON_ERROR);
            $valid = $valid && $method === 'POST' && $data['to'] === 'target@lid' && count($data) === 2;
            if (isset($data['media'])) {
                $valid = $valid && $data['media']['kind'] === 'audio' && $data['media']['ptt'] === true && strlen(base64_decode($data['media']['media_key'], true)) === 32;
            } else {
                $valid = $valid && $data['text'] === 'fixture';
            }$reply = '{"message_id":"sent-fixture","server_timestamp":1720000000,"resent":false}';
        } elseif (str_ends_with($path, '/ack')) {
            $acks++;
            $valid = $valid && $method === 'POST';
            $status = $acks === 1 ? 204 : 404;
            $reply = $acks === 1 ? '' : '{"error":{"code":"unknown_event","message":"private data must not reach errors"}}';
        } elseif (str_starts_with($path, '/v1/events')) {
            if ($mode === 'headers') {
                usleep(300000);
                fclose($peer);
                continue;
            }
            $valid = $valid && $path === '/v1/events?session_id=session-fixture';
            if ($mode === 'cancel') {
                fwrite($peer, "HTTP/1.1 200 Fixture\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n: keepalive\n\n");
                $streams[] = $peer;
                continue;
            }
            $id = $mode === 'wrong-id' ? 'wrong' : $fixture['eventId'];
            $type = $mode === 'wrong-type' ? 'history.sync' : 'message';
            $frame = ": keepalive\r\nid: $id\r\nevent: $type\r\ndata: ".$fixture['rawBody']."\r\n\r\n";
            fwrite($peer, "HTTP/1.1 200 Fixture\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n".$frame);
            $streams[] = $peer;
            continue;
        } else {
            $status = 404;
        }
    }
    if ($mode === 'redirect') {
        $status = 302;
        $extra = "Location: http://127.0.0.1:1/private?capability=synthetic\r\n";
    }
    if ($mode === 'body') {
        fwrite($peer, "HTTP/1.1 200 Fixture\r\nContent-Type: application/json\r\nContent-Length: 100\r\nConnection: close\r\n\r\n");
        usleep(300000);
    } else {
        @fwrite($peer, "HTTP/1.1 $status Fixture\r\nContent-Type: application/json\r\n$extra".'Content-Length: '.strlen($reply)."\r\nConnection: close\r\n\r\n".$reply);
    }fclose($peer);
}
foreach ($streams as $stream) {
    fclose($stream);
}fclose($server);
echo json_encode(['valid' => (bool)$valid,'calls' => $calls,'acks' => $acks,'sends' => $sends])."\n";
flush();
