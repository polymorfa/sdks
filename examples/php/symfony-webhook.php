<?php

declare(strict_types=1);

use Polymorfa\{WebhookRequest,WebhookSignatureException,ValidationException};
use Symfony\Component\HttpFoundation\{Request,JsonResponse};

// Match this limit at ingress, before SAPI or framework buffering.
function polymorfaWebhook(Request $request, string $signingSecret, int $maxBodyBytes = WebhookRequest::DEFAULT_MAX_BODY_BYTES): JsonResponse
{
    if ($request->getMethod() !== 'POST') {
        return new JsonResponse(['error' => 'method_not_allowed'], 405, ['Allow' => 'POST']);
    }
    try {
        $event = WebhookRequest::fromSymfony($request, $signingSecret, $maxBodyBytes);
    } catch (ValidationException $error) {
        return new JsonResponse(['error' => $error->errorCode], $error->status ?? 400);
    } catch (WebhookSignatureException) {
        return new JsonResponse(['error' => 'invalid_signature'], 400);
    }
    return new JsonResponse(['received' => $event->id]);
}
