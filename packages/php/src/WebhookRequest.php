<?php

declare(strict_types=1);

namespace Polymorfa;

use Illuminate\Http\Request as LaravelRequest;
use Psr\Http\Message\ServerRequestInterface;
use Symfony\Component\HttpFoundation\Request as SymfonyRequest;

/** Verify original request bytes before an application's JSON parsing middleware. */
final class WebhookRequest
{
    public static function fromSymfony(SymfonyRequest $request, #[\SensitiveParameter] string $secret): WebhookEvent
    {
        return Webhooks::constructEvent($request->getContent(), $request->headers->get('x-webhook-signature', '') ?? '', $secret);
    }
    public static function fromLaravel(LaravelRequest $request, #[\SensitiveParameter] string $secret): WebhookEvent
    {
        return self::fromSymfony($request, $secret);
    }
    public static function fromPsr(ServerRequestInterface $request, #[\SensitiveParameter] string $secret): WebhookEvent
    {
        return Webhooks::constructEvent((string)$request->getBody(), $request->getHeaderLine('x-webhook-signature'), $secret);
    }
}
