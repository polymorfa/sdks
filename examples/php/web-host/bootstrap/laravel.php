<?php

declare(strict_types=1);

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\{Exceptions,Middleware};
use Illuminate\Support\Facades\Route;
use PolymorfaExample\Host;
use Symfony\Component\HttpFoundation\Response;

$state = getenv('EXAMPLE_STATE_DIR');
if (!$state || !str_starts_with($state, '/') || str_starts_with($state, '/tmp/')) {
    throw new RuntimeException('Configure a persistent application state directory.');
}
foreach (['framework/views','framework/cache','logs'] as $directory) {
    Host::directory($state.'/'.$directory);
}
$application = Application::configure(basePath:dirname(__DIR__))
    ->withRouting(using:function (): void {
        Route::any('/{path?}', function (Illuminate\Http\Request $request): Response {
            $host = new Host(fn (bool $authenticated, bool $partial): string => view('workspace', compact('authenticated', 'partial'))->render());
            return $host->handle($request);
        })->where('path', '.*');
    })
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->use([]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->report(function (Throwable $error): bool {
            return false;
        });
        $exceptions->render(fn (Throwable $error) => new Response('Example application unavailable.', 503, ['Cache-Control' => 'no-store']));
    })->create();
$application->useStoragePath($state);
$application->useBootstrapPath($state.'/bootstrap');
Host::directory($state.'/bootstrap/cache');
return $application;
