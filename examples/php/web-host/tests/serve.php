<?php

$root = dirname(__DIR__);
$state = getenv('EXAMPLE_STATE_DIR');
if (!$state || !str_starts_with($state, '/') || str_starts_with($state, '/tmp/')) {
    throw new RuntimeException('Set the persistent test state directory.');
}
if (!is_dir($state)) {
    mkdir($state, 0700, true);
}
$fixture = proc_open([PHP_BINARY,'-S','127.0.0.1:31305',$root.'/tests/upstream.php'], [STDIN,STDOUT,STDERR], $pipes, $root);
$app = proc_open([PHP_BINARY,'-S','0.0.0.0:31306','-t',$root.'/public',$root.'/public/router.php'], [STDIN,STDOUT,STDERR], $pipes, $root);
try {
    while (is_resource($app) && proc_get_status($app)['running']) {
        usleep(100000);
    }
} finally {
    foreach ([$fixture,$app] as $process) {
        if (is_resource($process)) {
            proc_terminate($process);
            proc_close($process);
        }
    }
}
