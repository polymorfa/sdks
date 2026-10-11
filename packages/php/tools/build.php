<?php

declare(strict_types=1);

$root = dirname(__DIR__);
$destination = getenv('POLYMORFA_BUILD_DIR') ?: $root . '/dist';
if (!is_dir($destination)) {
    mkdir($destination, 0777, true);
}
$archive = new PharData($destination . '/polymorfa-sdk.tar');
foreach (['src', 'README.md', 'composer.json', 'LICENSE', 'release-contract.json'] as $relative) {
    $path = $root . '/' . $relative;
    if (is_dir($path)) {
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($path)) as $file) {
            if ($file->isFile()) {
                $archive->addFile($file->getPathname(), substr($file->getPathname(), strlen($root) + 1));
            }
        }
    } elseif (is_file($path)) {
        $archive->addFile($path, $relative);
    }
}
echo "Built package archive.\n";
