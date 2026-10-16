<?php

require dirname(__DIR__).'/vendor/autoload.php';
try {
    $application = require dirname(__DIR__).'/bootstrap/laravel.php';
    $application->handleRequest(Illuminate\Http\Request::capture());
} catch (Throwable) {
    (new Symfony\Component\HttpFoundation\Response('Example application unavailable.', 503, ['Cache-Control' => 'no-store']))->send();
}
