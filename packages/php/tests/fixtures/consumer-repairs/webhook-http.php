<?php

declare(strict_types=1);
require dirname(__DIR__, 3).'/vendor/autoload.php';
if (!class_exists(Symfony\Component\HttpKernel\HttpKernel::class) || !class_exists(Illuminate\Routing\Router::class)) {
    $framework = getenv('POLYMORFA_WEBHOOK_FRAMEWORK_AUTOLOAD') ?: dirname(__DIR__, 5).'/examples/php/web-host/vendor/autoload.php';
    require $framework;
}

use Polymorfa\{WebhookRequest,ValidationException,WebhookSignatureException};
use Symfony\Component\HttpFoundation\{Request,JsonResponse,Response,RequestStack};

$state = getenv('POLYMORFA_WEBHOOK_HTTP_STATE');
$limit = (int)getenv('POLYMORFA_WEBHOOK_HTTP_LIMIT');
if (!$state || !is_dir($state) || $limit <= 0) {
    throw new RuntimeException('Configure owned webhook fixture state.');
}
$effects = $state.'/effects';
if (parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) === '/state') {
    (new JsonResponse(['effects' => is_file($effects) ? (int)file_get_contents($effects) : 0,'sdk' => (new ReflectionClass(WebhookRequest::class))->getFileName(),'symfony' => (new ReflectionClass(Symfony\Component\HttpKernel\HttpKernel::class))->getFileName(),'laravel' => (new ReflectionClass(Illuminate\Routing\Router::class))->getFileName()]))->send();
    return;
}
$handle = static function (Request $request, string $framework) use ($effects, $limit): Response {
    if ($request->getMethod() !== 'POST') {
        return new JsonResponse(['error' => 'method_not_allowed'], 405, ['Allow' => 'POST']);
    }
    try {
        $event = $framework === 'laravel' ? WebhookRequest::fromLaravel($request, 'synthetic-webhook-secret', $limit) : WebhookRequest::fromSymfony($request, 'synthetic-webhook-secret', $limit);
    } catch (ValidationException $error) {
        return new JsonResponse(['error' => $error->errorCode], $error->status ?? 400);
    } catch (WebhookSignatureException) {
        return new JsonResponse(['error' => 'invalid_signature'], 400);
    }
    file_put_contents($effects, (string)((is_file($effects) ? (int)file_get_contents($effects) : 0) + 1));
    return new JsonResponse(['received' => $event->id]);
};
$request = Request::createFromGlobals();
if ($request->getPathInfo() === '/symfony') {
    $request->attributes->set('_controller', fn (Request $request): Response => $handle($request, 'symfony'));
    $kernel = new Symfony\Component\HttpKernel\HttpKernel(new Symfony\Component\EventDispatcher\EventDispatcher(), new Symfony\Component\HttpKernel\Controller\ControllerResolver(), new RequestStack(), new Symfony\Component\HttpKernel\Controller\ArgumentResolver());
    $response = $kernel->handle($request);
    $response->send();
    $kernel->terminate($request, $response);
    return;
}
// Actual Laravel JSON capture occurs before the route helper and may prebuffer.
$laravel = Illuminate\Http\Request::capture();
$container = new Illuminate\Container\Container();
$container->instance('request', $laravel);
$container->instance(Illuminate\Http\Request::class, $laravel);
$container->bind(Illuminate\Routing\Contracts\CallableDispatcher::class, fn ($app) => new Illuminate\Routing\CallableDispatcher($app));
$router = new Illuminate\Routing\Router(new Illuminate\Events\Dispatcher($container), $container);
$router->post('/laravel', fn (Illuminate\Http\Request $request): Response => $handle($request, 'laravel'));
try {
    $response = $router->dispatch($laravel);
} catch (Symfony\Component\HttpKernel\Exception\MethodNotAllowedHttpException) {
    $response = new JsonResponse(['error' => 'method_not_allowed'], 405, ['Allow' => 'POST']);
}
$response->send();
