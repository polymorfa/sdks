<?php

$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
if (is_string($path) && preg_match('~^/assets/(elements|htmx)\.js$~D', $path) && is_file(__DIR__.$path)) {
    return false;
}
require __DIR__.((getenv('EXAMPLE_FRAMEWORK') ?: 'laravel') === 'symfony' ? '/symfony.php' : '/laravel.php');
