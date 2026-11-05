<?php

declare(strict_types=1);
usleep(300000);
$path = $argv[1].'/inject.json';
if (file_exists($path)) {
    throw new RuntimeException('Shared fixture injection slot already owned.');
}file_put_contents($path, json_encode(['messageId' => $argv[2],'text' => $argv[3]], JSON_THROW_ON_ERROR));
chmod($path, 0600);
