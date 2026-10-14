<?php

declare(strict_types=1);
$mode = $argv[1] ?? 'direct';
$kind = $argv[2] ?? 'image';
$directory = getenv('HOME').'/.polymorfa-agent-work/php-media-upload-'.getmypid().'-'.bin2hex(random_bytes(8));
mkdir($directory, 0700, true);
$valid = true;
$grants = $posts = $probes = $finals = 0;
$uploaded = $firstBody = '';
$next = 0;
try {
    $config = "[req]\ndistinguished_name=dn\nreq_extensions=fixture\n[dn]\n[fixture]\nsubjectAltName=DNS:cdn.whatsapp.net,IP:127.0.0.1,DNS:localhost\nbasicConstraints=critical,CA:TRUE\n";
    file_put_contents($directory.'/openssl.cnf', $config);
    $options = ['config' => $directory.'/openssl.cnf','req_extensions' => 'fixture','x509_extensions' => 'fixture','private_key_bits' => 2048];
    $key = openssl_pkey_new($options);
    $csr = openssl_csr_new(['commonName' => 'cdn.whatsapp.net'], $key, $options);
    $cert = openssl_csr_sign($csr, null, $key, 1, $options);
    openssl_pkey_export($key, $private);
    openssl_x509_export($cert, $public);
    file_put_contents($directory.'/tls.pem', $public.$private);
    file_put_contents($directory.'/cert.pem', $public);
    chmod($directory.'/tls.pem', 0600);
    $context = stream_context_create(['ssl' => ['local_cert' => $directory.'/tls.pem']]);
    $server = stream_socket_server('tls://127.0.0.1:0', $errno, $error, STREAM_SERVER_BIND | STREAM_SERVER_LISTEN, $context);
    echo json_encode(['address' => stream_socket_get_name($server, false),'ca' => $directory.'/cert.pem'])."\n";
    flush();
    for (;;) {
        $read = [$server, STDIN];
        $write = $except = null;
        if (stream_select($read, $write, $except, 10) < 1) {
            throw new RuntimeException('Missing media upload fixture command.');
        }
        if (in_array(STDIN, $read, true)) {
            fgets(STDIN);
            break;
        }
        $peer = stream_socket_accept($server, 10);
        if ($peer === false) {
            throw new RuntimeException('Missing upload connection.');
        }
        stream_set_timeout($peer, 5);
        $line = fgets($peer);
        $headers = [];
        while (($header = fgets($peer)) !== false && $header !== "\r\n") {
            [$name, $value] = explode(':', $header, 2);
            $headers[strtolower($name)] = trim($value);
        }
        $target = explode(' ', $line)[1] ?? '';
        $path = parse_url($target, PHP_URL_PATH);
        parse_str(parse_url($target, PHP_URL_QUERY) ?? '', $query);
        $length = (int) ($headers['content-length'] ?? 0);
        $body = '';
        while (strlen($body) < $length && !feof($peer)) {
            $part = fread($peer, $length - strlen($body));
            if ($part === false || $part === '') {
                break;
            } $body .= $part;
        }
        $status = 200;
        $extraHeaders = '';
        $reply = '{}';
        $mapped = match ($kind) {
            'document' => 'file', 'ptt','audio' => 'voice', default => $kind
        };
        if ($mode === 'send' && str_ends_with($path, '/messages/send')) {
            $posts++;
            $data = json_decode($body, true, flags:JSON_THROW_ON_ERROR);
            $expectedDate = $posts === 1 ? '2026-10-14' : ($posts === 2 ? '2026-09-22' : '2026-12-01');
            $valid = $valid && ($headers['polymorfa-version'] ?? '') === $expectedDate && isset($headers['idempotency-key']) && str_starts_with($headers['authorization'] ?? '', 'Bearer ');
            if ($posts !== 2) {
                $media = $data['content'][$mapped];
                $wire = $media['descriptor'];
                $valid = $valid && $wire['mediaKey'] === base64_encode(str_repeat(chr(24), 32)) && $wire['fileLength'] === 25 && count($data['content']) === 1 && !isset($media['url']) && !isset($media['base64']);
            }
            $reply = json_encode(['success' => true,'data' => ['id' => 'fixture','type' => $posts === 2 ? 'text' : $mapped,'content' => $data['content']]]);
        } elseif (str_ends_with($path, '/upload-grants')) {
            $grants++;
            $data = json_decode($body, true, flags:JSON_THROW_ON_ERROR);
            $valid = $valid && ($headers['polymorfa-version'] ?? '') === '2026-10-14' && str_starts_with($headers['authorization'] ?? '', 'Bearer ');
            $valid = $valid && $data['type'] === $mapped && count($data) === ($mapped === 'voice' ? 3 : 2);
            if ($mapped === 'voice') {
                $valid = $valid && $data['ptt'] === ($kind === 'ptt');
            }
            $hash = $data['fileEncSha256'];
            $grantKind = $mode === 'invalid-grant' ? 'wrong' : $kind;
            $reply = json_encode(['success' => true,'data' => ['host' => 'cdn.whatsapp.net','uploadUrl' => 'https://cdn.whatsapp.net/mms/'.$grantKind.'/'.$hash.'?auth=synthetic_grant_'.$grants.'&token=exact%2Btoken&media_id=exact-id&server_thumb_gen=1','expiresAt' => 2000000000]]);
        } elseif (str_ends_with($path, '/uploads')) {
            $posts++;
            $uploaded = $body;
            $sum = rtrim(strtr(base64_encode(hash('sha256', $body, true)), '+/', '-_'), '=');
            $valid = $valid && strlen($body) === $length && ($headers['content-type'] ?? '') === 'application/octet-stream' && ($headers['polymorfa-version'] ?? '') === '2026-10-14' && str_starts_with($headers['authorization'] ?? '', 'Bearer ') && $query['type'] === $mapped && $query['fileEncSha256'] === $sum;
            if ($mapped === 'voice') {
                $valid = $valid && $query['ptt'] === ($kind === 'ptt' ? 'true' : 'false');
            }
            $reply = '{"success":true,"data":{"directPath":"/fixture/path","url":"https://cdn.whatsapp.net/fixture/path"}}';
        } else {
            foreach (['authorization','cookie','polymorfa-version','idempotency-key','x-caller-private'] as $name) {
                $valid = $valid && !isset($headers[$name]);
            }
            $valid = $valid && ($headers['origin'] ?? '') === 'https://web.whatsapp.com' && ($headers['referer'] ?? '') === 'https://web.whatsapp.com/' && ($query['token'] ?? '') === 'exact+token' && ($query['media_id'] ?? '') === 'exact-id' && ($query['server_thumb_gen'] ?? '') === '1';
            if (($query['resume'] ?? '') === '1') {
                $probes++;
                $reply = '{"resume":"48"}';
            } elseif (isset($query['final_hash'])) {
                $finals++;
                $sum = rtrim(strtr(base64_encode(hash('sha256', $uploaded, true)), '+/', '-_'), '=');
                $valid = $valid && $query['final_hash'] === $sum;
                $reply = '{"direct_path":"/fixture/path","url":"https://cdn.whatsapp.net/fixture/path","handle":"fixture-handle"}';
            } else {
                $posts++;
                if ($mode === 'redirect') {
                    $status = 302;
                    $extraHeaders = "Location: https://cdn.whatsapp.net/escaped?capability=synthetic\r\n";
                } elseif (str_starts_with($mode, 'status') && $posts === 1) {
                    $status = (int) substr($mode, 6);
                    $firstBody = $body;
                } elseif (isset($query['stream'])) {
                    $valid = $valid && ($query['stream'] === '1') && ($query['bytestart'] === (string) $next) && strlen($body) === $length;
                    $next += strlen($body);
                    $valid = $valid && $query['byteend'] === (string) $next;
                    $uploaded .= $body;
                } else {
                    $uploaded = $body;
                    if ($probes > 0) {
                        $valid = $valid && $query['bytestart'] === '48' && $body === substr($firstBody, 48);
                        $uploaded = substr($firstBody, 0, 48).$body;
                    }
                    $sum = rtrim(strtr(base64_encode(hash('sha256', $uploaded, true)), '+/', '-_'), '=');
                    $valid = $valid && $sum === basename($path) && strlen($body) === $length;
                    $reply = '{"direct_path":"/fixture/path","url":"https://cdn.whatsapp.net/fixture/path"}';
                }
            }
        }
        if ($mode === 'stall' && $posts > 0) {
            fwrite($peer, "HTTP/1.1 200 Fixture\r\nContent-Type: application/json\r\nContent-Length: 100\r\nConnection: close\r\n\r\n");
            usleep(300000);
        } else {
            fwrite($peer, "HTTP/1.1 $status Fixture\r\nContent-Type: application/json\r\n$extraHeaders".'Content-Length: '.strlen($reply)."\r\nConnection: close\r\n\r\n".$reply);
        }
        fclose($peer);
    }
    fclose($server);
    echo json_encode(['valid' => $valid,'grants' => $grants,'posts' => $posts,'probes' => $probes,'finals' => $finals,'ciphertext' => base64_encode($uploaded)])."\n";
    flush();
} finally {
    foreach (['tls.pem','cert.pem','openssl.cnf'] as $file) {
        if (file_exists($directory.'/'.$file)) {
            unlink($directory.'/'.$file);
        }
    }
    rmdir($directory);
}
