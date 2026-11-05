<?php

declare(strict_types=1);
$mode = $argv[1] ?? 'safe';
$directory = (getenv('POLYMORFA_TEST_WORK_DIR') ?: getenv('HOME').'/.polymorfa-agent-work').'/php-media-redirect-'.getmypid();
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
    echo json_encode(['url' => 'https://'.stream_socket_get_name($server, false).'/first'])."\n";
    flush();
    $count = $mode === 'safe' ? 3 : 1;
    $valid = true;
    for ($hop = 0; $hop < $count; ++$hop) {
        $peer = stream_socket_accept($server, 10);
        if ($peer === false) {
            throw new RuntimeException('Missing storage redirect request.');
        }
        stream_set_timeout($peer, 5);
        $line = fgets($peer);
        $headers = [];
        while (($header = fgets($peer)) !== false && $header !== "\r\n") {
            [$name, $value] = explode(':', $header, 2);
            $headers[strtolower($name)] = trim($value);
        }
        $paths = ['/first','/directory/second','/final'];
        $valid = $valid && $line === 'GET '.$paths[$hop]." HTTP/1.1\r\n";
        foreach (['authorization','cookie','idempotency-key','polymorfa-version','x-caller-secret'] as $name) {
            $valid = $valid && !isset($headers[$name]);
        }
        if ($mode === 'unsafe') {
            $response = "HTTP/1.1 302 Fixture\r\nLocation: http://public-storage.fixture.invalid/plaintext?capability=synthetic\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        } elseif ($hop < 2) {
            $location = $hop === 0 ? '/directory/second' : '../final';
            $response = "HTTP/1.1 302 Fixture\r\nLocation: $location\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
        } else {
            $body = 'native three-hop';
            $response = "HTTP/1.1 200 Fixture\r\nContent-Type: application/octet-stream\r\nContent-Length: ".strlen($body)."\r\nConnection: close\r\n\r\n".$body;
        }
        fwrite($peer, $response);
        fclose($peer);
    }
    fclose($server);
    echo json_encode(['valid' => $valid,'requests' => $count])."\n";
    flush();
} finally {
    unlink($directory.'/tls.pem');
    rmdir($directory);
}
