<?php

declare(strict_types=1);

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Polymorfa\{WebhookRequest,WebhookSignatureException,ValidationException};

// Enforce the same size limit at ingress. Laravel JSON capture can buffer before this route.
Route::post('/webhooks/polymorfa', function (Request $request) {
    try {
        $event = WebhookRequest::fromLaravel($request, (string)config('services.polymorfa.webhook_secret'), WebhookRequest::DEFAULT_MAX_BODY_BYTES);
    } catch (ValidationException $error) {
        return response()->json(['error' => $error->errorCode], $error->status ?? 400);
    } catch (WebhookSignatureException) {
        return response()->json(['error' => 'invalid_signature'], 400);
    }
    // Persist event.id for delivery deduplication before processing its payload.
    return response()->json(['received' => $event->id]);
});
