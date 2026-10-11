<?php

declare(strict_types=1);
$directory = getenv('HOME').'/.polymorfa-agent-work/php-voice-fixture-'.getmypid();
mkdir($directory, 0700, true);
try {
    $key = openssl_pkey_new(['private_key_bits' => 2048]);
    $csr = openssl_csr_new(['commonName' => '127.0.0.1'], $key);
    $cert = openssl_csr_sign($csr, null, $key, 1);
    openssl_pkey_export($key, $private);
    openssl_x509_export($cert, $public);
    file_put_contents($directory.'/tls.pem', $public.$private);
    chmod($directory.'/tls.pem', 0600);
    $context = stream_context_create(['ssl' => ['local_cert' => $directory.'/tls.pem']]);
    $server = stream_socket_server('tls://127.0.0.1:0', $errno, $error, STREAM_SERVER_BIND | STREAM_SERVER_LISTEN, $context);
    echo json_encode(['url' => 'https://'.stream_socket_get_name($server, false).'/upload'])."\n";
    flush();
    $peer = stream_socket_accept($server, 10);
    if ($peer === false) {
        throw new RuntimeException('No storage request.');
    } stream_set_timeout($peer, 5);
    $request = fgets($peer);
    $headers = [];
    while (($line = fgets($peer)) !== false && $line !== "\r\n") {
        [$name,$value] = explode(':', $line, 2);
        $headers[strtolower($name)] = trim($value);
    }
    $bytes = '';
    $length = (int)($headers['content-length'] ?? 0);
    while (strlen($bytes) < $length) {
        $part = fread($peer, $length - strlen($bytes));
        if ($part === false || $part === '') {
            throw new RuntimeException('Incomplete audio input.');
        } $bytes .= $part;
    }
    $valid = $request === "POST /upload HTTP/1.1\r\n" && $bytes === 'abc' && ($headers['x-fixture'] ?? null) === 'audio';
    foreach (['authorization','cookie','idempotency-key','polymorfa-version'] as $name) {
        if (isset($headers[$name])) {
            $valid = false;
        }
    }
    $status = $valid ? 200 : 400;
    fwrite($peer, "HTTP/1.1 $status Fixture\r\ncontent-length:0\r\nconnection:close\r\n\r\n");
    fclose($peer);
    fclose($server);
    echo json_encode(['valid' => $valid])."\n";
    flush();
} finally {
    if (is_file($directory.'/tls.pem')) {
        unlink($directory.'/tls.pem');
    } rmdir($directory);
}
