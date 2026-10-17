<?php

require dirname(__DIR__).'/vendor/autoload.php';
use PolymorfaExample\Host;
use Symfony\Component\EventDispatcher\EventDispatcher;
use Symfony\Component\HttpFoundation\{Request,Response};
use Symfony\Component\HttpKernel\{HttpKernel,Controller\ControllerResolver,Controller\ArgumentResolver};

try {
    $twig = new Twig\Environment(new Twig\Loader\FilesystemLoader(dirname(__DIR__).'/views'), ['autoescape' => 'html']);
    $host = new Host(fn (bool $authenticated, bool $partial): string => $twig->render('workspace.html.twig', compact('authenticated', 'partial')));
    $request = Request::createFromGlobals();
    $request->attributes->set('_controller', fn (Request $request): Response => $host->handle($request));
    $kernel = new HttpKernel(new EventDispatcher(), new ControllerResolver(), argumentResolver:new ArgumentResolver());
    $response = $kernel->handle($request);
    $response->send();
    $kernel->terminate($request, $response);
} catch (Throwable) {
    (new Response('Example application unavailable.', 503, ['Cache-Control' => 'no-store']))->send();
}
